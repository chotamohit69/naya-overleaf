const React = require('react');

const THEME_STORAGE_KEY = 'naya-ui-theme-preference';
const ALLOWED_THEME_PREFERENCES = Object.freeze(['light', 'dark', 'system']);

const ThemeContext = React.createContext({
  themePreference: 'system',
  resolvedTheme: 'light',
  setThemePreference: () => {}
});

function normalizeThemePreference(themePreference) {
  if (ALLOWED_THEME_PREFERENCES.includes(themePreference)) {
    return themePreference;
  }

  return 'system';
}

function readStoredThemePreference(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return 'system';
  }

  try {
    const storedThemePreference = storage.getItem(THEME_STORAGE_KEY);
    return normalizeThemePreference(storedThemePreference);
  } catch (error) {
    return 'system';
  }
}

function resolveTheme(themePreference, prefersDarkMode) {
  const normalizedThemePreference = normalizeThemePreference(themePreference);

  if (normalizedThemePreference === 'system') {
    return prefersDarkMode ? 'dark' : 'light';
  }

  return normalizedThemePreference;
}

function applyThemeToDocument(documentRef, resolvedTheme, themePreference) {
  if (!documentRef || !documentRef.documentElement) {
    return;
  }

  const normalizedThemePreference = normalizeThemePreference(themePreference);
  const nextResolvedTheme = resolveTheme(normalizedThemePreference, resolvedTheme === 'dark');

  documentRef.documentElement.setAttribute('data-theme', nextResolvedTheme);
  documentRef.documentElement.setAttribute('data-theme-preference', normalizedThemePreference);
}

function getSystemPreference(windowRef) {
  if (!windowRef || typeof windowRef.matchMedia !== 'function') {
    return false;
  }

  return windowRef.matchMedia('(prefers-color-scheme: dark)').matches;
}

function ThemeProvider({ children, initialThemePreference = 'system' }) {
  const windowRef = typeof window !== 'undefined' ? window : undefined;
  const documentRef = typeof document !== 'undefined' ? document : undefined;

  const [themePreference, setThemePreferenceState] = React.useState(() => {
    const persistedThemePreference = windowRef
      ? readStoredThemePreference(windowRef.localStorage)
      : 'system';

    if (persistedThemePreference !== 'system') {
      return persistedThemePreference;
    }

    return normalizeThemePreference(initialThemePreference);
  });

  const [prefersDarkMode, setPrefersDarkMode] = React.useState(() => getSystemPreference(windowRef));

  const resolvedTheme = React.useMemo(
    () => resolveTheme(themePreference, prefersDarkMode),
    [themePreference, prefersDarkMode]
  );

  React.useEffect(() => {
    if (!windowRef || typeof windowRef.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = windowRef.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (event) => {
      setPrefersDarkMode(Boolean(event.matches));
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    return undefined;
  }, [windowRef]);

  React.useEffect(() => {
    applyThemeToDocument(documentRef, resolvedTheme, themePreference);

    if (!windowRef || !windowRef.localStorage || typeof windowRef.localStorage.setItem !== 'function') {
      return;
    }

    try {
      windowRef.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch (error) {
      // Ignore storage write errors to avoid breaking UI rendering.
    }
  }, [documentRef, resolvedTheme, themePreference, windowRef]);

  const setThemePreference = React.useCallback((nextThemePreference) => {
    setThemePreferenceState(normalizeThemePreference(nextThemePreference));
  }, []);

  const themeContextValue = React.useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference
    }),
    [themePreference, resolvedTheme, setThemePreference]
  );

  return React.createElement(
    ThemeContext.Provider,
    {
      value: themeContextValue
    },
    children
  );
}

function useTheme() {
  return React.useContext(ThemeContext);
}

module.exports = {
  ALLOWED_THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  ThemeProvider,
  applyThemeToDocument,
  normalizeThemePreference,
  readStoredThemePreference,
  resolveTheme,
  useTheme
};
