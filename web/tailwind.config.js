/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#bae0ff',
          300: '#7ec8ff',
          400: '#36aeff',
          500: '#0094ff',
          600: '#0077cc',
          700: '#005fa3',
          800: '#004a7a',
          900: '#003d66',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
