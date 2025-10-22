// middleware/auth.js
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchSelf } = useAuth()

  // Smart behavior on the public home
  if (to.path === '/') {
    try { await fetchSelf() } catch {}
    if (user.value?.needsSetup) return navigateTo('/setup-username')
    if (user.value) return navigateTo('/dashboard')
    return
  }

  // Only guard protected pages
  const needsAuth =
    to.meta?.requiresAuth ||
    to.path.startsWith('/dashboard')

  if (!needsAuth) return

  if (!user.value) {
    try { await fetchSelf() } catch {}
  }

  if (!user.value) return navigateTo('/')

  if (user.value.needsSetup && to.path !== '/setup-username') {
    return navigateTo('/setup-username')
  }

  if (!user.value.inGuild && to.path !== '/join-discord') {
    return navigateTo('/join-discord')
  }
})
