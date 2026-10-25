/**
 * MongoDB-backed express-session store.
 *
 * The development setup uses MemoryStore, but production must not lose every
 * login on restart and must not keep sessions in a single process.
 */

const session = require('express-session');

const DEFAULT_COLLECTION = 'sessions';
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

class MongoSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.collectionName = options.collectionName || DEFAULT_COLLECTION;
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS;
    this.indexPromise = null;
  }

  getCollection() {
    const db = require('../db/connection').db;

    if (!db) {
      throw new Error('MongoDB is not connected; session store unavailable');
    }

    const collection = db.collection(this.collectionName);

    if (!this.indexPromise) {
      this.indexPromise = collection
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        .catch((error) => {
          console.error('Failed to create session TTL index:', error.message);
        });
    }

    return collection;
  }

  get(sid, callback) {
    let collection;

    try {
      collection = this.getCollection();
    } catch (error) {
      callback(error);
      return;
    }

    collection.findOne({ _id: sid })
      .then((document) => {
        if (!document) {
          callback(null, null);
          return;
        }

        if (document.expiresAt && document.expiresAt.getTime() <= Date.now()) {
          collection.deleteOne({ _id: sid }).catch(() => {});
          callback(null, null);
          return;
        }

        callback(null, document.session);
      })
      .catch(callback);
  }

  set(sid, sessionData, callback) {
    let collection;

    try {
      collection = this.getCollection();
    } catch (error) {
      callback(error);
      return;
    }

    const now = new Date();
    collection.updateOne(
      { _id: sid },
      {
        $set: {
          session: sessionData,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + this.ttlMs)
        }
      },
      { upsert: true }
    ).then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback) {
    let collection;

    try {
      collection = this.getCollection();
    } catch (error) {
      callback(error);
      return;
    }

    collection.deleteOne({ _id: sid })
      .then(() => callback(null))
      .catch(callback);
  }

  touch(sid, sessionData, callback) {
    let collection;

    try {
      collection = this.getCollection();
    } catch (error) {
      callback(error);
      return;
    }

    const now = new Date();
    collection.updateOne(
      { _id: sid },
      {
        $set: {
          updatedAt: now,
          expiresAt: new Date(now.getTime() + this.ttlMs)
        }
      }
    ).then(() => callback(null)).catch(callback);
  }
}

module.exports = {
  DEFAULT_COLLECTION,
  DEFAULT_TTL_MS,
  MongoSessionStore
};
