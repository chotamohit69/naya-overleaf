/**
 * LaTeX Compilation Worker for Naya Overleaf
 * Consumes compilation jobs from RabbitMQ and processes them using Docker.
 */

const amqp = require('amqplib');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const http = require('http');
const redis = require('redis');
const docker = require('./docker');
const { createCorrelationPayload } = require('../observability/correlation');
const { logInfo, logError } = require('../observability/logger');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'naya_overleaf';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_CONNECT_TIMEOUT_MS = Number.parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '3000', 10);
const COMPILATION_DIR = process.env.COMPILATION_DIR || path.join(__dirname, '../../../compilation');
const WORKER_HEALTH_PORT = Number.parseInt(process.env.WORKER_HEALTH_PORT || '3001', 10);
const MAX_RETRY_ATTEMPTS = 3;
const COMPILATION_EVENTS_CHANNEL = 'naya:compilation-events';

if (!fs.existsSync(COMPILATION_DIR)) {
  fs.mkdirSync(COMPILATION_DIR, { recursive: true });
}

let redisClient = null;
let db = null;
let rabbitChannel = null;
let workerReady = false;
let workerHealthServer = null;
let shuttingDown = false;

async function connectToMongo() {
  try {
    const client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
    await client.connect();
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB');
    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    throw err;
  }
}

async function connectToRedis() {
  const client = redis.createClient({ url: REDIS_URL });
  let connectTimeout;

  try {
    client.on('error', (err) => {
      console.error('Redis client error:', err.message);
    });

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => {
        connectTimeout = setTimeout(
          () => reject(new Error(`redis connect timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`)),
          REDIS_CONNECT_TIMEOUT_MS
        );
      })
    ]);

    redisClient = client;
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Redis unavailable; compilation caching and live events are disabled:', error.message);
    redisClient = null;

    try {
      client.disconnect();
    } catch (disconnectError) {
      // Ignore cleanup errors.
    }
  } finally {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
    }
  }
}

function startHealthServer(port) {
  if (workerHealthServer) {
    return workerHealthServer;
  }

  workerHealthServer = http.createServer((req, res) => {
    if (req.url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'live' }));
      return;
    }

    if (req.url === '/health' || req.url === '/health/ready') {
      const ready = workerReady && Boolean(rabbitChannel) && Boolean(db);
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: ready ? 'ok' : 'not_ready',
        ready
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  workerHealthServer.listen(port, '0.0.0.0', () => {
    console.log(`Worker health server listening on port ${port}`);
  });

  if (typeof workerHealthServer.unref === 'function') {
    workerHealthServer.unref();
  }

  return workerHealthServer;
}

function resolveCorrelationId(job, msg) {
  return job?.correlationId
    || msg?.properties?.headers?.correlationId
    || 'unknown';
}

