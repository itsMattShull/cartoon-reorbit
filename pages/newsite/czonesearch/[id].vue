<template>
  <div class="czs-wrap">
        <div v-if="pending" class="czs-card">
          <div class="h-6 w-48 rounded bg-white/10 animate-pulse"></div>
          <div class="mt-4 h-4 w-72 rounded bg-white/10 animate-pulse"></div>
        </div>

        <div v-else-if="error" class="czs-card">
          <p class="text-sm text-white/60">{{ error.message || 'Unable to load cZone search.' }}</p>
        </div>

        <div v-else class="czs-inner">
          <section class="czs-card">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs uppercase tracking-widest text-white/40">cZone Search</p>
                <h1 class="text-2xl font-semibold text-white">{{ searchName }}</h1>
                <p class="text-sm text-white/50">Active {{ formatDateRange(search?.startAt, search?.endAt) }}</p>
              </div>
              <div class="czs-badge">
                {{ collectionLabel(search?.collectionType) }}
              </div>
            </div>

            <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="czs-info-box">
                <p class="text-xs uppercase tracking-widest text-white/40">Schedule</p>
                <p class="mt-1 text-sm text-white/80">Start: {{ formatDateTime(search?.startAt) }}</p>
                <p class="text-sm text-white/80">End: {{ formatDateTime(search?.endAt) }}</p>
                <p class="text-xs text-white/40">Your timezone: {{ userTimeZone }}</p>
              </div>
              <div class="czs-info-box">
                <p class="text-xs uppercase tracking-widest text-white/40">Appearance</p>
                <p class="mt-1 text-sm text-white/80">
                  {{ formatPercent(search?.appearanceRatePercent) }} chance to appear
                </p>
                <p class="text-sm text-white/80">{{ resetLabel(search) }}</p>
              </div>
              <div class="czs-info-box">
                <p class="text-xs uppercase tracking-widest text-white/40">Collection</p>
                <p class="mt-1 text-sm text-white/80">{{ collectionLabel(search?.collectionType) }}</p>
                <p v-if="search?.collectionType === 'CUSTOM_PER_CTOON'" class="text-sm text-white/50">
                  Max captures can vary per prize pool cToon.
                </p>
              </div>
              <div class="czs-info-box">
                <p class="text-xs uppercase tracking-widest text-white/40">Prize Pool</p>
                <p class="mt-1 text-sm text-white/80">{{ prizeCount }} cToon{{ prizeCount === 1 ? '' : 's' }}</p>
              </div>
            </div>
          </section>

          <section class="czs-prize-section">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-white">Prize Pool</h2>
              <div class="flex items-center gap-2">
                <span class="text-xs text-white/50 select-none">Only Show Available cToons</span>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="showOnlyAvailable"
                  @click="showOnlyAvailable = !showOnlyAvailable"
                  :class="showOnlyAvailable ? 'bg-[var(--OrbitLightBlue)]' : 'bg-white/20'"
                  class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors"
                >
                  <span
                    :class="showOnlyAvailable ? 'translate-x-4' : 'translate-x-0.5'"
                    class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  />
                </button>
              </div>
            </div>

            <div v-if="!filteredPrizePool.length" class="czs-card mt-4">
              <p class="text-sm text-white/60">
                {{ showOnlyAvailable ? 'No available cToons match your current conditions.' : 'No prize pool entries found.' }}
              </p>
            </div>

            <div v-else class="mt-4 space-y-4">
              <div
                v-for="entry in filteredPrizePool"
                :key="entry.id"
                class="czs-card"
              >
                <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div class="czs-ctoon-thumb">
                    <img
                      v-if="entry.ctoon?.assetPath"
                      :src="entry.ctoon.assetPath"
                      :alt="entry.ctoon?.name || 'cToon'"
                      class="h-full w-full object-contain"
                    />
                  </div>
                  <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-lg font-semibold text-white">
                        {{ entry.ctoon?.name || 'Unknown cToon' }}
                      </h3>
                      <span v-if="entry.ctoon?.rarity" class="czs-tag">
                        {{ entry.ctoon.rarity }}
                      </span>
                      <span class="czs-tag czs-tag-blue">
                        {{ formatPercent(entry.chancePercent) }} chance
                      </span>
                      <span v-if="entry.maxCaptures" class="czs-tag czs-tag-amber">
                        Max {{ entry.maxCaptures }}
                      </span>
                    </div>

                    <div class="mt-3 flex gap-4 text-sm text-white/60">
                      <span>You own: <span class="font-semibold text-white/90">{{ entry.userOwnedCount }}</span></span>
                      <span>Captured: <span class="font-semibold text-white/90">{{ entry.userCaptureCount }}</span></span>
                    </div>

                    <div class="mt-4 space-y-3">
                      <p class="text-xs uppercase tracking-widest text-white/40">Conditions</p>
                      <div v-if="!hasConditions(entry)" class="text-sm text-white/50">
                        No extra conditions.
                      </div>
                      <div v-else class="space-y-3 text-sm text-white/80">
                        <div v-if="entry.conditionDateEnabled" class="czs-condition">
                          <p class="font-semibold text-white">Date Window</p>
                          <p class="text-white/60">
                            {{ entry.conditionDateStart || 'Any' }} to {{ entry.conditionDateEnd || 'Any' }}
                          </p>
                        </div>
                        <div v-if="entry.conditionTimeEnabled" class="czs-condition">
                          <p class="font-semibold text-white">Time of Day</p>
                          <p class="text-white/60">{{ timeOfDayLabel(entry.conditionTimeOfDay) }} ({{ userTimeZone }})</p>
                        </div>
                        <div v-if="entry.conditionBackgroundEnabled" class="czs-condition">
                          <p class="font-semibold text-white">Required Backgrounds</p>
                          <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div
                              v-for="bg in backgroundList(entry)"
                              :key="bg.filename || bg.id"
                              class="overflow-hidden rounded-lg border border-white/10 bg-white/5"
                            >
                              <div class="h-20 bg-white/5">
                                <img
                                  v-if="backgroundSrc(bg)"
                                  :src="backgroundSrc(bg)"
                                  :alt="bg.label || bg.filename || 'Background'"
                                  class="h-full w-full object-cover"
                                />
                              </div>
                              <div class="px-2 py-1 text-xs text-white/60">
                                {{ bg.label || bg.filename || 'Background' }}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div v-if="entry.conditionCtoonInZoneEnabled" class="czs-condition">
                          <p class="font-semibold text-white">cToon Must Be In cZone</p>
                          <div class="mt-2 flex items-center gap-3">
                            <div class="h-12 w-12 rounded-lg border border-white/10 bg-white/5 p-1">
                              <img
                                v-if="entry.conditionCtoonInZone?.assetPath"
                                :src="entry.conditionCtoonInZone.assetPath"
                                :alt="entry.conditionCtoonInZone?.name || 'cToon'"
                                class="h-full w-full object-contain"
                              />
                            </div>
                            <div>
                              <p class="text-sm font-semibold text-white">
                                {{ entry.conditionCtoonInZone?.name || entry.conditionCtoonInZoneId || 'Unknown cToon' }}
                              </p>
                              <p v-if="entry.conditionCtoonInZone?.rarity" class="text-xs text-white/50">
                                {{ entry.conditionCtoonInZone.rarity }}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div v-if="entry.conditionUserOwnsEnabled" class="czs-condition">
                          <p class="font-semibold text-white">User Must Own</p>
                          <div class="mt-2 space-y-2">
                            <div
                              v-for="row in entry.conditionUserOwns"
                              :key="row.ctoonId"
                              class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2"
                            >
                              <div class="h-10 w-10 rounded-md border border-white/10 bg-white/5 p-1">
                                <img
                                  v-if="row.ctoon?.assetPath"
                                  :src="row.ctoon.assetPath"
                                  :alt="row.ctoon?.name || 'cToon'"
                                  class="h-full w-full object-contain"
                                />
                              </div>
                              <div class="flex-1">
                                <p class="text-sm font-semibold text-white">{{ row.ctoon?.name || row.ctoonId }}</p>
                                <p v-if="row.ctoon?.rarity" class="text-xs text-white/50">{{ row.ctoon.rarity }}</p>
                              </div>
                              <div class="text-xs font-semibold text-white/60">x{{ row.count || 1 }}</div>
                            </div>
                          </div>
                        </div>
                        <div v-if="entry.conditionUserPointsEnabled" class="czs-condition">
                          <p class="font-semibold text-white">User Points Required</p>
                          <p class="text-white/60">{{ formatNumber(entry.conditionUserPointsMin) }}+ points</p>
                        </div>
                        <div v-if="entry.conditionUserTotalCountEnabled" class="czs-condition">
                          <p class="font-semibold text-white">Total cToon Count Required</p>
                          <p class="text-white/60">{{ formatNumber(entry.conditionUserTotalCountMin) }}+ total cToons</p>
                        </div>
                        <div v-if="entry.conditionUserUniqueCountEnabled" class="czs-condition">
                          <p class="font-semibold text-white">Unique cToon Count Required</p>
                          <p class="text-white/60">{{ formatNumber(entry.conditionUserUniqueCountMin) }}+ unique cToons</p>
                        </div>
                        <div v-if="entry.conditionSetUniqueCountEnabled" class="czs-condition">
                          <p class="font-semibold text-white"># of unique cToons from set</p>
                          <p class="text-white/60">{{ formatNumber(entry.conditionSetUniqueCountMin) }}+ from {{ entry.conditionSetUniqueCountSet }}</p>
                        </div>
                        <div v-if="entry.conditionSetTotalCountEnabled" class="czs-condition">
                          <p class="font-semibold text-white"># of total cToons from set</p>
                          <p class="text-white/60">{{ formatNumber(entry.conditionSetTotalCountMin) }}+ from {{ entry.conditionSetTotalCountSet }}</p>
                        </div>
                        <div v-if="entry.conditionOwnsLessThanEnabled" class="czs-condition">
                          <p class="font-semibold text-white">User Owns This cToon Less Than</p>
                          <p class="text-white/60">Must own fewer than {{ formatNumber(entry.conditionOwnsLessThanCount) }} of this cToon</p>
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
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: 'newsite', showAdbar: true, showNav: true })

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

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
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time'

