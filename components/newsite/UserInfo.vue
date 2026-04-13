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
      <div class="user-info-details" ref="detailsEl">
        <template v-if="!ready">
          <div class="skel skel-username" />
          <div class="skel skel-stat" />
          <div class="skel skel-stat" />
          <div class="skel skel-stat" />
        </template>
        <template v-else>
          <span class="user-info-username" ref="usernameEl">{{ user.username }}</span>
          <span class="user-info-stat">{{ user.points }} Points</span>
          <span class="user-info-stat">{{ collectionSummary.uniqueCount }} Unique cToons</span>
          <span class="user-info-stat">{{ collectionSummary.totalCount }} Total cToons</span>
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
const collectionSummary = ref({ totalCount: 0, uniqueCount: 0 })
const resetCountdown = ref('--:--:--')
const detailsEl = ref(null)
const usernameEl = ref(null)
const ready = ref(false)
let countdownInterval = null
let resizeObserver = null

function fitUsername() {
  const el = usernameEl.value
  const container = detailsEl.value
  if (!el || !container) return
  const maxWidth = container.offsetWidth
  let size = 20
  el.style.fontSize = size + 'px'
  while (el.scrollWidth > maxWidth && size > 7) {
    size -= 0.5
    el.style.fontSize = size + 'px'
  }
}

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
  await nextTick()
  fitUsername()
  if (detailsEl.value) {
    resizeObserver = new ResizeObserver(() => fitUsername())
    resizeObserver.observe(detailsEl.value)
  }
})

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval)
  if (resizeObserver) resizeObserver.disconnect()
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
  font-size: 20px;
  line-height: 1.2;
  white-space: nowrap;
}

.user-info-stat {
  font-size: 0.65rem;
  color: #cce0ff;
  line-height: 1.2;
}

.user-info-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  width: 100%;
}

.user-info-reset {
  font-size: 0.65rem;
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
