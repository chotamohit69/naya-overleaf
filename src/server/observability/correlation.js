const crypto = require('crypto');

const CORRELATION_HEADER = 'x-correlation-id';

function createCorrelationId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeCorrelationId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCorrelationIdFromRequest(req) {
  if (!req || !req.headers) {
    return null;
  }

  return normalizeCorrelationId(req.headers[CORRELATION_HEADER]);
}

function ensureCorrelationId(req) {
  const existing = getCorrelationIdFromRequest(req)
    || normalizeCorrelationId(req?.correlationId)
    || createCorrelationId();

  req.correlationId = existing;
  return existing;
}

function correlationMiddleware(req, res, next) {
  const correlationId = ensureCorrelationId(req);
  res.setHeader(CORRELATION_HEADER, correlationId);
  next();
}

function createCorrelationPayload(payload = {}, fallbackCorrelationId) {
  const candidate = normalizeCorrelationId(payload.correlationId)
    || normalizeCorrelationId(fallbackCorrelationId)
    || 'unknown';

  return {
    correlationId: candidate
  };
}

module.exports = {
  CORRELATION_HEADER,
  correlationMiddleware,
  ensureCorrelationId,
  createCorrelationPayload,
  getCorrelationIdFromRequest
};
