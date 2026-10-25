/**
 * Compilation Controller for Naya Overleaf
 */

const { ObjectId } = require('mongodb');
const client = require('../../db/connection');
const amqp = require('amqplib');
const redis = require('redis');
const crypto = require('crypto');
const { createCorrelationPayload, getCorrelationIdFromRequest } = require('../../observability/correlation');
const { logInfo, logError } = require('../../observability/logger');
const { validateDocumentName } = require('../../utils/documentNames');
const { updateSharedDependencyState } = require('../../health/dependency-state');
const { setQueueDepth } = require('../../observability/metrics');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const RABBITMQ_RECONNECT_DELAY_MS = Number.parseInt(process.env.RABBITMQ_RECONNECT_DELAY_MS || '2000', 10);
const COMPILATION_QUEUE = 'latex-compilation';
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';
const localQueue = PREVIEW_MODE ? require('../../compiler/local-queue') : null;

let redisClient;
let channel = null;
let connectPromise = null;
let reconnectTimer = null;
let queueDepthInterval = null;

function scheduleRabbitReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRabbitMQ();
  }, RABBITMQ_RECONNECT_DELAY_MS);

  if (typeof reconnectTimer.unref === 'function') {
    reconnectTimer.unref();
  }
}

async function connectRabbitMQ() {
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      const nextChannel = await connection.createChannel();

      if (!nextChannel) {
        throw new Error('RabbitMQ channel could not be created');
      }

      await nextChannel.assertQueue(COMPILATION_QUEUE, { durable: true });
      channel = nextChannel;
      updateSharedDependencyState('rabbitmq', 'healthy');
      console.log('Connected to RabbitMQ');

      if (!queueDepthInterval) {
        queueDepthInterval = setInterval(async () => {
          if (!channel) {
            return;
          }

          try {
            const queueState = await channel.checkQueue(COMPILATION_QUEUE);
            setQueueDepth(queueState.messageCount);
          } catch (error) {
            // Queue depth is best-effort telemetry.
          }
        }, 30000);

        if (typeof queueDepthInterval.unref === 'function') {
          queueDepthInterval.unref();
        }
      }

      if (typeof nextChannel.on === 'function') {
        nextChannel.on('close', () => {
          if (channel === nextChannel) {
            channel = null;
            updateSharedDependencyState('rabbitmq', 'unhealthy');
            scheduleRabbitReconnect();
          }
        });
        nextChannel.on('error', (error) => {
          console.error('RabbitMQ channel error:', error.message);
        });
      }

      if (typeof connection.on === 'function') {
        connection.on('close', () => {
          if (channel === nextChannel) {
            channel = null;
            updateSharedDependencyState('rabbitmq', 'unhealthy');
            scheduleRabbitReconnect();
          }
        });
        connection.on('error', (error) => {
          console.error('RabbitMQ connection error:', error.message);
        });
      }

      return true;
    } catch (error) {
      channel = null;
      updateSharedDependencyState('rabbitmq', 'unhealthy');
      console.error('Failed to connect to RabbitMQ:', error.message);
      scheduleRabbitReconnect();
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

if (!PREVIEW_MODE) {
  // Redis client for caching compilation results.
  (async () => {
    try {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
      });

      await redisClient.connect();
      console.log('Connected to Redis');
    } catch (error) {
      console.error('Failed to connect to Redis. Application will run without Redis caching.');
      redisClient = null;
    }
  })();

  (async () => {
    await connectRabbitMQ();
  })();
}

