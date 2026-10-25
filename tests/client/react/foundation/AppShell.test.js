const { getAppShellClassName } = require('../../../../src/client/react/foundation/AppShell');

describe('AppShell helpers', () => {
  test('builds class name with region and density', () => {
    expect(getAppShellClassName({ region: 'header', density: 'compact' })).toBe(
      'app-shell app-shell--header app-shell--compact'
    );
  });

  test('falls back to default region and density', () => {
    expect(getAppShellClassName({})).toBe('app-shell app-shell--workspace app-shell--comfortable');
  });
});
