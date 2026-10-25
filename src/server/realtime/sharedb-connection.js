/**
 * ShareDB Connection for Naya Overleaf
 */

const ShareDB = require('sharedb');
const Snapshot = require('sharedb/lib/snapshot');
const WebSocket = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const otText = require('ot-text');
const { updateSharedDependencyState } = require('../health/dependency-state');
const { installRealtimeAccessControl } = require('./auth');

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

async function getCurrentSnapshotVersion(snapshots, ops, id) {
  const doc = await snapshots.findOne({ _id: id }, { projection: { v: 1 } });
  if (Number.isInteger(doc?.v)) {
    return doc.v;
  }

  const latestOp = await ops
    .find({ d: id }, { projection: { v: 1 } })
    .sort({ v: -1 })
    .limit(1)
    .next();

  return Number.isInteger(latestOp?.v) ? latestOp.v + 1 : 0;
}

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
      async commit(collection, id, op, snapshot, options, callback) {
        try {
          const snapshots = db.db.collection(`sharedb_${collection}`);
          const ops = db.db.collection(`sharedb_${collection}_ops`);
          const currentVersion = await getCurrentSnapshotVersion(snapshots, ops, id);

          if (snapshot.v !== currentVersion + 1) {
            callback(null, false);
            return;
          }

          await ops.updateOne(
            { d: id, v: op.v },
            { $set: { ...op, d: id } },
            { upsert: true }
          );

          if (snapshot.type) {
            await snapshots.updateOne(
              { _id: id },
              {
                $set: {
                  _id: id,
                  v: snapshot.v,
                  type: snapshot.type,
                  data: snapshot.data,
                  m: snapshot.m || null
                }
              },
              { upsert: true }
            );
          } else {
            await snapshots.deleteOne({ _id: id });
          }

          callback(null, true);
        } catch (err) {
          callback(err);
        }
      },

      async getSnapshot(collection, id, fields, options, callback) {
        try {
          const snapshots = db.db.collection(`sharedb_${collection}`);
          const ops = db.db.collection(`sharedb_${collection}_ops`);
          const doc = await snapshots.findOne({ _id: id });

          if (doc) {
            callback(null, new Snapshot(id, doc.v, doc.type, doc.data, doc.m || null));
            return;
          }

          const version = await getCurrentSnapshotVersion(snapshots, ops, id);
          callback(null, new Snapshot(id, version, null, undefined, null));
        } catch (err) {
          callback(err);
        }
      },

      async getOps(collection, id, from, to, options, callback) {
        try {
          const query = { d: id, v: { $gte: from } };
          if (to !== null && to !== undefined) {
            query.v.$lt = to;
          }

          const ops = await db.db.collection(`sharedb_${collection}_ops`)
            .find(query)
            .sort({ v: 1 })
            .toArray();

          callback(null, ops.map(({ _id, d, ...op }) => op));
        } catch (err) {
          callback(err);
        }
      },

      close(callback) {
        if (callback) callback();
      }
    };

    const newBackend = new ShareDB({
      db: shareDBDb,
      presence: true
    });

    installRealtimeAccessControl(newBackend, db);

    const newConnection = newBackend.connect();
    if (newConnection.agent) {
      newConnection.agent.custom = {
        ...(newConnection.agent.custom || {}),
        serverSide: true
      };
    }

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

  wss.on('connection', (ws, request) => {
    const stream = new WebSocketJSONStream(ws);

    getBackend().listen(stream, request);

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
