<template>
    <div class="min-h-screen bg-gradient-to-br from-cyan-200 to-purple-200 flex items-center justify-center p-6">
      <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <h1 class="text-3xl font-orbit mb-4">Welcome to Cartoon ReOrbit</h1>
        <p class="mb-6 text-gray-600">Collect, trade, and show off your cToons just like back in the day.</p>
  
        <button
          @click="login"
          class="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold px-5 py-3 rounded-lg transition">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6 fill-white"
            viewBox="0 0 245 240"
            >
            <path d="M104.4 104.5c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zm36.2 0c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z"/>
            <path d="M189.5 20h-134C42 20 30 32 30 46v148c0 14 12 26 25.5 26h114.3l-5.4-18.7 13 12 12.3 11.3 21.8 19V46c0-14-12-26-25.5-26zm-37 141s-3.5-4.2-6.4-7.9c12.7-3.6 17.5-11.6 17.5-11.6-4 2.6-7.8 4.4-11.2 5.6-4.9 2.1-9.6 3.4-14.2 4.2-9.4 1.8-18 1.3-25.3-.1-5.6-1.1-10.4-2.6-14.4-4.2-2.2-.9-4.6-2-7.1-3.4-.3-.2-.6-.3-.9-.5-.2-.1-.3-.2-.4-.3-1.8-1-2.8-1.7-2.8-1.7s4.6 7.6 16.7 11.4c-2.9 3.7-6.5 8-6.5 8-21.6-.7-29.8-14.9-29.8-14.9 0-31.5 14-57 14-57 14-10.4 27.2-10.1 27.2-10.1l1 1.2c-17.5 5.1-25.6 13-25.6 13s2.1-1.1 5.6-2.7c10.2-4.5 18.3-5.8 21.6-6.1.5-.1.9-.1 1.4-.1 5-1 10.6-1.2 16.5-0.1 7.7 1.1 15.9 3.9 24.3 9.6 0 0-7.7-7.3-24.3-12.3l1.4-1.6s13.2-.3 27.2 10.1c0 0 14 25.5 14 57 0 0-8.2 14.2-29.8 14.9z"/>
          </svg>

          Sign in with Discord
        </button>
      </div>
    </div>
  </template>
  
  <script setup>
  const { login } = useAuth()

  defineNuxtRouteMiddleware('auth', async () => {
    const { user, fetchSelf } = useAuth()
    await fetchSelf()
    if (user.value && !user.value.needsSetup) {
      return navigateTo('/dashboard')
    }
    if (user.value?.needsSetup) {
      return navigateTo('/setup-username')
    }
  })

  definePageMeta({
    middleware: async () => {
      const { user, fetchSelf } = useAuth()
      try {
        await fetchSelf()
      } catch {
        // fetchSelf will throw on 401; ignore so unauthenticated users stay on index page
      }

      if (user.value) {
        if (user.value.needsSetup) {
          return navigateTo('/setup-username')
        }
        return navigateTo('/dashboard')
      }
    }
  })
  </script>
  
  <style scoped>
  /* Optional: add styles or leave empty */
  </style>