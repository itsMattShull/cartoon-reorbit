<template>
  <div ref="onboardingRef" class="ob-root fixed right-3 z-50 flex flex-col items-end gap-2">
    <transition name="daily-drawer">
      <div
        v-show="isOpen"
        class="ob-panel w-72 sm:w-80 rounded-2xl border border-white/15 shadow-xl backdrop-blur overflow-hidden flex flex-col"
      >
        <div class="h-1 w-full bg-gradient-to-r from-[var(--OrbitDarkBlue)] via-[var(--OrbitLightBlue)] to-[#66CC00] flex-none"></div>
        <div class="px-4 py-3 flex-none">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-[11px] uppercase tracking-widest text-white/50">Onboarding</p>
              <h3 class="text-sm font-semibold text-white">
                {{ panelHeading }}
              </h3>
            </div>
            <button
              type="button"
              class="ob-hide text-xs font-semibold text-white/60 hover:text-white transition"
              @click="isOpen = false"
            >
              Hide
            </button>
          </div>
          <div class="mt-3 flex rounded-full bg-white/10 p-1 text-xs font-semibold">
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
            <!-- "Alerts", not "Notifications". At 360px the panel is 288px wide,
                 which leaves each of three tabs ~58px of text room at 12px —
                 "Notifications" wraps to two lines, "Alerts" does not. -->
            <button
              type="button"
              :class="tabButtonClass('alerts')"
              @click="activeTab = 'alerts'"
            >
              Alerts
              <span v-if="unreadCount > 0" class="ob-tab-count">{{ badgeLabel }}</span>
            </button>
          </div>
        </div>
        <div class="px-4 pb-4 flex-1 min-h-0 flex flex-col">
          <div v-if="activeTab === 'daily'" class="flex-1 min-h-0 flex flex-col">
            <div v-if="dailyPending || (!dailyData && !dailyError)" class="space-y-3 animate-pulse">
              <div class="h-4 bg-white/10 rounded w-5/6"></div>
              <div class="h-4 bg-white/10 rounded w-4/6"></div>
              <div class="h-4 bg-white/10 rounded w-3/6"></div>
            </div>
            <div v-else-if="dailyError" class="text-sm text-white/55">
              Sign in to view your daily activities.
            </div>
            <ul v-else class="space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
              <li v-for="item in items" :key="item.id" class="flex items-start gap-3">
                <span
                  :class="[
                    'mt-0.5 flex h-6 w-6 flex-none shrink-0 items-center justify-center rounded-full border',
                    item.done
                      ? 'border-transparent bg-gradient-to-br from-[#66CC00] to-[#3399CC] shadow'
                      : 'border-white/25 bg-white/10'
                  ]"
                >
                  <svg
                    v-if="item.done"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    class="h-4 w-4 text-white"
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
                    class="h-4 w-4 text-white/30"
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
                <p class="text-sm text-white/85">{{ item.text }}</p>
              </li>
            </ul>
          </div>
          <div v-else-if="activeTab === 'alerts'" class="flex-1 min-h-0 flex flex-col">
            <div v-if="alertsPending && !alertsLoaded" class="space-y-3 animate-pulse">
              <div class="h-4 bg-white/10 rounded w-5/6"></div>
              <div class="h-4 bg-white/10 rounded w-4/6"></div>
              <div class="h-4 bg-white/10 rounded w-3/6"></div>
            </div>
            <div v-else-if="alertsError" class="text-sm text-white/55">
              Sign in to view your notifications.
            </div>
            <template v-else>
              <button
                v-if="unreadCount > 0"
                type="button"
                class="ob-mark-all mb-2 w-full rounded-lg border border-white/15 bg-white/5 text-[11px] font-semibold text-white/70 hover:text-white hover:bg-white/10 transition"
                @click="markAllRead"
              >
                Mark all read
              </button>
              <p v-if="!notifications.length" class="text-sm text-white/45">
                No notifications yet.
              </p>
              <ul v-else class="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
                <li v-for="n in notifications" :key="n.id">
                  <component
                    :is="notificationRoute(n) ? 'NuxtLink' : 'div'"
                    v-bind="notificationRoute(n) ? { to: notificationRoute(n) } : {}"
                    class="ob-alert block rounded-lg border px-3 py-2 transition"
                    :class="n.readAt ? 'ob-alert-read border-white/10' : 'ob-alert-unread border-white/20'"
                    @click="onNotificationClick(n)"
                  >
                    <div class="flex items-start gap-2">
                      <span v-if="!n.readAt" class="ob-alert-dot mt-1.5 flex-none"></span>
                      <div class="min-w-0 flex-1">
                        <p class="ob-clamp-2 break-words text-sm text-white/90">
                          {{ n.title }}<span v-if="n.count > 1" class="text-white/50"> ×{{ n.count }}</span>
                        </p>
                        <p v-if="n.body" class="ob-clamp-1 break-words text-xs text-white/50">{{ n.body }}</p>
                        <p class="text-[10px] text-white/35">{{ formatRelative(n.createdAt) }}</p>
                      </div>
                    </div>
                  </component>
                </li>
              </ul>
            </template>
          </div>
          <div v-else class="flex-1 min-h-0 flex flex-col">
            <div v-if="eventsPending || (!eventsData && !eventsError)" class="space-y-3 animate-pulse">
              <div class="h-4 bg-white/10 rounded w-5/6"></div>
              <div class="h-4 bg-white/10 rounded w-4/6"></div>
              <div class="h-4 bg-white/10 rounded w-3/6"></div>
            </div>
            <div v-else-if="eventsError" class="text-sm text-white/55">
              Sign in to view active events.
            </div>
            <div v-else class="space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
              <div>
                <p class="text-[11px] uppercase tracking-widest text-white/50">Holiday Events</p>
                <div class="mt-1 text-[11px] text-white/40 leading-snug">Check the cMart Holiday tab to purchase Holiday cToons.</div>
                <div v-if="holidayEvents.length" class="mt-2 space-y-2">
                  <div
                    v-for="event in holidayEvents"
                    :key="`holiday-${event.id}`"
                    class="ob-event-card rounded-lg border border-white/10 px-3 py-2"
                  >
                    <p class="text-sm font-semibold text-white/90">
                      {{ displayName(event.name, 'Holiday Event') }}
                    </p>
                    <p class="text-xs text-white/50">
                      Active {{ formatDateRange(event.startsAt, event.endsAt) }}
                    </p>
                  </div>
                </div>
                <p v-else class="mt-2 text-xs text-white/45">No holiday events are active right now.</p>
              </div>
              <div>
                <p class="text-[11px] uppercase tracking-widest text-white/50">cZone Searches</p>
                <div class="mt-1 text-[11px] text-white/40 leading-snug">Look on other user's cZones to capture "shiny" cToons.</div>
                <div v-if="czoneSearches.length" class="mt-2 space-y-2">
                  <div
                    v-for="search in czoneSearches"
                    :key="`czone-${search.id}`"
                    class="ob-event-card rounded-lg border border-white/10 px-3 py-2"
                  >
                    <NuxtLink
                      v-if="search.linkInOnboarding"
                      :to="czoneSearchPath(search.id)"
                      class="text-sm font-semibold text-[var(--OrbitLightBlue)] hover:text-white transition"
                    >
                      {{ displayName(search.name, 'cZone Search') }}
                    </NuxtLink>
                    <p v-else class="text-sm font-semibold text-white/90">
                      {{ displayName(search.name, 'cZone Search') }}
                    </p>
                    <p class="text-xs text-white/50">
                      Active {{ formatDateRange(search.startAt, search.endAt) }}
                    </p>
                  </div>
                </div>
                <p v-else class="mt-2 text-xs text-white/45">No cZone searches are active right now.</p>
              </div>
              <div>
                <p class="text-[11px] uppercase tracking-widest text-white/50">cZone Contests</p>
                <div class="mt-1 text-[11px] text-white/40 leading-snug">Submit your cZone and vote on others during active contests.</div>
                <div v-if="czoneContests.length" class="mt-2 space-y-2">
                  <div
                    v-for="contest in czoneContests"
                    :key="`contest-${contest.id}`"
                    class="ob-event-card rounded-lg border border-white/10 px-3 py-2"
                  >
                    <NuxtLink
                      :to="czoneContestPath(contest.id)"
                      class="text-sm font-semibold text-[var(--OrbitLightBlue)] hover:text-white transition"
                    >
                      {{ displayName(contest.name, 'cZone Contest') }}
                    </NuxtLink>
                    <p class="text-xs text-white/50">
                      <template v-if="contest.status === 'voting'">
                        Voting open until {{ formatDate(contest.endVotingDate) }}
                      </template>
                      <template v-else-if="contest.status === 'distributed'">
                        Winners distributed {{ formatDate(contest.distributedAt) }}
                      </template>
                      <template v-else-if="contest.status === 'closed'">
                        Closed, awaiting distribution
                      </template>
                      <template v-else>
                        Active {{ formatDateRange(contest.startDate, contest.endDate) }}
                      </template>
                    </p>
                  </div>
                </div>
                <p v-else class="mt-2 text-xs text-white/45">No cZone contests are active right now.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <button
      type="button"
      class="ob-toggle group relative inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:shadow-xl hover:border-white/35"
      :aria-label="unreadCount > 0 ? `Daily — ${unreadCount} unread notifications` : 'Daily'"
      @click="toggleOpen"
    >
      <!-- The status dot turns red when there is something unread. The button
           says "Daily", so a bare badge would read as "you have daily tasks
           left" — which is what the green dot already implies. -->
      <span
        class="h-2 w-2 rounded-full"
        :class="unreadCount > 0
          ? 'bg-[#ef4444] shadow-[0_0_10px_#ef4444]'
          : 'bg-[#66CC00] shadow-[0_0_10px_#66CC00]'"
      ></span>
      <!-- Nothing renders at all when the count is zero. -->
      <span v-if="unreadCount > 0" class="ob-badge">{{ badgeLabel }}</span>
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

