/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        vcr:   ['"VCR OSD Mono"', 'monospace'],
        press: ['"Press Start 2P"', 'monospace'],
      },
      colors: {
        vice: {
          bg:      '#0A0E1A',
          surface: '#0D2137',
          pink:    '#FF2D78',
          cyan:    '#00D4FF',
          violet:  '#7B2FBE',
          muted:   '#8B9DC3',
          gold:    '#FFB800',
        },
      },
      boxShadow: {
        'pixel':          '4px 4px 0 rgba(0,0,0,0.65)',
        'pixel-lg':       '6px 6px 0 rgba(0,0,0,0.65)',
        'neon-cyan':      '0 0 8px #00D4FF, 0 0 20px #00D4FF60',
        'neon-pink':      '0 0 8px #FF2D78, 0 0 20px #FF2D7860',
        'neon-violet':    '0 0 8px #7B2FBE, 0 0 20px #7B2FBE60',
        'neon-gold':      '0 0 8px #FFB800, 0 0 20px #FFB80060',
        'card':           '3px 3px 0 rgba(0,0,0,0.70)',
        'panel-violet':   '6px 6px 0 #7B2FBE60',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 6px #FFB80080, 0 0 16px #FFB80040, 0 0 0 2px #FFB800' },
          '50%':      { boxShadow: '0 0 18px #FFB800, 0 0 36px #FFB80080, 0 0 0 2px #FFB800' },
        },
        'blink': {
          '0%, 49%':   { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        'winner-flash': {
          '0%, 100%': { color: '#FFB800', textShadow: '0 0 8px #FFB800, 0 0 16px #FFB80080' },
          '50%':      { color: '#ffffff', textShadow: '0 0 20px #FFB800' },
        },
        'card-deal': {
          from: { transform: 'translateY(-28px) scale(0.82)', opacity: '0' },
          to:   { transform: 'translateY(0) scale(1)',        opacity: '1' },
        },
      },
      animation: {
        'glow-pulse':   'glow-pulse 1.5s ease-in-out infinite',
        'blink':        'blink 1s step-end infinite',
        'winner-flash': 'winner-flash 0.55s ease-in-out infinite',
        'card-deal':    'card-deal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
    },
  },
  plugins: [],
};
