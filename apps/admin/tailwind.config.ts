import type { Config } from 'tailwindcss';

/* Dostelo admin Tailwind configuration.
   Same shared approach as the storefront: Tailwind CSS v3.4.19
   through PostCSS, explicit content list, preflight disabled so
   the existing hand-written CSS in src/app/globals.css keeps its
   exact cascade and the current look does not change.
   Every theme value below resolves to an existing CSS variable:
   the Dostelo design tokens from @dostelo/design-tokens
   (tokens.css), which the admin globals.css already uses. The
   font stack is the admin body stack from globals.css verbatim.
   No colour, radius, shadow or font value is hard-coded here. */
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
      },
      borderRadius: {
        lg: 'var(--r-lg)',
        md: 'var(--r-md)',
        sm: 'var(--r-sm)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        token: 'var(--shadow)',
      },
    },
  },
  plugins: [],
};

export default config;