const route = useRoute()
const isNewsite = computed(() => route.path.startsWith('/newsite'))

const czoneSearchPath = (id) =>
  isNewsite.value ? `/newsite/czonesearch/${id}` : `/czonesearch/${id}`

const czoneContestPath = (id) =>
  isNewsite.value ? `/newsite/czone-contest/${id}` : `/czone-contest/${id}`

const isOpen = ref(false)
const onboardingRef = ref(null)

const { user } = useAuth()

const activeTab = ref('daily')
const notifications = ref([])
const unreadCount = ref(0)
const alertsPending = ref(false)
const alertsLoaded = ref(false)
const alertsError = ref(null)

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

const fetchAlerts = async () => {
  alertsPending.value = true
  alertsError.value = null
  try {
    const res = await $fetch('/api/notifications', { credentials: 'include' })
    notifications.value = res?.items || []
    unreadCount.value = Number(res?.unreadCount || 0)
    alertsLoaded.value = true
  } catch (err) {
    alertsError.value = err
  } finally {
    alertsPending.value = false
  }
}

// Just the badge number. Separate from fetchAlerts because this is the one that
// runs on a timer: it hits /api/notifications/count, which authenticates off the
// JWT already parsed by middleware and is listed in HOT_PATHS, so a tick is a
// single indexed COUNT rather than the ~20 round trips the usual
// $fetch('/api/auth/me') auth pattern would cost.
const fetchUnreadCount = async () => {
  if (!user.value) return
  try {
    const res = await $fetch('/api/notifications/count', { credentials: 'include' })
    unreadCount.value = Number(res?.unreadCount || 0)
  } catch {
    // Silent: a failed poll must not surface an error on every page.
  }
}

