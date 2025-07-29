import React from 'react';
import { useTheme } from '../theme/useTheme';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`btn ${className}`}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <span role="img" aria-label="moon">
          🌙
        </span>
      ) : (
        <span role="img" aria-label="sun">
          ☀️
        </span>
      )}
      <span style={{ marginLeft: '0.5rem' }}>
        {theme === 'light' ? 'Dark' : 'Light'} Mode
      </span>
    </button>
  );
}; 