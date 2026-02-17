<template>
  <div ref="onboardingRef" class="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
    <transition name="daily-drawer">
      <div
        v-show="isOpen"
        class="w-72 sm:w-80 rounded-2xl border border-[var(--reorbit-border)] bg-white/95 shadow-xl backdrop-blur overflow-hidden"
        style="--panel-max: 300px;"
      >
        <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>
        <div class="px-4 py-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-[11px] uppercase tracking-widest text-slate-500">Onboarding</p>
              <h3 class="text-sm font-semibold text-[var(--reorbit-blue)]">
                {{ activeTab === 'daily' ? 'Daily Checklist' : 'Events' }}
              </h3>
            </div>
            <button
              type="button"
              class="text-xs font-semibold text-[var(--reorbit-blue)]/80 hover:text-[var(--reorbit-purple)]"
              @click="isOpen = false"
            >
              Hide
            </button>
          </div>
          <div class="mt-3 flex rounded-full bg-[var(--reorbit-tint)] p-1 text-xs font-semibold">
            <button
              type="button"
              :class="tabButtonClass('daily')"
              @click="activeTab = 'daily'"
            >
              Daily
            </button>
            <button
              type="button"
              :class="tabButtonClass('events')"
              @click="activeTab = 'events'"
            >
              Events
            </button>
          </div>
        </div>
        <div class="px-4 pb-4">
          <div v-if="activeTab === 'daily'">
            <div v-if="dailyPending || (!dailyData && !dailyError)" class="space-y-3 animate-pulse">
              <div class="h-4 bg-[var(--reorbit-tint)] rounded w-5/6"></div>
              <div class="h-4 bg-[var(--reorbit-tint)] rounded w-4/6"></div>
              <div class="h-4 bg-[var(--reorbit-tint)] rounded w-3/6"></div>
            </div>
            <div v-else-if="dailyError" class="text-sm text-slate-600">
              Sign in to view your daily activities.
            </div>
            <ul v-else class="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              <li v-for="item in items" :key="item.id" class="flex items-start gap-3">
                <span
                  :class="[
                    'mt-0.5 flex h-6 w-6 flex-none shrink-0 items-center justify-center rounded-full border',
                    item.done
                      ? 'border-transparent bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] shadow'
                      : 'border-slate-300 bg-white'
                  ]"
                >
                  <svg
                    v-if="item.done"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    class="h-4 w-4 text-[var(--reorbit-deep)]"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                  <svg
                    v-else
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    class="h-4 w-4 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="7" />
                  </svg>
                </span>
                <p class="text-sm text-slate-700">{{ item.text }}</p>
              </li>
            </ul>
          </div>
          <div v-else>
            <div v-if="eventsPending || (!eventsData && !eventsError)" class="space-y-3 animate-pulse">
              <div class="h-4 bg-[var(--reorbit-tint)] rounded w-5/6"></div>
              <div class="h-4 bg-[var(--reorbit-tint)] rounded w-4/6"></div>
              <div class="h-4 bg-[var(--reorbit-tint)] rounded w-3/6"></div>
            </div>
            <div v-else-if="eventsError" class="text-sm text-slate-600">
              Sign in to view active events.
            </div>
            <div v-else class="space-y-4 max-h-[220px] overflow-y-auto pr-1">
              <div>
                <p class="text-[11px] uppercase tracking-widest text-slate-500">Holiday Events</p>
                <div class="mt-1 text-[11px] text-slate-400 leading-snug">Check the cMart Holiday tab to purchase Holiday cToons.</div>
                <div v-if="holidayEvents.length" class="mt-2 space-y-2">
                  <div
                    v-for="event in holidayEvents"
                    :key="`holiday-${event.id}`"
                    class="rounded-lg border border-[var(--reorbit-border)] bg-white/80 px-3 py-2"
                  >
                    <p class="text-sm font-semibold text-slate-700">
                      {{ displayName(event.name, 'Holiday Event') }}
                    </p>
                    <p class="text-xs text-slate-500">
                      Active {{ formatDateRange(event.startsAt, event.endsAt) }}
                    </p>
                  </div>
                </div>
                <p v-else class="mt-2 text-xs text-slate-500">No holiday events are active right now.</p>
              </div>
              <div>
                <p class="text-[11px] uppercase tracking-widest text-slate-500">cZone Searches</p>
                <div class="mt-1 text-[11px] text-slate-400 leading-snug">Look on other user's cZones to capture "shiny" cToons.</div>
                <div v-if="czoneSearches.length" class="mt-2 space-y-2">
                  <div
                    v-for="search in czoneSearches"
                    :key="`czone-${search.id}`"
                    class="rounded-lg border border-[var(--reorbit-border)] bg-white/80 px-3 py-2 text-sm font-semibold"
                  >
                    <NuxtLink
                      v-if="search.linkInOnboarding"
                      :to="`/czonesearch/${search.id}`"
                      class="text-sm font-semibold text-[var(--reorbit-blue)] hover:text-[var(--reorbit-purple)]"
                    >
                      {{ displayName(search.name, 'cZone Search') }}
                    </NuxtLink>
                    <span v-else class="text-sm font-semibold text-slate-700">
                      {{ displayName(search.name, 'cZone Search') }}
                    </span>
                    <p class="text-xs text-slate-500">
                      Active {{ formatDateRange(search.startAt, search.endAt) }}
                    </p>
                  </div>
                </div>
                <p v-else class="mt-2 text-xs text-slate-500">No cZone searches are active right now.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <button
      type="button"
      class="group inline-flex items-center gap-2 rounded-full border border-[var(--reorbit-border)] bg-white/95 px-4 py-2 text-sm font-semibold text-[var(--reorbit-blue)] shadow-lg backdrop-blur transition hover:shadow-xl"
      @click="toggleOpen"
    >
      <span class="h-2 w-2 rounded-full bg-[var(--reorbit-lime)] shadow-[0_0_12px_var(--reorbit-lime)]"></span>
      Daily
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        class="h-4 w-4 transition-transform"
        :class="isOpen ? 'rotate-180' : ''"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const isOpen = ref(false)
