/**
 * LaTeX Compilation Service for Naya Overleaf
 * Handles compilation requests and communicates with the Docker container
 */

const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { MongoClient, ObjectId } = require('mongodb');
const redis = require('redis');

// Configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'naya_overleaf';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const COMPILATION_DIR = process.env.COMPILATION_DIR || path.join(__dirname, '../../../compilation');

// Create compilation directory if it doesn't exist
if (!fs.existsSync(COMPILATION_DIR)) {
  fs.mkdirSync(COMPILATION_DIR, { recursive: true });
}

// Redis client for caching
let redisClient;

// MongoDB connection
let db;

/**
 * Initialize the compilation service
 */
async function init() {
  try {
    // Connect to Redis
    redisClient = redis.createClient({
      url: REDIS_URL
    });
    
    await redisClient.connect();
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    
    // Connect to MongoDB
    const client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
    await client.connect();
    db = client.db(DB_NAME);
    console.log('Compilation service initialized successfully');
    
    return true;
  } catch (err) {
    console.error('Failed to initialize compilation service:', err);
    return false;
  }
}

/**
 * Submit a compilation job to the queue
 * @param {Object} job - The compilation job details
 * @returns {Object} - The job ID and status
 */
async function submitCompilationJob(job) {
  try {
    // Generate a unique job ID
    const jobId = uuidv4();
    
    // Create job document
    const jobDoc = {
      _id: jobId,
      documentId: job.documentId,
      projectId: job.projectId,
      userId: job.userId,
      mainFile: job.mainFile,
      compiler: job.compiler || 'pdflatex',
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Save job to database
    await db.collection('compilation_jobs').insertOne(jobDoc);
    
    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    // Ensure the compilation queue exists
    await channel.assertQueue('latex-compilation', {
      durable: true
    });
    
    // Send job to queue
    channel.sendToQueue('latex-compilation', Buffer.from(JSON.stringify({
      jobId,
      documentId: job.documentId,
      projectId: job.projectId,
      userId: job.userId,
      mainFile: job.mainFile,
      compiler: job.compiler || 'pdflatex'
    })), {
      persistent: true
    });
    
    // Close the connection
    await channel.close();
    await connection.close();
    
    return {
      jobId,
      status: 'queued'
    };
  } catch (err) {
    console.error('Failed to submit compilation job:', err);
    throw err;
  }
}

/**
 * Get the status of a compilation job
 * @param {string} jobId - The job ID
 * @returns {Object} - The job status and details
 */
async function getJobStatus(jobId) {
  try {
    // Check cache first
    const cachedJob = await redisClient.get(`job:${jobId}`);
    if (cachedJob) {
      return JSON.parse(cachedJob);
    }
    
    // Get job from database
    const job = await db.collection('compilation_jobs').findOne({ _id: jobId });
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    // Cache the result
    await redisClient.set(`job:${jobId}`, JSON.stringify(job), { EX: 300 }); // Cache for 5 minutes
    
    return job;
  } catch (err) {
    console.error('Failed to get job status:', err);
    throw err;
  }
}

/**
 * Get the latest compilation result for a document
 * @param {string} documentId - The document ID
 * @returns {Object} - The latest compilation result
 */
async function getLatestCompilationResult(documentId) {
  try {
    // Get the latest job for this document
    const job = await db.collection('compilation_jobs')
      .find({ documentId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    
    if (job.length === 0) {
      return { status: 'not_compiled' };
    }
    
    return job[0];
  } catch (err) {
    console.error('Failed to get latest compilation result:', err);
    throw err;
  }
}

/**
 * Cancel a compilation job
 * @param {string} jobId - The job ID
 * @returns {boolean} - Whether the job was successfully canceled
 */
async function cancelJob(jobId) {
  try {
    // Update job status in database
    const result = await db.collection('compilation_jobs').updateOne(
      { _id: jobId, status: { $in: ['queued', 'processing'] } },
      { $set: { status: 'canceled', updatedAt: new Date() } }
    );
    
    // Clear cache
    await redisClient.del(`job:${jobId}`);
    
    return result.modifiedCount > 0;
  } catch (err) {
    console.error('Failed to cancel job:', err);
    throw err;
  }
}

module.exports = {
  init,
  submitCompilationJob,
  getJobStatus,
  getLatestCompilationResult,
  cancelJob
};