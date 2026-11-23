/**
 * Dostelo design tokens for TypeScript consumers.
 * Values extracted verbatim from the preserved legacy storefront
 * (apps/storefront/public/legacy/index.html) during Migration Stage 1.
 * The CSS source of truth is tokens.css in this package.
 */

export const THEME_STORAGE_KEY = 'dostelo-theme' as const;

export type ThemeName = 'light' | 'dark';

export const lightTokens = {
  "--bg": "#F4F2ED",
  "--panel": "#EDEAE3",
  "--surface": "#FFFFFF",
  "--surface2": "#F7F5F0",
  "--ink": "#1C1B17",
  "--body": "#45423B",
  "--muted": "#837E72",
  "--line": "#E0DCD2",
  "--dark": "#211E19",
  "--dark2": "#2A2721",
  "--on-dark": "#F2EFE7",
  "--on-dark-mut": "#A79F92",
  "--chip": "#EFECE5",
  "--shadow": "0 18px 50px rgba(28,27,23,.10)",
  "--r-lg": "28px",
  "--r-md": "20px",
  "--r-sm": "14px"
} as const;

export const darkTokens = {
  "--bg": "#1C1B17",
  "--panel": "#24221C",
  "--surface": "#2B2821",
  "--surface2": "#201E19",
  "--ink": "#F4F2ED",
  "--body": "#C9C3B6",
  "--muted": "#8E887B",
  "--line": "#3B382F",
  "--dark": "#12110E",
  "--dark2": "#1E1C17",
  "--on-dark": "#F4F2ED",
  "--on-dark-mut": "#A79F92",
  "--chip": "#332F27",
  "--shadow": "0 18px 50px rgba(0,0,0,.5)"
} as const;

export type TokenName = keyof typeof lightTokens;

export const tokenNames = Object.keys(lightTokens) as TokenName[];
