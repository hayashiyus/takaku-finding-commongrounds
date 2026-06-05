/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // node-type tokens (SPEC §8.2)
        fact: '#1a1a20',
        insight: '#5f9e2f',
        idea: '#2585b0',
        hypothesis: '#cc2b2b',
        final: '#d97706',
        paper: '#f5f2e9',
        ink: '#15151a',
        'ink-soft': '#44444a',
        line: '#cdc8b8',
      },
      fontFamily: {
        jp: ['"Noto Sans JP"', '"Hiragino Sans"', 'sans-serif'],
        serif: ['"Noto Serif JP"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
