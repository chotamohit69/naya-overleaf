/**
 * API Keys Settings Panel
 * Vanilla JS settings UI for managing AI API keys
 */

class ApiKeysSettings {
  constructor(container) {
    this.container = container;
    this.providers = ['openai', 'anthropic', 'gemini'];
    this.providerLabels = {
      openai: 'OpenAI (GPT-4)',
      anthropic: 'Anthropic (Claude)',
      gemini: 'Google Gemini'
    };
    this.init();
  }

  async init() {
    this.render();
    await this.loadExistingKeys();
  }

  render() {
    this.container.innerHTML = `
      <div class="api-keys-settings">
        <h2 class="settings-title">AI API Keys</h2>
        <p class="settings-description">
          Configure your own LLM API keys for AI features. Keys are encrypted and stored securely.
        </p>
        
        <div class="provider-cards">
          ${this.providers.map(provider => this.renderProviderCard(provider)).join('')}
        </div>
        
        <div class="settings-info">
          <h3>How it works</h3>
          <ul>
            <li>Your API keys are encrypted with AES-256-GCM before storage</li>
            <li>Keys are never exposed to the frontend in plaintext</li>
            <li>Only masked versions (e.g., sk-abc...xyz) are shown</li>
            <li>You need at least one configured key to use AI features</li>
          </ul>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }

  renderProviderCard(provider) {
    return `
      <div class="provider-card" data-provider="${provider}">
        <div class="provider-header">
          <h3>${this.providerLabels[provider]}</h3>
          <span class="provider-status" id="status-${provider}">Not configured</span>
        </div>
        
        <div class="provider-form">
          <input 
            type="password" 
            class="api-key-input" 
            id="key-${provider}"
            placeholder="Enter your ${provider} API key"
            autocomplete="off"
          >
          
          <div class="provider-actions">
            <button class="btn btn-test" data-provider="${provider}">Test & Save</button>
            <button class="btn btn-delete" data-provider="${provider}" style="display: none;">Delete</button>
          </div>
          
          <div class="test-result" id="result-${provider}"></div>
        </div>
        
        <div class="provider-help">
          <small>
            ${this.getProviderHelpText(provider)}
          </small>
        </div>
      </div>
    `;
  }

  getProviderHelpText(provider) {
    const helpTexts = {
      openai: 'Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>',
      anthropic: 'Get your API key from <a href="https://console.anthropic.com/" target="_blank">Anthropic Console</a>',
      gemini: 'Get your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>'
    };
    return helpTexts[provider] || '';
  }

  attachEventListeners() {
    this.providers.forEach(provider => {
      const testBtn = this.container.querySelector(`.btn-test[data-provider="${provider}"]`);
      const deleteBtn = this.container.querySelector(`.btn-delete[data-provider="${provider}"]`);
      const input = this.container.querySelector(`#key-${provider}`);
      
      if (testBtn) {
        testBtn.addEventListener('click', () => this.testAndSaveKey(provider));
      }
      
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteKey(provider));
      }
      
      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.testAndSaveKey(provider);
          }
        });
      }
    });
  }

  async loadExistingKeys() {
    try {
      const response = await fetch('/api/user/api-keys', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const keys = await response.json();
        
        this.providers.forEach(provider => {
          const maskedKey = keys[provider];
          const statusEl = this.container.querySelector(`#status-${provider}`);
          const deleteBtn = this.container.querySelector(`.btn-delete[data-provider="${provider}"]`);
          const input = this.container.querySelector(`#key-${provider}`);
          
          if (maskedKey) {
            if (statusEl) statusEl.textContent = maskedKey;
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
            if (input) input.placeholder = 'Key configured - enter new key to replace';
          }
        });
        
        if (keys.provider) {
          this.currentProvider = keys.provider;
        }
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
    }
  }

  async testAndSaveKey(provider) {
    const input = this.container.querySelector(`#key-${provider}`);
    const resultEl = this.container.querySelector(`#result-${provider}`);
    const testBtn = this.container.querySelector(`.btn-test[data-provider="${provider}"]`);
    
    const apiKey = input.value.trim();
    
    if (!apiKey) {
      this.showResult(provider, 'Please enter an API key', 'error');
      return;
    }
    
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    try {
      const response = await fetch('/api/user/api-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, apiKey })
      });
      
      const result = await response.json();
      
      if (response.ok && result.valid) {
        this.showResult(provider, 'Key is valid! Saving...', 'success');
        
        await this.saveKey(provider, apiKey);
        
        const deleteBtn = this.container.querySelector(`.btn-delete[data-provider="${provider}"]`);
        if (deleteBtn) deleteBtn.style.display = 'inline-block';
        
        input.value = '';
        input.placeholder = 'Key configured - enter new key to replace';
        
        const statusEl = this.container.querySelector(`#status-${provider}`);
        if (statusEl) {
          const masked = this.maskKey(apiKey);
          statusEl.textContent = masked;
        }
        
      } else {
        this.showResult(provider, result.error || 'Invalid key', 'error');
      }
      
    } catch (error) {
      this.showResult(provider, 'Error: ' + error.message, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test & Save';
    }
  }

  async saveKey(provider, apiKey) {
    const response = await fetch('/api/user/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, apiKey })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save key');
    }
    
    return response.json();
  }

  async deleteKey(provider) {
    if (!confirm(`Are you sure you want to delete your ${provider} API key?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/user/api-keys/${provider}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        const statusEl = this.container.querySelector(`#status-${provider}`);
        const deleteBtn = this.container.querySelector(`.btn-delete[data-provider="${provider}"]`);
        const input = this.container.querySelector(`#key-${provider}`);
        
        if (statusEl) statusEl.textContent = 'Not configured';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (input) {
          input.value = '';
          input.placeholder = `Enter your ${provider} API key`;
        }
        
        this.showResult(provider, 'Key deleted', 'success');
      } else {
        const error = await response.json();
        this.showResult(provider, error.error || 'Failed to delete key', 'error');
      }
    } catch (error) {
      this.showResult(provider, 'Error: ' + error.message, 'error');
    }
  }

  showResult(provider, message, type) {
    const resultEl = this.container.querySelector(`#result-${provider}`);
    if (resultEl) {
      resultEl.textContent = message;
      resultEl.className = `test-result ${type}`;
      resultEl.style.display = 'block';
      
      setTimeout(() => {
        resultEl.style.display = 'none';
      }, 5000);
    }
  }

  maskKey(key) {
    if (!key || key.length <= 8) return '***';
    return key.substring(0, 7) + '...' + key.substring(key.length - 4);
  }
}

window.ApiKeysSettings = ApiKeysSettings;
