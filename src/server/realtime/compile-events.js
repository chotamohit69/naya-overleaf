/**
 * Bridges compilation completion events from the worker (Redis pub/sub) into
 * Socket.IO rooms so connected editors do not have to poll for the final state.
 */

const redis = require('redis');
const { recordCompilation } = require('../observability/metrics');

const COMPILATION_EVENTS_CHANNEL = 'naya:compilation-events';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_CONNECT_TIMEOUT_MS = Number.parseInt(
  process.env.REDIS_CONNECT_TIMEOUT_MS || '3000',
  10
);

let subscriber = null;

async function startCompileEventBridge(io, options = {}) {
  if (subscriber) {
    return subscriber;
  }

  const url = options.redisUrl || REDIS_URL;

  try {
    subscriber = redis.createClient({ url });
    subscriber.on('error', (error) => {
      console.error('Compilation event subscriber error:', error.message);
    });

    let connectTimeout;
    try {
      await Promise.race([
        subscriber.connect(),
        new Promise((_, reject) => {
          connectTimeout = setTimeout(
            () => reject(new Error(`redis connect timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`)),
            REDIS_CONNECT_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
    }

    await subscriber.subscribe(COMPILATION_EVENTS_CHANNEL, (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage);
        recordCompilation({
          success: payload.type === 'completed',
          durationMs: payload.durationMs
        });

        if (payload.documentId) {
          io.to(payload.documentId).emit('compilation-complete', payload);
        }
      } catch (error) {
        console.error('Failed to handle compilation event:', error.message);
      }
    });

    console.log('Compilation event bridge connected');
    return subscriber;
  } catch (error) {
    console.error('Compilation event bridge unavailable:', error.message);
    if (subscriber) {
      try {
        subscriber.disconnect();
      } catch (disconnectError) {
        // Ignore cleanup errors.
      }
    }
    subscriber = null;
    return null;
  }
}

async function stopCompileEventBridge() {
  if (!subscriber) {
    return;
  }

  try {
    await subscriber.quit();
  } catch (error) {
    // Ignore shutdown errors.
  }

  subscriber = null;
}

module.exports = {
  COMPILATION_EVENTS_CHANNEL,
  startCompileEventBridge,
  stopCompileEventBridge
};
