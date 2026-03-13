
/**
 * LaTeX Compilation Worker for Naya Overleaf
 * Consumes compilation jobs from RabbitMQ and processes them using Docker
 */

const amqp = require('amqplib');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const redis = require('redis');
const docker = require('./docker');
const {
  createCorrelationPayload
} = require('../observability/correlation');
const { logInfo, logError } = require('../observability/logger');

// Configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'naya_overleaf';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const COMPILATION_DIR = process.env.COMPILATION_DIR || path.join(__dirname, '../../../compilation');
const MAX_RETRY_ATTEMPTS = 3;

// Create compilation directory if it doesn't exist
if (!fs.existsSync(COMPILATION_DIR)) {
  fs.mkdirSync(COMPILATION_DIR, { recursive: true });
}

// Connect to Redis
const redisClient = redis.createClient({
  url: REDIS_URL
});

// Connect to MongoDB
let db;
async function connectToMongo() {
  try {
    const client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
    await client.connect();
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB');
    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

// Connect to RabbitMQ and start consuming jobs
function resolveCorrelationId(job, msg) {
  return job?.correlationId
    || msg?.properties?.headers?.correlationId
    || 'unknown';
}

async function startWorker() {
  try {
    // Connect to Redis
    await redisClient.connect();
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    
    // Connect to MongoDB
    await connectToMongo();
    
    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    // Ensure the compilation queue exists
    await channel.assertQueue('latex-compilation', {
      durable: true
    });
    
    // Set prefetch to 1 to ensure fair distribution of jobs
    channel.prefetch(1);
    
    console.log('LaTeX compilation worker started. Waiting for jobs...');
    
    // Consume jobs from the queue
    channel.consume('latex-compilation', async (msg) => {
      if (!msg) return;

      let job;

      try {
        job = JSON.parse(msg.content.toString());
        const correlationId = resolveCorrelationId(job, msg);
        logInfo(`Received compilation job: ${job.jobId}`, {
          component: 'worker',
          correlationId,
          errorClass: 'NONE'
        });

        // Update job status to 'processing'
        await updateJobStatus(job.jobId, 'processing');

        // Process the job
        const result = await processCompilationJob(job);
        if (!result.success) {
          throw new Error(result.error || 'Compilation failed');
        }

        // Update job status to completed
        await updateJobStatus(job.jobId, 'completed', { pdfPath: result.pdfPath });

        // Cache the result in Redis using deterministic key
        if (job.compilationFingerprint) {
          const compiler = job.compiler || 'pdflatex';
          const cacheKey = `compilation:${job.documentId}:${compiler}:${job.compilationFingerprint}`;
          await redisClient.set(cacheKey, JSON.stringify({
            jobId: job.jobId,
            status: 'completed',
            pdfPath: result.pdfPath,
            documentId: job.documentId
          }), { EX: 3600 }); // Cache for 1 hour
        }

        // Acknowledge the message on success
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

        if (nextRetryCount >= MAX_RETRY_ATTEMPTS) {
          await updateJobStatus(job.jobId, 'failed', {
            error: error.message,
            retryCount: nextRetryCount
          });
          channel.nack(msg, false, false);
          return;
        }

        await updateJobStatus(job.jobId, 'queued', {
          error: error.message,
          retryCount: nextRetryCount
        });

        const retryJob = {
          ...job,
          retryCount: nextRetryCount
        };

        if (typeof channel.sendToQueue === 'function') {
          channel.sendToQueue('latex-compilation', Buffer.from(JSON.stringify(retryJob)), {
            persistent: true,
            headers: {
              ...createCorrelationPayload({}, correlationId)
            }
          });
          channel.ack(msg);
          return;
        }

        channel.nack(msg, false, true);
      }
    });
    
    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('Shutting down worker...');
      await channel.close();
      await connection.close();
      await redisClient.quit();
      process.exit(0);
    });
  } catch (error) {
    console.error('Worker startup error:', error);
    process.exit(1);
  }
}

// Update job status in MongoDB
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

// Process a compilation job
async function processCompilationJob(job) {
  try {
    console.log(`Processing compilation job ${job.jobId}`);
    
    const jobDocuments = Array.isArray(job.documents) ? job.documents : null;

    // Fallback for older queued jobs that don't include documents
    const documentsForCompilation = jobDocuments || await db.collection('documents')
      .find({
        projectId: job.projectId,
        deleted: { $ne: true }
      })
      .toArray()
      .then(docs => docs.map(doc => ({
        name: doc.name,
        content: doc.content
      })));
    
    // Prepare the compilation environment
    const prepared = await docker.prepareCompilationEnvironment(
      job.jobId,
      documentsForCompilation
    );
    
    if (!prepared) {
      throw new Error('Failed to prepare compilation environment');
    }
    
    // Run the compilation
    const result = await docker.runCompilation(
      job.jobId,
      job.mainFile,
      job.compiler
    );
    
    if (result.success) {
      // Store the PDF path
      const pdfPath = path.relative(COMPILATION_DIR, result.pdfPath);
      
      // Clean up the compilation environment but keep the PDF
      await docker.cleanupCompilationEnvironment(job.jobId, true);
      
      return {
        success: true,
        pdfPath
      };
    } else {
      // Compilation failed
      // Clean up the compilation environment
      await docker.cleanupCompilationEnvironment(job.jobId, false);
      
      return {
        success: false,
        error: result.error || 'Compilation failed',
        stderr: result.stderr
      };
    }
  } catch (err) {
    console.error(`Error processing job ${job.jobId}:`, err);
    
    // Clean up the compilation environment
    await docker.cleanupCompilationEnvironment(job.jobId, false);
    
    return {
      success: false,
      error: err.message
    };
  }
}

// Start the worker if this file is run directly
if (require.main === module) {
  startWorker().catch(err => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}

module.exports = {
  startWorker,
  processCompilationJob,
  updateJobStatus
};
