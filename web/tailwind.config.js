/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Open Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Poppins', '"Open Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f6f3ff',
          100: '#eee8ff',
          200: '#ddd2ff',
          300: '#c3adff',
          400: '#a47bfa',
          500: '#8b4ff0',
          600: '#7c3aed',
          700: '#6b2bd2',
          800: '#5926ab',
          900: '#4c2389',
          950: '#2f145c',
        },
        accent: {
          50: '#fffbea',
          100: '#fff3c4',
          500: '#c58a16',
          600: '#a16207',
          700: '#854d0e',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(44, 26, 78, 0.04), 0 8px 24px rgba(44, 26, 78, 0.06)',
        lift: '0 16px 40px rgba(44, 26, 78, 0.12)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
