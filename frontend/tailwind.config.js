/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#14181F',
          900: '#1B1F27',
          800: '#242A35',
          700: '#333B48',
        },
        paper: {
          DEFAULT: '#F6F3EC',
          dim: '#EBE6D9',
        },
        brass: {
          DEFAULT: '#B8862B',
          light: '#D4A94F',
          dark: '#8C6620',
        },
        sage: {
          DEFAULT: '#4F7863',
          light: '#6E9782',
        },
        rust: {
          DEFAULT: '#9C4A3C',
          light: '#BC6A5C',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
