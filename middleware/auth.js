export default defineNuxtRouteMiddleware(async (to, from) => {
  const { user, fetchSelf } = useAuth()

  if (!user.value) {
    await fetchSelf()
  }

  // if still no user, redirect to root
  if (!user.value) {
    return navigateTo('/')
  }

  // if user needs setup, go to setup page
  if (user.value.needsSetup && to.path !== '/setup-username') {
    return navigateTo('/setup-username')
  }

  // if user is missing roles or not in the guild, send them to join discord
  // if ((!user.value.roles || !user.value.inGuild) && to.path !== '/join-discord') {
  if ((!user.value.inGuild) && to.path !== '/join-discord') {
    return navigateTo('/join-discord')
  }
})