watch([isOpen, activeTab], ([nextOpen, nextTab]) => {
  if (!nextOpen) return
  if (nextTab === 'daily') {
    fetchDaily()
    return
  }
  if (nextTab === 'alerts') {
    // Opening the tab deliberately does NOT mark anything read — a stray tap on
    // a phone would otherwise wipe the only signal that something happened.
    fetchAlerts()
    return
  }
  fetchEvents()
})

const notificationRoute = (n) => {
  // Built here from `type`, never from a stored string. A route persisted in the
  // database by five call sites and rendered into a NuxtLink `:to` would be an
  // open-redirect / `javascript:` sink; there is no such column, by design.
  if (!n) return null
  if (n.type === 'TRADE_OFFER_RECEIVED' || n.type === 'TRADE_OFFER_ACCEPTED') {
    return '/newsite/trade'
  }
  if (!n.contextId) return null
  return `/newsite/AuctionHouse/${encodeURIComponent(n.contextId)}`
}

const markRead = async (ids) => {
  if (!ids.length) return
  try {
    await $fetch('/api/notifications/read', {
      method: 'POST',
      credentials: 'include',
      body: { ids }
    })
  } catch {}
}

const onNotificationClick = async (n) => {
  if (!n || n.readAt) return
  // Optimistic: the drawer closes on navigation, so waiting for the round trip
  // would show a stale unread dot for the frame before it does.
  n.readAt = new Date().toISOString()
  unreadCount.value = Math.max(0, unreadCount.value - 1)
  await markRead([n.id])
}

