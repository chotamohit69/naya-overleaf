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

router.get('/projects', optionalAuth, projectsController.getAllProjects);
router.get('/projects/:id', optionalAuth, projectsController.getProject);
router.post('/projects', optionalAuth, projectsController.createProject);
router.put('/projects/:id', optionalAuth, projectsController.updateProject);
router.delete('/projects/:id', optionalAuth, projectsController.deleteProject);

router.get('/documents/:id', optionalAuth, documentsController.getDocument);
router.get('/documents/:id/pdf', optionalAuth, documentsController.getDocumentPdf);
router.post('/documents', optionalAuth, documentsController.createDocument);
router.put('/documents/:id', optionalAuth, documentsController.updateDocument);
router.delete('/documents/:id', optionalAuth, documentsController.deleteDocument);
router.get('/documents/download', optionalAuth, documentsController.downloadPdf);

router.post('/compile/:documentId', optionalAuth, compilationController.compileDocument);
router.get('/compile/status/:jobId', optionalAuth, compilationController.getCompilationStatus);
router.get('/compile/status/:documentId/latest', optionalAuth, documentsController.getLatestCompilationStatus);

router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'live' });
});

router.get('/health/ready', (req, res) => {
  const readiness = getReadinessPayload('app');
  setReadinessMetrics(readiness);
  const statusCode = readiness.ready ? 200 : 503;

  res.status(statusCode).json(readiness);
});

router.get('/observability/metrics', (req, res) => {
  res.status(200).json(getMetricsSnapshot());
});

module.exports = router;
