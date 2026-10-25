/**
 * Dev Authentication Middleware for Naya Overleaf
 * Provides a mock user for development when Keycloak is not available
 */

const nodeEnvironment = process.env.NODE_ENV || 'development';
const IS_DEV = nodeEnvironment === 'development'
  || nodeEnvironment === 'test'
  || process.env.SKIP_KEYCLOAK === 'true';

const DEV_USER = {
  id: 'dev-user-123',
  sub: 'dev-user-123',
  name: 'Developer User',
  email: 'dev@localhost',
  roles: ['user', 'admin']
};

function devAuthMiddleware(req, res, next) {
  if (IS_DEV) {
    req.user = DEV_USER;
    req.kauth = {
      grant: {
        access_token: {
          content: {
            sub: DEV_USER.id,
            name: DEV_USER.name,
            email: DEV_USER.email,
            realm_access: { roles: DEV_USER.roles }
          }
        }
      }
    };
  }
  next();
}

function createDevAuthRoutes() {
  const express = require('express');
  const router = express.Router();
  
  if (IS_DEV) {
    console.log('Running in DEVELOPMENT mode with mock authentication');
    
    router.get('/login', (req, res) => {
      res.redirect('/');
    });
    
    router.get('/logout', (req, res) => {
      res.redirect('/');
    });
    
    router.get('/profile', devAuthMiddleware, (req, res) => {
      res.json({
        id: DEV_USER.id,
        name: DEV_USER.name,
        email: DEV_USER.email,
        roles: DEV_USER.roles
      });
    });
  }
  
  return router;
}

module.exports = {
  devAuthMiddleware,
  createDevAuthRoutes,
  DEV_USER,
  IS_DEV
};
