/**
 * ShareDB Connection for Naya Overleaf
 */

const ShareDB = require('sharedb');
const WebSocket = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const otText = require('ot-text');
const { updateSharedDependencyState } = require('../health/dependency-state');

ShareDB.types.register(otText.type);

let backend;
let connection;
let initializePromise;

const DEFAULT_INIT_TIMEOUT_MS = 5000;
const DB_WAIT_INTERVAL_MS = 100;

const createShareDbInitTimeoutError = (timeoutMs) => {
  const error = new Error(`ShareDB initialization timed out after ${timeoutMs}ms waiting for MongoDB readiness`);
  error.code = 'SHAREDB_INIT_TIMEOUT';
  return error;
};

async function waitForDbReady(dbModule, timeoutMs) {
  if (dbModule.db) {
    return;
  }

  await new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkDb = setInterval(() => {
      if (dbModule.db) {
        clearInterval(checkDb);
        resolve();
        return;
      }

      if (Date.now() - startTime >= timeoutMs) {
        clearInterval(checkDb);
        reject(createShareDbInitTimeoutError(timeoutMs));
      }
    }, DB_WAIT_INTERVAL_MS);
  });
}

async function initializeShareDB(options = {}) {
  if (initializePromise) {
    return initializePromise;
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_INIT_TIMEOUT_MS;

  initializePromise = (async () => {
    const db = require('../db/connection');

    if (!db.db) {
      console.log('MongoDB not connected yet, waiting...');
      await waitForDbReady(db, timeoutMs);
    }

    const shareDBDb = {
      getCollection: (name) => {
        return {
          getSnapshot: async (id, version, options, callback) => {
            try {
              const collection = db.db.collection(`sharedb_${name}`);
              const doc = await collection.findOne({ _id: id });
              if (callback) callback(null, doc || null);
              return doc;
            } catch (err) {
              if (callback) callback(err);
              throw err;
            }
          },
          writeSnapshot: async (id, version, snapshot, options, callback) => {
            try {
              const collection = db.db.collection(`sharedb_${name}`);
              if (snapshot === null) {
                await collection.deleteOne({ _id: id });
              } else {
                await collection.updateOne(
                  { _id: id },
                  { $set: { ...snapshot, _id: id } },
                  { upsert: true }
                );
              }
              if (callback) callback(null);
            } catch (err) {
              if (callback) callback(err);
              throw err;
            }
          },
          getOps: async (collection, id, from, to, options, callback) => {
            try {
              const opsCollection = db.db.collection(`sharedb_${name}_ops`);
              const ops = await opsCollection
                .find({ d: id, v: { $gte: from, $lt: to } })
                .sort({ v: 1 })
                .toArray();
              if (callback) callback(null, ops);
              return ops;
            } catch (err) {
              if (callback) callback(err);
              throw err;
            }
          },
          submit: async (id, op, options, callback) => {
            try {
              const opsCollection = db.db.collection(`sharedb_${name}_ops`);
              await opsCollection.insertOne({ d: id, ...op });
              if (callback) callback(null);
            } catch (err) {
              if (callback) callback(err);
              throw err;
            }
          }
        };
      },
      commit: (cb) => cb && cb(),
      close: (cb) => cb && cb()
    };

    const newBackend = new ShareDB({
      db: shareDBDb,
      presence: true
    });

    const newConnection = newBackend.connect();

    backend = newBackend;
    connection = newConnection;

    updateSharedDependencyState('mongo', 'healthy');
    console.log('ShareDB initialized with MongoDB backend');

    return { backend, connection };
  })().catch((error) => {
    if (error && error.code === 'SHAREDB_INIT_TIMEOUT') {
      updateSharedDependencyState('mongo', 'unhealthy');
    }
    initializePromise = undefined;
    throw error;
  });

  return initializePromise;
}

const initialBackend = new ShareDB({
  db: { getCollection: () => null, commit: () => {}, close: () => {} },
  presence: true
});

backend = initialBackend;
connection = backend.connect();

initializeShareDB().catch(err => {
  console.error('Failed to initialize ShareDB with MongoDB:', err);
});

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    const stream = new WebSocketJSONStream(ws);

    getBackend().listen(stream);

    console.log('New ShareDB WebSocket connection');

    ws.on('close', () => {
      console.log('ShareDB WebSocket connection closed');
    });
  });

  return wss;
}

function get(collection, id) {
  return connection.get(collection, id);
}

function getBackend() {
  return backend;
}

function getConnection() {
  return connection;
}

module.exports = {
  get,
  setupWebSocketServer,
  initializeShareDB,
  getBackend,
  getConnection
};
