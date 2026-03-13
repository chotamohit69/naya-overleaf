const amqp = require('amqplib');
const redis = require('redis');
const dbConnection = require('../db/connection');
const { updateSharedDependencyState } = require('./dependency-state');

let rabbitConnection;
let redisClient;
let initializePromise;
let mongoHealthcheckInterval;
let rabbitReconnectTimeout;
let rabbitConnectionGeneration = 0;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MONGO_HEALTHCHECK_INTERVAL_MS = Number.parseInt(
  process.env.MONGO_HEALTHCHECK_INTERVAL_MS || '3000',
  10
);
const MONGO_HEALTHCHECK_TIMEOUT_MS = Number.parseInt(
  process.env.MONGO_HEALTHCHECK_TIMEOUT_MS || '1000',
  10
);
const RABBITMQ_RECONNECT_DELAY_MS = Number.parseInt(
  process.env.RABBITMQ_RECONNECT_DELAY_MS || '1000',
  10
);
const RABBITMQ_CONNECT_TIMEOUT_MS = Number.parseInt(
  process.env.RABBITMQ_CONNECT_TIMEOUT_MS || '3000',
  10
);

const createMongoPingTimeoutError = () => {
  const error = new Error(`mongo ping timed out after ${MONGO_HEALTHCHECK_TIMEOUT_MS}ms`);
  error.code = 'MONGO_PING_TIMEOUT';
  return error;
};

const createRabbitConnectTimeoutError = () => {
  const error = new Error(`rabbitmq connect timed out after ${RABBITMQ_CONNECT_TIMEOUT_MS}ms`);
  error.code = 'RABBITMQ_CONNECT_TIMEOUT';
  return error;
};

const checkMongoHealth = async () => {
  let pingTimeout;

  try {
    const mongoPingPromise = dbConnection.client.db().admin().command({ ping: 1 });
    const timeoutPromise = new Promise((_, reject) => {
      pingTimeout = setTimeout(() => reject(createMongoPingTimeoutError()), MONGO_HEALTHCHECK_TIMEOUT_MS);
    });

    await Promise.race([mongoPingPromise, timeoutPromise]);
    updateSharedDependencyState('mongo', 'healthy');
  } catch (error) {
    if (error && error.code === 'MONGO_PING_TIMEOUT') {
      updateSharedDependencyState('mongo', 'unhealthy');
      return;
    }

    try {
      await dbConnection.connect();
      updateSharedDependencyState('mongo', 'healthy');
    } catch (connectError) {
      updateSharedDependencyState('mongo', 'unhealthy');
    }
  } finally {
    if (pingTimeout) {
      clearTimeout(pingTimeout);
    }
  }
};

const connectRabbitWithTimeout = async () => {
  let connectTimeout;

  try {
    const connectPromise = amqp.connect(RABBITMQ_URL);
    const timeoutPromise = new Promise((_, reject) => {
      connectTimeout = setTimeout(
        () => reject(createRabbitConnectTimeoutError()),
        RABBITMQ_CONNECT_TIMEOUT_MS
      );
    });

    return await Promise.race([connectPromise, timeoutPromise]);
  } finally {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
    }
  }
};

const stopDependencyReadinessMonitoring = () => {
  if (!mongoHealthcheckInterval) {
    return;
  }

  clearInterval(mongoHealthcheckInterval);
  mongoHealthcheckInterval = undefined;
};

const startDependencyReadinessMonitoring = () => {
  stopDependencyReadinessMonitoring();

  mongoHealthcheckInterval = setInterval(() => {
    checkMongoHealth();
  }, MONGO_HEALTHCHECK_INTERVAL_MS);

  if (typeof mongoHealthcheckInterval.unref === 'function') {
    mongoHealthcheckInterval.unref();
  }
};

const stopRabbitReconnect = () => {
  if (!rabbitReconnectTimeout) {
    return;
  }

  clearTimeout(rabbitReconnectTimeout);
  rabbitReconnectTimeout = undefined;
};

const scheduleRabbitReconnect = (connectRabbitDependency) => {
  if (rabbitReconnectTimeout) {
    return;
  }

  rabbitReconnectTimeout = setTimeout(async () => {
    rabbitReconnectTimeout = undefined;

    try {
      await connectRabbitDependency();
    } catch (error) {
      updateSharedDependencyState('rabbitmq', 'unhealthy');
      scheduleRabbitReconnect(connectRabbitDependency);
    }
  }, RABBITMQ_RECONNECT_DELAY_MS);

  if (typeof rabbitReconnectTimeout.unref === 'function') {
    rabbitReconnectTimeout.unref();
  }
};

async function initializeDependencyReadiness() {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    try {
      await dbConnection.connect();
      updateSharedDependencyState('mongo', 'healthy');
      startDependencyReadinessMonitoring();
    } catch (error) {
      updateSharedDependencyState('mongo', 'unhealthy');
      startDependencyReadinessMonitoring();
    }

    const connectRabbitDependency = async () => {
      const nextGeneration = rabbitConnectionGeneration + 1;
      const connection = await connectRabbitWithTimeout();

      rabbitConnectionGeneration = nextGeneration;
      rabbitConnection = connection;
      updateSharedDependencyState('rabbitmq', 'healthy');
      stopRabbitReconnect();

      connection.on('error', () => {
        if (rabbitConnectionGeneration !== nextGeneration) {
          return;
        }

        updateSharedDependencyState('rabbitmq', 'unhealthy');
        scheduleRabbitReconnect(connectRabbitDependency);
      });
      connection.on('close', () => {
        if (rabbitConnectionGeneration !== nextGeneration) {
          return;
        }

        updateSharedDependencyState('rabbitmq', 'unhealthy');
        scheduleRabbitReconnect(connectRabbitDependency);
      });
    };

    try {
      await connectRabbitDependency();
    } catch (error) {
      updateSharedDependencyState('rabbitmq', 'unhealthy');
      scheduleRabbitReconnect(connectRabbitDependency);
    }

    try {
      redisClient = redis.createClient({ url: REDIS_URL });
      redisClient.on('error', () => {
        updateSharedDependencyState('redis', 'unhealthy');
      });
      redisClient.on('ready', () => {
        updateSharedDependencyState('redis', 'healthy');
      });
      await redisClient.connect();
      updateSharedDependencyState('redis', 'healthy');
    } catch (error) {
      updateSharedDependencyState('redis', 'unhealthy');
    }
  })().finally(() => {
    initializePromise = undefined;
  });

  return initializePromise;
}

module.exports = {
  initializeDependencyReadiness,
  startDependencyReadinessMonitoring,
  stopDependencyReadinessMonitoring
};
