describe('mongo connection readiness behavior', () => {
  const originalMongoUri = process.env.MONGODB_URI;
  const originalDbName = process.env.DB_NAME;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.MONGODB_URI = originalMongoUri;
    process.env.DB_NAME = originalDbName;
  });

  it('does not connect at module import time', () => {
    const connectMock = jest.fn().mockResolvedValue(undefined);
    const mockClient = {
      connect: connectMock,
      db: jest.fn(() => ({ name: 'mockdb' })),
      close: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => mockClient)
    }));

    require('../../../src/server/db/connection');

    expect(connectMock).not.toHaveBeenCalled();
  });

  it('marks mongo unhealthy on connect failure without exiting process', async () => {
    const connectMock = jest.fn().mockRejectedValue(new Error('connect failed'));
    const mockClient = {
      connect: connectMock,
      db: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => mockClient)
    }));

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should not be called');
    });

    const dependencyStateModule = require('../../../src/server/health/dependency-state');
    dependencyStateModule.setDependencyState({
      mongo: 'unknown',
      rabbitmq: 'healthy',
      redis: 'healthy'
    });

    const { connect } = require('../../../src/server/db/connection');

    await expect(connect()).rejects.toThrow('connect failed');

    expect(dependencyStateModule.getDependencyState().mongo).toBe('unhealthy');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('marks mongo healthy after successful reconnect', async () => {
    const connectMock = jest.fn()
      .mockRejectedValueOnce(new Error('initial failure'))
      .mockResolvedValueOnce(undefined);

    const dbMock = jest.fn(() => ({ name: 'mockdb' }));

    const mockClient = {
      connect: connectMock,
      db: dbMock,
      close: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => mockClient)
    }));

    const dependencyStateModule = require('../../../src/server/health/dependency-state');
    dependencyStateModule.setDependencyState({
      mongo: 'unknown',
      rabbitmq: 'healthy',
      redis: 'healthy'
    });

    const { connect } = require('../../../src/server/db/connection');

    await expect(connect()).rejects.toThrow('initial failure');
    expect(dependencyStateModule.getDependencyState().mongo).toBe('unhealthy');

    await expect(connect()).resolves.toEqual({ name: 'mockdb' });
    expect(dependencyStateModule.getDependencyState().mongo).toBe('healthy');
  });
});
