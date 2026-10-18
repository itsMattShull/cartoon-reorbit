import { useAuth } from '~/composables/useAuth'
import { navigateTo } from '#app'

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isAdmin, isFullAdmin, fetchSelf } = useAuth()

  // If admin state is unknown on first load, fetch session once
  if (!isAdmin.value) {
    try { await fetchSelf() } catch {}
  }
  // A cached user from before sub-admins existed has no adminScope; refetch rather than guess
  // its access level.
  if (isAdmin.value && !user.value?.adminScope) {
    try { await fetchSelf({ force: true }) } catch {}
  }

  if (!isAdmin.value) {
    return navigateTo('/')
  }

  // Sub-admins only get the admin console. The legacy /admin/* pages predate per-tool
  // permissions, so they stay full-admin only.
  if (!isFullAdmin.value && !to.path.startsWith('/newsite/admin')) {
    return navigateTo('/newsite/admin')
  }
})
