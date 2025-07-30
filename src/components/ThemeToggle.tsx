import React from 'react';
import { useTheme } from '../theme/useTheme';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <span role="img" aria-label="moon">🌙</span>;
      case 'dark':
        return <span role="img" aria-label="sun">☀️</span>;
      case 'party':
        return <span role="img" aria-label="party">🎉</span>;
      default:
        return <span role="img" aria-label="moon">🌙</span>;
    }
  };

  const getNextThemeName = () => {
    switch (theme) {
      case 'light':
        return 'Dark';
      case 'dark':
        return 'Party';
      case 'party':
        return 'Light';
      default:
        return 'Dark';
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className={`btn ${className}`}
      aria-label={`Switch to ${getNextThemeName().toLowerCase()} mode`}
      title={`Switch to ${getNextThemeName().toLowerCase()} mode`}
    >
      {getThemeIcon()}
      <span style={{ marginLeft: '0.5rem' }}>
        {getNextThemeName()} Mode
      </span>
    </button>
  );
}; 