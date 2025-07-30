import React, { createContext, useEffect, useState } from 'react';
import type { Theme, ThemeContextType, ThemeProviderProps } from './types';

// Create the theme context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Local storage key for theme persistence
const THEME_STORAGE_KEY = 'party';

// Get initial theme from localStorage or system preference
const getInitialTheme = (defaultTheme?: Theme): Theme => {
  // Check localStorage first
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
  if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'party')) {
    return storedTheme;
  }
  
  // Return default theme or party as fallback
  return defaultTheme || 'party';
};

// Apply theme to document
const applyTheme = (theme: Theme) => {
  const html = document.documentElement;
  
  if (theme === 'dark' || theme === 'party') {
    html.setAttribute('data-theme', theme);
  } else {
    html.removeAttribute('data-theme');
  }
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme 
}) => {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme(defaultTheme));

  // Toggle between light, dark, and party themes
  const toggleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'party'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setThemeState(themes[nextIndex]);
  };

  // Set specific theme
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  // Apply theme to document and save to localStorage
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Listen for system theme changes (only for light/dark, not party)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (!storedTheme) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const contextValue: ThemeContextType = {
    theme,
    toggleTheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Export the context for direct access if needed
export { ThemeContext }; 