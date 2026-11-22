// middleware/auth.js
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchSelf, blockedRedirect } = useAuth()

  // Every route using this middleware requires authentication ('/' is handled by
  // home-redirect.global.js)
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
})
