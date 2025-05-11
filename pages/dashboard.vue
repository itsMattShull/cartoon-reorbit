<template>
    <Nav /> 
    <div class="pt-16 min-h-screen bg-gray-100 p-6">
      <div class="flex flex-col lg:flex-row gap-6 max-w-4xl mx-auto">
        <template v-if="loading">
          <div class="bg-white rounded-xl shadow-md p-6 w-full lg:w-1/2 animate-pulse">
            <div class="flex items-center gap-6 w-full">
              <div class="w-24 h-24 rounded-full bg-gray-300"></div>
              <div class="flex-1 space-y-4 py-1">
                <div class="h-6 bg-gray-300 rounded w-3/4"></div>
                <div class="h-4 bg-gray-300 rounded w-1/2"></div>
                <div class="h-4 bg-gray-300 rounded w-1/3"></div>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow-md p-6 w-full lg:w-1/2 animate-pulse">
            <div class="h-24 bg-gray-300 rounded"></div>
          </div>
        </template>
        <template v-else>
          <div class="bg-white rounded-xl shadow-md p-6 w-full lg:w-1/2">
            <div class="flex items-center gap-6 w-full">
              <img
                :src="`/avatars/${user?.avatar || 'default.png'}`"
                alt="User Avatar"
                class="w-24 h-24 rounded-full object-cover border-4 border-indigo-500"
              />
              <div>
                
                  <NuxtLink :to="`/czone/${user?.username}`" class="text-2xl font-bold mb-1 text-indigo-600 hover:underline">
                    {{ user?.username }}
                  </NuxtLink>
                
                <p class="text-gray-700">{{ user?.points }} Points</p>
                <p class="text-gray-700">
                  {{
                    user?.ctoons ? new Set(user.ctoons.map(c => c.ctoonId)).size : 0
                  }} cToons Collected
                </p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow-md p-6 w-full lg:w-1/2">
            <div class="flex items-center gap-6 w-full">
              <div>
                <!-- Add actual content here -->
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </template>
  
  <script setup>
    import { useRouter } from 'vue-router'
    definePageMeta({
      middleware: 'auth'
    })

    const loading = ref(true)
    const { user, fetchSelf } = useAuth()
    const router = useRouter()

    onMounted(async () => {
      await fetchSelf()
      if (user.value?.needsSetup) {
        router.push('/setup-username')
        return
      }
      loading.value = false
    })
  </script>
  
  <style scoped>
  /* optional additional styles */
  </style>