/**
 * MongoDB Connection for Naya Overleaf
 */

const { MongoClient } = require('mongodb');
const { updateSharedDependencyState } = require('../health/dependency-state');

// Connection URL
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'naya_overleaf';

// Create a new MongoClient
const client = new MongoClient(url, {
  useUnifiedTopology: true,
  maxPoolSize: 10
});

let db;

// Connect to MongoDB
async function connect() {
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    db = client.db(dbName);
    updateSharedDependencyState('mongo', 'healthy');
    return db;
  } catch (err) {
    updateSharedDependencyState('mongo', 'unhealthy');
    console.error('Failed to connect to MongoDB:', err);
    throw err;
  }
}

module.exports = {
  connect,
  get db() {
    return db;
  },
  client
};