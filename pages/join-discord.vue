<template>
    <div class="p-6 max-w-md mx-auto text-center">
      <h2 class="text-2xl font-bold mb-4">You're Almost In!</h2>
      <p class="mb-4">Join our Discord server to unlock all features.</p>
      <a
        :href="inviteUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block bg-indigo-600 text-white px-5 py-3 rounded-lg font-semibold"
      >
        Join the Server
      </a>
    </div>
  </template>
  
  <script setup>
  import { onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useRuntimeConfig } from '#imports'

  definePageMeta({ middleware: 'auth' })

  const config    = useRuntimeConfig()
  const inviteUrl = config.public.discordInvite  // now injected at runtime
  const router    = useRouter()
  let checkInterval = null

  async function checkGuildMembership() {
    try {
      const res = await fetch('/api/discord/guild-check')
      if (res.ok) {
        const data = await res.json()
        if (data.inGuild) {
          clearInterval(checkInterval)
          router.push('/dashboard')
        }
      }
    } catch (err) {
      console.error('Guild check failed:', err)
    }
  }

  onMounted(() => {
    checkGuildMembership()
    checkInterval = setInterval(checkGuildMembership, 5000)
  })

  onUnmounted(() => {
    clearInterval(checkInterval)
  })
  </script>