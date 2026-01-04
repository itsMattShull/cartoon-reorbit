<template>
  <div
    class="reorbit-theme relative overflow-hidden min-h-screen"
    style="background:
    linear-gradient(180deg, var(--reorbit-cyan) -50%, transparent 100%) top/100% 100px no-repeat,
    linear-gradient(180deg, var(--reorbit-blue), var(--reorbit-navy))"
    >
    <Nav />

    <!-- Navy page background with subtle brand glows -->
    <div
      class="mt-16 md:mt-20 md:pt-6 min-h-screen p-6 text-white"
    >
            <template v-if="loading">
        <!-- Top row skeleton -->
        <div class="flex flex-col lg:flex-row gap-2 max-w-4xl mx-auto">
          <!-- Profile + counters + Winball (left column) -->
          <div class="w-full lg:w-1/2">
            <!-- Profile card skeleton -->
            <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/90 backdrop-blur-sm animate-pulse">
              <div class="h-1 w-full bg-[var(--reorbit-tint)]"></div>
              <div class="flex items-center gap-6 w-full px-6 py-3">
                <div class="w-24 h-24 rounded-full bg-[var(--reorbit-tint)]"></div>
                <div class="flex-1 space-y-3">
                  <div class="h-6 bg-[var(--reorbit-tint)] rounded w-3/4"></div>
                  <div class="h-4 bg-[var(--reorbit-tint)] rounded w-1/2"></div>
                  <div class="h-4 bg-[var(--reorbit-tint)] rounded w-1/3"></div>
                  <div class="h-4 bg-[var(--reorbit-tint)] rounded w-2/3"></div>
                </div>
              </div>
              <div class="px-6 pb-4 space-y-2">
                <div class="h-5 bg-[var(--reorbit-tint)] rounded w-2/3"></div>
                <div class="h-4 bg-[var(--reorbit-tint)] rounded w-1/2"></div>
              </div>
            </div>

            <!-- Winball prize preview skeleton -->
            <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] mt-2 bg-white/90 backdrop-blur-sm animate-pulse">
              <div class="h-1 w-full bg-[var(--reorbit-tint)]"></div>
              <div class="p-2">
                <div class="w-full aspect-[16/9] bg-[var(--reorbit-tint)] rounded-xl"></div>
              </div>
            </div>
          </div>

          <!-- Promo (right column) -->
          <div class="rounded-xl shadow-md border border-[var(--reorbit-border)] w-full lg:w-1/2 overflow-hidden bg-white/90 backdrop-blur-sm animate-pulse">
            <div class="w-full h-full min-h-[220px] bg-[var(--reorbit-tint)]"></div>
          </div>
        </div>

        <!-- Releases skeleton -->
        <div class="flex flex-col md:flex-row max-w-4xl mx-auto mt-6">
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] w-full bg-white/90 backdrop-blur-sm animate-pulse">
            <div class="h-1 w-full bg-[var(--reorbit-tint)]"></div>
            <div class="p-6">
              <div class="h-6 bg-[var(--reorbit-tint)] rounded w-1/3 mb-4"></div>
              <div class="relative overflow-x-hidden">
                <div class="flex items-stretch space-x-8 pl-8 py-2">
                  <div
                    v-for="i in 3"
                    :key="i"
                    class="flex-none rounded-lg shadow border border-[var(--reorbit-border)] p-4 flex flex-col justify-end bg-white/90"
                  >
                    <div class="h-24 w-24 mx-auto bg-[var(--reorbit-tint)] rounded-md mb-2"></div>
                    <div class="h-4 bg-[var(--reorbit-tint)] rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Leaderboards skeleton -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mt-6 mx-auto">
          <div
            v-for="i in 6"
            :key="i"
            class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/90 backdrop-blur-sm animate-pulse"
          >
            <div class="h-1 w-full bg-[var(--reorbit-tint)]"></div>
            <div class="w-full p-6">
              <div class="h-5 bg-[var(--reorbit-tint)] rounded w-2/3 mb-4"></div>
              <div class="space-y-2">
                <div
                  v-for="j in 5"
                  :key="j"
                  class="flex items-center justify-between py-1"
                >
                  <div class="h-4 bg-[var(--reorbit-tint)] rounded w-2/3"></div>
                  <div class="h-4 bg-[var(--reorbit-tint)] rounded w-1/4"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Discord skeleton -->
        <section class="max-w-4xl mt-6 mx-auto">
          <div class="rounded-xl shadow-md border border-[var(--reorbit-border)] w-full bg-white/90 backdrop-blur-sm overflow-hidden animate-pulse">
            <div class="bg-[#5865F2] px-4 py-3 flex items-center gap-2">
              <div class="w-6 h-6 rounded-full bg-[var(--reorbit-tint)]"></div>
              <div class="h-4 w-32 bg-[var(--reorbit-tint)] rounded"></div>
              <div class="ml-auto h-3 w-16 bg-[var(--reorbit-tint)] rounded"></div>
            </div>

            <div class="p-6">
              <div class="h-9 w-full bg-[var(--reorbit-tint)] rounded mb-4"></div>
              <div class="space-y-2 max-h-[144px] overflow-hidden">
                <div
                  v-for="i in 4"
                  :key="i"
                  class="flex items-center gap-2"
                >
                  <div class="w-6 h-6 rounded-full bg-[var(--reorbit-tint)]"></div>
                  <div class="h-4 w-1/2 bg-[var(--reorbit-tint)] rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <!-- Top row -->
        <div class="flex flex-col lg:flex-row gap-2 max-w-4xl mx-auto">
          <!-- Profile + counters -->
          <div class="w-full lg:w-1/2">
            <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
              <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>
              <div class="flex items-center gap-6 w-full px-6 py-3 text-slate-900">
                <img
                  :src="`/avatars/${user?.avatar || 'default.png'}`"
                  alt="User Avatar"
                  class="w-24 h-24 rounded-full object-cover ring-4 ring-[var(--reorbit-cyan)] ring-offset-2 ring-offset-white"
                />
                <div class="truncate">
                  <NuxtLink
                    :to="`/czone/${user?.username}`"
                    class="text-2xl font-bold mb-1 text-[var(--reorbit-blue)] hover:text-[var(--reorbit-purple)] hover:underline"
                  >
                    {{ user?.username }}
                  </NuxtLink>
                  <p class="text-slate-800">{{ user?.points }} Points</p>
                  <p class="text-slate-800">
                    {{ user?.ctoons ? new Set(user.ctoons.map(c => c.ctoonId)).size : 0 }} unique cToons Collected
                  </p>
                  <p class="text-slate-800">
                    {{ user?.ctoons ? user.ctoons.length : 0 }} total cToons Collected
                  </p>
                </div>
              </div>
              <div class="flex-col items-center gap-6 w-full px-6 text-slate-900">
                <p class="text-xl">
                  Daily Points Reset:
                  <span class="font-semibold text-[var(--reorbit-blue)]">{{ resetCountdown }}</span>
                </p>
                <p
                  class="text-[var(--reorbit-blue)]/90 cursor-pointer hover:text-[var(--reorbit-purple)] mt-2 mb-2 underline"
                  @click="showModal = true"
                >
                  How do I earn more points?
                </p>
              </div>
            </div>

            <!-- <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] mt-2 bg-white/95 backdrop-blur-sm">
              <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-lime)] via-[var(--reorbit-green-2)] to-[var(--reorbit-teal)]"></div>
              <div class="p-6 text-slate-900">
                <p class="text-xl">
                  Daily Points Reset:
                  <span class="font-semibold text-[var(--reorbit-blue)]">{{ resetCountdown }}</span>
                </p>
                <p
                  class="text-[var(--reorbit-blue)]/90 cursor-pointer hover:text-[var(--reorbit-purple)] mt-3 underline"
                  @click="showModal = true"
                >
                  How do I earn more points?
                </p>
              </div>
            </div> -->

            <!-- Winball prize preview -->
            <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] mt-2 bg-white/95 backdrop-blur-sm">
             <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-lime)] via-[var(--reorbit-green-2)] to-[var(--reorbit-teal)]"></div>
              <div class="p-2">
                <nuxt-link to="/games/winball" class="block relative rounded-xl overflow-hidden">
                  <!-- background image -->
                  <img
                    :src="winballBgSrc"
                    alt="Winball promo"
                    class="w-full h-auto rounded-xl"
                  />
                  <!-- centered prize overlay -->
                  <img
                    v-if="winballPrizeUrl"
                    :src="winballPrizeUrl"
                    alt="Current Winball prize"
                    class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          max-w-[60%] max-h-[60%] object-contain rounded-lg"
                  />
                </nuxt-link>
              </div>
            </div>
          </div>

          <!-- Promo -->
          <div class="rounded-xl shadow-md border border-[var(--reorbit-border)] w-full lg:w-1/2 overflow-hidden bg-white/95 backdrop-blur-sm">
            <nuxt-link to="/games/winwheel">
              <img :src="showcaseSrc" alt="Showcase Poster Image" class="w-full h-full object-cover">
            </nuxt-link>
          </div>
        </div>

        <!-- Releases -->
        <div class="flex flex-col md:flex-row max-w-4xl mx-auto mt-6">
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] w-full bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>
            <div class="p-6 text-slate-900">
              <h2 class="text-xl font-bold mb-4 text-[var(--reorbit-blue)]">
                <nuxt-link to="/cmart">{{ upcoming.length > 0 ? 'Upcoming Drops' : 'Recently Released' }}</nuxt-link>
              </h2>

              <div class="relative overflow-x-auto">
                <div class="flex items-stretch space-x-8 pl-8 py-2">
                  <template v-for="c in upcoming.length > 0 ? upcoming : recent" :key="c.ctoonId">
                    <div class="flex-none rounded-lg shadow border border-[var(--reorbit-border)] p-4 flex flex-col justify-end bg-white/95">
                      <div class="flex justify-center">
                        <img :src="c.assetPath" :alt="c.name" class="rounded-md" />
                      </div>
                      <div class="mt-2 text-sm text-slate-700">
                        <span class="font-medium">Release:</span>
                        {{ new Date(c.releaseDate).toLocaleString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                        }) }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- leaderboards -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mt-6 mx-auto">
          <!-- Active cToon Acquirers -->
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-teal)] via-[var(--reorbit-green-2)] to-[var(--reorbit-lime)]"></div>
            <div class="w-full p-6 text-slate-900">
              <div class="flex items-baseline justify-between gap-3">
                <h2 class="text-lg font-semibold text-[var(--reorbit-blue)]">Active cToon Acquirers</h2>
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last 7 Days</span>
              </div>
              <ul class="w-full mt-3">
                <li v-for="(entry, i) in activeCtoonAcquirers" :key="entry.username"
                    class="flex items-center border-b border-[var(--reorbit-border)] last:border-b-0 py-2">
                  <span class="flex-1 mr-2 truncate">{{ i + 1 }}. {{ entry.username }}</span>
                  <span class="font-medium text-right">{{ entry.count.toLocaleString() }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Trending Earners -->
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-cyan)] via-[var(--reorbit-aqua)] to-[var(--reorbit-teal)]"></div>
            <div class="w-full p-6 text-slate-900">
              <div class="flex items-baseline justify-between gap-3">
                <h2 class="text-lg font-semibold text-[var(--reorbit-blue)]">Trending Earners</h2>
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last 7 Days</span>
              </div>
              <ul class="w-full mt-3">
                <li v-for="(entry, i) in trendingEarners" :key="entry.username"
                    class="flex items-center border-b border-[var(--reorbit-border)] last:border-b-0 py-2">
                  <span class="flex-1 mr-2 truncate">{{ i + 1 }}. {{ entry.username }}</span>
                  <span class="font-medium text-right">{{ entry.points.toLocaleString() }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Trending Spenders -->
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-blue)] to-[var(--reorbit-cyan)]"></div>
            <div class="w-full p-6 text-slate-900">
              <div class="flex items-baseline justify-between gap-3">
                <h2 class="text-lg font-semibold text-[var(--reorbit-blue)]">Trending Spenders</h2>
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last 7 Days</span>
              </div>
              <ul class="w-full mt-3">
                <li v-for="(entry, i) in trendingSpenders" :key="entry.username"
                    class="flex items-center border-b border-[var(--reorbit-border)] last:border-b-0 py-2">
                  <span class="flex-1 mr-2 truncate">{{ i + 1 }}. {{ entry.username }}</span>
                  <span class="font-medium text-right">{{ entry.points.toLocaleString() }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Unique cToon Count Leaderboard -->
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>
            <div class="w-full p-6 text-slate-900">
              <h2 class="text-lg font-semibold mb-2 text-[var(--reorbit-blue)]">Unique cToon Count Leaderboard</h2>
              <ul class="w-full">
                <li v-for="(entry, i) in uniqueCtoonLb" :key="entry.username"
                    class="flex items-center border-b border-[var(--reorbit-border)] last:border-b-0 py-2">
                  <span class="flex-1 mr-2 truncate">{{ i + 1 }}. {{ entry.username }}</span>
                  <span class="font-medium text-right">{{ entry.count.toLocaleString() }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Total cToon Count Leaderboard -->
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-lime)] via-[var(--reorbit-green-2)] to-[var(--reorbit-teal)]"></div>
            <div class="w-full p-6 text-slate-900">
              <h2 class="text-lg font-semibold mb-2 text-[var(--reorbit-blue)]">Total cToon Count Leaderboard</h2>
              <ul class="w-full">
                <li v-for="(entry, i) in totalCtoonLb" :key="entry.username"
                    class="flex items-center border-b border-[var(--reorbit-border)] last:border-b-0 py-2">
                  <span class="flex-1 mr-2 truncate">{{ i + 1 }}. {{ entry.username }}</span>
                  <span class="font-medium text-right">{{ entry.count.toLocaleString() }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Points Leaderboard -->
          <div class="relative overflow-hidden rounded-xl shadow-md border border-[var(--reorbit-border)] bg-white/95 backdrop-blur-sm">
            <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-lime)] via-[var(--reorbit-green-2)] to-[var(--reorbit-teal)]"></div>
            <div class="w-full p-6 text-slate-900">
              <h2 class="text-lg font-semibold mb-2 text-[var(--reorbit-blue)]">Points Leaderboard</h2>
              <ul class="w-full">
                <li
                  v-for="(entry, i) in leaderboard"
                  :key="entry.username"
                  class="flex items-center border-b border-[var(--reorbit-border)] last:border-b-0 py-2"
                >
                  <span class="flex-1 mr-2 truncate">
                    {{ i + 1 }}. {{ entry.username }}
                  </span>
                  <span class="font-medium text-right">
                    {{ entry.points.toLocaleString() }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Discord -->
        <section class="max-w-4xl mt-6 mx-auto">
          <div class="rounded-xl shadow-md border border-[var(--reorbit-border)] w-full bg-white/95 backdrop-blur-sm overflow-hidden">
            <div class="flex flex-col lg:flex-row gap-6">
              <div class="flex w-full">
                <div class="w-full rounded-lg shadow-lg bg-[#2b2d31] text-white overflow-hidden">
                  <div class="bg-[#5865F2] px-4 py-3 flex items-center gap-2">
                    <svg class="w-6 h-6" viewBox="0 0 71 55" fill="currentColor" aria-hidden="true">
                      <path d="M60.104 4.552A58.9 58.9 0 0046.852.8a40.627 40.627 0 00-1.93 3.99 55.353 55.353 0 00-16.861 0A40.63 40.63 0 0026.13.8 58.9 58.9 0 0012.877 4.55C2.665 19.039-.58 33.145.264 47.144a59.267 59.267 0 0018.272 9.27 43.657 43.657 0 003.914-6.378 37.03 37.03 0 01-5.877-2.815c.494-.371.974-.757 1.438-1.155a41.586 41.586 0 0037.932 0c.465.398.945.784 1.439 1.155a37.036 37.036 0 01-5.884 2.82 43.575 43.575 0 003.914 6.378 59.295 59.295 0 0018.274-9.27c.93-15.098-2.314-29.192-12.526-42.592zM23.725 37.139c-3.6 0-6.568-3.291-6.568-7.349 0-4.058 2.916-7.349 6.568-7.349 3.667 0 6.568 3.308 6.568 7.349 0 4.058-2.916 7.349-6.568 7.349zm23.55 0c-3.6 0-6.568-3.291-6.568-7.349 0-4.058 2.915-7.349 6.568-7.349 3.667 0 6.568 3.308 6.568 7.349 0 4.058-2.901 7.349-6.568 7.349z"/>
                    </svg>
                    <span class="font-semibold truncate">{{ guild?.name || 'Discord' }}</span>
                    <span class="ml-auto text-xs opacity-80">{{ guild?.presence_count ?? 0 }} online</span>
                  </div>

                  <div class="p-6">
                    <a
                      :href="chatLink"
                      target="_blank"
                      rel="noopener"
                      class="block w-full text-center text-[var(--reorbit-deep)] bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] transition-colors text-sm font-medium py-2 rounded-md hover:brightness-95"
                    >
                      Start Chatting 
                    </a>
                  </div>

                  <div class="p-4 space-y-2 max-h-[144px] overflow-y-auto" v-if="guild">
                    <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Members Online</h4>
                    <div v-for="m in guild.members" :key="m.id" class="flex items-center gap-2">
                      <img :src="m.avatar_url" class="w-6 h-6 rounded-full object-cover" :alt="m.username" />
                      <span class="text-sm truncate">{{ m.username }}</span>
                    </div>
                  </div>

                  <div v-else class="p-4 text-center text-sm text-gray-300">Loading…</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Modal -->
        <teleport to="body">
          <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4 border border-[var(--reorbit-border)] text-slate-900">
              <h3 class="text-xl font-semibold mb-4 text-[var(--reorbit-blue)]">How To Gain Points</h3>
              <div class="space-y-2 my-6">
                All ways to gain points in a 24 hour cycle reset at 8pm CST.
              </div>
              <div class="space-y-6">
                <p>• {{ gc.czoneVisitPoints }} points every 24 hours for every cZone you visit (up to {{ gc.czoneVisitPoints * gc.czoneVisitMaxPerDay }} points per day).</p>
                <p>• Claim your daily login bonus ({{ gc.dailyLoginPoints }} points) once every 24 hour cycle.</p>
                <p>• Playing games, such as Winball, will give you up to {{ gc.dailyPointLimit }} points every 24 hours.</p>
                <p>• Special codes that can be found in the announcements channel in Discord.</p>
              </div>
              <div class="mt-6 text-right">
                <button
                  @click="showModal = false"
                  class="px-4 py-2 rounded text-[var(--reorbit-deep)] bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] hover:brightness-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </teleport>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { DateTime } from 'luxon'
import * as Sentry from '@sentry/nuxt'

definePageMeta({ title: 'Showcase', middleware: 'auth', layout: 'default' })

/* pull public homepage config */
const { data: hp } = await useAsyncData('homepage-public', () =>
  $fetch('/api/homepage') // note: /api/homepage, not /api/hompage
)

/* bind with fallback to the old poster */
const showcaseSrc = computed(
  () => hp.value?.showcaseImagePath || '/images/posterOct25.png'
)

const loading = ref(true)
const { user, fetchSelf } = useAuth()
const router = useRouter()

const guild = ref(null)
const chatLink = 'https://discord.com/channels/1369067208029896794/1369067208520503591'
const getDiscordWidget = async () => {
  try {
    guild.value = await $fetch('https://discord.com/api/guilds/1369067208029896794/widget.json')
  } catch (err) {
    Sentry.withScope(scope => {
      scope.setTag('page', 'dashboard')
      scope.setTag('user', user?.username)
      scope.setExtra('moreInfo', 'Failed while loading discord widget')
      Sentry.captureException(err)
    })
    console.error('Failed to load Discord widget JSON', err)
  }
}

const leaderboard = ref([])

const allCToons = ref([])
const upcoming = computed(() => {
  const now = new Date()
  const inFourWeeks = new Date(now); inFourWeeks.setDate(now.getDate() + 28)
  return allCToons.value.filter(c => {
    const d = new Date(c.releaseDate)
    return d > now && d <= inFourWeeks
  })
})
const recent = computed(() => {
  const now = new Date()
  const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(now.getDate() - 28)
  return allCToons.value.filter(c => {
    const d = new Date(c.releaseDate)
    return d <= now && d >= fourWeeksAgo
  })
})
const fetchCToons = async () => {
  try {
    allCToons.value = await $fetch('/api/ctoons')
  } catch (err) {
    Sentry.withScope(scope => {
      scope.setTag('page', 'dashboard')
      scope.setTag('user', user?.username)
      scope.setExtra('moreInfo', 'Failed while loading /api/ctoons')
      Sentry.captureException(err)
    })
    console.error('Failed to fetch cToons', err)
  }
}

const uniqueCtoonLb = ref([])
const totalCtoonLb  = ref([])
const activeCtoonAcquirers = ref([])
const trendingEarners = ref([])
const trendingSpenders = ref([])

async function fetchLeaderboards() {
  try {
    const [uRes, tRes, aRes, eRes, sRes] = await Promise.all([
      fetch('/api/leaderboard/unique-ctoons', { credentials: 'include' }),
      fetch('/api/leaderboard/total-ctoons',  { credentials: 'include' }),
      fetch('/api/leaderboard/active-ctoon-acquirers', { credentials: 'include' }),
      fetch('/api/leaderboard/trending-earners', { credentials: 'include' }),
      fetch('/api/leaderboard/trending-spenders', { credentials: 'include' })
    ])
    if (uRes.ok) uniqueCtoonLb.value = await uRes.json()
    if (tRes.ok) totalCtoonLb.value  = await tRes.json()
    if (aRes.ok) activeCtoonAcquirers.value  = await aRes.json()
    if (eRes.ok) trendingEarners.value  = await eRes.json()
    if (sRes.ok) trendingSpenders.value  = await sRes.json()
  } catch (err) {
    console.error('Leaderboard fetch error:', err)
  }
}

const resetCountdown = ref('--:--:--')
let countdownInterval = null
function computeNextReset() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let next8pm = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow >= next8pm) next8pm = next8pm.plus({ days: 1 })
  return next8pm.toLocal()
}
function updateCountdown() {
  const nowLocal = DateTime.local()
  const resetLocal = computeNextReset()
  const diff = resetLocal.diff(nowLocal, ['hours', 'minutes', 'seconds']).toObject()
  const hh = String(Math.max(0, Math.floor(diff.hours || 0))).padStart(2, '0')
  const mm = String(Math.max(0, Math.floor(diff.minutes || 0))).padStart(2, '0')
  const ss = String(Math.max(0, Math.floor(diff.seconds || 0))).padStart(2, '0')
  resetCountdown.value = `${hh}:${mm}:${ss}`
}

