// middleware/home-redirect.global.js
export default defineNuxtRouteMiddleware( async (to) => {
  if (to.path !== '/') return
  const { user, fetchSelf } = useAuth()
  try { await fetchSelf() } catch {}
  if (user.value?.needsSetup) return navigateTo('/setup-username')
  if (user.value) return navigateTo('/dashboard')
})