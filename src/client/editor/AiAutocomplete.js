/**
 * AI Autocomplete - Ghost Text Extension for CodeMirror 6
 * Shows AI-predicted completions as ghost text at the cursor.
 */

import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const AI_COMPLETION_DELAY = 700;
const MAX_PREFIX_LENGTH = 500;
const MAX_SUFFIX_LENGTH = 200;

const setCompletion = StateEffect.define();
const clearCompletion = StateEffect.define();

class GhostTextWidget extends WidgetType {
  constructor(text) {
    super();
    this.text = text;
  }

  eq(other) {
    return other.text === this.text;
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'ai-ghost-text';
    span.textContent = this.text;
    span.style.whiteSpace = 'pre';
    span.title = 'Press Tab to accept, Esc to dismiss';
    span.addEventListener('mousedown', (event) => {
      event.preventDefault();
      acceptAiCompletion(view);
    });
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

const completionField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setCompletion)) {
        const { pos, text } = effect.value;
        decorations = Decoration.set([
          Decoration.widget({
            widget: new GhostTextWidget(text),
            side: 1
          }).range(pos)
        ]);
      } else if (effect.is(clearCompletion)) {
        decorations = Decoration.none;
      }
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

function createAiAutocompleteExtension() {
  let requestSequence = 0;

  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.idleTimer = null;
      this.currentCompletion = null;
      this.disposed = false;

      this.handleKeyDown = (event) => {
        if (!this.currentCompletion) {
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          this.acceptCompletion();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.clearCompletion();
        }
      };

      this.handleBlur = () => {
        this.clearCompletion();
      };

      view.dom.addEventListener('keydown', this.handleKeyDown, true);
      view.dom.addEventListener('blur', this.handleBlur, true);
    }

    update(update) {
      if (update.docChanged || update.selectionSet) {
        if (this.currentCompletion) {
          const head = update.state.selection.main.head;
          if (head !== this.currentCompletion.pos) {
            this.currentCompletion = null;
            requestSequence += 1;

            if (this.idleTimer) {
              clearTimeout(this.idleTimer);
              this.idleTimer = null;
            }

            // Dispatching from inside a ViewPlugin update is not allowed.
            queueMicrotask(() => {
              if (!this.disposed) {
                this.view.dispatch({
                  effects: clearCompletion.of(null)
                });
              }
            });
          }
        }

        this.scheduleCompletion();
      }
    }

    scheduleCompletion() {
      if (this.disposed || typeof window === 'undefined' || window.AI_ENABLED === false) {
        return;
      }

      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
      }

      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        this.requestCompletion();
      }, AI_COMPLETION_DELAY);
    }

    async requestCompletion() {
      if (this.disposed || typeof window === 'undefined' || window.AI_ENABLED === false) {
        return;
      }

      const view = this.view;
      const selection = view.state.selection.main;

      if (selection.from !== selection.to) {
        return;
      }

      const doc = view.state.doc;
      const cursorPos = selection.head;
      const prefix = doc.sliceString(Math.max(0, cursorPos - MAX_PREFIX_LENGTH), cursorPos);
      const suffix = doc.sliceString(cursorPos, Math.min(doc.length, cursorPos + MAX_SUFFIX_LENGTH));

      if (!prefix.trim() && !suffix.trim()) {
        return;
      }

      const requestId = ++requestSequence;

      try {
        const aiServiceUrl = window.AI_SERVICE_URL || '/api/ai';
        const response = await fetch(`${aiServiceUrl}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ prefix, suffix })
        });

        if (!response.ok || this.disposed || requestId !== requestSequence) {
          return;
        }

        const result = await response.json();
        const completion = typeof result.completion === 'string' ? result.completion : '';

        if (!completion.trim()) {
          return;
        }

        // The document may have moved while the request was in flight.
        if (this.view.state.selection.main.head !== cursorPos) {
          return;
        }

        this.currentCompletion = { pos: cursorPos, text: completion };
        this.view.dispatch({
          effects: setCompletion.of({ pos: cursorPos, text: completion })
        });
      } catch (error) {
        console.error('AI autocomplete error:', error);
      }
    }

    acceptCompletion() {
      const completion = this.currentCompletion;

      if (!completion) {
        return false;
      }

      this.clearCompletion();
      this.view.dispatch({
        changes: { from: completion.pos, insert: completion.text },
        selection: { anchor: completion.pos + completion.text.length }
      });

      return true;
    }

    clearCompletion() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }

      this.currentCompletion = null;
      requestSequence += 1;

      if (!this.disposed) {
        this.view.dispatch({
          effects: clearCompletion.of(null)
        });
      }
    }

    destroy() {
      this.disposed = true;

      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
      }

      this.view.dom.removeEventListener('keydown', this.handleKeyDown, true);
      this.view.dom.removeEventListener('blur', this.handleBlur, true);
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
  const decorations = view.state.field(completionField, false);

  if (!decorations) {
    return false;
  }

  let accepted = false;

  decorations.between(0, view.state.doc.length, (from, to, decoration) => {
    if (accepted || !(decoration.widget instanceof GhostTextWidget)) {
      return;
    }

    accepted = true;
    const text = decoration.widget.text;
    view.dispatch({
      changes: { from, insert: text },
      selection: { anchor: from + text.length },
      effects: clearCompletion.of(null)
    });
  });

  return accepted;
}

export { aiAutocomplete, acceptAiCompletion, setCompletion, clearCompletion };
export default aiAutocomplete;
