const React = require('react');

const DENSITIES = Object.freeze(['comfortable', 'compact']);
const REGIONS = Object.freeze(['workspace', 'header', 'dashboard']);

function normalizeDensity(density) {
  return DENSITIES.includes(density) ? density : 'comfortable';
}

function normalizeRegion(region) {
  return REGIONS.includes(region) ? region : 'workspace';
}

function getAppShellClassName({ region, density } = {}) {
  const normalizedRegion = normalizeRegion(region);
  const normalizedDensity = normalizeDensity(density);

  return `app-shell app-shell--${normalizedRegion} app-shell--${normalizedDensity}`;
}

function AppShell({ children, region = 'workspace', density = 'comfortable' }) {
  return React.createElement(
    'div',
    {
      className: getAppShellClassName({ region, density }),
      'data-region': normalizeRegion(region),
      'data-density': normalizeDensity(density)
    },
    children
  );
}

module.exports = {
  AppShell,
  DENSITIES,
  REGIONS,
  getAppShellClassName,
  normalizeDensity,
  normalizeRegion
};
