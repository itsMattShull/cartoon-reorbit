// middleware/home-redirect.global.js
export default defineNuxtRouteMiddleware( async (to) => {
  if (to.path !== '/') return
  const { user, fetchSelf } = useAuth()
  try { await fetchSelf() } catch {}
  if (user.value?.active === false) return navigateTo('/join-discord?inactive=1')
  if (user.value?.needsSetup) return navigateTo('/setup-username')
  if (user.value) {
    const { public: { viewNewDesign } } = useRuntimeConfig()
    if (viewNewDesign === '1') return navigateTo('/newsite/home')
    return navigateTo('/dashboard')
  }
})
