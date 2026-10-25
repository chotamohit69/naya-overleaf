const { getNextThemePreference, getThemeToggleRenderModel } = require('../../../../src/client/react/foundation/ThemeToggle');

describe('ThemeToggle helpers', () => {
  test('cycles preferences in expected order', () => {
    expect(getNextThemePreference('light')).toBe('dark');
    expect(getNextThemePreference('dark')).toBe('system');
    expect(getNextThemePreference('system')).toBe('light');
  });

  test('builds render model with accessible labels', () => {
    expect(
      getThemeToggleRenderModel({
        themePreference: 'dark',
        resolvedTheme: 'dark'
      })
    ).toEqual({
      buttonLabel: 'Theme: dark',
      ariaLabel: 'Theme: dark. Activate to switch theme.',
      title: 'Theme: dark (resolved: dark)',
      variant: 'secondary'
    });
  });
});
