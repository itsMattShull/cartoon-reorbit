// middleware/newsite.js
// Gates all /newsite/* pages behind auth.
export default defineNuxtRouteMiddleware(async (to) => {
  // Require authentication
  const { user, fetchSelf, blockedRedirect } = useAuth()
  if (!user.value) {
    try { await fetchSelf() } catch {}
  }
  // A banned/suspended account gets sent to its notice page (with reason/until) instead of the
  // generic '/' — see blockedRedirect's comment in composables/useAuth.js.
  if (!user.value) return navigateTo(blockedRedirect.value || '/')

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
