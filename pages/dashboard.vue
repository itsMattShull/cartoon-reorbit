<template>
    <Nav /> 
    <div class="pt-16 min-h-screen bg-gray-100 p-6">
      <template v-if="loading">
        <div class="flex flex-col lg:flex-row gap-6 max-w-4xl mx-auto">
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
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col lg:flex-row gap-6 max-w-4xl mx-auto">
          <div class="w-full lg:w-1/2">
            <div class="flex items-center gap-6 w-full bg-white rounded-xl shadow-md p-6">
              <img
                :src="`/avatars/${user?.avatar || 'default.png'}`"
                alt="User Avatar"
                class="w-24 h-24 rounded-full object-cover border-4 border-indigo-500"
              />
              <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
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
            <div class="gap-6 w-full bg-white rounded-xl shadow-md p-6 mt-6">
              <!-- New “Daily Points Reset” line: -->
              <p class="text-gray-700 text-xl">
                Daily Points Reset: {{ resetCountdown }}
              </p>
              <p
                class="text-gray-700 cursor-pointer hover:text-indigo-600 mt-3 underline"
                @click="showModal = true"
              >
                How do I earn more points?
              </p>
            </div>
          </div>
          <div class="rounded-xl shadow-md w-full lg:w-1/2">
            <nuxt-link to="/games/winwheel">
              <img src="/images/poster.png" alt="Fantastic Four Poster">
            </nuxt-link>
          </div>
        </div>
        <div class="flex flex-col md:flex-row max-w-4xl mx-auto mt-6">
          <div class="bg-white rounded-xl shadow-md p-6 w-full">
            <div>
              <h2 class="text-xl font-bold mb-4 text-indigo-600">
                <nuxt-link to="/cmart">{{ upcoming.length > 0 ? 'Upcoming Drops' : 'Recently Released' }}</nuxt-link>
              </h2>
              <!-- Horizontal scroll of cToon images -->
              <div class="relative overflow-x-auto">
                <div class="flex items-stretch space-x-8 pl-8 py-2">
                  <template
                    v-for="c in upcoming.length > 0 ? upcoming : recent"
                    :key="c.ctoonId"
                  >
                    <!-- each card is now a flex-column, full height, with content justified to the bottom -->
                    <div class="flex-none bg-white rounded-lg shadow p-4 flex flex-col justify-end">
                      <!-- Image -->
                      <div class="flex justify-center">
                        <img
                          :src="c.assetPath"
                          :alt="c.name"
                          class="rounded-md"
                        />
                      </div>

                      <!-- Release Date/Time -->
                      <div class="mt-2 text-sm text-gray-600">
                        <span class="font-medium">Release:</span>
                        {{ new Date(c.releaseDate).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZoneName: 'short'
                        }) }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
        <section class="flex flex-col lg:flex-row gap-6 max-w-4xl mt-6 mx-auto">
          <div class="w-full lg:w-1/2">
            <div class="flex flex-col items-center gap-6 w-full bg-white rounded-xl shadow-md p-6">
              <h2 class="text-lg font-semibold mb-2">Points Leaderboard</h2>
              <ul>
                <li
                  v-for="(entry, i) in leaderboard"
                  :key="entry.username"
                  class="flex items-center border-b last:border-b-0 py-1"
                >
                  <!-- username takes all available space, left-aligned -->
                  <span class="flex-1 mr-2">
                    {{ i + 1 }}. {{ entry.username }}
                  </span>
                  <!-- points right-aligned -->
                  <span class="font-medium text-right">
                    {{ entry.points.toLocaleString() }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <div class="w-full lg:w-1/2">
            <div class="rounded-xl shadow-md w-full">
              <div class="flex flex-col lg:flex-row gap-6 max-w-4xl mx-auto">
                <!-- Discord widget rebuilt with JSON -->
                <div class="flex w-full">
                  <div
                    class="w-full rounded-lg shadow-lg bg-[#2b2d31] text-white overflow-hidden"
                  >
                    <!-- Header -->
                    <div class="bg-[#5865F2] px-4 py-3 flex items-center gap-2">
                      <!-- Discord icon -->
                      <svg
                        class="w-6 h-6"
                        viewBox="0 0 71 55"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M60.104 4.552A58.9 58.9 0 0046.852.8a40.627 40.627 0 00-1.93 3.99 55.353 55.353 0 00-16.861 0A40.63 40.63 0 0026.13.8 58.9 58.9 0 0012.877 4.55C2.665 19.039-.58 33.145.264 47.144a59.267 59.267 0 0018.272 9.27 43.657 43.657 0 003.914-6.378 37.03 37.03 0 01-5.877-2.815c.494-.371.974-.757 1.438-1.155a41.586 41.586 0 0037.932 0c.465.398.945.784 1.439 1.155a37.036 37.036 0 01-5.884 2.82 43.575 43.575 0 003.914 6.378 59.295 59.295 0 0018.274-9.27c.93-15.098-2.314-29.192-12.526-42.592zM23.725 37.139c-3.6 0-6.568-3.291-6.568-7.349 0-4.058 2.916-7.349 6.568-7.349 3.667 0 6.568 3.308 6.568 7.349 0 4.058-2.916 7.349-6.568 7.349zm23.55 0c-3.6 0-6.568-3.291-6.568-7.349 0-4.058 2.915-7.349 6.568-7.349 3.667 0 6.568 3.308 6.568 7.349 0 4.058-2.901 7.349-6.568 7.349z"
                        />
                      </svg>
                      <span class="font-semibold truncate">{{ guild?.name || 'Discord' }}</span>
                      <span class="ml-auto text-xs opacity-80">
                        {{ guild?.presence_count ?? 0 }} online
                      </span>
                    </div>

                    <!-- “Start Chatting” CTA -->
                    <div class="p-6">
                      <a
                        :href="chatLink"
                        target="_blank"
                        rel="noopener"
                        class="block w-full text-center bg-indigo-600 hover:bg-indigo-700 transition-colors text-sm font-medium py-2 rounded-md"
                      >
                        Start Chatting
                      </a>
                    </div>

                    <!-- Members list -->
                    <div class="p-4 space-y-2 max-h-[144px] overflow-y-auto" v-if="guild">
                      <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        Members Online
                      </h4>
                      <div
                        v-for="m in guild.members"
                        :key="m.id"
                        class="flex items-center gap-2"
                      >
                        <img
                          :src="m.avatar_url"
                          class="w-6 h-6 rounded-full object-cover"
                          :alt="m.username"
                        />
                        <span class="text-sm truncate">{{ m.username }}</span>
                      </div>
                    </div>

                    <!-- Loading / error state -->
                    <div v-else class="p-4 text-center text-sm text-gray-300">
                      Loading…
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <!-- Modal: “How To Gain Points” -->
        <teleport to="body">
          <div
            v-if="showModal"
            class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
              <h3 class="text-xl font-semibold mb-4">How To Gain Points</h3>
              <div class="space-y-2 text-gray-700 my-6">
                All ways to gain points in a 24 hour cycle reset at 8pm CST.
              </div>
              <div class="space-y-6 text-gray-700">
                <p>
                  • 20 points every 24 hours for every cZone you visit (up to 200 points per day).
                </p>
                <p>
                  • Claim your daily login bonus (500 points) once every 24 hour cycle.
                </p>
                <p>
                  • Playing games, such as Winball, will give you up to 250 points every 24 hours.
                </p>
                <p>
                  • Special codes that can be found in the announcements channel in Discord.
                </p>
              </div>
              <div class="mt-6 text-right">
                <button
                  @click="showModal = false"
                  class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </teleport>
      </template>
    </div>
  </template>
  
  <script setup>
    import { ref, onMounted, onUnmounted } from 'vue'
    import { useRouter } from 'vue-router'
    import { DateTime, Duration } from 'luxon'
    import * as Sentry from "@sentry/nuxt"
    definePageMeta({
      middleware: 'auth',
      layout: 'default'
    })

    const loading = ref(true)
    const { user, fetchSelf } = useAuth()
    const router = useRouter()

    // --- Discord widget data ---
    const guild = ref(null)
    const chatLink =
      'https://discord.com/channels/1369067208029896794/1369067208520503591'

    const getDiscordWidget = async () => {
      try {
        guild.value = await $fetch('https://discord.com/api/guilds/1369067208029896794/widget.json')
      } catch (err) {
        Sentry.withScope(scope => {
          // add any custom metadata you like:
          scope.setTag('page', 'dashboard');
          scope.setTag('user', user?.username);
          scope.setExtra('moreInfo', 'Failed while loading discord widget');
          Sentry.captureException(err);
        });
        console.error('Failed to load Discord widget JSON', err)
      }
    }
    // --- end Discord widget data ---

    const leaderboard = ref([])

    // --- cToons logic ---
    const allCToons = ref([])
    const upcoming = computed(() =>
      allCToons.value.filter(c => {
        const date = new Date(c.releaseDate)
        const now = new Date()
        const inFourWeeks = new Date()
        inFourWeeks.setDate(now.getDate() + 28)
        return date > now && date <= inFourWeeks
      })
    )
    const recent = computed(() =>
      allCToons.value.filter(c => {
        const date = new Date(c.releaseDate)
        const now = new Date()
        const fourWeeksAgo = new Date()
        fourWeeksAgo.setDate(now.getDate() - 28)
        return date <= now && date >= fourWeeksAgo
      })
    )

    const fetchCToons = async () => {
      try {
        allCToons.value = await $fetch('/api/ctoons')
      } catch (err) {
        Sentry.withScope(scope => {
          // add any custom metadata you like:
          scope.setTag('page', 'dashboard');
          scope.setTag('user', user?.username);
          scope.setExtra('moreInfo', 'Failed while loading /api/ctoons');
          Sentry.captureException(err);
        });
        console.error('Failed to fetch cToons', err)
      }
    }
    // --- end cToons logic ---

    // -------- Countdown to next 8 PM CST --------
    const resetCountdown = ref('--:--:--')
    let countdownInterval = null

    function computeNextReset() {
      // “Now” in Chicago
      const chicagoNow = DateTime.now().setZone('America/Chicago')

      // 8 PM today in Chicago
      let next8pm = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })

      // If we’re already past or exactly at 8 PM, bump to tomorrow
      if (chicagoNow >= next8pm) {
        next8pm = next8pm.plus({ days: 1 })
      }

      // Convert that 8 PM CST into the user’s local time
      const nextLocal = next8pm.toLocal()

      return nextLocal
    }

    function updateCountdown() {
      const nowLocal = DateTime.local()
      const resetLocal = computeNextReset()
      const diff = resetLocal.diff(nowLocal, ['hours', 'minutes', 'seconds']).toObject()

      // If for any reason diff is negative or missing, show 00:00:00
      if (diff.hours < 0 || diff.minutes < 0 || diff.seconds < 0) {
        resetCountdown.value = '00:00:00'
        return
      }

      // Format as HH:mm:ss, zero-pad
      const hh = String(Math.floor(diff.hours)).padStart(2, '0')
      const mm = String(Math.floor(diff.minutes)).padStart(2, '0')
      const ss = String(Math.floor(diff.seconds)).padStart(2, '0')
      resetCountdown.value = `${hh}:${mm}:${ss}`
    }

    onMounted(async () => {
      await fetchSelf()
      if (user.value?.needsSetup) {
        router.push('/setup-username')
        return
      }

      // 2) Kick off countdown timer
      updateCountdown()
      countdownInterval = setInterval(updateCountdown, 1000)

      // fetch Discord data in parallel with the rest
      getDiscordWidget()

      // fetch cToons
      await fetchCToons()

      try {
        const res = await fetch('/api/points-leaderboard', {
          credentials: 'include'
        })
        if (res.ok) {
          leaderboard.value = await res.json()
        } else {
          console.error('Failed to load leaderboard:', await res.text())
        }
      } catch (err) {
        Sentry.withScope(scope => {
          // add any custom metadata you like:
          scope.setTag('page', 'dashboard');
          scope.setTag('user', user?.username);
          scope.setExtra('moreInfo', 'Failed while loading /api/points-leaderboard');
          Sentry.captureException(err);
        });
        console.error('Leaderboard fetch error:', err)
      }

      // remove loading animation
      loading.value = false
    })

    onUnmounted(() => {
      if (countdownInterval) {
        clearInterval(countdownInterval)
        countdownInterval = null
      }
    })

    const showModal = ref(false)
  </script>
  
  <style scoped>
  /* optional additional styles */
  </style>