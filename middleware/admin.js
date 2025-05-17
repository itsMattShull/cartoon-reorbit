import { useAuth } from '~/composables/useAuth'
import { navigateTo } from '#app'

export default defineNuxtRouteMiddleware(() => {
  const { isAdmin } = useAuth()
  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
