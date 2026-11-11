/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#07080a',
          900: '#0c0d12',
          850: '#11131a',
          800: '#161924',
          700: '#1f2333',
          600: '#2b3147',
        },
        karaoke: {
          cyan: '#00E5FF',
          pink: '#FF2A85',
          purple: '#8B5CF6',
          violet: '#7D2AE8',
          yellow: '#FFD600',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}

