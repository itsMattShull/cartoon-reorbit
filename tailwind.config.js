/** @type {import('tailwindcss').Config} */
export default {
    content: [
      './components/**/*.{vue,js}',
      './layouts/**/*.{vue,js}',
      './pages/**/*.{vue,js}',
      './app.vue'
    ],
    theme: {
      extend: {
        gridTemplateRows: {
          // give it any name you like:
          '2-7': 'repeat(2, minmax(0, 0.7fr))',
        },
        fontFamily: {
          orbit: ['"Comic Neue"', 'cursive']  // Example retro font
        },
        // Optional: Add custom colors or spacing here if needed
      }
    },
    plugins: []
  }
  