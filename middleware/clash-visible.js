// middleware/clash-visible.js
// Sends players away from the gToons Clash pages while an admin has the game hidden
// (Manage Games > gToons Clash). Runs after 'newsite', so it only ever sees signed-in players.
// The Clash APIs and socket actions refuse independently; this is just the page-level half.
export default defineNuxtRouteMiddleware(async () => {
  try {
    const { hidden } = await $fetch('/api/game/clash/config')
    if (hidden) return navigateTo('/newsite/home')
  } catch {
    // Config unreachable: let the page load rather than locking players out of a live game.
  }
})
