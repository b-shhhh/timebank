export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#2B3040',
          900: '#333A4D',
          800: '#454E64',
          700: '#5B6478',
        },
        paper: {
          DEFAULT: '#F6F3EC',
          dim: '#EBE6D9',
        },
        brass: {
          DEFAULT: '#C99A3F',
          light: '#E0BE6E',
          dark: '#A67A2E',
        },
        sage: {
          DEFAULT: '#5C8871',
          light: '#7DA893',
        },
        rust: {
          DEFAULT: '#AC5C4C',
          light: '#C87E6E',
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