/**
 * KeyEncryption - AES-256-GCM encryption for API keys
 * 
 * Encryption format: JSON string { iv, tag, data } - all hex-encoded
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  
  if (!secret) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET environment variable is not set');
  }
  
  const keyBuffer = Buffer.from(secret, 'hex');
  
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `AI_KEY_ENCRYPTION_SECRET must be exactly 32 bytes (64 hex characters). ` +
      `Got ${keyBuffer.length} bytes. Generate with: openssl rand -hex 32`
    );
  }
  
  return keyBuffer;
}

function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH
  });
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  const result = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted
  };
  
  return JSON.stringify(result);
}

function decrypt(stored) {
  if (!stored || typeof stored !== 'string') {
    throw new Error('Stored value must be a non-empty string');
  }
  
  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch (e) {
    throw new Error('Stored value is not valid JSON');
  }
  
  const { iv, tag, data } = parsed;
  
  if (!iv || !tag || !data) {
    throw new Error('Stored value missing required fields (iv, tag, data)');
  }
  
  const key = getEncryptionKey();
  
  const ivBuffer = Buffer.from(iv, 'hex');
  const tagBuffer = Buffer.from(tag, 'hex');
  
  if (ivBuffer.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${ivBuffer.length}`);
  }
  
  if (tagBuffer.length !== TAG_LENGTH) {
    throw new Error(`Invalid tag length: expected ${TAG_LENGTH}, got ${tagBuffer.length}`);
  }
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: TAG_LENGTH
  });
  
  decipher.setAuthTag(tagBuffer);
  
  try {
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    throw new Error('Decryption failed - data may be corrupted or tampered with');
  }
}

function maskKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return '';
  }
  
  if (apiKey.length <= 8) {
    return '***';
  }
  
  const prefix = apiKey.substring(0, 7);
  const suffix = apiKey.substring(apiKey.length - 4);
  
  return `${prefix}...${suffix}`;
}

function validateKeyFormat(provider, apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API key is required' };
  }
  
  const trimmedKey = apiKey.trim();
  
  switch (provider) {
    case 'openai':
      if (!trimmedKey.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI API key should start with "sk-"' };
      }
      break;
    
    case 'anthropic':
      if (!trimmedKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic API key should start with "sk-ant-"' };
      }
      break;
    
    case 'gemini':
      if (trimmedKey.length < 20) {
        return { valid: false, error: 'Gemini API key appears to be too short' };
      }
      break;
    
    default:
      return { valid: false, error: `Unknown provider: ${provider}` };
  }
  
  return { valid: true, key: trimmedKey };
}

module.exports = {
  encrypt,
  decrypt,
  maskKey,
  validateKeyFormat,
  ALGORITHM,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_LENGTH
};