const markAllRead = async () => {
  const now = new Date().toISOString()
  notifications.value.forEach(n => { if (!n.readAt) n.readAt = now })
  unreadCount.value = 0
  try {
    await $fetch('/api/notifications/read', {
      method: 'POST',
      credentials: 'include',
      body: { all: true }
    })
  } catch {
    // Put the truth back if the server disagreed.
    fetchAlerts()
  }
}

const badgeLabel = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)))

const panelHeading = computed(() => {
  if (activeTab.value === 'daily') return 'Daily Checklist'
  if (activeTab.value === 'alerts') return 'Notifications'
  return 'Events'
})

const formatRelative = (date) => {
  const d = date ? new Date(date) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(d)
}

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
  const tkoDailyPointLimit = formatNumber(cfg.tkoDailyPointLimit)
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
      text: `Play Winball, ReOrbit Match, or scan for Monsters to win up to ${dailyPointLimit} points.`
    },
    {
      id: 'tko',
      done: Boolean(st.tkoPointsComplete),
      text: `Play TKO, gToons Clash or Ed, Edd n Eddy RPS to win up to ${tkoDailyPointLimit} combined points.`
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
  'ob-tab flex-1 rounded-full px-3 py-1.5 transition',
  activeTab.value === tab
    ? 'bg-[var(--OrbitDarkBlue)] text-white shadow-sm'
    : 'text-white/50 hover:text-white'
])

const displayName = (value, fallback) => {
  const trimmed = String(value || '').trim()
  return trimmed || fallback
}

