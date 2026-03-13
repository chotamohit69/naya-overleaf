/**
 * Compilation Controller for Naya Overleaf
 */

const { ObjectId } = require('mongodb');
const client = require('../../db/connection');
const amqp = require('amqplib');
const redis = require('redis');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  createCorrelationPayload,
  getCorrelationIdFromRequest
} = require('../../observability/correlation');
const { logInfo, logError } = require('../../observability/logger');

// Redis client for caching compilation results
let redisClient;

// Connect to Redis
(async () => {
  try {
    // Set a flag to track connection attempts
    let connectionAttempts = 0;
    const maxRetries = 2;
    
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    // Handle connection errors with limited retries
    redisClient.on('error', (err) => {
      connectionAttempts++;
      if (connectionAttempts <= maxRetries) {
        console.error('Redis Client Error:', err.message);
      } else if (connectionAttempts === maxRetries + 1) {
        console.log('Max Redis connection attempts reached. Further errors will be suppressed.');
      }
      // Don't log any more errors after max retries
    });
    
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Failed to connect to Redis. Application will run without Redis caching.');
  }
})();

// RabbitMQ connection
let channel;

// Connect to RabbitMQ
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await connection.createChannel();
    
    // Ensure the compilation queue exists
    await channel.assertQueue('latex-compilation', {
      durable: true
    });
    
    console.log('Connected to RabbitMQ');
    return true;
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    console.log('Application will run without RabbitMQ compilation queue');
    return false;
  }
}

// Initialize RabbitMQ connection but don't block the application
(async () => {
  try {
    await connectRabbitMQ();
  } catch (error) {
    console.error('RabbitMQ initialization error:', error);
  }
})();

function createControllerCorrelationId(req) {
  return getCorrelationIdFromRequest(req)
    || req?.correlationId
    || (typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function buildCompilationFingerprint(documents, compiler) {
  const hash = crypto.createHash('sha256');
  hash.update(`${compiler || 'pdflatex'}\n`);

  const normalized = [...documents]
    .map(doc => ({
      name: doc?.name || '',
      content: typeof doc?.content === 'string' ? doc.content : ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  normalized.forEach(doc => {
    hash.update(`FILE:${doc.name}\n`);
    hash.update(doc.content);
    hash.update('\n---\n');
  });

  return hash.digest('hex');
}

// Compile a LaTeX document
const compileDocument = async (req, res) => {
  const correlationId = createControllerCorrelationId(req);

  try {
    const userId = req.kauth.grant.access_token.content.sub;
    const documentId = req.params.documentId;
    const { compiler = 'pdflatex' } = req.body; // Default to pdflatex
    const db = client.db;
    
    // Get the document
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user has access to the project this document belongs to
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

    if (!channel) {
      logError('Compilation queue is currently unavailable', {
        component: 'api',
        correlationId,
        errorClass: 'QUEUE_UNAVAILABLE'
      });
      return res.status(503).json({ error: 'Compilation queue is currently unavailable' });
    }

    // Create a compilation job
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
    
    // Save job to database
    await db.collection('compilation_jobs').insertOne(compilationJob);
    
    // Get all documents in the project to compile
    const projectDocuments = await db.collection('documents')
      .find({
        projectId: document.projectId,
        deleted: { $ne: true }
      })
      .toArray();

    // Prefer latest content from ShareDB snapshots when available
    const shareDocIds = projectDocuments.map(doc => doc._id.toString());
    const shareSnapshots = await db.collection('sharedb_documents')
      .find({ _id: { $in: shareDocIds } })
      .toArray();

    const snapshotContentById = new Map(
      shareSnapshots.map(snapshot => [
        snapshot._id,
        typeof snapshot?.data?.content === 'string'
          ? snapshot.data.content
          : (typeof snapshot?.content === 'string' ? snapshot.content : null)
      ])
    );

    const compileDocuments = projectDocuments.map(doc => {
      const latestContent = snapshotContentById.get(doc._id.toString());
      return {
        name: doc.name,
        content: latestContent ?? doc.content
      };
    });

    const compilationFingerprint = buildCompilationFingerprint(compileDocuments, compiler);

    // Check cache first if Redis is connected
    if (redisClient && redisClient.isReady) {
      const cacheKey = `compilation:${documentId}:${compiler}:${compilationFingerprint}`;
      const cachedResult = await redisClient.get(cacheKey);

      if (cachedResult) {
        return res.json(JSON.parse(cachedResult));
      }
    }
    
    // Send job to RabbitMQ if connected
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
    
    if (channel) {
      try {
        channel.sendToQueue('latex-compilation', Buffer.from(JSON.stringify(jobMessage)), {
          persistent: true,
          headers: {
            ...createCorrelationPayload({}, correlationId)
          }
        });
        logInfo('Compilation job enqueued', {
          component: 'api',
          correlationId,
          errorClass: 'NONE'
        });
      } catch (error) {
        logError('Error sending job to RabbitMQ', {
          component: 'api',
          correlationId,
          errorClass: 'QUEUE_ENQUEUE_FAILED'
        });
        // Continue without RabbitMQ
      }
    } else {
      console.log('RabbitMQ not connected, skipping queue');
    }
    
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

// Get compilation status
const getCompilationStatus = async (req, res) => {
  try {
    const userId = req.kauth.grant.access_token.content.sub;
    const jobId = req.params.jobId;
    const db = client.db;
    
    const job = await db.collection('compilation_jobs').findOne({
      _id: new ObjectId(jobId)
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Compilation job not found' });
    }
    
    // Check if user has access to the project
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
  buildCompilationFingerprint
};
