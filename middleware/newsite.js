// middleware/newsite.js
// Gates all /newsite/* pages behind the VIEWNEWDESIGN flag and auth.
export default defineNuxtRouteMiddleware(async (to) => {
  const { public: { viewNewDesign } } = useRuntimeConfig()

  // If the flag is off, redirect away from newsite pages
  if (viewNewDesign !== '1') {
    return navigateTo('/dashboard')
  }

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
