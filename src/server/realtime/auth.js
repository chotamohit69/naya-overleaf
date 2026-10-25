const { ObjectId } = require('mongodb');

function getUserIdFromRequest(req) {
  return req?.kauth?.grant?.access_token?.content?.sub
    || req?.user?.id
    || req?.user?.sub
    || getUserIdFromKeycloakSession(req);
}

function getUserIdFromKeycloakSession(req) {
  const rawGrant = req?.session?.['keycloak-token'];
  if (!rawGrant) {
    return null;
  }

  try {
    const grant = typeof rawGrant === 'string' ? JSON.parse(rawGrant) : rawGrant;
    const accessToken = grant?.access_token;
    const tokenParts = typeof accessToken === 'string' ? accessToken.split('.') : [];
    if (tokenParts.length < 2) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8'));
    return payload?.sub || null;
  } catch (error) {
    return null;
  }
}

function isValidObjectId(value) {
  return typeof value === 'string' && ObjectId.isValid(value);
}

function isServerSideAgent(agent) {
  return !agent || !agent.stream || agent.custom?.serverSide;
}

async function userCanAccessDocument(db, userId, documentId) {
  if (!userId || !isValidObjectId(documentId)) {
    return false;
  }

  const document = await db.collection('documents').findOne({
    _id: new ObjectId(documentId),
    deleted: { $ne: true }
  });

  if (!document?.projectId || !isValidObjectId(document.projectId)) {
    return false;
  }

  const project = await db.collection('projects').findOne({
    _id: new ObjectId(document.projectId),
    $or: [
      { userId },
      { collaborators: userId }
    ],
    deleted: { $ne: true }
  });

  return Boolean(project);
}

function createRealtimeAccessError(message = 'Realtime document access denied') {
  const error = new Error(message);
  error.code = 'REALTIME_ACCESS_DENIED';
  return error;
}

function getAgentUserId(agent) {
  return agent?.custom?.userId || agent?.req?.realtimeUserId || null;
}

function installRealtimeAccessControl(backend, dbModule) {
  backend.use('connect', (request, next) => {
    if (!request.req || request.agent?.stream?.isServer) {
      return next();
    }

    const userId = getUserIdFromRequest(request.req);
    if (!userId) {
      return next(createRealtimeAccessError('Authentication required for realtime connection'));
    }

    request.agent.custom = request.agent.custom || {};
    request.agent.custom.userId = userId;
    next();
  });

  backend.use('readSnapshots', async (request, next) => {
    try {
      if (isServerSideAgent(request.agent) || request.collection !== 'documents') {
        return next();
      }

      const userId = getAgentUserId(request.agent);
      const snapshots = Array.isArray(request.snapshots) ? request.snapshots : [];

      for (const snapshot of snapshots) {
        const documentId = snapshot?.id;
        const allowed = await userCanAccessDocument(dbModule.db, userId, documentId);
        if (!allowed) {
          request.rejectSnapshotRead(snapshot, createRealtimeAccessError());
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  });

  backend.use('submit', async (request, next) => {
    try {
      if (isServerSideAgent(request.agent) || request.collection !== 'documents') {
        return next();
      }

      const userId = getAgentUserId(request.agent);
      const allowed = await userCanAccessDocument(dbModule.db, userId, request.id);
      if (!allowed) {
        return next(createRealtimeAccessError());
      }

      next();
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  createRealtimeAccessError,
  getUserIdFromRequest,
  installRealtimeAccessControl,
  userCanAccessDocument
};
