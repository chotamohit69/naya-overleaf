const {
  normalizeHotkey,
  matchesHotkeyEvent,
  createEmptyHotkeyRegistry
} = require('../../../../src/client/react/foundation/HotkeyProvider');

describe('HotkeyProvider helpers', () => {
  test('normalizes command-style hotkey definition', () => {
    expect(normalizeHotkey('Cmd+K')).toBe('meta+k');
    expect(normalizeHotkey('ctrl+shift+p')).toBe('ctrl+shift+p');
  });

  test('matches keyboard events against normalized hotkeys', () => {
    const event = {
      key: 'K',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false
    };

    expect(matchesHotkeyEvent(event, 'meta+k')).toBe(true);
    expect(matchesHotkeyEvent(event, 'ctrl+k')).toBe(false);
  });

  test('creates immutable-style registry snapshots on update', () => {
    const registry = createEmptyHotkeyRegistry();
    const updated = registry.register('meta+k', jest.fn());

    expect(updated).not.toBe(registry);
    expect(updated.handlers['meta+k']).toHaveLength(1);
    expect(registry.handlers['meta+k']).toBeUndefined();
  });
});
