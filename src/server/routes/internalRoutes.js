/**
 * Internal Routes - Only accessible within Docker network
 * These routes require X-Internal-Secret header
 */

const express = require('express');
const router = express.Router();
const client = require('../db/connection');
const { decrypt } = require('../utils/KeyEncryption');
const { evaluateReadiness } = require('../health/readiness-policy');
const { getDependencyState } = require('../health/dependency-state');

const getReadinessPayload = () => {
  try {
    const dependencyState = getDependencyState();
    return evaluateReadiness(dependencyState, 'app');
  } catch (error) {
    return {
      ready: false,
      degraded: false,
      reasons: ['readiness_unavailable'],
      featureImpacts: []
    };
  }
};

const INTERNAL_SECRET = process.env.AI_INTERNAL_SECRET;

function validateInternalSecret(req, res, next) {
  const providedSecret = req.headers['x-internal-secret'];
  
  if (!INTERNAL_SECRET) {
    console.error('AI_INTERNAL_SECRET not configured');
    return res.status(500).json({ error: 'Internal authentication not configured' });
  }
  
  if (!providedSecret || providedSecret !== INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Forbidden - Invalid internal secret' });
  }
  
  next();
}

router.use(validateInternalSecret);

router.get('/internal/user/:userId/api-key', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const db = client.db;
    
    const user = await db.collection('users').findOne(
      { _id: userId },
      { projection: { apiKeys: 1 } }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const apiKeys = user.apiKeys || {};
    const provider = apiKeys.provider || 'openai';
    
    const encryptedKey = apiKeys[provider];
    
    if (!encryptedKey) {
      return res.status(404).json({ error: 'No API key configured for this user' });
    }
    
    let decryptedKey;
    try {
      decryptedKey = decrypt(encryptedKey);
    } catch (decryptError) {
      console.error('Error decrypting API key:', decryptError);
      return res.status(500).json({ error: 'Failed to decrypt API key' });
    }
    
    res.json({
      provider,
      key: decryptedKey
    });
    
  } catch (error) {
    console.error('Error in internal API key endpoint:', error);
    res.status(500).json({ error: 'Failed to retrieve API key' });
  }
});

router.get('/internal/health', (req, res) => {
  const readiness = getReadinessPayload();
  const statusCode = readiness.ready ? 200 : 503;

  res.status(statusCode).json(readiness);
});

module.exports = router;
