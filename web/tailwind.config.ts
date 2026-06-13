import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7C3AED', // viral purple
          ink: '#13111C',
          panel: '#1C1830',
          soft: '#2A2440',
        },
        chat: {
          green: '#25D366',
          bubble: '#DCF8C6',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(124,58,237,0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
