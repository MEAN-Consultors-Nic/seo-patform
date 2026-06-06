const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}')],
  theme: {
    extend: {
      colors: {
        // Ahrefs-inspired brand palette
        brand: {
          50: '#FFF1ED',
          100: '#FFE3DA',
          200: '#FFC2AE',
          300: '#FFA181',
          400: '#FF8B68',
          500: '#FF7A59', // primary CTA orange (Ahrefs hero)
          600: '#E5613D',
          700: '#C24A29',
          800: '#8F3014',
          900: '#5C1D0A',
        },
        // Neutrals — Ahrefs uses very subtle grays
        ink: {
          50: '#F7F8FA',
          100: '#F0F2F5',
          200: '#E4E7EB',
          300: '#D1D5DA',
          400: '#9AA3AD',
          500: '#6B7280',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        // Accent colors for charts/states
        sky: {
          500: '#0EA5E9',
          600: '#0284C7',
        },
        positive: { 500: '#16A34A', 100: '#DCFCE7' },
        warning: { 500: '#D97706', 100: '#FEF3C7' },
        danger: { 500: '#DC2626', 100: '#FEE2E2' },
        // Tier-specific
        tierA: '#0F172A',
        tierB: '#0EA5E9',
        tierC: '#FF7A59',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.06)',
        elevated: '0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)',
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
    },
  },
  plugins: [],
};
