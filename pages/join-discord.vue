<template>
    <div class="p-6 max-w-md mx-auto text-center">
      <h2 class="text-2xl font-bold mb-4" v-if="!isBanned && !isInactive && !isSuspended">You're Almost In!</h2>
      <h2 class="text-2xl font-bold mb-4 text-red-600" v-else-if="isBanned">Account Banned</h2>
      <h2 class="text-2xl font-bold mb-4 text-orange-600" v-else-if="isSuspended">Account Temporarily Suspended</h2>
      <h2 class="text-2xl font-bold mb-4 text-amber-600" v-else>Account Inactive</h2>

      <p class="mb-4" v-if="!isBanned && !isInactive && !isSuspended">
        Join our Discord server, then come back and refresh the page, to unlock all features.
      </p>
      <p class="mb-4 text-red-600" v-else-if="isBanned">
        Your account has been banned. If you believe this is a mistake, please contact a moderator in Discord.
      </p>
      <p class="mb-4 text-orange-700" v-else-if="isSuspended">
        Your account has been temporarily suspended<span v-if="suspendedUntilText"> until {{ suspendedUntilText }}</span>.
        You'll be able to log back in once the suspension ends. If you believe this is a mistake, please contact a moderator in Discord.
      </p>
      <p class="mb-4 text-amber-700" v-else>
        Your account has been marked as inactive. If you believe this is a mistake, please reach out to the admins in Discord.
      </p>

      <a
        v-if="!isBanned && !isInactive && !isSuspended"
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
      title: 'Join Discord',
      middleware: 'auth',
      layout: 'default'
    })

    const config = useRuntimeConfig()
    const inviteUrl = config.public.discordInvite

    const router = useRouter()
    const route = useRoute()

    // If URL has ?banned=1, ?inactive=1, or ?suspended=1, show appropriate message and stop polling.
    const isBanned = computed(() => route.query.banned === '1')
    const isInactive = computed(() => route.query.inactive === '1')
    const isSuspended = computed(() => route.query.suspended === '1')
    const suspendedUntilText = computed(() => {
      const raw = route.query.until
      if (typeof raw !== 'string') return ''
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
    })

    let checkInterval = null

    async function checkGuildMembership () {
      if (isBanned.value || isInactive.value || isSuspended.value) return // don't poll if blocked
      try {
        const res = await fetch('/api/discord/guild-check')
        if (res.ok) {
          const data = await res.json()
          if (data.inGuild) {
            if (checkInterval) clearInterval(checkInterval)
            router.push('/newsite/home')
          }
        }
      } catch (err) {
        console.error('Guild check failed:', err)
      }
    }

    onMounted(() => {
      checkGuildMembership()
      if (!isBanned.value && !isSuspended.value) {
        checkInterval = setInterval(checkGuildMembership, 5000)
      }
    })

    onUnmounted(() => {
      if (checkInterval) clearInterval(checkInterval)
    })

    // expose to template
    // (inviteUrl and isBanned are used directly in <template>)
  </script>
