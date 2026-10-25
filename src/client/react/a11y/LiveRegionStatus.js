const React = require('react');

function LiveRegionStatus({ message }) {
  return React.createElement(
    'div',
    {
      className: 'sr-only',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    },
    message || ''
  );
}

module.exports = {
  LiveRegionStatus
};
