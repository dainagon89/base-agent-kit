/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: {
          blue: '#0052FF',
          ink: '#0A0B0D',
          panel: '#13151A',
          line: '#23262E',
          mist: '#8A8F98',
        },
      },
    },
  },
  plugins: [],
};
