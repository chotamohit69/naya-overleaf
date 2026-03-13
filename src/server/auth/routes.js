/**
 * Authentication Routes for Naya Overleaf
 */

const express = require('express');
const router = express.Router();
const keycloak = require('./keycloak-config').keycloak;

// Login route
router.get('/login', keycloak.protect(), (req, res) => {
  res.json({ message: 'Authentication successful' });
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// User profile route
router.get('/profile', keycloak.protect(), (req, res) => {
  const userInfo = {
    id: req.kauth.grant.access_token.content.sub,
    name: req.kauth.grant.access_token.content.name,
    email: req.kauth.grant.access_token.content.email,
    roles: req.kauth.grant.access_token.content.realm_access?.roles || []
  };
  
  res.json(userInfo);
});

module.exports = router;