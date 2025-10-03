<template>
    <div class="p-6 max-w-md mx-auto text-center">
      <h2 class="text-2xl font-bold mb-4" v-if="!isBanned">You're Almost In!</h2>
      <h2 class="text-2xl font-bold mb-4 text-red-600" v-else>Account Banned</h2>
      <p class="mb-4" v-if="!isBanned">
        Join our Discord server, then come back and refresh the page, to unlock all features.
      </p>
      <p class="mb-4 text-red-600" v-else>
        Your account has been banned. If you believe this is a mistake, please contact a moderator in Discord.
      </p>
      <a
        v-if="!isBanned"
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
    import { onMounted, onUnmounted, computed } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import { useRuntimeConfig } from '#imports'

    definePageMeta({
      middleware: 'auth',
      layout: 'default'
    })

    const config = useRuntimeConfig()
    const inviteUrl = config.public.discordInvite

    const router = useRouter()
    const route = useRoute()

    // If URL has ?banned=1, show ban message and stop polling.
    const isBanned = computed(() => route.query.banned === '1')

    let checkInterval = null

    async function checkGuildMembership () {
      if (isBanned.value) return // don't poll if banned
      try {
        const res = await fetch('/api/discord/guild-check')
        if (res.ok) {
          const data = await res.json()
          if (data.inGuild) {
            if (checkInterval) clearInterval(checkInterval)
            router.push('/dashboard')
          }
        }
      } catch (err) {
        console.error('Guild check failed:', err)
      }
    }

    onMounted(() => {
      checkGuildMembership()
      if (!isBanned.value) {
        checkInterval = setInterval(checkGuildMembership, 5000)
      }
    })

    onUnmounted(() => {
      if (checkInterval) clearInterval(checkInterval)
    })

    // expose to template
    // (inviteUrl and isBanned are used directly in <template>)
  </script>
