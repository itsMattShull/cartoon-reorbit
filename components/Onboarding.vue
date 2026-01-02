<template>
  <div ref="onboardingRef" class="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
    <transition name="daily-drawer">
      <div
        v-show="isOpen"
        class="w-72 sm:w-80 rounded-2xl border border-[var(--reorbit-border)] bg-white/95 shadow-xl backdrop-blur overflow-hidden"
        style="--panel-max: 300px;"
      >
        <div class="h-1 w-full bg-gradient-to-r from-[var(--reorbit-purple)] via-[var(--reorbit-cyan)] to-[var(--reorbit-lime)]"></div>
        <div class="px-4 py-3 flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-widest text-slate-500">Daily</p>
            <h3 class="text-sm font-semibold text-[var(--reorbit-blue)]">Checklist</h3>
          </div>
          <button
            type="button"
            class="text-xs font-semibold text-[var(--reorbit-blue)]/80 hover:text-[var(--reorbit-purple)]"
            @click="isOpen = false"
          >
            Hide
          </button>
        </div>
        <div class="px-4 pb-4">
          <div v-if="pending || (!data && !error)" class="space-y-3 animate-pulse">
            <div class="h-4 bg-[var(--reorbit-tint)] rounded w-5/6"></div>
            <div class="h-4 bg-[var(--reorbit-tint)] rounded w-4/6"></div>
            <div class="h-4 bg-[var(--reorbit-tint)] rounded w-3/6"></div>
          </div>
          <div v-else-if="error" class="text-sm text-slate-600">
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

const data = ref(null)
const pending = ref(false)
const error = ref(null)

const fetchDaily = async () => {
  pending.value = true
  error.value = null
  try {
    data.value = await $fetch('/api/onboarding/daily', { credentials: 'include' })
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

watch(isOpen, (next) => {
  if (next) fetchDaily()
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
  const cfg = data.value?.config || {}
  const st = data.value?.status || {}

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
      text: `Play Winball or gToons Clash to win up to ${dailyPointLimit} points.`
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
    },
    {
      id: 'scan',
      done: Boolean(st.monsterScanComplete),
      text: `Scan ${pluralize(scanLimit, 'barcode')} and QR codes in Monsters to gain ${scanTotal} points.`
    }
  ]
})

const toggleOpen = () => {
  isOpen.value = !isOpen.value
}

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
