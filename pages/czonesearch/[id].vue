<template>
  <div class="min-h-screen bg-slate-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto space-y-6">
      <div v-if="pending" class="rounded-2xl border border-slate-200 bg-white p-6 shadow">
        <div class="h-6 w-48 rounded bg-slate-100 animate-pulse"></div>
        <div class="mt-4 h-4 w-72 rounded bg-slate-100 animate-pulse"></div>
      </div>

      <div v-else-if="error" class="rounded-2xl border border-slate-200 bg-white p-6 shadow">
        <p class="text-sm text-slate-600">{{ error.message || 'Unable to load cZone search.' }}</p>
      </div>

      <div v-else class="space-y-6">
        <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs uppercase tracking-widest text-slate-400">cZone Search</p>
              <h1 class="text-2xl font-semibold text-slate-900">{{ searchName }}</h1>
              <p class="text-sm text-slate-500">Active {{ formatDateRange(search?.startAt, search?.endAt) }}</p>
            </div>
            <div class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {{ collectionLabel(search?.collectionType) }}
            </div>
          </div>

          <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs uppercase tracking-widest text-slate-400">Schedule</p>
              <p class="mt-1 text-sm text-slate-700">Start: {{ formatDateTime(search?.startAt) }}</p>
              <p class="text-sm text-slate-700">End: {{ formatDateTime(search?.endAt) }}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs uppercase tracking-widest text-slate-400">Appearance</p>
              <p class="mt-1 text-sm text-slate-700">
                {{ formatPercent(search?.appearanceRatePercent) }} chance to appear
              </p>
              <p class="text-sm text-slate-700">{{ resetLabel(search) }}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs uppercase tracking-widest text-slate-400">Collection</p>
              <p class="mt-1 text-sm text-slate-700">{{ collectionLabel(search?.collectionType) }}</p>
              <p v-if="search?.collectionType === 'CUSTOM_PER_CTOON'" class="text-sm text-slate-500">
                Max captures can vary per prize pool cToon.
              </p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs uppercase tracking-widest text-slate-400">Prize Pool</p>
              <p class="mt-1 text-sm text-slate-700">{{ prizeCount }} cToon{{ prizeCount === 1 ? '' : 's' }}</p>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900">Prize Pool</h2>
            <p class="text-xs text-slate-500">Conditions listed per cToon</p>
          </div>

          <div v-if="!search?.prizePool?.length" class="rounded-2xl border border-slate-200 bg-white p-6 shadow">
            <p class="text-sm text-slate-600">No prize pool entries found.</p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="entry in search.prizePool"
              :key="entry.id"
              class="rounded-2xl border border-slate-200 bg-white p-5 shadow"
            >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div class="h-20 w-20 flex-none rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <img
                    v-if="entry.ctoon?.assetPath"
                    :src="entry.ctoon.assetPath"
                    :alt="entry.ctoon?.name || 'cToon'"
                    class="h-full w-full object-contain"
                  />
                </div>
                <div class="flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-semibold text-slate-900">
                      {{ entry.ctoon?.name || 'Unknown cToon' }}
                    </h3>
                    <span v-if="entry.ctoon?.rarity" class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {{ entry.ctoon.rarity }}
                    </span>
                    <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {{ formatPercent(entry.chancePercent) }} chance
                    </span>
                    <span
                      v-if="entry.maxCaptures"
                      class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"
                    >
                      Max {{ entry.maxCaptures }}
                    </span>
                  </div>

                  <div class="mt-4 space-y-3">
                    <p class="text-xs uppercase tracking-widest text-slate-400">Conditions</p>
                    <div v-if="!hasConditions(entry)" class="text-sm text-slate-500">
                      No extra conditions.
                    </div>
                    <div v-else class="space-y-3 text-sm text-slate-700">
                      <div v-if="entry.conditionDateEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">Date Window</p>
                        <p class="text-slate-600">
                          {{ entry.conditionDateStart || 'Any' }} to {{ entry.conditionDateEnd || 'Any' }}
                        </p>
                      </div>
                      <div v-if="entry.conditionTimeEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">Time of Day</p>
                        <p class="text-slate-600">{{ timeOfDayLabel(entry.conditionTimeOfDay) }}</p>
                      </div>
                      <div v-if="entry.conditionBackgroundEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">Required Backgrounds</p>
                        <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div
                            v-for="bg in backgroundList(entry)"
                            :key="bg.filename || bg.id"
                            class="overflow-hidden rounded-lg border border-slate-200 bg-white"
                          >
                            <div class="h-20 bg-slate-100">
                              <img
                                v-if="backgroundSrc(bg)"
                                :src="backgroundSrc(bg)"
                                :alt="bg.label || bg.filename || 'Background'"
                                class="h-full w-full object-cover"
                              />
                            </div>
                            <div class="px-2 py-1 text-xs text-slate-600">
                              {{ bg.label || bg.filename || 'Background' }}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div v-if="entry.conditionCtoonInZoneEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">cToon Must Be In cZone</p>
                        <div class="mt-2 flex items-center gap-3">
                          <div class="h-12 w-12 rounded-lg border border-slate-200 bg-white p-1">
                            <img
                              v-if="entry.conditionCtoonInZone?.assetPath"
                              :src="entry.conditionCtoonInZone.assetPath"
                              :alt="entry.conditionCtoonInZone?.name || 'cToon'"
                              class="h-full w-full object-contain"
                            />
                          </div>
                          <div>
                            <p class="text-sm font-semibold text-slate-800">
                              {{ entry.conditionCtoonInZone?.name || entry.conditionCtoonInZoneId || 'Unknown cToon' }}
                            </p>
                            <p v-if="entry.conditionCtoonInZone?.rarity" class="text-xs text-slate-500">
                              {{ entry.conditionCtoonInZone.rarity }}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div v-if="entry.conditionUserOwnsEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">User Must Own</p>
                        <div class="mt-2 space-y-2">
                          <div
                            v-for="row in entry.conditionUserOwns"
                            :key="row.ctoonId"
                            class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"
                          >
                            <div class="h-10 w-10 rounded-md border border-slate-200 bg-slate-50 p-1">
                              <img
                                v-if="row.ctoon?.assetPath"
                                :src="row.ctoon.assetPath"
                                :alt="row.ctoon?.name || 'cToon'"
                                class="h-full w-full object-contain"
                              />
                            </div>
                            <div class="flex-1">
                              <p class="text-sm font-semibold text-slate-800">{{ row.ctoon?.name || row.ctoonId }}</p>
                              <p v-if="row.ctoon?.rarity" class="text-xs text-slate-500">{{ row.ctoon.rarity }}</p>
                            </div>
                            <div class="text-xs font-semibold text-slate-600">x{{ row.count || 1 }}</div>
                          </div>
                        </div>
                      </div>
                      <div v-if="entry.conditionUserPointsEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">User Points Required</p>
                        <p class="text-slate-600">{{ formatNumber(entry.conditionUserPointsMin) }}+ points</p>
                      </div>
                      <div v-if="entry.conditionUserTotalCountEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">Total cToon Count Required</p>
                        <p class="text-slate-600">{{ formatNumber(entry.conditionUserTotalCountMin) }}+ total cToons</p>
                      </div>
                      <div v-if="entry.conditionUserUniqueCountEnabled" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p class="font-semibold text-slate-800">Unique cToon Count Required</p>
                        <p class="text-slate-600">{{ formatNumber(entry.conditionUserUniqueCountMin) }}+ unique cToons</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Nav from '@/components/Nav.vue'

