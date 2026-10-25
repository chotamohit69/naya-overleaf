/**
 * User API Keys Controller
 * Manages encrypted API keys for AI features
 */

const client = require('../db/connection');
const { encrypt, decrypt, maskKey, validateKeyFormat } = require('../utils/KeyEncryption');
const { getUserIdFromRequest } = require('../realtime/auth');

const API_KEY_TEST_TIMEOUT_MS = 10000;

const VALID_PROVIDERS = ['openai', 'anthropic', 'gemini'];

function isEncryptionConfigured() {
  return /^[0-9a-f]{64}$/i.test(process.env.AI_KEY_ENCRYPTION_SECRET || '');
}

async function getUserApiKeys(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isEncryptionConfigured()) {
      return res.status(503).json({ error: 'AI key encryption is not configured' });
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
    
    const maskedKeys = {
      openai: apiKeys.openai ? maskKey(decrypt(apiKeys.openai)) : null,
      anthropic: apiKeys.anthropic ? maskKey(decrypt(apiKeys.anthropic)) : null,
      gemini: apiKeys.gemini ? maskKey(decrypt(apiKeys.gemini)) : null,
      provider: apiKeys.provider || 'openai'
    };
    
    res.json(maskedKeys);
    
  } catch (error) {
    console.error('Error getting user API keys:', error);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
}

async function saveUserApiKey(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isEncryptionConfigured()) {
      return res.status(503).json({ error: 'AI key encryption is not configured' });
    }
    
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' });
    }
    
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }
    
    const validation = validateKeyFormat(provider, apiKey);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    const db = client.db;
    
    let user = await db.collection('users').findOne({ _id: userId });
    
    if (!user) {
      await db.collection('users').insertOne({
        _id: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    const encryptedKey = encrypt(validation.key);
    
    const updateField = `apiKeys.${provider}`;
    await db.collection('users').updateOne(
      { _id: userId },
      { 
        $set: {
          [updateField]: encryptedKey,
          'apiKeys.provider': provider,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    res.json({ 
      success: true,
      provider,
      maskedKey: maskKey(validation.key)
    });
    
  } catch (error) {
    console.error('Error saving user API key:', error);
    res.status(500).json({ error: 'Failed to save API key' });
  }
}

async function deleteUserApiKey(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { provider } = req.params;
    
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }
    
    const db = client.db;
    
    const updateField = `apiKeys.${provider}`;
    
    const result = await db.collection('users').updateOne(
      { _id: userId },
      { 
        $unset: { [updateField]: "" },
        $set: { updatedAt: new Date() }
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = await db.collection('users').findOne({ _id: userId });
    if (user?.apiKeys?.provider === provider) {
      const remainingProviders = VALID_PROVIDERS.filter(p => user.apiKeys?.[p]);
      if (remainingProviders.length > 0) {
        await db.collection('users').updateOne(
          { _id: userId },
          { $set: { 'apiKeys.provider': remainingProviders[0] } }
        );
      } else {
        await db.collection('users').updateOne(
          { _id: userId },
          { $unset: { 'apiKeys.provider': "" } }
        );
      }
    }
    
    res.json({ success: true, message: `${provider} API key deleted` });
    
  } catch (error) {
    console.error('Error deleting user API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
}

async function setPreferredProvider(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { provider } = req.body;
    
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }
    
    const db = client.db;
    
    const user = await db.collection('users').findOne({ _id: userId });
    
    if (!user?.apiKeys?.[provider]) {
      return res.status(400).json({ 
        error: `No API key configured for provider: ${provider}` 
      });
    }
    
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { 'apiKeys.provider': provider, updatedAt: new Date() } }
    );
    
    res.json({ success: true, provider });
    
  } catch (error) {
    console.error('Error setting preferred provider:', error);
    res.status(500).json({ error: 'Failed to set preferred provider' });
  }
}

function testProviderKey(provider, key) {
  return new Promise((resolve) => {
    const https = require('https');
    let settled = false;
    let request;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const buildRequest = () => {
      if (provider === 'openai') {
        return {
          url: 'https://api.openai.com/v1/models',
          options: {
            method: 'GET',
            headers: { Authorization: `Bearer ${key}` }
          }
        };
      }

      if (provider === 'anthropic') {
        const payload = JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        });

        return {
          url: 'https://api.anthropic.com/v1/messages',
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'x-api-key': key,
              'anthropic-version': '2023-06-01'
            }
          },
          payload
        };
      }

      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models',
        options: {
          method: 'GET',
          headers: { 'x-goog-api-key': key }
        }
      };
    };

    const timeout = setTimeout(() => {
      if (request) {
        request.destroy();
      }
      finish({ valid: false, error: 'Connection timed out' });
    }, API_KEY_TEST_TIMEOUT_MS);

    const { url, options, payload } = buildRequest();

    try {
      request = https.request(url, options, (response) => {
        response.resume();

        if (response.statusCode === 200 || response.statusCode === 201) {
          finish({ valid: true, error: null });
        } else if (response.statusCode === 401 || response.statusCode === 403) {
          finish({ valid: false, error: 'Invalid API key' });
        } else {
          finish({ valid: false, error: `API returned status ${response.statusCode}` });
        }
      });

      request.on('error', (error) => {
        finish({ valid: false, error: `Connection error: ${error.message}` });
      });

      if (payload) {
        request.write(payload);
      }

      request.end();
    } catch (error) {
      finish({ valid: false, error: `Test failed: ${error.message}` });
    }
  });
}

async function testApiKey(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' });
    }
    
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ 
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` 
      });
    }
    
    const validation = validateKeyFormat(provider, apiKey);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    let testResult;

    try {
      testResult = await testProviderKey(provider, validation.key);
    } catch (testError) {
      testResult = { valid: false, error: `Test failed: ${testError.message}` };
    }

    if (testResult.valid) {
      res.json({ valid: true, message: 'API key is valid' });
    } else {
      res.status(400).json({
        valid: false,
        error: testResult.error || 'API key validation failed'
      });
    }
    
  } catch (error) {
    console.error('Error testing API key:', error);
    res.status(500).json({ error: 'Failed to test API key' });
  }
}

module.exports = {
  getUserApiKeys,
  saveUserApiKey,
  deleteUserApiKey,
  setPreferredProvider,
  testApiKey,
  VALID_PROVIDERS
};
