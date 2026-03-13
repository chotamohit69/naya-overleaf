const http = require('http');
const express = require('express');

const performRequest = ({ app, method, path, headers = {} }) => new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          server.close(() => {
            let body = {};
            if (data) {
              try {
                body = JSON.parse(data);
              } catch (error) {
                body = { raw: data };
              }
            }
            resolve({ status: res.statusCode, body });
          });
        });
      }
    );

    req.on('error', (error) => {
      server.close(() => reject(error));
    });

    req.end();
  });
});

describe('internal health routes', () => {
  const originalInternalSecret = process.env.AI_INTERNAL_SECRET;

  beforeEach(() => {
    process.env.AI_INTERNAL_SECRET = 'test-secret';
    jest.resetModules();
  });

  afterAll(() => {
    process.env.AI_INTERNAL_SECRET = originalInternalSecret;
  });

  const mountInternalRoutes = ({ mockResult, dependencyState, throwOnDependencyRead } = {}) => {
    jest.doMock('../../../src/server/db/connection', () => ({
      db: {
        collection: jest.fn(() => ({
          findOne: jest.fn()
        }))
      }
    }));

    jest.doMock('../../../src/server/utils/KeyEncryption', () => ({
      decrypt: jest.fn()
    }));

    if (mockResult) {
      jest.doMock('../../../src/server/health/readiness-policy', () => ({
        evaluateReadiness: jest.fn(() => mockResult)
      }));
    }

    if (throwOnDependencyRead) {
      jest.doMock('../../../src/server/health/dependency-state', () => ({
        getDependencyState: jest.fn(() => {
          throw new Error('dependency state unavailable');
        })
      }));
    }

    if (dependencyState) {
      const dependencyStateModule = require('../../../src/server/health/dependency-state');
      dependencyStateModule.setDependencyState(dependencyState);
    }

    const internalRoutes = require('../../../src/server/routes/internalRoutes');
    const app = express();
    app.use('/', internalRoutes);

    return app;
  };

  it('GET /internal/health returns 503 when shared dependency state is unhealthy (non-mocked route path)', async () => {
    const app = mountInternalRoutes({
      dependencyState: {
        mongo: 'unhealthy',
        rabbitmq: 'healthy',
        redis: 'healthy'
      }
    });

    const res = await performRequest({
      app,
      method: 'GET',
      path: '/internal/health',
      headers: { 'x-internal-secret': 'test-secret' }
    });

    expect(res.status).toBe(503);
    expect(res.body).toEqual(expect.objectContaining({
      ready: false,
      degraded: false,
      reasons: expect.arrayContaining(['mongo']),
      featureImpacts: []
    }));
  });

  it('GET /internal/health returns 200 when degraded-ready and follows readiness contract', async () => {
    const app = mountInternalRoutes({
      mockResult: {
        ready: true,
        degraded: true,
        reasons: [],
        featureImpacts: ['cache']
      }
    });

    const res = await performRequest({
      app,
      method: 'GET',
      path: '/internal/health',
      headers: { 'x-internal-secret': 'test-secret' }
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ready: true,
      degraded: true,
      reasons: [],
      featureImpacts: expect.arrayContaining(['cache'])
    }));
  });

  it('GET /internal/health returns controlled not-ready payload when readiness retrieval fails', async () => {
    const app = mountInternalRoutes({ throwOnDependencyRead: true });

    const res = await performRequest({
      app,
      method: 'GET',
      path: '/internal/health',
      headers: { 'x-internal-secret': 'test-secret' }
    });

    expect(res.status).toBe(503);
    expect(res.body).toEqual(expect.objectContaining({
      ready: false,
      degraded: false,
      reasons: expect.arrayContaining(['readiness_unavailable']),
      featureImpacts: []
    }));
  });
});
