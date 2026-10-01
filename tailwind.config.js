/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        poke: {
          yellow: '#ffcb05',
          blue: '#3b4cca',
        },
      },
      fontFamily: {
        pokemon: ['"Pokemon Solid"', 'Impact', '"Arial Black"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};