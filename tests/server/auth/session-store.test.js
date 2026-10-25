/**
 * MongoSessionStore behavior with an in-memory fake collection.
 */

describe('MongoSessionStore', () => {
  let documents;
  let collection;

  beforeEach(() => {
    jest.resetModules();
    documents = new Map();

    collection = {
      createIndex: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(async (query) => documents.get(query._id) || null),
      updateOne: jest.fn(async (query, update, options) => {
        const existing = documents.get(query._id) || {};
        documents.set(query._id, {
          ...existing,
          ...update.$set
        });

        if (!existing && !options?.upsert) {
          return { matchedCount: 0 };
        }

        return { matchedCount: 1, upsertedCount: existing ? 0 : 1 };
      }),
      deleteOne: jest.fn(async (query) => {
        documents.delete(query._id);
        return { deletedCount: 1 };
      })
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      db: {
        collection: jest.fn(() => collection)
      }
    }));
  });

  const createStore = () => {
    const { MongoSessionStore } = require('../../../src/server/auth/session-store');
    return new MongoSessionStore({ ttlMs: 60000 });
  };

  it('stores and retrieves a session', async () => {
    const store = createStore();
    const sessionData = { cookie: { maxAge: 60000 }, userId: 'user1' };

    await new Promise((resolve, reject) => {
      store.set('sid-1', sessionData, (error) => (error ? reject(error) : resolve()));
    });

    await expect(new Promise((resolve, reject) => {
      store.get('sid-1', (error, value) => (error ? reject(error) : resolve(value)));
    })).resolves.toEqual(sessionData);
  });

  it('returns null for expired sessions and removes them', async () => {
    const store = createStore();

    documents.set('sid-2', {
      _id: 'sid-2',
      session: { userId: 'user2' },
      expiresAt: new Date(Date.now() - 1000)
    });

    await expect(new Promise((resolve, reject) => {
      store.get('sid-2', (error, value) => (error ? reject(error) : resolve(value)));
    })).resolves.toBeNull();

    expect(documents.has('sid-2')).toBe(false);
  });

  it('destroys sessions', async () => {
    const store = createStore();
    documents.set('sid-3', { _id: 'sid-3', session: { userId: 'user3' } });

    await new Promise((resolve, reject) => {
      store.destroy('sid-3', (error) => (error ? reject(error) : resolve()));
    });

    expect(documents.has('sid-3')).toBe(false);
  });
});
