// middleware/auth.js
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchSelf } = useAuth()

  // Smart behavior on the public home
  if (to.path === '/') {
    try { await fetchSelf() } catch {}
    if (user.value?.active === false) return navigateTo('/join-discord?inactive=1')
    if (user.value?.needsSetup) return navigateTo('/setup-username')
    if (user.value) {
      const { public: { viewNewDesign } } = useRuntimeConfig()
      if (viewNewDesign === '1') return navigateTo('/newsite/home')
      return navigateTo('/dashboard')
    }
    return
  }

  // All non-home routes using this middleware require authentication
  if (!user.value) {
    try { await fetchSelf() } catch {}
  }

  if (!user.value) return navigateTo('/')

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
})