const onboardingRef = ref(null)

const activeTab = ref('daily')
const dailyData = ref(null)
const dailyPending = ref(false)
const dailyError = ref(null)
const eventsData = ref(null)
const eventsPending = ref(false)
const eventsError = ref(null)

const fetchDaily = async () => {
  dailyPending.value = true
  dailyError.value = null
  try {
    dailyData.value = await $fetch('/api/onboarding/daily', { credentials: 'include' })
  } catch (err) {
    dailyError.value = err
  } finally {
    dailyPending.value = false
  }
}

const fetchEvents = async () => {
  eventsPending.value = true
  eventsError.value = null
  try {
    eventsData.value = await $fetch('/api/onboarding/events', { credentials: 'include' })
  } catch (err) {
    eventsError.value = err
  } finally {
    eventsPending.value = false
  }
}

watch([isOpen, activeTab], ([nextOpen, nextTab]) => {
  if (!nextOpen) return
  if (nextTab === 'daily') {
    fetchDaily()
    return
  }
  fetchEvents()
})

const formatNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString() : '0'
}

const pluralize = (count, singular, plural) => {
  const num = Number(count)
  if (!Number.isFinite(num)) {
    return `${formatNumber(count)} ${plural || `${singular}s`}`
  }
  return `${formatNumber(num)} ${num === 1 ? singular : (plural || `${singular}s`)}`
}

const items = computed(() => {
  const cfg = dailyData.value?.config || {}
  const st = dailyData.value?.status || {}

  const loginPoints = formatNumber(cfg.dailyLoginPoints)
  const czoneVisits = Number(cfg.czoneVisitMaxPerDay ?? 0)
  const czonePoints = Number(cfg.czoneVisitPoints ?? 0)
  const czoneTotal = formatNumber(czoneVisits * czonePoints)
  const dailyPointLimit = formatNumber(cfg.dailyPointLimit)
  const winwheelMax = Number(cfg.winwheelMaxDailySpins ?? 0)
  const lottoCountRaw = Number(cfg.lottoCountPerDay ?? 0)
  const scanLimit = Number(cfg.monsterDailyScanLimit ?? 0)
  const scanPoints = Number(cfg.scanPoints ?? 0)
  const scanTotal = formatNumber(scanLimit * scanPoints)

  const lottoText = lottoCountRaw === -1
    ? 'Try the lotto for points and exclusive cToons.'
    : `Try the lotto ${pluralize(lottoCountRaw, 'time')} for points and exclusive cToons.`

  return [
    {
      id: 'login',
      done: Boolean(st.dailyLoginComplete),
      text: `Daily log in bonus of ${loginPoints} points.`
    },
    {
      id: 'czone',
      done: Boolean(st.czoneVisitComplete),
      text: `Visit ${pluralize(czoneVisits, 'cZone')} to gain ${czoneTotal} points.`
    },
    {
      id: 'games',
      done: Boolean(st.gamePointsComplete),
      text: `Play Winball, gToons Clash, or scan for Monsters to win up to ${dailyPointLimit} points.`
    },
    {
      id: 'winwheel',
      done: Boolean(st.winwheelComplete),
      text: `Spin Win Wheel ${pluralize(winwheelMax, 'time')} to win points or exclusive cToons.`
    },
    {
      id: 'lotto',
      done: Boolean(st.lottoComplete),
      text: lottoText
    }
  ]
})

const toggleOpen = () => {
  isOpen.value = !isOpen.value
}

const tabButtonClass = (tab) => ([
  'flex-1 rounded-full px-3 py-1.5 transition',
  activeTab.value === tab
    ? 'bg-white text-[var(--reorbit-blue)] shadow-sm'
    : 'text-slate-500 hover:text-[var(--reorbit-blue)]'
])

const displayName = (value, fallback) => {
  const trimmed = String(value || '').trim()
  return trimmed || fallback
}

const formatDateRange = (start, end) => {
  const startDate = start ? new Date(start) : null
  const endDate = end ? new Date(end) : null
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'dates unavailable'
  }
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt.format(startDate)} - ${fmt.format(endDate)}`
}

const holidayEvents = computed(() => (eventsData.value?.holidayEvents || []))
const czoneSearches = computed(() => (eventsData.value?.czoneSearches || []))

const handleOutsideClick = (event) => {
  if (!isOpen.value) return
  const root = onboardingRef.value
  if (!root) return
  if (event.target && !root.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<style scoped>
.daily-drawer-enter-active,
.daily-drawer-leave-active {
  transition: max-height 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
}

.daily-drawer-enter-from,
.daily-drawer-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(10px);
}

.daily-drawer-enter-to,
.daily-drawer-leave-from {
  max-height: var(--panel-max, 300px);
  opacity: 1;
  transform: translateY(0);
}
</style>
