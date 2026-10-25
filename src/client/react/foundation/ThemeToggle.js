const React = require('react');
const { ALLOWED_THEME_PREFERENCES, useTheme } = require('./ThemeProvider');
const { Button } = require('../primitives/Button');

function getNextThemePreference(currentThemePreference) {
  const currentIndex = ALLOWED_THEME_PREFERENCES.indexOf(currentThemePreference);

  if (currentIndex === -1) {
    return 'light';
  }

  const nextIndex = (currentIndex + 1) % ALLOWED_THEME_PREFERENCES.length;
  return ALLOWED_THEME_PREFERENCES[nextIndex];
}

function getThemeToggleRenderModel({ themePreference, resolvedTheme }) {
  return {
    buttonLabel: `Theme: ${themePreference}`,
    ariaLabel: `Theme: ${themePreference}. Activate to switch theme.`,
    title: `Theme: ${themePreference} (resolved: ${resolvedTheme})`,
    variant: 'secondary'
  };
}

function ThemeToggle({ onThemeChange }) {
  const { themePreference, resolvedTheme, setThemePreference } = useTheme();

  const handleToggleTheme = React.useCallback(() => {
    const nextThemePreference = getNextThemePreference(themePreference);
    setThemePreference(nextThemePreference);

    if (typeof onThemeChange === 'function') {
      onThemeChange(nextThemePreference);
    }
  }, [onThemeChange, setThemePreference, themePreference]);

  const viewModel = getThemeToggleRenderModel({ themePreference, resolvedTheme });

  return React.createElement(
    Button,
    {
      type: 'button',
      variant: viewModel.variant,
      className: 'theme-toggle-btn',
      onClick: handleToggleTheme,
      'aria-label': viewModel.ariaLabel,
      title: viewModel.title
    },
    viewModel.buttonLabel
  );
}

module.exports = {
  ThemeToggle,
  getNextThemePreference,
  getThemeToggleRenderModel
};

