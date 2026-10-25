describe('realtime auth', () => {
  const documentId = '507f1f77bcf86cd799439011';
  const projectId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    jest.resetModules();
  });

  it('allows access to a document when the user owns the project', async () => {
    jest.doMock('../../../src/server/db/connection', () => ({
      db: {
        collection: jest.fn((name) => {
          if (name === 'documents') {
            return {
              findOne: jest.fn().mockResolvedValue({
                _id: 'doc1',
                projectId
              })
            };
          }

          if (name === 'projects') {
            return {
              findOne: jest.fn().mockResolvedValue({
                _id: projectId,
                userId: 'user1',
                collaborators: []
              })
            };
          }

          return {};
        })
      }
    }));

    const { userCanAccessDocument } = require('../../../src/server/realtime/auth');
    await expect(userCanAccessDocument(require('../../../src/server/db/connection').db, 'user1', documentId)).resolves.toBe(true);
  });

  it('denies access when the project is not shared with the user', async () => {
    jest.doMock('../../../src/server/db/connection', () => ({
      db: {
        collection: jest.fn((name) => {
          if (name === 'documents') {
            return {
              findOne: jest.fn().mockResolvedValue({
                _id: 'doc1',
                projectId
              })
            };
          }

          if (name === 'projects') {
            return {
              findOne: jest.fn().mockResolvedValue(null)
            };
          }

          return {};
        })
      }
    }));

    const { userCanAccessDocument } = require('../../../src/server/realtime/auth');
    await expect(userCanAccessDocument(require('../../../src/server/db/connection').db, 'user2', documentId)).resolves.toBe(false);
  });

  it('registers connect/read/write middleware', () => {
    const middlewares = {};
    const backend = {
      use: jest.fn((action, fn) => {
        middlewares[action] = fn;
      })
    };

    const { installRealtimeAccessControl } = require('../../../src/server/realtime/auth');
    installRealtimeAccessControl(backend, { db: { collection: jest.fn() } });

    expect(backend.use).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(backend.use).toHaveBeenCalledWith('readSnapshots', expect.any(Function));
    expect(backend.use).toHaveBeenCalledWith('submit', expect.any(Function));
  });
});
