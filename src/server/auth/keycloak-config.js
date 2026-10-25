/**
 * Keycloak Configuration for Naya Overleaf
 */

const Keycloak = require('keycloak-connect');
const session = require('express-session');
const { MongoSessionStore, DEFAULT_TTL_MS } = require('./session-store');

const nodeEnvironment = process.env.NODE_ENV || 'development';
const isProductionLike = nodeEnvironment !== 'development' && nodeEnvironment !== 'test';

if (isProductionLike && process.env.SKIP_KEYCLOAK === 'true') {
  throw new Error('SKIP_KEYCLOAK must not be enabled outside development and test');
}

const IS_DEV = !isProductionLike || process.env.SKIP_KEYCLOAK === 'true';

const configuredSessionSecret = process.env.SESSION_SECRET;

if (!IS_DEV) {
  const normalizedSessionSecret = typeof configuredSessionSecret === 'string'
    ? configuredSessionSecret.trim()
    : '';

  if (!normalizedSessionSecret || normalizedSessionSecret === 'naya-overleaf-secret') {
    throw new Error('SESSION_SECRET must be set to a non-empty, non-default value in production');
  }

  if (normalizedSessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
}

const sessionStore = IS_DEV
  ? new session.MemoryStore()
  : new MongoSessionStore({ ttlMs: DEFAULT_TTL_MS });

const sessionMiddleware = session({
  secret: configuredSessionSecret || 'naya-overleaf-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: !IS_DEV,
    maxAge: DEFAULT_TTL_MS
  }
});

let keycloak = null;
let keycloakConfig = null;

if (!IS_DEV) {
  keycloakConfig = {
    realm: process.env.KEYCLOAK_REALM || 'naya-overleaf',
    'auth-server-url': process.env.KEYCLOAK_URL || 'http://localhost:8080/auth',
    'ssl-required': 'external',
    resource: process.env.KEYCLOAK_CLIENT_ID || 'naya-overleaf-client',
    'public-client': true,
    'confidential-port': 0,
    'bearer-only': false
  };

  keycloak = new Keycloak({ store: sessionStore }, keycloakConfig);
} else {
  console.log('Running in DEVELOPMENT mode - Keycloak disabled');
  keycloak = {
    middleware: () => (req, res, next) => next(),
    protect: () => (req, res, next) => next()
  };
}

module.exports = {
  keycloak,
  sessionMiddleware,
  sessionStore,
  // Backwards-compatible alias for development tooling.
  memoryStore: sessionStore,
  IS_DEV
};