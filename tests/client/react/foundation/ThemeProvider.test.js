const {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveTheme,
  readStoredThemePreference
} = require('../../../../src/client/react/foundation/ThemeProvider');

describe('ThemeProvider theming helpers', () => {
  test('normalizes unknown preference to system', () => {
    expect(normalizeThemePreference('sepia')).toBe('system');
  });

  test('resolves system preference from media query to dark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
  });

  test('reads theme preference from storage with validation', () => {
    const storage = {
      getItem: jest.fn(() => 'light')
    };

    expect(readStoredThemePreference(storage)).toBe('light');
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });

  test('falls back to system when storage value is invalid', () => {
    const storage = {
      getItem: jest.fn(() => 'invalid-theme')
    };

    expect(readStoredThemePreference(storage)).toBe('system');
  });
});