const showOnlyAvailable = ref(false)

function getCurrentTimeOfDay() {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'MORNING'
  if (hour >= 12 && hour < 17) return 'AFTERNOON'
  if (hour >= 17 && hour < 22) return 'EVENING'
  return 'NIGHT'
}

function isEntryAvailable(entry) {
  const stats = search.value?.userStats
  if (!stats) return true

  if (entry.conditionDateEnabled) {
    const today = new Date().toISOString().split('T')[0]
    if (entry.conditionDateStart && today < entry.conditionDateStart) return false
    if (entry.conditionDateEnd && today > entry.conditionDateEnd) return false
  }

  if (entry.conditionTimeEnabled && entry.conditionTimeOfDay) {
    if (getCurrentTimeOfDay() !== entry.conditionTimeOfDay) return false
  }

  if (entry.conditionUserOwnsEnabled && Array.isArray(entry.conditionUserOwns)) {
    for (const req of entry.conditionUserOwns) {
      const owned = stats.userOwnsCountMap[req.ctoonId] || 0
      if (owned < (req.count || 1)) return false
    }
  }

  if (entry.conditionUserPointsEnabled && entry.conditionUserPointsMin != null) {
    if (stats.userPoints < entry.conditionUserPointsMin) return false
  }

  if (entry.conditionUserTotalCountEnabled && entry.conditionUserTotalCountMin != null) {
    if (stats.userTotalCount < entry.conditionUserTotalCountMin) return false
  }

  if (entry.conditionUserUniqueCountEnabled && entry.conditionUserUniqueCountMin != null) {
    if (stats.userUniqueCount < entry.conditionUserUniqueCountMin) return false
  }

  if (entry.conditionSetUniqueCountEnabled && entry.conditionSetUniqueCountSet && entry.conditionSetUniqueCountMin != null) {
    const count = stats.userSetUniqueCountMap[entry.conditionSetUniqueCountSet] || 0
    if (count < entry.conditionSetUniqueCountMin) return false
  }

  if (entry.conditionSetTotalCountEnabled && entry.conditionSetTotalCountSet && entry.conditionSetTotalCountMin != null) {
    const count = stats.userSetTotalCountMap[entry.conditionSetTotalCountSet] || 0
    if (count < entry.conditionSetTotalCountMin) return false
  }

  if (entry.conditionOwnsLessThanEnabled && entry.conditionOwnsLessThanCount != null) {
    if (entry.userOwnedCount >= entry.conditionOwnsLessThanCount) return false
  }

  if (search.value?.collectionType === 'ONCE' && entry.userCaptureCount > 0) return false

  if (search.value?.collectionType === 'CUSTOM_PER_CTOON' && entry.maxCaptures != null) {
    if (entry.userCaptureCount >= entry.maxCaptures) return false
  }

  return true
}

const filteredPrizePool = computed(() => {
  const pool = search.value?.prizePool || []
  if (!showOnlyAvailable.value) return pool
  return pool.filter(isEntryAvailable)
})

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
    minute: '2-digit',
    timeZoneName: 'short'
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
  || entry?.conditionSetUniqueCountEnabled
  || entry?.conditionSetTotalCountEnabled
  || entry?.conditionOwnsLessThanEnabled
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

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.czs-wrap {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}

.czs-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.czs-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
}

.czs-badge {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.czs-info-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
}

.czs-prize-section {
  display: flex;
  flex-direction: column;
}

.czs-ctoon-thumb {
  height: 80px;
  width: 80px;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
}

.czs-tag {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.czs-tag-blue {
  background: rgba(51, 153, 204, 0.2);
  color: var(--OrbitLightBlue, #3399cc);
}

.czs-tag-amber {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.czs-condition {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px;
}
</style>
