const React = require('react');

function normalizeHotkey(hotkey) {
  if (!hotkey || typeof hotkey !== 'string') {
    return '';
  }

  return hotkey
    .toLowerCase()
    .replace(/cmd/g, 'meta')
    .replace(/command/g, 'meta')
    .split('+')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('+');
}

function eventKey(event) {
  if (!event || !event.key) {
    return '';
  }

  return String(event.key).toLowerCase();
}

function matchesHotkeyEvent(event, hotkey) {
  const normalized = normalizeHotkey(hotkey);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  if (eventKey(event) !== key) {
    return false;
  }

  const requiresMeta = modifiers.has('meta');
  const requiresCtrl = modifiers.has('ctrl');
  const requiresShift = modifiers.has('shift');
  const requiresAlt = modifiers.has('alt');

  return Boolean(event.metaKey) === requiresMeta
    && Boolean(event.ctrlKey) === requiresCtrl
    && Boolean(event.shiftKey) === requiresShift
    && Boolean(event.altKey) === requiresAlt;
}

function createEmptyHotkeyRegistry() {
  const snapshot = Object.freeze({ handlers: Object.freeze({}) });

  function register(hotkey, handler) {
    const normalized = normalizeHotkey(hotkey);
    if (!normalized || typeof handler !== 'function') {
      return snapshot;
    }

    const currentHandlers = snapshot.handlers[normalized] || [];
    const nextHandlers = [...currentHandlers, handler];
    const nextMap = Object.freeze({
      ...snapshot.handlers,
      [normalized]: nextHandlers
    });

    return Object.freeze({
      handlers: nextMap,
      register
    });
  }

  return Object.freeze({
    ...snapshot,
    register
  });
}

function HotkeyProvider({ children }) {
  return React.createElement(React.Fragment, null, children);
}

module.exports = {
  HotkeyProvider,
  createEmptyHotkeyRegistry,
  matchesHotkeyEvent,
  normalizeHotkey
};