definePageMeta({
  title: (route) => {
    const raw = route.params.id
    const id = typeof raw === 'string' ? raw : (Array.isArray(raw) ? raw[0] : '')
    return id ? `cZone Search ${id}` : 'cZone Search'
  },
  middleware: 'auth',
  layout: 'default'
})

const route = useRoute()
const rawId = route.params.id
const searchId = typeof rawId === 'string' ? rawId : (Array.isArray(rawId) ? rawId[0] : '')

const { data, pending, error } = await useFetch(
  searchId ? `/api/czone/searches/${searchId}` : null,
  { key: `czone-search-${searchId}`, credentials: 'include' }
)

const search = computed(() => data.value || null)
const searchName = computed(() => (search.value?.name || '').trim() || 'cZone Search')
const prizeCount = computed(() => Number(search.value?.prizePool?.length || 0))

const formatNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString() : value || '0'
}

const formatDateTime = (value) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

const formatDateRange = (start, end) => {
  if (!start || !end) return 'dates unavailable'
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'dates unavailable'
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt.format(startDate)} - ${fmt.format(endDate)}`
}

const formatPercent = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${num.toFixed(num % 1 === 0 ? 0 : 2)}%`
}

const resetLabel = (searchValue) => {
  if (!searchValue) return 'Reset information unavailable'
  if (searchValue.resetType === 'DAILY_AT_RESET') {
    const limit = Number(searchValue.dailyCollectLimit || 0)
    return limit > 0
      ? `Daily reset at 8pm CT (limit ${limit})`
      : 'Daily reset at 8pm CT'
  }
  const hours = Number(searchValue.cooldownHours || 0)
  return hours > 0 ? `Cooldown ${hours} hours` : 'No cooldown'
}

const collectionLabel = (value) => {
  if (value === 'ONCE') return 'Collect Once'
  if (value === 'CUSTOM_PER_CTOON') return 'Custom Per cToon'
  return 'Collect Multiple'
}

const timeOfDayLabel = (value) => {
  if (value === 'MORNING') return 'Morning (6am-11:59am)'
  if (value === 'AFTERNOON') return 'Afternoon (12pm-4:59pm)'
  if (value === 'EVENING') return 'Evening (5pm-9:59pm)'
  if (value === 'NIGHT') return 'Night (10pm-5:59am)'
  return 'Any time'
}

const hasConditions = (entry) => (
  entry?.conditionDateEnabled
  || entry?.conditionTimeEnabled
  || entry?.conditionBackgroundEnabled
  || entry?.conditionCtoonInZoneEnabled
  || entry?.conditionUserOwnsEnabled
  || entry?.conditionUserPointsEnabled
  || entry?.conditionUserTotalCountEnabled
  || entry?.conditionUserUniqueCountEnabled
)

const backgroundSrc = (bg) => {
  if (!bg) return ''
  const path = bg.imagePath || bg.filename || ''
  if (!path) return ''
  if (/^(https?:)?\/\//.test(path) || path.startsWith('/')) return path
  return `/backgrounds/${path}`
}

const backgroundList = (entry) => {
  const details = Array.isArray(entry?.conditionBackgroundDetails) ? entry.conditionBackgroundDetails : []
  if (details.length) return details
  const names = Array.isArray(entry?.conditionBackgrounds) ? entry.conditionBackgrounds : []
  return names.map((filename) => ({ filename, label: filename, imagePath: null }))
}
</script>
