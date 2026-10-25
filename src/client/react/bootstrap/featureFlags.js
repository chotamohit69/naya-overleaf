const DEFAULT_UI_FEATURE_FLAGS = Object.freeze({
  reactHeaderIsland: true
});

let cachedFlags = null;

function parseBooleanFlag(rawValue, fallbackValue) {
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const normalizedValue = rawValue.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return fallbackValue;
}

function buildFeatureFlags({ windowRef, processEnv }) {
  const runtimeFlags = windowRef && windowRef.__NAYA_FLAGS__ ? windowRef.__NAYA_FLAGS__ : {};

  return {
    reactHeaderIsland: parseBooleanFlag(
      runtimeFlags.reactHeaderIsland,
      parseBooleanFlag(processEnv.REACT_HEADER_ISLAND, DEFAULT_UI_FEATURE_FLAGS.reactHeaderIsland)
    )
  };
}

function getUiFeatureFlags(options = {}) {
  const shouldUseCache = options.disableCache !== true;

  if (shouldUseCache && cachedFlags) {
    return cachedFlags;
  }

  const windowRef = Object.prototype.hasOwnProperty.call(options, 'windowRef')
    ? options.windowRef
    : typeof window !== 'undefined'
      ? window
      : undefined;

  const processEnv = options.processEnv || (typeof process !== 'undefined' ? process.env : {});
  const resolvedFlags = buildFeatureFlags({ windowRef, processEnv });

  if (shouldUseCache) {
    cachedFlags = resolvedFlags;
  }

  return resolvedFlags;
}

function isFeatureEnabled(featureName, options = {}) {
  const flags = getUiFeatureFlags(options);
  return Boolean(flags[featureName]);
}

function resetFeatureFlagCacheForTests() {
  cachedFlags = null;
}

module.exports = {
  DEFAULT_UI_FEATURE_FLAGS,
  getUiFeatureFlags,
  isFeatureEnabled,
  parseBooleanFlag,
  resetFeatureFlagCacheForTests
};
