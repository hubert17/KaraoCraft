/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#6c2bd9',
          purpleHover: '#5b21b6',
          purpleLight: '#f3e8ff',
          sky: '#3dbeff',
          cyan: '#00d4d4',
          coral: '#ff8f8f',
          red: '#ff4d4f',
          lavender: '#a5b4fc',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Inter"',
          '"Hiragino Sans"',
          '"Hiragino Kaku Gothic ProN"',
          'sans-serif',
        ],
        script: [
          '"Snell Roundhand"',
          '"Apple Chancery"',
          '"Brush Script MT"',
          'Georgia',
          'serif',
        ],
        mono: [
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 4px 20px rgba(15, 23, 42, 0.07), 0 1px 4px rgba(15, 23, 42, 0.04)',
        pill: '0 2px 6px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
}
