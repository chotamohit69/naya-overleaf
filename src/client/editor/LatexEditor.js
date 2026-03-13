/**
 * LaTeX Editor Component using CodeMirror 6
 */

import { EditorState, StateField, StateEffect, Prec } from '@codemirror/state';
import { EditorView, keymap, highlightSpecialChars, drawSelection, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, foldGutter, bracketMatching as cmBracketMatching } from '@codemirror/language';
import { closeBrackets, autocompletion } from '@codemirror/autocomplete';
import { Connection as ShareDBConnection } from 'sharedb/lib/client';
import { diffMatchPatch } from 'diff-match-patch';
import { latex, latexHighlighting } from './latex-lang';

class LatexEditor {
  constructor(container, documentId, options = {}) {
    this.container = container;
    this.documentId = documentId;
    this.options = Object.assign({
      readOnly: false,
      lineNumbers: true,
      autoCloseBrackets: true,
      trackChanges: false
    }, options);
    
    this.view = null;
    this.shareDbDoc = null;
    this.socket = null;
    this.diffMatchPatch = new diffMatchPatch();
    this.isRemoteChange = false;
    this.connected = false;
    this.ready = this.init();
  }

  
  async init() {
    try {
      await this.connectToShareDB();
      
      const initialContent = this.shareDbDoc.data?.content || '';
      
      const state = EditorState.create({
        doc: initialContent,
        extensions: this.createExtensions()
      });
      
      this.view = new EditorView({
        state,
        parent: this.container
      });
      
      this.setupChangeHandlers();
      this.connected = true;
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      this.container.innerHTML = `<div class="editor-error">Failed to connect to collaboration server: ${err.message}</div>`;
    }
  }
  
  createExtensions() {
    const latexTheme = EditorView.baseTheme({
      '&': { fontSize: '14px' },
      '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" },
      '.cm-line': { padding: '0 4px' },
      '.cm-gutters': { backgroundColor: '#f8f9fa', border: 'none' }
    });

    const extensions = [
      lineNumbers(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      foldGutter(),
      syntaxHighlighting(defaultHighlightStyle),
      syntaxHighlighting(latexHighlighting),
      latex(),
      indentOnInput(),
      cmBracketMatching(),
      autocompletion(),
      latexTheme,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab
      ]),
      EditorView.lineWrapping
    ];
    
    if (this.options.autoCloseBrackets) {
      extensions.push(closeBrackets());
    }
    
    if (this.options.readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }
    
    if (this.options.trackChanges) {
      extensions.push(this.createTrackChangesExtension());
    }
    
    extensions.push(this.createSyncExtension());
    
    return extensions;
  }
  
  createTrackChangesExtension() {
    const addChange = StateEffect.define();
    
    const trackChangesField = StateField.define({
      create() {
        return [];
      },
      update(changes, tr) {
        changes = [...changes];
        
        for (const effect of tr.effects) {
          if (effect.is(addChange)) {
            changes.push(effect.value);
          }
        }
        
        return changes;
      }
    });
    
    return trackChangesField;
  }
  
  createSyncExtension() {
    return EditorView.updateListener.of((update) => {
      if (update.docChanged && this.shareDbDoc && !this.isRemoteChange) {
        const newContent = update.state.doc.toString();
        const oldContent = this.shareDbDoc.data?.content || '';
        
        if (newContent !== oldContent) {
          this.submitChange(oldContent, newContent);
        }
      }
    });
  }
  
  submitChange(oldContent, newContent) {
    if (!this.shareDbDoc) return;
    
    try {
      const ops = [];
      let oldPos = 0;
      let newPos = 0;
      
      const diff = this.diffMatchPatch.diff_main(oldContent, newContent);
      this.diffMatchPatch.diff_cleanupSemantic(diff);
      
      for (const [type, text] of diff) {
        if (type === 0) {
          oldPos += text.length;
          newPos += text.length;
        } else if (type === -1) {
          ops.push({ p: ['content', oldPos], d: text });
          oldPos += text.length;
        } else if (type === 1) {
          ops.push({ p: ['content', oldPos], i: text });
          newPos += text.length;
        }
      }
      
      if (ops.length > 0) {
        this.shareDbDoc.submitOp(ops, (err) => {
          if (err) console.error('Error submitting op:', err);
        });
      }
    } catch (err) {
      console.error('Error in submitChange:', err);
    }
  }
  
  async connectToShareDB() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      this.socket = socket;
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
      
      socket.onopen = () => {
        clearTimeout(timeout);
        
        const connection = new ShareDBConnection(socket);
        this.shareDbDoc = connection.get('documents', this.documentId);
        
        this.shareDbDoc.subscribe((err) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!this.shareDbDoc.type) {
            this.shareDbDoc.create({ content: '' }, 'json0', (err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      };
      
      socket.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error('WebSocket error'));
      };
      
      socket.onclose = () => {
        this.connected = false;
        console.log('ShareDB connection closed');
      };
    });
  }
  
  setupChangeHandlers() {
    this.shareDbDoc.on('op', (op, source) => {
      if (source === true) return;
      
      this.isRemoteChange = true;
      
      try {
        let newContent = this.shareDbDoc.data?.content || '';
        const currentContent = this.view.state.doc.toString();
        
        if (newContent !== currentContent) {
          this.view.dispatch({
            changes: {
              from: 0,
              to: this.view.state.doc.length,
              insert: newContent
            }
          });
        }
      } finally {
        this.isRemoteChange = false;
      }
    });
    
    this.shareDbDoc.on('error', (err) => {
      console.error('ShareDB document error:', err);
    });
  }
  
  // Get the current content
  getContent() {
    return this.view.state.doc.toString();
  }
  
  // Set the content
  setContent(content) {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: content
      }
    });
  }
  
  destroy() {
    if (this.view) {
      this.view.destroy();
    }
    
    if (this.shareDbDoc) {
      this.shareDbDoc.unsubscribe();
      this.shareDbDoc.destroy();
    }
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    
    this.connected = false;
  }
  
  isConnected() {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }
  
  getDocument() {
    return this.shareDbDoc;
  }
}

export default LatexEditor;