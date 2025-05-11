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
        fontFamily: {
          orbit: ['"Comic Neue"', 'cursive']  // Example retro font
        },
        // Optional: Add custom colors or spacing here if needed
      }
    },
    plugins: []
  }
  