const formatDate = (date) => {
  const d = date ? new Date(date) : null
  if (!d || Number.isNaN(d.getTime())) return 'date unavailable'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
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
const czoneContests = computed(() => (eventsData.value?.czoneContests || []))

const handleOutsideClick = (event) => {
  if (!isOpen.value) return
  const root = onboardingRef.value
  if (!root) return
  if (event.target && !root.contains(event.target)) {
    isOpen.value = false
  }
}

// 120s, and only while the tab is actually being looked at. The badge is not
// time-critical, this runs on every page for every logged-in user, and an
// unguarded interval means abandoned background tabs polling forever.
const POLL_MS = 120_000
let pollTimer = null

const startPolling = () => {
  if (pollTimer || !user.value) return
  // Jitter, so clients that all loaded after the same deploy do not converge
  // into one synchronised burst every two minutes.
  const jitter = 1 + (Math.random() * 0.4 - 0.2)
  pollTimer = setInterval(fetchUnreadCount, Math.round(POLL_MS * jitter))
}

const stopPolling = () => {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

const handleVisibility = () => {
  if (document.visibilityState === 'visible') {
    fetchUnreadCount()
    startPolling()
  } else {
    stopPolling()
  }
}

onMounted(() => {
  // pointerdown, not click: on iOS Safari a `click` on a non-interactive element
  // does not reach `document`, so tap-outside-to-dismiss silently did nothing on
  // iPhone — which matters more now that the panel is a notification surface.
  document.addEventListener('pointerdown', handleOutsideClick)
  document.addEventListener('visibilitychange', handleVisibility)

  // The count arrives free on the /api/auth/me payload the app already loads, so
  // the badge is correct on first paint without waiting for a poll.
  if (user.value) {
    unreadCount.value = Number(user.value.unreadNotifications || 0)
    startPolling()
  }
})

// Logged-out visitors see this component too (it is rendered unconditionally by
// the newsite layout), so polling must start only once there is a session —
// otherwise every public page 401s on a timer forever.
watch(user, (next) => {
  if (next) {
    unreadCount.value = Number(next.unreadNotifications || 0)
    startPolling()
  } else {
    unreadCount.value = 0
    stopPolling()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsideClick)
  document.removeEventListener('visibilitychange', handleVisibility)
  stopPolling()
})
</script>

<style scoped>
.ob-root {
  /* 12px put the toggle under the iPhone home indicator / Safari bottom bar. */
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
}

.ob-panel {
  background: rgba(10, 25, 55, 0.96);
  /* Bounds the panel against the viewport. Without this it grows upward with no
     limit: in landscape (~375px of visual viewport) the header — the only way to
     switch tabs — ran off the top of the screen with no way to scroll to it. The
     inner lists are flex-1/min-h-0, so they absorb whatever is left. */
  max-height: min(70dvh, 420px);
}

.ob-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 9999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.ob-tab-count {
  display: inline-block;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 9999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.ob-alert { text-decoration: none; }
.ob-alert-unread { background: rgba(255, 255, 255, 0.08); }
.ob-alert-read   { background: rgba(255, 255, 255, 0.03); }
.ob-alert:hover  { background: rgba(255, 255, 255, 0.13); }

.ob-alert-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: #ef4444;
}

.ob-mark-all { padding: 6px 8px; }

/* Titles and bodies carry usernames and cToon names, which have no spaces to
   break at. Unclamped, one long title eats the whole scroller on a phone. */
.ob-clamp-2,
.ob-clamp-1 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ob-clamp-2 { -webkit-line-clamp: 2; }
.ob-clamp-1 { -webkit-line-clamp: 1; }

@media (max-width: 768px) {
  /* Real tap targets. These were ~28px (tabs) and a padding-less ~16px text run
     (Hide) — under the 44px iOS / 48dp Android floor, on what is now the primary
     notification surface on mobile. */
  .ob-toggle { min-height: 44px; }
  .ob-hide { min-height: 40px; padding: 0 8px; }
  .ob-mark-all { min-height: 40px; }
  .ob-tab { min-height: 40px; }
}

.ob-toggle {
  background: rgba(10, 25, 55, 0.92);
}

.ob-event-card {
  background: rgba(255, 255, 255, 0.06);
}

/* Animates opacity and transform rather than max-height.
   The old version transitioned max-height to a hardcoded 300px while the panel's
   natural height was already ~344px, so opening snapped the last ~44px in a
   single frame and closing jumped down before collapsing. A third tab and
   multi-line notification titles would only widen that gap — and any fixed
   number here drifts again the next time the contents change. */
.daily-drawer-enter-active,
.daily-drawer-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
  transform-origin: bottom right;
}

.daily-drawer-enter-from,
.daily-drawer-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

.daily-drawer-enter-to,
.daily-drawer-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>
