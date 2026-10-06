// middleware/auth.js
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchSelf, blockedRedirect } = useAuth()

  // Smart behavior on the public home
  if (to.path === '/') {
    try { await fetchSelf() } catch {}
    // A banned/suspended account gets its notice page (with reason/until) instead of silently
    // staying on '/' — see blockedRedirect's comment in composables/useAuth.js.
    if (blockedRedirect.value) return navigateTo(blockedRedirect.value)
    if (user.value?.active === false) return navigateTo('/join-discord?inactive=1')
    if (user.value?.needsSetup) return navigateTo('/setup-username')
    if (user.value) {
      return navigateTo('/newsite/home')
    }
    return
  }

  // All non-home routes using this middleware require authentication
  if (!user.value) {
    try { await fetchSelf() } catch {}
  }

  // /join-discord is the banned/suspended/inactive notice page itself — it reads its message
  // from the query string alone and never needs `user.value`. A banned/suspended account can
  // never pass the `!user.value` check below (the 403 that routes it here is permanent for the
  // length of the block), so redirecting it again from here would bounce it straight back to
  // this same URL — Nuxt's SSR navigation-guard loop detector then throws a 500 for what is,
  // from the user's side, just "go to the page that already explains why you're blocked."
  if (!user.value && to.path !== '/join-discord') return navigateTo(blockedRedirect.value || '/')
  if (!user.value) return

  // Admin routes only need authentication; admin.js handles authorization
  if (to.path.startsWith('/admin')) return

  // Inactive accounts are sent to join-discord with a notice
  if (user.value.active === false && to.path !== '/join-discord') {
    return navigateTo('/join-discord?inactive=1')
  }

  if (user.value.needsSetup && to.path !== '/setup-username') {
    return navigateTo('/setup-username')
  }

  if (!user.value.inGuild && to.path !== '/join-discord') {
    return navigateTo('/join-discord')
  }

  if (to.path === '/dashboard') {
    return navigateTo('/newsite/home')
  }
})