const showModal = ref(false)

/* ── Winball prize (public) ─────────────────────────────────── */
const { data: prizeData } = await useAsyncData('winball-prize', () =>
  $fetch('/api/winball-prize')
)
const winballPrizeUrl = computed(() => prizeData.value?.prize?.ctoon?.imageUrl || '')

/* background image behind overlay (fallback to poster) */
const winballBgSrc = computed(() =>
  hp.value?.bottomRightImagePath || '/images/ZoidsWinball.png'
)


// Public global config for dynamic copy in the modal
const { data: globalCfg } = await useAsyncData('global-config', () => $fetch('/api/global-config'))
const gc = computed(() => ({
  dailyPointLimit:    Number(globalCfg.value?.dailyPointLimit ?? 250),
  dailyLoginPoints:   Number(globalCfg.value?.dailyLoginPoints ?? 500),
  dailyNewUserPoints: Number(globalCfg.value?.dailyNewUserPoints ?? 1000),
  czoneVisitPoints:   Number(globalCfg.value?.czoneVisitPoints ?? 20),
  czoneVisitMaxPerDay:Number(globalCfg.value?.czoneVisitMaxPerDay ?? 10)
}))


onMounted(async () => {
  await fetchSelf({ force: true })
  if (user.value?.needsSetup) { router.push('/setup-username'); return }

  updateCountdown()
  countdownInterval = setInterval(updateCountdown, 1000)
  await fetchLeaderboards()
  getDiscordWidget()
  await fetchCToons()

  try {
    const res = await fetch('/api/points-leaderboard', { credentials: 'include' })
    if (res.ok) leaderboard.value = await res.json()
    else console.error('Failed to load leaderboard:', await res.text())
  } catch (err) {
    Sentry.withScope(scope => {
      scope.setTag('page', 'dashboard')
      scope.setTag('user', user?.username)
      scope.setExtra('moreInfo', 'Failed while loading /api/points-leaderboard')
      Sentry.captureException(err)
    })
    console.error('Leaderboard fetch error:', err)
  }

  loading.value = false
})

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval)
})
</script>

<!-- Brand variables: not scoped -->
<style>
.reorbit-theme{
  --reorbit-deep: #010A36;
  --reorbit-navy: #002C62;
  --reorbit-blue: #2D5294;
  --reorbit-cyan: #0FDDD6;
  --reorbit-aqua: #16ECE9;
  --reorbit-teal: #19E6AC;
  --reorbit-green: #51F68E;
  --reorbit-green-2: #70F873;
  --reorbit-lime: #AFFA2D;
  --reorbit-lime-2: #B3FB57;
  --reorbit-purple: #9647CF;

  --reorbit-border: rgba(45,82,148,0.25);
  --reorbit-tint: rgba(0,44,98,0.035);
  --reorbit-cyan-transparent: rgba(15,221,214,0.12);
  --reorbit-purple-transparent: rgba(150,71,207,0.12);
  --reorbit-green-transparent: rgba(81,246,142,0.12); /* new */
}
</style>

<style scoped>
/* component tweaks if needed */
</style>
