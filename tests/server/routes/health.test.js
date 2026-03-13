const {
  createDependencyState,
  updateDependencyState
} = require('../../../src/server/health/dependency-state');
const { evaluateReadiness } = require('../../../src/server/health/readiness-policy');

describe('health readiness policy', () => {
  it('returns not-ready for app when a critical dependency for app is unhealthy', () => {
    const state = { mongo: 'healthy', rabbitmq: 'unhealthy', redis: 'healthy' };

    const result = evaluateReadiness(state, 'app');

    expect(result.ready).toBe(false);
    expect(result.reasons).toContain('rabbitmq');
  });

  it('returns degraded-ready for app when only non-critical dependencies for app are unhealthy', () => {
    const state = { mongo: 'healthy', rabbitmq: 'healthy', redis: 'unhealthy' };

    const result = evaluateReadiness(state, 'app');

    expect(result.ready).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.featureImpacts).toContain('cache');
  });

  it('returns not-ready for worker when a worker-critical dependency is unhealthy', () => {
    const state = { mongo: 'healthy', rabbitmq: 'unhealthy', redis: 'healthy' };

    const result = evaluateReadiness(state, 'worker');

    expect(result.ready).toBe(false);
    expect(result.reasons).toContain('rabbitmq');
  });

  it('throws a controlled error for invalid state', () => {
    expect(() => evaluateReadiness(null, 'app')).toThrow('state must be an object');
  });

  it('throws for unknown serviceName', () => {
    expect(() => evaluateReadiness({ mongo: 'healthy' }, 'api')).toThrow('Unknown serviceName: api');
  });
});

describe('dependency state immutability', () => {
  it('updates dependency snapshots immutably', () => {
    const initialState = createDependencyState({
      mongo: 'unknown',
      rabbitmq: 'unknown',
      redis: 'unknown'
    });

    const updatedState = updateDependencyState(initialState, 'mongo', 'healthy');

    expect(updatedState).not.toBe(initialState);
    expect(updatedState).toEqual({
      mongo: 'healthy',
      rabbitmq: 'unknown',
      redis: 'unknown'
    });
    expect(initialState).toEqual({
      mongo: 'unknown',
      rabbitmq: 'unknown',
      redis: 'unknown'
    });
  });

  it('throws for invalid initialState when null', () => {
    expect(() => createDependencyState(null)).toThrow('initialState must be an object');
  });

  it('throws for invalid initialState when array', () => {
    expect(() => createDependencyState([])).toThrow('initialState must be an object');
  });

  it('throws for invalid seeded state value', () => {
    expect(() => createDependencyState({ mongo: 'degraded' })).toThrow('initialState contains invalid dependency state for mongo');
  });

  it('throws for invalid currentState', () => {
    expect(() => updateDependencyState(null, 'mongo', 'healthy')).toThrow('currentState must be an object');
  });

  it('throws for invalid currentState when array', () => {
    expect(() => updateDependencyState([], 'mongo', 'healthy')).toThrow('currentState must be an object');
  });

  it('throws for invalid dependencyName', () => {
    expect(() => updateDependencyState({}, '', 'healthy')).toThrow('dependencyName must be a non-empty string');
  });

  it('throws for whitespace-only dependencyName', () => {
    expect(() => updateDependencyState({}, '   ', 'healthy')).toThrow('dependencyName must be a non-empty string');
  });

  it('throws for invalid dependencyState', () => {
    expect(() => updateDependencyState({}, 'mongo', 'degraded')).toThrow('dependencyState must be one of: unknown, healthy, unhealthy');
  });
});

describe('api health routes', () => {
  const http = require('http');
  const express = require('express');

  const performRequest = ({ app, method, path }) => new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.request(
        { host: '127.0.0.1', port, method, path },
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

  const mountApiRoutes = ({ mockResult, dependencyState, throwOnDependencyRead, mongoPingFails } = {}) => {
    jest.resetModules();

    jest.doMock('../../../src/server/auth/keycloak-config', () => ({
      keycloak: {
        protect: () => (req, res, next) => next()
      }
    }));

    const pingMock = mongoPingFails
      ? jest.fn().mockRejectedValue(new Error('mongo ping failed'))
      : jest.fn().mockResolvedValue({ ok: 1 });

    jest.doMock('../../../src/server/db/connection', () => ({
      client: {
        db: jest.fn(() => ({
          admin: () => ({
            command: pingMock
          })
        }))
      }
    }));

    jest.doMock('../../../src/server/api/controllers/projects', () => ({
      getAllProjects: jest.fn(),
      getProject: jest.fn(),
      createProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: jest.fn()
    }));

    jest.doMock('../../../src/server/api/controllers/documents', () => ({
      getDocument: jest.fn(),
      getDocumentPdf: jest.fn(),
      createDocument: jest.fn(),
      updateDocument: jest.fn(),
      deleteDocument: jest.fn(),
      downloadPdf: jest.fn(),
      getLatestCompilationStatus: jest.fn()
    }));

    jest.doMock('../../../src/server/api/controllers/compilation', () => ({
      compileDocument: jest.fn(),
      getCompilationStatus: jest.fn()
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

    const apiRoutes = require('../../../src/server/api/routes');
    const app = express();
    app.use('/api', apiRoutes);

    return app;
  };

  it('GET /api/health/live returns 200', async () => {
    const app = mountApiRoutes();

    const res = await performRequest({ app, method: 'GET', path: '/api/health/live' });

    expect(res.status).toBe(200);
  });

  it('GET /api/health/ready returns 503 when shared dependency state is unhealthy (non-mocked route path)', async () => {
    const app = mountApiRoutes({
      dependencyState: {
        mongo: 'unhealthy',
        rabbitmq: 'healthy',
        redis: 'healthy'
      }
    });

    const res = await performRequest({ app, method: 'GET', path: '/api/health/ready' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual(expect.objectContaining({
      ready: false,
      degraded: false,
      reasons: expect.arrayContaining(['mongo']),
      featureImpacts: []
    }));
  });

  it('GET /api/health/ready returns 200 degraded with feature impact when only non-critical dependency is down', async () => {
    const app = mountApiRoutes({
      mockResult: {
        ready: true,
        degraded: true,
        reasons: [],
        featureImpacts: ['cache']
      }
    });

    const res = await performRequest({ app, method: 'GET', path: '/api/health/ready' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ready: true,
      degraded: true,
      featureImpacts: expect.arrayContaining(['cache'])
    }));
  });


  it('GET /api/health/ready returns controlled not-ready payload when readiness retrieval fails', async () => {
    const app = mountApiRoutes({ throwOnDependencyRead: true });

    const res = await performRequest({ app, method: 'GET', path: '/api/health/ready' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual(expect.objectContaining({
      ready: false,
      degraded: false,
      reasons: expect.arrayContaining(['readiness_unavailable']),
      featureImpacts: []
    }));
  });
});
