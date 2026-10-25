/**
 * Naya Overleaf - Server Entry Point
 */

const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const WebSocket = require('ws');
const keycloak = require('./auth/keycloak-config').keycloak;
const { sessionMiddleware } = require('./auth/keycloak-config');
const { devAuthMiddleware, createDevAuthRoutes, IS_DEV } = require('./auth/dev-auth');

const apiRoutes = require('./api/routes');
const authRoutes = require('./auth/routes');
const userApiKeysRoutes = require('./routes/userApiKeysRoutes');
const internalRoutes = require('./routes/internalRoutes');
const aiProxyRoutes = require('./routes/aiProxyRoutes');

const dbConnection = require('./db/connection');
const shareDBConnection = require('./realtime/sharedb-connection');
const { getUserIdFromRequest, userCanAccessDocument } = require('./realtime/auth');
const { correlationMiddleware } = require('./observability/correlation');
const {
  recordWebsocketConnected,
  recordWebsocketDisconnected,
  recordWebsocketError
} = require('./observability/metrics');
const { startAlertMonitoring, stopAlertMonitoring } = require('./observability/alert-monitor');
const { startCompileEventBridge, stopCompileEventBridge } = require('./realtime/compile-events');
const { initializeDependencyReadiness } = require('./health/dependency-bootstrap');

const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  recordWebsocketConnected();

  ws.on('close', () => {
    recordWebsocketDisconnected();
  });

  ws.on('error', () => {
    recordWebsocketError();
  });
});

app.use(helmet({
  contentSecurityPolicy: IS_DEV ? false : {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(correlationMiddleware);

const configuredBrowserOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Browser state-changing requests must come from this origin (or an explicitly
// configured origin). SameSite=Lax cookies already block most cross-site form
// posts; checking Origin/Referer closes the remaining browser paths without
// requiring a token in every fetch call.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const source = req.headers.origin || req.headers.referer;
  if (!source) {
    return next();
  }

  let sourceOrigin;
  try {
    sourceOrigin = new URL(source).origin;
  } catch (error) {
    return res.status(403).json({ error: 'Invalid request origin' });
  }

  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  if (sourceOrigin !== requestOrigin && !configuredBrowserOrigins.has(sourceOrigin)) {
    return res.status(403).json({ error: 'Cross-origin request rejected' });
  }

  return next();
});
app.use(express.static(path.join(__dirname, '../../public')));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use(sessionMiddleware);

if (IS_DEV) {
  app.use(devAuthMiddleware);
  app.use('/auth', createDevAuthRoutes());
}

app.use(keycloak.middleware());

app.use('/api', apiLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api', apiRoutes);
app.use('/api', userApiKeysRoutes);
app.use('/api/ai', aiProxyRoutes);
app.use('/internal', internalRoutes);
app.use('/auth', authRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

function runMiddleware(middleware, req, res = {}) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function authenticateUpgradeRequest(request) {
  await runMiddleware(sessionMiddleware, request, {});

  if (IS_DEV) {
    await runMiddleware(devAuthMiddleware, request, {});
  }

  const userId = getUserIdFromRequest(request);
  if (!userId) {
    const error = new Error('Authentication required for realtime websocket');
    error.code = 'REALTIME_AUTH_REQUIRED';
    throw error;
  }

  request.realtimeUserId = userId;
  return userId;
}

server.on('upgrade', async (request, socket, head) => {
  if (request.url === '/ws' || request.url.startsWith('/ws?')) {
    try {
      await authenticateUpgradeRequest(request);
      await shareDBConnection.initializeShareDB();
      wss.handleUpgrade(request, socket, head, (ws) => {
        const stream = new WebSocketJSONStream(ws);
        shareDBConnection.getBackend().listen(stream, request);
      });
    } catch (error) {
      recordWebsocketError();
      console.error('Failed to initialize ShareDB for websocket upgrade:', error);
      socket.destroy();
    }
  } else if (request.url.startsWith('/socket.io')) {
    // Socket.IO handles its own upgrade
  }
});

// Reuse the Express session and development identity for Socket.IO handshakes.
io.engine.use(sessionMiddleware);
if (IS_DEV) {
  io.engine.use(devAuthMiddleware);
}

io.use((socket, next) => {
  const userId = getUserIdFromRequest(socket.request);

  if (!userId) {
    return next(new Error('Authentication required for realtime events'));
  }

  socket.data.userId = userId;
  next();
});

io.on('connection', (socket) => {
  recordWebsocketConnected();

  socket.on('join-document', async (documentId) => {
    try {
      const allowed = await userCanAccessDocument(dbConnection.db, socket.data.userId, documentId);
      if (!allowed) {
        socket.emit('realtime-error', { error: 'Access denied to this document' });
        return;
      }

      socket.join(documentId);
    } catch (error) {
      recordWebsocketError();
      socket.emit('realtime-error', { error: 'Failed to join document' });
    }
  });

  socket.on('leave-document', (documentId) => {
    socket.leave(documentId);
  });

  socket.on('error', () => {
    recordWebsocketError();
  });

  socket.on('disconnect', () => {
    recordWebsocketDisconnected();
  });
});

function validateProductionConfiguration() {
  const nodeEnvironment = process.env.NODE_ENV || 'development';

  if (nodeEnvironment === 'development' || nodeEnvironment === 'test') {
    return;
  }

  const missingVariables = [];
  const aiEnabled = process.env.AI_ENABLED !== 'false';

  if (aiEnabled) {
    if (!process.env.AI_INTERNAL_SECRET || process.env.AI_INTERNAL_SECRET.length < 16) {
      missingVariables.push('AI_INTERNAL_SECRET (minimum 16 characters)');
    }

    if (!/^[0-9a-f]{64}$/i.test(process.env.AI_KEY_ENCRYPTION_SECRET || '')) {
      missingVariables.push('AI_KEY_ENCRYPTION_SECRET (64 hex characters)');
    }
  }

  if (missingVariables.length > 0) {
    throw new Error(`Invalid production configuration: ${missingVariables.join(', ')}`);
  }
}

const initializeServer = async () => {
  validateProductionConfiguration();

  const PORT = process.env.PORT || 3000;

  // Bind the HTTP server before dependency bootstrap. Liveness must not depend
  // on Mongo/RabbitMQ/Redis being reachable; readiness reports the dependency
  // state separately and stays 503 until critical dependencies are healthy.
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      server.once('error', onError);
      server.listen(PORT, () => {
        server.off('error', onError);
        resolve();
      });
    });
  }

  console.log(`Server running on port ${PORT}`);
  if (IS_DEV) {
    console.log('Development mode: Using mock authentication');
    console.log('Access the app at: http://localhost:' + PORT);
  }

  initializeDependencyReadiness().catch((error) => {
    console.error('Failed to initialize dependency readiness:', error.message);
  });
  startAlertMonitoring();

  // Redis pub/sub is an optimization for live compile events. Polling still
  // works, so it must never block startup.
  if (!PREVIEW_MODE) {
    startCompileEventBridge(io).catch((error) => {
      console.error('Failed to start compilation event bridge:', error.message);
    });
  }
};

let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}; shutting down`);

  const forceExit = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  stopAlertMonitoring();
  stopCompileEventBridge().catch(() => {});
  io.close();

  server.close(async () => {
    try {
      await dbConnection.client.close();
    } catch (error) {
      console.error('Failed to close MongoDB client:', error.message);
    }

    clearTimeout(forceExit);
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

initializeServer().catch((error) => {
  console.error('Failed to initialize server dependencies:', error);
  process.exit(1);
});

module.exports = { app, server, io, initializeServer, shutdown };
