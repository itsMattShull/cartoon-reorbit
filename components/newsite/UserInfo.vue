<template>
  <div class="user-info" v-if="user">
    <div class="user-info-top">
      <div v-if="!ready" class="skel skel-avatar" />
      <img
        v-else
        :src="`/avatars/${user.avatar || 'default.png'}`"
        alt="User Avatar"
        class="user-info-avatar"
      />
      <div class="user-info-details">
        <template v-if="!ready">
          <div class="skel skel-username" />
          <div class="skel skel-stat" />
          <div class="skel skel-stat" />
          <div class="skel skel-stat" />
        </template>
        <template v-else>
          <NuxtLink :to="`/newsite/czone/${user.username}`" class="user-info-username" ref="usernameEl">{{ user.username }}</NuxtLink>
          <!-- Locked rides the existing points line rather than getting a line of
               its own. This box is a fixed 85px with overflow:hidden, and its
               current five rows already measure ~90px — the daily-reset row is
               being shaved today. A sixth row would clip the divider and the
               countdown outright, and growing --sidebar-top-height means
               shrinking --sidebar-middle-height in :root plus the five pages
               that override it, or WinballPromo gets clipped instead. -->
          <span class="user-info-stat" :title="lockedTitle">
            {{ (user.points ?? 0).toLocaleString() }} Points<span
              v-if="lockedPoints > 0"
              class="user-info-locked"
            > · {{ lockedPoints.toLocaleString() }} locked</span>
          </span>
          <span class="user-info-stat">{{ (collectionSummary.uniqueCount ?? 0).toLocaleString() }} Unique cToons</span>
          <span class="user-info-stat">{{ (collectionSummary.totalCount ?? 0).toLocaleString() }} Total cToons</span>
        </template>
      </div>
    </div>
    <div class="user-info-divider" />
    <div class="user-info-reset">
      <template v-if="!ready">
        <div class="skel skel-reset" />
      </template>
      <template v-else>
        Daily Points Reset: <span class="user-info-countdown">{{ resetCountdown }}</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { DateTime } from 'luxon'

const { user, fetchSelf } = useAuth()

// Points committed to live auction bids and pending trade offers. Comes back on
// the /api/auth/me payload that fetchSelf() below already loads, so this costs
// no extra request.
const lockedPoints = computed(() => Number(user.value?.lockedPoints ?? 0))
const lockedTitle = computed(() => {
  if (lockedPoints.value <= 0) return ''
  const available = Number(user.value?.availablePoints ?? 0)
  return `${lockedPoints.value.toLocaleString()} points are locked in auction bids and pending trade offers. `
    + `You can spend ${available.toLocaleString()}.`
})

const collectionSummary = ref({ totalCount: 0, uniqueCount: 0 })
const resetCountdown = ref('--:--:--')
const ready = ref(false)
let countdownInterval = null

async function fetchCollectionSummary() {
  try {
    collectionSummary.value = await $fetch('/api/collection/self/summary', { credentials: 'include' })
  } catch {
    collectionSummary.value = { totalCount: 0, uniqueCount: 0 }
  }
}

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

onMounted(async () => {
  await fetchSelf({ force: true })
  updateCountdown()
  countdownInterval = setInterval(updateCountdown, 1000)
  await fetchCollectionSummary()
  ready.value = true
})

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval)
})
</script>

<style scoped>
.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  padding: 4px 6px;
  box-sizing: border-box;
  gap: 2px;
}

.user-info-top {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

.user-info-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.user-info-details {
  display: flex;
  flex-direction: column;
  gap: 0px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.user-info-username {
  font-weight: bold;
  color: white;
  font-size: 1.15rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: none;
}

.user-info-username:hover {
  text-decoration: underline;
}

.user-info-stat {
  font-size: 0.72rem;
  color: #cce0ff;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Brighter than the stat text it sits in, so the locked figure reads as a
   distinct number rather than as part of the points total. .user-info-stat
   already clips with an ellipsis, so on a narrow sidebar this degrades to
   "12,340 Points · 2,5…" rather than breaking the fixed-height box. */
.user-info-locked {
  color: #ffd166;
  font-weight: bold;
}

.user-info-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  width: 100%;
}

.user-info-reset {
  font-size: 0.72rem;
  color: #cce0ff;
  line-height: 1.2;
  width: 100%;
  text-align: center;
}

.user-info-countdown {
  font-weight: bold;
  color: white;
}

/* ── Skeleton loaders ── */
@keyframes skel-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}

.skel {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.08) 25%,
    rgba(255,255,255,0.18) 50%,
    rgba(255,255,255,0.08) 75%
  );
  background-size: 200% 100%;
  animation: skel-shimmer 1.4s ease-in-out infinite;
}

.skel-avatar  { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; }
.skel-username { height: 14px; width: 70%; margin-bottom: 2px; }
.skel-stat    { height: 10px; width: 90%; margin-top: 2px; }
.skel-reset   { height: 10px; width: 60%; margin: 0 auto; }
</style>
