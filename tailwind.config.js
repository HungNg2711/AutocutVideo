/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#EC4899', foreground: '#000000' },
        secondary: { DEFAULT: '#DB2777', foreground: '#FFFFFF' },
        accent: { DEFAULT: '#2563EB', foreground: '#FFFFFF' },
        background: '#0F172A',
        foreground: '#FFFFFF',
        card: { DEFAULT: '#192134', foreground: '#FFFFFF' },
        muted: { DEFAULT: '#201A32', foreground: '#94A3B8' },
        border: 'rgba(255,255,255,0.08)',
        destructive: { DEFAULT: '#DC2626', foreground: '#FFFFFF' },
        ring: '#EC4899',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '80%, 100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.2,0.6,0.4,1) infinite',
      },
    },
  },
  plugins: [],
}
