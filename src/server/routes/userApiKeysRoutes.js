/**
 * User API Keys Routes
 */

const express = require('express');
const router = express.Router();
const userApiKeysController = require('../controllers/userApiKeysController');

const optionalAuth = (req, res, next) => {
  if (req.kauth && req.kauth.grant) {
    return next();
  }
  if (req.user) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

router.get('/user/api-keys', optionalAuth, userApiKeysController.getUserApiKeys);

router.post('/user/api-keys', optionalAuth, userApiKeysController.saveUserApiKey);

router.post('/user/api-keys/test', optionalAuth, userApiKeysController.testApiKey);

router.delete('/user/api-keys/:provider', optionalAuth, userApiKeysController.deleteUserApiKey);

router.put('/user/api-keys/preferred', optionalAuth, userApiKeysController.setPreferredProvider);

module.exports = router;
