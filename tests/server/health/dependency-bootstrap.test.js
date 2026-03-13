describe('dependency readiness bootstrap', () => {
  const originalMongoInterval = process.env.MONGO_HEALTHCHECK_INTERVAL_MS;
  const originalMongoTimeout = process.env.MONGO_HEALTHCHECK_TIMEOUT_MS;
  const originalRabbitReconnectDelay = process.env.RABBITMQ_RECONNECT_DELAY_MS;
  const originalRabbitConnectTimeout = process.env.RABBITMQ_CONNECT_TIMEOUT_MS;

  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  afterEach(() => {
    process.env.MONGO_HEALTHCHECK_INTERVAL_MS = originalMongoInterval;
    process.env.MONGO_HEALTHCHECK_TIMEOUT_MS = originalMongoTimeout;
    process.env.RABBITMQ_RECONNECT_DELAY_MS = originalRabbitReconnectDelay;
    process.env.RABBITMQ_CONNECT_TIMEOUT_MS = originalRabbitConnectTimeout;
  });

  it('marks mongo, rabbitmq, and redis healthy when connections succeed', async () => {
    const updateSharedDependencyState = jest.fn();
    const connectMongo = jest.fn().mockResolvedValue(undefined);
    const pingMongo = jest.fn().mockResolvedValue({ ok: 1 });
    const rabbitConnection = { on: jest.fn() };
    const connectRabbit = jest.fn().mockResolvedValue(rabbitConnection);
    const redisClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      connect: connectMongo,
      client: {
        db: jest.fn(() => ({
          admin: () => ({ command: pingMongo })
        }))
      }
    }));

    jest.doMock('amqplib', () => ({
      connect: connectRabbit
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => redisClient)
    }));

    jest.doMock('../../../src/server/health/dependency-state', () => ({
      updateSharedDependencyState
    }));

    const {
      initializeDependencyReadiness,
      stopDependencyReadinessMonitoring
    } = require('../../../src/server/health/dependency-bootstrap');

    await initializeDependencyReadiness();
    stopDependencyReadinessMonitoring();

    expect(connectMongo).toHaveBeenCalledTimes(1);
    expect(connectRabbit).toHaveBeenCalledTimes(1);
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
    expect(updateSharedDependencyState).toHaveBeenCalledWith('mongo', 'healthy');
    expect(updateSharedDependencyState).toHaveBeenCalledWith('rabbitmq', 'healthy');
    expect(updateSharedDependencyState).toHaveBeenCalledWith('redis', 'healthy');
  });

  it('transitions mongo to unhealthy when ping exceeds timeout threshold', async () => {
    jest.useFakeTimers();
    process.env.MONGO_HEALTHCHECK_INTERVAL_MS = '50';
    process.env.MONGO_HEALTHCHECK_TIMEOUT_MS = '20';

    const updateSharedDependencyState = jest.fn();
    const connectMongo = jest.fn().mockResolvedValue(undefined);
    const pingMongo = jest.fn(() => new Promise(() => {}));
    const rabbitConnection = { on: jest.fn() };
    const connectRabbit = jest.fn().mockResolvedValue(rabbitConnection);
    const redisClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      connect: connectMongo,
      client: {
        db: jest.fn(() => ({
          admin: () => ({ command: pingMongo })
        }))
      }
    }));

    jest.doMock('amqplib', () => ({
      connect: connectRabbit
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => redisClient)
    }));

    jest.doMock('../../../src/server/health/dependency-state', () => ({
      updateSharedDependencyState
    }));

    const {
      initializeDependencyReadiness,
      stopDependencyReadinessMonitoring
    } = require('../../../src/server/health/dependency-bootstrap');

    await initializeDependencyReadiness();
    await jest.advanceTimersByTimeAsync(90);
    stopDependencyReadinessMonitoring();

    expect(updateSharedDependencyState).toHaveBeenCalledWith('mongo', 'unhealthy');
  });

  it('reconnects rabbitmq after close event and marks it healthy again', async () => {
    jest.useFakeTimers();
    process.env.MONGO_HEALTHCHECK_INTERVAL_MS = '50';
    process.env.MONGO_HEALTHCHECK_TIMEOUT_MS = '20';
    process.env.RABBITMQ_RECONNECT_DELAY_MS = '20';

    const updateSharedDependencyState = jest.fn();
    const connectMongo = jest.fn().mockResolvedValue(undefined);
    const pingMongo = jest.fn().mockResolvedValue({ ok: 1 });

    let rabbitCloseHandler;
    const firstRabbitConnection = {
      on: jest.fn((event, handler) => {
        if (event === 'close') {
          rabbitCloseHandler = handler;
        }
      })
    };
    const secondRabbitConnection = { on: jest.fn() };
    const connectRabbit = jest.fn()
      .mockResolvedValueOnce(firstRabbitConnection)
      .mockResolvedValueOnce(secondRabbitConnection);

    const redisClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      connect: connectMongo,
      client: {
        db: jest.fn(() => ({
          admin: () => ({ command: pingMongo })
        }))
      }
    }));

    jest.doMock('amqplib', () => ({
      connect: connectRabbit
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => redisClient)
    }));

    jest.doMock('../../../src/server/health/dependency-state', () => ({
      updateSharedDependencyState
    }));

    const {
      initializeDependencyReadiness,
      stopDependencyReadinessMonitoring
    } = require('../../../src/server/health/dependency-bootstrap');

    await initializeDependencyReadiness();
    rabbitCloseHandler();
    await jest.advanceTimersByTimeAsync(30);
    stopDependencyReadinessMonitoring();

    expect(connectRabbit).toHaveBeenCalledTimes(2);
    expect(updateSharedDependencyState).toHaveBeenCalledWith('rabbitmq', 'unhealthy');
    expect(updateSharedDependencyState).toHaveBeenCalledWith('rabbitmq', 'healthy');
  });




  it('recovers mongo to healthy after initial connect failure when monitor retry succeeds', async () => {
    jest.useFakeTimers();
    process.env.MONGO_HEALTHCHECK_INTERVAL_MS = '50';
    process.env.MONGO_HEALTHCHECK_TIMEOUT_MS = '20';

    const updateSharedDependencyState = jest.fn();
    const connectMongo = jest.fn()
      .mockRejectedValueOnce(new Error('initial connect failed'))
      .mockResolvedValue(undefined);
    const pingMongo = jest.fn()
      .mockRejectedValueOnce(new Error('not connected'))
      .mockResolvedValue({ ok: 1 });

    const rabbitConnection = { on: jest.fn() };
    const connectRabbit = jest.fn().mockResolvedValue(rabbitConnection);

    const redisClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      connect: connectMongo,
      client: {
        db: jest.fn(() => ({
          admin: () => ({ command: pingMongo })
        }))
      }
    }));

    jest.doMock('amqplib', () => ({
      connect: connectRabbit
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => redisClient)
    }));

    jest.doMock('../../../src/server/health/dependency-state', () => ({
      updateSharedDependencyState
    }));

    const {
      initializeDependencyReadiness,
      stopDependencyReadinessMonitoring
    } = require('../../../src/server/health/dependency-bootstrap');

    await initializeDependencyReadiness();
    await jest.advanceTimersByTimeAsync(90);
    stopDependencyReadinessMonitoring();

    expect(updateSharedDependencyState).toHaveBeenCalledWith('mongo', 'unhealthy');
    expect(connectMongo).toHaveBeenCalledTimes(2);
    expect(updateSharedDependencyState).toHaveBeenCalledWith('mongo', 'healthy');
  });

  it('marks redis healthy again when ready event fires after an error', async () => {
    const updateSharedDependencyState = jest.fn();
    const connectMongo = jest.fn().mockResolvedValue(undefined);
    const pingMongo = jest.fn().mockResolvedValue({ ok: 1 });
    const rabbitConnection = { on: jest.fn() };
    const connectRabbit = jest.fn().mockResolvedValue(rabbitConnection);

    let redisErrorHandler;
    let redisReadyHandler;
    const redisClient = {
      on: jest.fn((event, handler) => {
        if (event === 'error') {
          redisErrorHandler = handler;
        }
        if (event === 'ready') {
          redisReadyHandler = handler;
        }
      }),
      connect: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      connect: connectMongo,
      client: {
        db: jest.fn(() => ({
          admin: () => ({ command: pingMongo })
        }))
      }
    }));

    jest.doMock('amqplib', () => ({
      connect: connectRabbit
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => redisClient)
    }));

    jest.doMock('../../../src/server/health/dependency-state', () => ({
      updateSharedDependencyState
    }));

    const {
      initializeDependencyReadiness,
      stopDependencyReadinessMonitoring
    } = require('../../../src/server/health/dependency-bootstrap');

    await initializeDependencyReadiness();
    redisErrorHandler(new Error('redis temporarily unavailable'));
    redisReadyHandler();
    stopDependencyReadinessMonitoring();

    expect(updateSharedDependencyState).toHaveBeenCalledWith('redis', 'unhealthy');
    expect(updateSharedDependencyState).toHaveBeenCalledWith('redis', 'healthy');
  });
});

