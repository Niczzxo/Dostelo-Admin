import type { Config } from 'tailwindcss';

/* Dostelo admin Tailwind configuration, fresh rebuild 2026-11-28.
   Every theme value resolves to a CSS variable defined in
   src/app/globals.css from the Dostelo storefront colour system:
   Off-white #F4F2ED, Warm Black #1C1B17 and their tints and shades.
   Preflight stays disabled so the hand-written component classes in
   globals.css keep their exact cascade, as in the previous build. */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        ink: 'var(--ink)',
        body: 'var(--body)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        dark: 'var(--dark)',
        dark2: 'var(--dark2)',
        'on-dark': 'var(--on-dark)',
        'on-dark-mut': 'var(--on-dark-mut)',
        chip: 'var(--chip)',
        accent: 'var(--accent)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
      },
      borderRadius: {
        lg: 'var(--r-lg)',
        md: 'var(--r-md)',
        sm: 'var(--r-sm)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        token: 'var(--shadow)',
      },
    },
  },
  plugins: [],
};

export default config;
