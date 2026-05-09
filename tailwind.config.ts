import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#07080F',
        surface: '#11141C',
        'surface-2': '#1A1F2E',
        fg: '#F5F7FA',
        'fg-muted': '#9CA3AF',
        'brand-red': '#E60012',
        'accent-cyan': '#00E5FF',
        'accent-yellow': '#FFD400',
        success: '#00FF87',
        danger: '#FF3B30',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        'hud-xs': ['0.625rem', { lineHeight: '1', letterSpacing: '0.1em' }],
        'hud-sm': ['0.75rem', { lineHeight: '1.2', letterSpacing: '0.08em' }],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 3s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
