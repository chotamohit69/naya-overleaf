/**
 * API Routes for Naya Overleaf
 */

const express = require('express');
const router = express.Router();
const keycloak = require('../auth/keycloak-config').keycloak;

const projectsController = require('./controllers/projects');
const documentsController = require('./controllers/documents');
const compilationController = require('./controllers/compilation');
const { evaluateReadiness } = require('../health/readiness-policy');
const { getDependencyState } = require('../health/dependency-state');
const {
  getMetricsSnapshot,
  setReadinessMetrics,
  recordApiResult
} = require('../observability/metrics');

const getReadinessPayload = (serviceName) => {
  try {
    const dependencyState = getDependencyState();
    return evaluateReadiness(dependencyState, serviceName);
  } catch (error) {
    return {
      ready: false,
      degraded: false,
      reasons: ['readiness_unavailable'],
      featureImpacts: []
    };
  }
};

const optionalAuth = (req, res, next) => {
  if (req.kauth && req.kauth.grant) {
    return keycloak.protect()(req, res, next);
  }
  if (req.user) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

const requireAdmin = (req, res, next) => {
  const roles = req.user?.roles
    || req.kauth?.grant?.access_token?.content?.realm_access?.roles
    || [];

  if (!Array.isArray(roles) || !roles.includes('admin')) {
    return res.status(403).json({ error: 'Administrator access required' });
  }

  return next();
};

router.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    recordApiResult({
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});

router.get('/config', (req, res) => {
  res.json({
    aiEnabled: process.env.AI_ENABLED !== 'false',
    aiServiceUrl: '/api/ai'
  });
});

router.get('/projects', optionalAuth, projectsController.getAllProjects);
router.get('/projects/:id', optionalAuth, projectsController.getProject);
router.post('/projects', optionalAuth, projectsController.createProject);
router.put('/projects/:id', optionalAuth, projectsController.updateProject);
router.delete('/projects/:id', optionalAuth, projectsController.deleteProject);

router.get('/documents/download', optionalAuth, documentsController.downloadPdf);
router.get('/documents/:id', optionalAuth, documentsController.getDocument);
router.get('/documents/:id/pdf', optionalAuth, documentsController.getDocumentPdf);
router.post('/documents', optionalAuth, documentsController.createDocument);
router.put('/documents/:id', optionalAuth, documentsController.updateDocument);
router.delete('/documents/:id', optionalAuth, documentsController.deleteDocument);

router.post('/compile/:documentId', optionalAuth, compilationController.compileDocument);
router.get('/compile/status/:jobId', optionalAuth, compilationController.getCompilationStatus);
router.get('/compile/status/:documentId/latest', optionalAuth, documentsController.getLatestCompilationStatus);

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'live' });
});

router.get('/health/ready', (req, res) => {
  const readiness = getReadinessPayload('app');
  setReadinessMetrics(readiness);
  const statusCode = readiness.ready ? 200 : 503;

  res.status(statusCode).json(readiness);
});

router.get('/observability/metrics', optionalAuth, requireAdmin, (req, res) => {
  res.status(200).json(getMetricsSnapshot());
});

router.get('/observability/alerts', optionalAuth, requireAdmin, (req, res) => {
  const { getActiveAlerts } = require('../observability/alert-monitor');
  res.status(200).json({ alerts: getActiveAlerts() });
});

module.exports = router;
