/**
 * AI Proxy Routes
 * Keeps AI_INTERNAL_SECRET server-side while browser clients call /api/ai/*.
 */

const express = require('express');
const http = require('http');
const https = require('https');

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_INTERNAL_SECRET = process.env.AI_INTERNAL_SECRET;
const AI_ROUTE_ALLOWLIST = new Set(['chat', 'complete', 'fix-error']);

const optionalAuth = (req, res, next) => {
  if (req.kauth?.grant || req.user) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

function getUserId(req) {
  return req.kauth?.grant?.access_token?.content?.sub || req.user?.id;
}

function postJson(url, body, headers = {}) {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = transport.request({
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      },
      timeout: 30000
    }, (response) => {
      let data = '';

      response.setEncoding('utf8');
      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => {
        let parsedBody = {};
        if (data) {
          try {
            parsedBody = JSON.parse(data);
          } catch (error) {
            parsedBody = { detail: data };
          }
        }
        resolve({ statusCode: response.statusCode || 502, body: parsedBody });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('AI service request timed out'));
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

router.post('/:operation', optionalAuth, async (req, res) => {
  try {
    if (process.env.AI_ENABLED === 'false') {
      return res.status(503).json({ error: 'AI features are disabled' });
    }

    const operation = req.params.operation;
    if (!AI_ROUTE_ALLOWLIST.has(operation)) {
      return res.status(404).json({ error: 'Unknown AI operation' });
    }

    if (!AI_INTERNAL_SECRET) {
      return res.status(503).json({ error: 'AI internal secret is not configured' });
    }

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const upstreamUrl = new URL(`/ai/${operation}`, AI_SERVICE_URL).toString();
    const upstreamResponse = await postJson(
      upstreamUrl,
      {
        ...req.body,
        user_id: userId
      },
      {
        'X-AI-Internal-Secret': AI_INTERNAL_SECRET
      }
    );

    res.status(upstreamResponse.statusCode).json(upstreamResponse.body);
  } catch (error) {
    console.error('AI proxy error:', error);
    res.status(502).json({ error: 'AI service request failed' });
  }
});

module.exports = router;
