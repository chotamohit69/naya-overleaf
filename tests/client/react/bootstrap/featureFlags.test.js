const {
  getUiFeatureFlags,
  isFeatureEnabled,
  resetFeatureFlagCacheForTests
} = require('../../../../src/client/react/bootstrap/featureFlags');

describe('client react bootstrap feature flags', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    process.env.REACT_HEADER_ISLAND = '';
    global.window = {};
    resetFeatureFlagCacheForTests();
  });

  afterAll(() => {
    global.window = originalWindow;
    delete process.env.REACT_HEADER_ISLAND;
    resetFeatureFlagCacheForTests();
  });

  test('defaults reactHeaderIsland to enabled', () => {
    expect(getUiFeatureFlags()).toEqual({
      reactHeaderIsland: true
    });
  });

  test('uses global runtime override when provided', () => {
    global.window = {
      __NAYA_FLAGS__: {
        reactHeaderIsland: false
      }
    };

    expect(getUiFeatureFlags()).toEqual({
      reactHeaderIsland: false
    });
    expect(isFeatureEnabled('reactHeaderIsland')).toBe(false);
  });

  test('reads process env fallback when global flag is not defined', () => {
    process.env.REACT_HEADER_ISLAND = 'false';

    expect(isFeatureEnabled('reactHeaderIsland')).toBe(false);
  });
});
