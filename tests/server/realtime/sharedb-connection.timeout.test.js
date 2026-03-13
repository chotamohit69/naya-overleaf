describe('sharedb initialization timeout behavior', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails initialization after timeout when db never becomes ready', async () => {
    jest.doMock('../../../src/server/db/connection', () => ({
      db: null
    }));

    const dependencyState = require('../../../src/server/health/dependency-state');
    dependencyState.setDependencyState({
      mongo: 'unknown',
      rabbitmq: 'healthy',
      redis: 'healthy'
    });

    const sharedbConnection = require('../../../src/server/realtime/sharedb-connection');

    await expect(sharedbConnection.initializeShareDB({ timeoutMs: 50 })).rejects.toMatchObject({
      code: 'SHAREDB_INIT_TIMEOUT'
    });

    expect(dependencyState.getDependencyState().mongo).toBe('unhealthy');
  });

  it('succeeds when db becomes ready before timeout', async () => {
    const dbModuleMock = {
      db: null
    };

    jest.doMock('../../../src/server/db/connection', () => dbModuleMock);

    const sharedbConnection = require('../../../src/server/realtime/sharedb-connection');

    setTimeout(() => {
      dbModuleMock.db = {
        collection: () => ({
          findOne: jest.fn(),
          updateOne: jest.fn(),
          deleteOne: jest.fn(),
          insertOne: jest.fn(),
          find: () => ({ sort: () => ({ toArray: jest.fn() }) })
        })
      };
    }, 20);

    await expect(sharedbConnection.initializeShareDB({ timeoutMs: 200 })).resolves.toEqual(
      expect.objectContaining({
        backend: expect.any(Object),
        connection: expect.any(Object)
      })
    );
  });
});
