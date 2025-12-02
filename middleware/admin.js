import { useAuth } from '~/composables/useAuth'
import { navigateTo } from '#app'

export default defineNuxtRouteMiddleware(async () => {
  const { isAdmin, fetchSelf } = useAuth()

  // If admin state is unknown on first load, fetch session once
  if (!isAdmin.value) {
    try { await fetchSelf() } catch {}
  }

  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
