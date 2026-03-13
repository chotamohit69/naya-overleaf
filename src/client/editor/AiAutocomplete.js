/**
 * AI Autocomplete - Ghost Text Extension for CodeMirror 6
 * Shows AI-predicted completions as ghost text
 */

import { EditorView, Decoration, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const AI_COMPLETION_DELAY = 400;
const MAX_PREFIX_LENGTH = 500;
const MAX_SUFFIX_LENGTH = 200;

const setCompletion = StateEffect.define();
const clearCompletion = StateEffect.define();

const completionField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(completions, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCompletion)) {
        if (effect.value) {
          completions = Decoration.set([
            Decoration.widget({
              widget: new GhostTextWidget(effect.value),
              side: 1
            }).range(tr.state.doc.length)
          ]);
        } else {
          completions = Decoration.none;
        }
      } else if (effect.is(clearCompletion)) {
        completions = Decoration.none;
      }
    }
    return completions;
  },
  provide: f => EditorView.decorations.from(f)
});

class GhostTextWidget extends HTMLElement {
  constructor(text) {
    super();
    this.text = text;
  }

  connectedCallback() {
    this.className = 'ai-ghost-text';
    this.textContent = this.text;
    this.style.cssText = `
      color: #999;
      font-style: italic;
      opacity: 0.7;
      pointer-events: auto;
      cursor: pointer;
      padding-left: 2px;
    `;
    
    this.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('accept-completion', {
        bubbles: true,
        detail: { text: this.text }
      }));
    });
  }
}

function createAiAutocompleteExtension(aiChatInstance) {
  let idleTimer = null;
  let currentCompletion = null;
  
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.setupListeners();
    }

    setupListeners() {
      this.view.dom.addEventListener('input', () => {
        this.scheduleCompletion();
      });
      
      this.view.dom.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && currentCompletion) {
          e.preventDefault();
          this.acceptCompletion();
        } else if (e.key === 'Escape') {
          this.clearCompletion();
        }
      });
      
      this.view.dom.addEventListener('accept-completion', (e) => {
        this.acceptCompletion();
      });
    }

    scheduleCompletion() {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      
      idleTimer = setTimeout(() => {
        this.requestCompletion();
      }, AI_COMPLETION_DELAY);
    }

    async requestCompletion() {
      const view = this.view;
      const doc = view.state.doc;
      const cursorPos = view.state.selection.main.head;
      
      const prefixStart = Math.max(0, cursorPos - MAX_PREFIX_LENGTH);
      const prefix = doc.sliceString(prefixStart, cursorPos);
      
      const suffixEnd = Math.min(doc.length, cursorPos + MAX_SUFFIX_LENGTH);
      const suffix = doc.sliceString(cursorPos, suffixEnd);
      
      if (!prefix.trim() && !suffix.trim()) {
        return;
      }
      
      try {
        const userId = window.currentUserId || 'dev-user-123';
        const aiServiceUrl = window.AI_SERVICE_URL || 'http://localhost:8000';
        
        const response = await fetch(`${aiServiceUrl}/ai/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            prefix,
            suffix
          })
        });
        
        if (!response.ok) {
          return;
        }
        
        const result = await response.json();
        
        if (result.completion && result.completion.trim()) {
          currentCompletion = result.completion;
          view.dispatch({
            effects: setCompletion.of(result.completion)
          });
        }
      } catch (error) {
        console.error('AI autocomplete error:', error);
      }
    }

    acceptCompletion() {
      if (!currentCompletion) return;
      
      const view = this.view;
      const cursorPos = view.state.selection.main.head;
      
      view.dispatch({
        changes: { from: cursorPos, insert: currentCompletion },
        selection: { anchor: cursorPos + currentCompletion.length }
      });
      
      this.clearCompletion();
    }

    clearCompletion() {
      currentCompletion = null;
      this.view.dispatch({
        effects: clearCompletion.of(null)
      });
    }

    destroy() {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
    }
  }, {
    eventHandlers: {
      blur: () => {
        this.clearCompletion();
      }
    }
  });
}

function aiAutocomplete() {
  return [
    completionField,
    createAiAutocompleteExtension()
  ];
}

function acceptAiCompletion(view) {
  const completion = view.state.field(completionField);
  if (completion !== Decoration.none) {
    const widget = completion.between(view.state.doc.length, view.state.doc.length + 1, (deco) => {
      if (deco.widget instanceof GhostTextWidget) {
        view.dispatch({
          changes: { 
            from: view.state.selection.main.head, 
            insert: deco.widget.text 
          },
          selection: { 
            anchor: view.state.selection.main.head + deco.widget.text.length 
          }
        });
      }
    });
  }
}

export { aiAutocomplete, acceptAiCompletion, setCompletion, clearCompletion };
export default aiAutocomplete;
