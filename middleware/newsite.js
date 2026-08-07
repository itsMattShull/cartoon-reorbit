// middleware/newsite.js
// Gates all /newsite/* pages behind auth.
export default defineNuxtRouteMiddleware(async (to) => {
  // Require authentication
  const { user, fetchSelf } = useAuth()
  if (!user.value) {
    try { await fetchSelf() } catch {}
  }
  if (!user.value) return navigateTo('/')

  if (user.value.active === false) {
    return navigateTo('/join-discord?inactive=1')
  }
  if (user.value.needsSetup) {
    return navigateTo('/setup-username')
  }
  if (!user.value.inGuild) {
    return navigateTo('/join-discord')
  }
})
