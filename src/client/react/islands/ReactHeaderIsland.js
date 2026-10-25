const React = require('react');
const { ThemeProvider } = require('../foundation/ThemeProvider');
const { ThemeToggle } = require('../foundation/ThemeToggle');
const { LiveRegionStatus } = require('../a11y/LiveRegionStatus');
const { ToastProvider } = require('../overlays/ToastProvider');

function getHeaderIslandStatusMessage(nextThemePreference) {
  if (!nextThemePreference) {
    return 'Theme controls ready';
  }

  return `Theme changed to ${nextThemePreference}`;
}

function ReactHeaderIsland() {
  const [statusMessage, setStatusMessage] = React.useState(getHeaderIslandStatusMessage());

  const handleThemeChange = React.useCallback((nextThemePreference) => {
    setStatusMessage(getHeaderIslandStatusMessage(nextThemePreference));
  }, []);

  return React.createElement(
    ThemeProvider,
    null,
    React.createElement(
      ToastProvider,
      null,
      React.createElement(
        'div',
        {
          className: 'react-header-island-controls'
        },
        React.createElement(ThemeToggle, { onThemeChange: handleThemeChange }),
        React.createElement(LiveRegionStatus, { message: statusMessage })
      )
    )
  );
}

module.exports = {
  ReactHeaderIsland,
  getHeaderIslandStatusMessage
};

