import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-syne)', 'Syne', 'sans-serif'],
        sans: ['var(--font-plex)', 'IBM Plex Sans', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'IBM Plex Mono', 'monospace'],
      },
      colors: {
        base: '#0a0a0f',
        card: '#12121a',
        elevated: '#1a1a26',
        border: '#2a2a3a',
        primary: '#f0f0ff',
        secondary: '#8888aa',
        monotext: '#c0ffb0',
        gold: '#d4a017',
        hot: '#e63535',
        cold: '#3597e6',
        tight: '#e67a35',
      },
    },
  },
  plugins: [],
}

export default config