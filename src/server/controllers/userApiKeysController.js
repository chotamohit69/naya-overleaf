/**
 * User API Keys Controller
 * Manages encrypted API keys for AI features
 */

const { ObjectId } = require('mongodb');
const client = require('../db/connection');
const { encrypt, decrypt, maskKey, validateKeyFormat } = require('../utils/KeyEncryption');

const VALID_PROVIDERS = ['openai', 'anthropic', 'gemini'];

async function getUserApiKeys(req, res) {
  try {
    const userId = req.kauth?.grant?.access_token?.content?.sub || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
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
    const userId = req.kauth?.grant?.access_token?.content?.sub || req.user?.id;
    
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
    const userId = req.kauth?.grant?.access_token?.content?.sub || req.user?.id;
    
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
    const userId = req.kauth?.grant?.access_token?.content?.sub || req.user?.id;
    
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

async function testApiKey(req, res) {
  try {
    const userId = req.kauth?.grant?.access_token?.content?.sub || req.user?.id;
    
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
    
    let isValid = false;
    let errorMessage = null;
    
    try {
      if (provider === 'openai') {
        const https = require('https');
        const testUrl = 'https://api.openai.com/v1/models';
        
        await new Promise((resolve, reject) => {
          const req = https.request(testUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${validation.key}`
            }
          }, (response) => {
            if (response.statusCode === 200) {
              isValid = true;
              resolve();
            } else if (response.statusCode === 401) {
              errorMessage = 'Invalid API key';
              resolve();
            } else {
              errorMessage = `API returned status ${response.statusCode}`;
              resolve();
            }
          });
          req.on('error', (e) => {
            errorMessage = `Connection error: ${e.message}`;
            resolve();
          });
          req.end();
        });
        
      } else if (provider === 'anthropic') {
        const https = require('https');
        
        const postData = JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        });
        
        await new Promise((resolve) => {
          const req = https.request('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': validation.key,
              'anthropic-version': '2023-06-01'
            }
          }, (response) => {
            if (response.statusCode === 200 || response.statusCode === 201) {
              isValid = true;
            } else if (response.statusCode === 401) {
              errorMessage = 'Invalid API key';
            } else {
              errorMessage = `API returned status ${response.statusCode}`;
            }
            resolve();
          });
          req.on('error', (e) => {
            errorMessage = `Connection error: ${e.message}`;
            resolve();
          });
          req.write(postData);
          req.end();
        });
        
      } else if (provider === 'gemini') {
        const https = require('https');
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${validation.key}`;
        
        await new Promise((resolve) => {
          const req = https.request(testUrl, { method: 'GET' }, (response) => {
            if (response.statusCode === 200) {
              isValid = true;
            } else if (response.statusCode === 400 || response.statusCode === 403) {
              errorMessage = 'Invalid API key';
            } else {
              errorMessage = `API returned status ${response.statusCode}`;
            }
            resolve();
          });
          req.on('error', (e) => {
            errorMessage = `Connection error: ${e.message}`;
            resolve();
          });
          req.end();
        });
      }
    } catch (testError) {
      errorMessage = `Test failed: ${testError.message}`;
    }
    
    if (isValid) {
      res.json({ valid: true, message: 'API key is valid' });
    } else {
      res.status(400).json({ 
        valid: false, 
        error: errorMessage || 'API key validation failed' 
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
