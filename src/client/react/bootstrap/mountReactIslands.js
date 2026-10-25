const React = require('react');
const ReactDOMClient = require('react-dom/client');
const { getUiFeatureFlags } = require('./featureFlags');
const { ReactHeaderIsland } = require('../islands/ReactHeaderIsland');

let mountedIslands = null;

function mountReactIslands(options = {}) {
  if (mountedIslands) {
    return mountedIslands;
  }

  const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : undefined);
  const createRoot = options.createRoot || ReactDOMClient.createRoot;
  const featureFlags = options.featureFlags || getUiFeatureFlags();

  if (!documentRef || !featureFlags.reactHeaderIsland) {
    mountedIslands = {};
    return mountedIslands;
  }

  const headerIslandNode = documentRef.getElementById('react-header-island');
  if (!headerIslandNode) {
    mountedIslands = {};
    return mountedIslands;
  }

  const headerRoot = createRoot(headerIslandNode);
  headerRoot.render(React.createElement(ReactHeaderIsland));

  mountedIslands = {
    headerRoot
  };

  return mountedIslands;
}

function unmountReactIslands() {
  if (!mountedIslands) {
    return;
  }

  if (mountedIslands.headerRoot && typeof mountedIslands.headerRoot.unmount === 'function') {
    mountedIslands.headerRoot.unmount();
  }

  mountedIslands = null;
}

function resetReactIslandsForTest() {
  unmountReactIslands();
  mountedIslands = null;
}

module.exports = {
  mountReactIslands,
  resetReactIslandsForTest,
  unmountReactIslands
};
