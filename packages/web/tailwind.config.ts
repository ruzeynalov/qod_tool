import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'qod-bg': 'var(--qod-bg)',
        'qod-surface': 'var(--qod-surface)',
        'qod-border': 'rgb(var(--qod-border) / <alpha-value>)',
        'qod-hover': 'var(--qod-hover-bg)',
        'qod-accent': 'rgb(var(--qod-accent) / <alpha-value>)',
        'qod-sidebar': 'var(--qod-sidebar-bg)',
        'rag-green': 'rgb(var(--rag-green) / <alpha-value>)',
        'rag-amber': 'rgb(var(--rag-amber) / <alpha-value>)',
        'rag-red': 'rgb(var(--rag-red) / <alpha-value>)',
      },
      textColor: {
        primary: 'var(--qod-text-primary)',
        secondary: 'var(--qod-text-secondary)',
        muted: 'var(--qod-text-muted)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)', width: '40%' },
          '50%': { transform: 'translateX(60%)', width: '60%' },
          '100%': { transform: 'translateX(200%)', width: '40%' },
        },
      },
      animation: {
        'progress-indeterminate': 'progress-indeterminate 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
