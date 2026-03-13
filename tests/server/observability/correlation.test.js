/**
 * Tests for correlation ID middleware and helpers
 */

const http = require('http');
const express = require('express');

const performRequest = ({ app, method, path, headers }) => new Promise((resolve, reject) => {
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
              body = JSON.parse(data);
            }
            resolve({ status: res.statusCode, body, headers: res.headers });
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

describe('observability correlation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('propagates incoming x-correlation-id header', async () => {
    const {
      correlationMiddleware,
      CORRELATION_HEADER
    } = require('../../../src/server/observability/correlation');

    const app = express();
    app.use(correlationMiddleware);
    app.get('/probe', (req, res) => {
      res.json({ correlationId: req.correlationId });
    });

    const response = await performRequest({
      app,
      method: 'GET',
      path: '/probe',
      headers: { [CORRELATION_HEADER]: 'cid-from-header' }
    });

    expect(response.status).toBe(200);
    expect(response.body.correlationId).toBe('cid-from-header');
    expect(response.headers[CORRELATION_HEADER]).toBe('cid-from-header');
  });

  it('generates a correlation id when incoming header is missing', async () => {
    const {
      correlationMiddleware,
      CORRELATION_HEADER
    } = require('../../../src/server/observability/correlation');

    const app = express();
    app.use(correlationMiddleware);
    app.get('/probe', (req, res) => {
      res.json({ correlationId: req.correlationId });
    });

    const response = await performRequest({
      app,
      method: 'GET',
      path: '/probe'
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.correlationId).toBe('string');
    expect(response.body.correlationId.length).toBeGreaterThan(0);
    expect(response.headers[CORRELATION_HEADER]).toBe(response.body.correlationId);
  });

  it('uses fallback correlation id when enqueue payload has no correlation id', () => {
    const { createCorrelationPayload } = require('../../../src/server/observability/correlation');

    expect(createCorrelationPayload({}, 'fallback-cid')).toEqual({
      correlationId: 'fallback-cid'
    });
  });
});
