import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}'
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: '#005F73',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: '#94D2BD',
          foreground: '#0b2c3d'
        },
        destructive: {
          DEFAULT: '#D00000',
          foreground: '#ffffff'
        },
        muted: {
          DEFAULT: '#E9ECEF',
          foreground: '#495057'
        },
        accent: {
          DEFAULT: '#0A9396',
          foreground: '#ffffff'
        },
        popover: 'hsl(var(--popover))',
        card: 'hsl(var(--card))'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      fontFamily: {
        sans: ['"Source Sans Pro"', ...fontFamily.sans]
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;