function createControllerCorrelationId(req) {
  return getCorrelationIdFromRequest(req)
    || req?.correlationId
    || (typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function getUserId(req) {
  return req.kauth?.grant?.access_token?.content?.sub || req.user?.id || req.user?.sub;
}

function buildCompilationFingerprint(documents, compiler) {
  const hash = crypto.createHash('sha256');
  hash.update(`${compiler || 'pdflatex'}\n`);

  const normalized = [...documents]
    .map((doc) => ({
      name: doc?.name || '',
      content: typeof doc?.content === 'string' ? doc.content : ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  normalized.forEach((doc) => {
    hash.update(`FILE:${doc.name}\n`);
    hash.update(doc.content);
    hash.update('\n---\n');
  });

  return hash.digest('hex');
}

async function getCompilationDocuments(db, projectId) {
  const projectDocuments = await db.collection('documents')
    .find({
      projectId,
      deleted: { $ne: true }
    })
    .toArray();

  const shareDocIds = projectDocuments.map((doc) => doc._id.toString());
  const shareSnapshots = await db.collection('sharedb_documents')
    .find({ _id: { $in: shareDocIds } })
    .toArray();

  const snapshotContentById = new Map(
    shareSnapshots.map((snapshot) => [
      snapshot._id,
      typeof snapshot?.data?.content === 'string'
        ? snapshot.data.content
        : (typeof snapshot?.content === 'string' ? snapshot.content : null)
    ])
  );

  return projectDocuments.map((doc) => {
    const latestContent = snapshotContentById.get(doc._id.toString());
    const documentNameValidation = validateDocumentName(doc.name);
    if (!documentNameValidation.valid) {
      throw new Error(`Unsafe document name in project: ${doc.name}`);
    }
    return {
      name: documentNameValidation.name,
      content: latestContent ?? doc.content
    };
  });
}

const compileDocument = async (req, res) => {
  const correlationId = createControllerCorrelationId(req);

  try {
    const userId = getUserId(req);
    const documentId = req.params.documentId;
    const { compiler = 'pdflatex' } = req.body;
    const allowedCompilers = ['pdflatex', 'xelatex', 'lualatex', 'latexmk'];
    const db = client.db;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    if (!allowedCompilers.includes(compiler)) {
      return res.status(400).json({ error: `Compiler must be one of: ${allowedCompilers.join(', ')}` });
    }

    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.name.toLowerCase().endsWith('.tex')) {
      return res.status(400).json({ error: 'Only .tex documents can be compiled' });
    }

    const project = await db.collection('projects').findOne({
      _id: new ObjectId(document.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });

    if (!project) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }

    const compileDocuments = await getCompilationDocuments(db, document.projectId);
    const compilationFingerprint = buildCompilationFingerprint(compileDocuments, compiler);
    const cacheKey = `compilation:${documentId}:${compiler}:${compilationFingerprint}`;

    // Check the cache before creating a job so cache hits do not leave orphaned
    // queued jobs in MongoDB.
    if (redisClient && redisClient.isReady) {
      try {
        const cachedResult = await redisClient.get(cacheKey);
        if (cachedResult) {
          return res.json({ ...JSON.parse(cachedResult), cached: true });
        }
      } catch (error) {
        console.error('Failed to read compilation cache:', error.message);
      }
    }

    if (!PREVIEW_MODE && !channel) {
      logError('Compilation queue is currently unavailable', {
        component: 'api',
        correlationId,
        errorClass: 'QUEUE_UNAVAILABLE'
      });
      return res.status(503).json({ error: 'Compilation queue is currently unavailable' });
    }

    const jobId = new ObjectId();
    const compilationJob = {
      _id: jobId,
      documentId,
      projectId: document.projectId,
      userId,
      compiler,
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const jobMessage = {
      jobId: jobId.toString(),
      documentId,
      projectId: document.projectId,
      mainFile: document.name,
      compiler,
      compilationFingerprint,
      documents: compileDocuments,
      ...createCorrelationPayload({}, correlationId)
    };

    // Persist the job before publishing it. A fast worker can otherwise consume
    // the message and try to update a job document that does not exist yet.
    await db.collection('compilation_jobs').insertOne(compilationJob);

    if (PREVIEW_MODE) {
      localQueue.enqueueCompilation(db, jobMessage);

      logInfo('Preview compilation job enqueued', {
        component: 'api',
        correlationId,
        errorClass: 'NONE'
      });

      return res.json({
        jobId: jobId.toString(),
        status: 'queued',
        message: 'Compilation job queued successfully'
      });
    }

    try {
      const accepted = channel.sendToQueue(COMPILATION_QUEUE, Buffer.from(JSON.stringify(jobMessage)), {
        persistent: true,
        headers: {
          ...createCorrelationPayload({}, correlationId)
        }
      });

      if (accepted === false) {
        throw new Error('RabbitMQ rejected the compilation job');
      }
    } catch (error) {
      channel = null;
      updateSharedDependencyState('rabbitmq', 'unhealthy');
      scheduleRabbitReconnect();

      await db.collection('compilation_jobs').updateOne(
        { _id: jobId },
        {
          $set: {
            status: 'failed',
            error: 'Compilation queue enqueue failed',
            updatedAt: new Date()
          }
        }
      );

      logError('Error sending job to RabbitMQ', {
        component: 'api',
        correlationId,
        errorClass: 'QUEUE_ENQUEUE_FAILED'
      });

      return res.status(503).json({ error: 'Compilation queue is currently unavailable' });
    }

    try {
      const queueState = await channel.checkQueue(COMPILATION_QUEUE);
      setQueueDepth(queueState.messageCount);
    } catch (error) {
      // Queue depth is best-effort telemetry.
    }

    logInfo('Compilation job enqueued', {
      component: 'api',
      correlationId,
      errorClass: 'NONE'
    });

    res.json({
      jobId: jobId.toString(),
      status: 'queued',
      message: 'Compilation job queued successfully'
    });
  } catch (error) {
    console.error('Error compiling document:', error);
    res.status(500).json({ error: 'Failed to compile document' });
  }
};

const getCompilationStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const jobId = req.params.jobId;
    const db = client.db;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({ error: 'Invalid compilation job ID' });
    }

    const job = await db.collection('compilation_jobs').findOne({
      _id: new ObjectId(jobId)
    });

    if (!job) {
      return res.status(404).json({ error: 'Compilation job not found' });
    }

    const project = await db.collection('projects').findOne({
      _id: new ObjectId(job.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });

    if (!project) {
      return res.status(403).json({ error: 'Access denied to this compilation job' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching compilation status:', error);
    res.status(500).json({ error: 'Failed to fetch compilation status' });
  }
};

module.exports = {
  compileDocument,
  getCompilationStatus,
  buildCompilationFingerprint,
  connectRabbitMQ
};
