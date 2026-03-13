/**
 * Keycloak Configuration for Naya Overleaf
 */

const Keycloak = require('keycloak-connect');
const session = require('express-session');

const IS_DEV = process.env.NODE_ENV !== 'production' || process.env.SKIP_KEYCLOAK === 'true';

const configuredSessionSecret = process.env.SESSION_SECRET;

if (!IS_DEV) {
  const normalizedSessionSecret = typeof configuredSessionSecret === 'string'
    ? configuredSessionSecret.trim()
    : '';

  if (!normalizedSessionSecret || normalizedSessionSecret === 'naya-overleaf-secret') {
    throw new Error('SESSION_SECRET must be set to a non-empty, non-default value in production');
  }
}

const memoryStore = new session.MemoryStore();

const sessionMiddleware = session({
  secret: configuredSessionSecret || 'naya-overleaf-secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
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

  keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
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
  memoryStore,
  IS_DEV
};