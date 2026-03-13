/**
 * Naya Overleaf - Server Entry Point
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const WebSocket = require('ws');
const keycloak = require('./auth/keycloak-config').keycloak;
const { devAuthMiddleware, createDevAuthRoutes, IS_DEV } = require('./auth/dev-auth');

const apiRoutes = require('./api/routes');
const authRoutes = require('./auth/routes');
const userApiKeysRoutes = require('./routes/userApiKeysRoutes');
const internalRoutes = require('./routes/internalRoutes');

const shareDBConnection = require('./realtime/sharedb-connection');
const { correlationMiddleware } = require('./observability/correlation');
const { initializeDependencyReadiness } = require('./health/dependency-bootstrap');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const wss = new WebSocket.Server({ noServer: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(correlationMiddleware);
app.use(express.static(path.join(__dirname, '../../public')));

const { sessionMiddleware } = require('./auth/keycloak-config');

app.use(sessionMiddleware);

if (IS_DEV) {
  app.use(devAuthMiddleware);
  app.use('/auth', createDevAuthRoutes());
}

app.use(keycloak.middleware());

app.use('/api', apiRoutes);
app.use('/api', userApiKeysRoutes);
app.use('/', internalRoutes);
app.use('/auth', authRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

server.on('upgrade', async (request, socket, head) => {
  if (request.url === '/ws' || request.url.startsWith('/ws?')) {
    try {
      await shareDBConnection.initializeShareDB();
      wss.handleUpgrade(request, socket, head, (ws) => {
        const stream = new WebSocketJSONStream(ws);
        shareDBConnection.getBackend().listen(stream);
      });
    } catch (error) {
      console.error('Failed to initialize ShareDB for websocket upgrade:', error);
      socket.destroy();
    }
  } else if (request.url.startsWith('/socket.io')) {
    // Socket.IO handles its own upgrade
  }
});

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('join-document', (documentId) => {
    socket.join(documentId);
    console.log(`Client joined document: ${documentId}`);
  });
  
  socket.on('leave-document', (documentId) => {
    socket.leave(documentId);
    console.log(`Client left document: ${documentId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const initializeServer = async () => {
  await initializeDependencyReadiness();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (IS_DEV) {
      console.log('Development mode: Using mock authentication');
      console.log('Access the app at: http://localhost:' + PORT);
    }
  });
};

initializeServer().catch((error) => {
  console.error('Failed to initialize server dependencies:', error);
  process.exit(1);
});

module.exports = { app, server, io, initializeServer };