async function publishCompilationEvent(payload) {
  if (!redisClient || !redisClient.isReady) {
    return;
  }

  try {
    await redisClient.publish(COMPILATION_EVENTS_CHANNEL, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to publish compilation event:', error.message);
  }
}

async function cacheCompilationResult(job, result) {
  if (!job.compilationFingerprint || !redisClient?.isReady) {
    return;
  }

  const compiler = job.compiler || 'pdflatex';
  const cacheKey = `compilation:${job.documentId}:${compiler}:${job.compilationFingerprint}`;

  try {
    await redisClient.set(cacheKey, JSON.stringify({
      jobId: job.jobId,
      status: 'completed',
      pdfPath: result.pdfPath,
      documentId: job.documentId
    }), { EX: 3600 });
  } catch (error) {
    console.error('Failed to cache compilation result:', error.message);
  }
}

async function startWorker() {
  try {
    await connectToRedis();
    await connectToMongo();

    if (process.env.NODE_ENV !== 'test') {
      startHealthServer(WORKER_HEALTH_PORT);
    }

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue('latex-compilation', {
      durable: true
    });

    channel.prefetch(1);
    rabbitChannel = channel;
    workerReady = true;

    console.log('LaTeX compilation worker started. Waiting for jobs...');

    if (typeof connection.on === 'function') {
      connection.on('close', () => {
        rabbitChannel = null;
        workerReady = false;
        if (!shuttingDown) {
          console.error('RabbitMQ connection closed; worker will be restarted by Docker.');
          process.exit(1);
        }
      });
      connection.on('error', (error) => {
        console.error('RabbitMQ connection error:', error.message);
      });
    }

    channel.consume('latex-compilation', async (msg) => {
      if (!msg) return;

      let job;
      const startedAt = Date.now();

      try {
        job = JSON.parse(msg.content.toString());
        const correlationId = resolveCorrelationId(job, msg);
        logInfo(`Received compilation job: ${job.jobId}`, {
          component: 'worker',
          correlationId,
          errorClass: 'NONE'
        });

        await updateJobStatus(job.jobId, 'processing');

        const result = await processCompilationJob(job);
        if (!result.success) {
          const processingError = new Error(result.error || 'Compilation failed');
          processingError.compilation = result;
          throw processingError;
        }

        await updateJobStatus(job.jobId, 'completed', {
          pdfPath: result.pdfPath,
          durationMs: Date.now() - startedAt
        });

        await cacheCompilationResult(job, result);
        await publishCompilationEvent({
          type: 'completed',
          jobId: job.jobId,
          documentId: job.documentId,
          projectId: job.projectId,
          durationMs: Date.now() - startedAt
        });

        channel.ack(msg);
      } catch (error) {
        const correlationId = resolveCorrelationId(job, msg);
        logError('Error processing job', {
          component: 'worker',
          correlationId,
          errorClass: 'JOB_PROCESSING_FAILED'
        });

        if (!job?.jobId) {
          channel.nack(msg, false, false);
          return;
        }

        const currentRetryCount = Number.isInteger(job.retryCount) ? job.retryCount : 0;
        const nextRetryCount = currentRetryCount + 1;
        const compilation = error.compilation || {};
        const failureDetails = {
          error: error.message,
          stderr: compilation.stderr || '',
          stdout: compilation.stdout || '',
          logTail: compilation.logTail || '',
          exitCode: compilation.exitCode
        };

        if (nextRetryCount >= MAX_RETRY_ATTEMPTS) {
          await updateJobStatus(job.jobId, 'failed', {
            ...failureDetails,
            retryCount: nextRetryCount,
            durationMs: Date.now() - startedAt
          });
          await publishCompilationEvent({
            type: 'failed',
            jobId: job.jobId,
            documentId: job.documentId,
            projectId: job.projectId,
            durationMs: Date.now() - startedAt,
            error: error.message
          });
          channel.nack(msg, false, false);
          return;
        }

        await updateJobStatus(job.jobId, 'queued', {
          ...failureDetails,
          retryCount: nextRetryCount
        });

        const retryJob = {
          ...job,
          retryCount: nextRetryCount
        };

        if (typeof channel.sendToQueue === 'function') {
          try {
            channel.sendToQueue('latex-compilation', Buffer.from(JSON.stringify(retryJob)), {
              persistent: true,
              headers: {
                ...createCorrelationPayload({}, correlationId)
              }
            });
            channel.ack(msg);
            return;
          } catch (retryError) {
            await updateJobStatus(job.jobId, 'failed', {
              ...failureDetails,
              retryCount: nextRetryCount,
              durationMs: Date.now() - startedAt,
              error: `Failed to requeue compilation: ${retryError.message}`
            });
            await publishCompilationEvent({
              type: 'failed',
              jobId: job.jobId,
              documentId: job.documentId,
              projectId: job.projectId,
              durationMs: Date.now() - startedAt,
              error: retryError.message
            });
            channel.nack(msg, false, false);
            return;
          }
        }

        channel.nack(msg, false, true);
      }
    });

    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      workerReady = false;
      console.log(`Received ${signal}, shutting down worker...`);

      try {
        await channel.close();
      } catch (error) {
        // Ignore shutdown errors.
      }

      try {
        await connection.close();
      } catch (error) {
        // Ignore shutdown errors.
      }

      if (redisClient) {
        try {
          await redisClient.quit();
        } catch (error) {
          // Ignore shutdown errors.
        }
      }

      if (workerHealthServer) {
        workerHealthServer.close();
      }

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Worker startup error:', error);
    process.exit(1);
  }
}

async function updateJobStatus(jobId, status, additionalData = {}) {
  try {
    const updateData = {
      status,
      updatedAt: new Date(),
      ...additionalData
    };

    await db.collection('compilation_jobs').updateOne(
      { _id: new ObjectId(jobId) },
      { $set: updateData }
    );

    console.log(`Job ${jobId} status updated to ${status}`);
  } catch (error) {
    console.error(`Error updating job ${jobId} status:`, error);
    throw error;
  }
}

async function processCompilationJob(job) {
  try {
    console.log(`Processing compilation job ${job.jobId}`);

    const jobDocuments = Array.isArray(job.documents) ? job.documents : null;

    const documentsForCompilation = jobDocuments || await db.collection('documents')
      .find({
        projectId: job.projectId,
        deleted: { $ne: true }
      })
      .toArray()
      .then((docs) => docs.map((doc) => ({
        name: doc.name,
        content: doc.content
      })));

    const prepared = await docker.prepareCompilationEnvironment(
      job.jobId,
      documentsForCompilation
    );

    if (!prepared) {
      throw new Error('Failed to prepare compilation environment');
    }

    const result = await docker.runCompilation(
      job.jobId,
      job.mainFile,
      job.compiler
    );

    if (result.success) {
      const mainFile = job.mainFile || 'main.tex';
      const pdfFileName = mainFile.replace(/\.tex$/i, '.pdf');
      await docker.cleanupCompilationEnvironment(job.jobId, true, pdfFileName);

      // cleanupCompilationEnvironment moves the PDF to <jobId>.pdf at the
      // compilation root so the app can serve it after the job directory is
      // removed.
      return {
        success: true,
        pdfPath: `${job.jobId}.pdf`
      };
    }

    await docker.cleanupCompilationEnvironment(job.jobId, false);

    return {
      success: false,
      error: result.error || 'Compilation failed',
      stderr: result.stderr,
      stdout: result.stdout,
      logTail: result.logTail,
      exitCode: result.exitCode
    };
  } catch (err) {
    console.error(`Error processing job ${job.jobId}:`, err);

    await docker.cleanupCompilationEnvironment(job.jobId, false);

    return {
      success: false,
      error: err.message
    };
  }
}

if (require.main === module) {
  startWorker().catch((err) => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}

module.exports = {
  startWorker,
  processCompilationJob,
  updateJobStatus
};
