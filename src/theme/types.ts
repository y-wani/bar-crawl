export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

// Theme CSS custom properties type (for reference)
export interface ThemeColors {
  // Background colors
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-tertiary': string;
  '--bg-elevated': string;
  
  // Text colors
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  '--text-inverse': string;
  
  // Brand colors
  '--primary': string;
  '--primary-hover': string;
  '--primary-light': string;
  
  // Secondary colors
  '--secondary': string;
  '--secondary-hover': string;
  
  // Status colors
  '--success': string;
  '--warning': string;
  '--error': string;
  '--info': string;
  
  // Border colors
  '--border': string;
  '--border-light': string;
  '--border-dark': string;
  
  // Shadow colors
  '--shadow': string;
  '--shadow-elevated': string;
  
  // Spacing and sizing
  '--radius': string;
  '--radius-lg': string;
  '--radius-xl': string;
  
  // Transitions
  '--transition': string;
} 