/**
 * Hosted preview entry point.
 *
 * Starts an in-memory MongoDB, then boots the normal server with the preview
 * compiler backend. This is for Render demo deployments only; production
 * deployments use the Docker worker and external MongoDB/RabbitMQ/Redis.
 */

process.env.PREVIEW_MODE = 'true';
process.env.SKIP_KEYCLOAK = process.env.SKIP_KEYCLOAK || 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.AI_ENABLED = process.env.AI_ENABLED || 'false';

const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  console.log('Starting preview database...');

  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'naya_overleaf',
      // Small instances need a bounded WiredTiger cache.
      args: ['--wiredTigerCacheSizeGB', '0.25']
    }
  });

  process.env.MONGODB_URI = mongod.getUri('naya_overleaf');
  process.env.DB_NAME = 'naya_overleaf';

  console.log('Preview database ready');

  // Connect before the server modules load so ShareDB does not start against
  // an unconnected database.
  const dbConnection = require('../src/server/db/connection');
  await dbConnection.connect();

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      try {
        await mongod.stop();
      } catch (error) {
        // The process is exiting anyway.
      }
    });
  }

  require('../src/server/index');
}

main().catch((error) => {
  console.error('Failed to start the preview server:', error);
  process.exit(1);
});
