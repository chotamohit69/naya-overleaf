const { getHeaderIslandStatusMessage } = require('../../../../src/client/react/islands/ReactHeaderIsland');

describe('ReactHeaderIsland helpers', () => {
  test('builds human-readable status for theme change', () => {
    expect(getHeaderIslandStatusMessage('dark')).toBe('Theme changed to dark');
  });

  test('builds fallback status for missing value', () => {
    expect(getHeaderIslandStatusMessage()).toBe('Theme controls ready');
  });
});
