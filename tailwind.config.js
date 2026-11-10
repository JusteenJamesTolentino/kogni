/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        light: {
          primary: '#6d4aff',
          secondary: '#8b5cf6',
          accent: '#14b8a6',
          neutral: '#1f2937',
          'base-100': '#ffffff',
          'base-200': '#f6f5fb',
          'base-300': '#e7e5ef',
          'base-content': '#211d2b',
          info: '#3b82f6',
          success: '#16a34a',
          warning: '#d97706',
          error: '#dc2626',
        },
      },
      {
        dark: {
          primary: '#9b87ff',
          secondary: '#c084fc',
          accent: '#2dd4bf',
          neutral: '#d1d5db',
          'base-100': '#15131d',
          'base-200': '#0f0e15',
          'base-300': '#2c2838',
          'base-content': '#f2eff8',
          info: '#60a5fa',
          success: '#4ade80',
          warning: '#fbbf24',
          error: '#f87171',
        },
      },
    ],
  },
}
