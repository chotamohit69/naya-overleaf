/**
 * AI Chat Sidebar
 * Panel for AI-assisted LaTeX editing
 */

class AiChatSidebar {
  constructor(options = {}) {
    this.editor = options.editor;
    this.getDocumentContent = options.getDocumentContent || null;
    this.documentContent = '';
    this.userId = options.userId || 'dev-user-123';
    this.container = null;
    this.messages = [];
    this.isOpen = false;
    this.isLoading = false;
    
    const clientEnv = typeof process !== 'undefined' ? process.env || {} : {};
    this.AI_SERVICE_URL = clientEnv.AI_SERVICE_URL || '/api/ai';
    
    this.init();
  }

  init() {
    this.createContainer();
    this.attachEventListeners();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'ai-chat-sidebar';
    this.container.style.display = 'none';
    
    this.container.innerHTML = `
      <div class="ai-chat-header">
        <h3>AI Assistant</h3>
        <button class="ai-chat-close" title="Close">&times;</button>
      </div>
      <div class="ai-chat-messages">
        <div class="ai-message assistant">
          Hello! I'm your LaTeX assistant. Describe what you'd like to add to your document, and I'll generate the LaTeX code for you.
        </div>
      </div>
      <div class="ai-chat-input-container">
        <textarea 
          class="ai-chat-input" 
          placeholder="e.g., Add a 3-column table after the Introduction"
          rows="3"
        ></textarea>
        <button class="ai-chat-submit">Send</button>
      </div>
    `;
    
    document.body.appendChild(this.container);
  }

  attachEventListeners() {
    const closeBtn = this.container.querySelector('.ai-chat-close');
    const submitBtn = this.container.querySelector('.ai-chat-submit');
    const input = this.container.querySelector('.ai-chat-input');
    
    closeBtn.addEventListener('click', () => this.close());
    
    submitBtn.addEventListener('click', () => this.sendMessage());
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.container.style.display = 'flex';
  }

  close() {
    this.isOpen = false;
    this.container.style.display = 'none';
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  setDocumentContent(content) {
    this.documentContent = content;
  }

  async sendMessage() {
    const input = this.container.querySelector('.ai-chat-input');
    const messagesContainer = this.container.querySelector('.ai-chat-messages');
    const submitBtn = this.container.querySelector('.ai-chat-submit');
    
    const message = input.value.trim();
    if (!message || this.isLoading) return;
    
    input.value = '';
    this.addMessage(message, 'user');
    
    this.isLoading = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Thinking...';
    
    const loadingMsg = this.addMessage('Thinking...', 'assistant');
    
    try {
      const cursorLine = this.getCursorLine();
      const currentDocumentContent = this.getDocumentContent
        ? this.getDocumentContent()
        : this.documentContent;
      
      const response = await fetch(`${this.AI_SERVICE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          document_content: currentDocumentContent,
          cursor_line: cursorLine
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'AI request failed');
      }
      
      const result = await response.json();
      
      this.removeMessage(loadingMsg);
      
      this.addMessage('I can add this after line ' + result.insert_after_line + ':', 'assistant');
      
      const latexPreview = document.createElement('div');
      latexPreview.className = 'ai-message latex-preview';
      latexPreview.textContent = result.latex;
      messagesContainer.appendChild(latexPreview);
      
      const insertBtn = document.createElement('button');
      insertBtn.className = 'ai-insert-btn';
      insertBtn.textContent = 'Insert at line ' + result.insert_after_line;
      insertBtn.addEventListener('click', () => {
        this.insertAtLine(result.insert_after_line, result.latex);
      });
      messagesContainer.appendChild(insertBtn);
      
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
    } catch (error) {
      console.error('AI chat error:', error);
      this.removeMessage(loadingMsg);
      this.addMessage('Error: ' + error.message, 'assistant');
    } finally {
      this.isLoading = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send';
    }
  }

  addMessage(content, role) {
    const messagesContainer = this.container.querySelector('.ai-chat-messages');
    
    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ${role}`;
    msgEl.textContent = content;
    
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return msgEl;
  }

  removeMessage(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  getEditorView() {
    return this.editor?.view || this.editor || null;
  }

  getCursorLine() {
    const view = this.getEditorView();

    if (view && view.state) {
      const head = view.state.selection.main.head;
      return view.state.doc.lineAt(head).number;
    }
    return 1;
  }

  insertAtLine(lineNumber, latex) {
    const view = this.getEditorView();

    if (!view) return;

    const currentContent = this.getDocumentContent
      ? this.getDocumentContent()
      : view.state.doc.toString();
    const lines = currentContent.split('\n');
    const insertIndex = Math.max(0, Math.min(lineNumber - 1, lines.length));
    
    lines.splice(insertIndex, 0, latex);
    const newContent = lines.join('\n');
    this.documentContent = newContent;
    
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: newContent
      }
    });
    
    this.close();
    
    if (window.NayaOverleaf && window.NayaOverleaf.showNotification) {
      window.NayaOverleaf.showNotification('LaTeX inserted successfully', 'success');
    }
  }
}

export { AiChatSidebar };
export default AiChatSidebar;

window.AiChatSidebar = AiChatSidebar;
