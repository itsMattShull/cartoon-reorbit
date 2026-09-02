<template>
  <div class="economy-ticker">
    <!-- Static chip, not rotated — there's only ever one number. Glyph plus
         colour so direction reads without relying on colour alone. -->
    <div
      v-if="inflation?.available"
      class="ticker-index"
      :class="`ticker-index--${inflation.direction}`"
    >
      <span class="ticker-index-label">Economy Index</span>
      <span class="ticker-index-value">{{ formatPoints(inflation.indexThisWeek) }}</span>
      <span class="ticker-index-change" aria-hidden="true">
        {{ directionArrow }}{{ Math.abs(inflation.pctChange).toFixed(1) }}%
      </span>
      <span class="sr-only">{{ srIndexText }}</span>
    </div>
    <div v-else class="ticker-index ticker-index--unavailable">
      <span class="ticker-index-label">Economy Index</span>
      <span class="ticker-index-value">{{ inflationLoaded ? 'N/A' : '—' }}</span>
    </div>

    <!-- Single-card auto-advance, deliberately not a marquee: cToon names run
         long (e.g. "1 Year Anniversary Miss Sara Bellum"), a marquee never
         idles (battery drain on a page meant to sit open in a background
         tab), a polled refresh would restart an in-progress scroll, and a
         continuously-scrolling list is effectively unreadable to screen
         readers. The whole card is aria-hidden — the sr-only aria-live
         paragraph below is what a screen reader actually announces, once,
         calmly, per entry. -->
    <div
      class="ticker-card"
      aria-hidden="true"
      @click="advanceManually"
      @mouseenter="hovering = true"
      @mouseleave="hovering = false"
      @touchstart.passive="hovering = true"
      @touchend.passive="hovering = false"
    >
      <span class="ticker-card-label">Recent Sales</span>
      <Transition name="ticker-fade" mode="out-in">
        <div v-if="currentEntry" :key="currentKey" class="ticker-entry">
          <img
            v-if="currentEntry.assetPath"
            :src="currentEntry.assetPath"
            class="ticker-thumb"
            alt=""
          />
          <div class="ticker-entry-text">
            <span class="ticker-entry-name">{{ currentEntry.ctoonName }}</span>
            <span class="ticker-entry-meta">
              <span
                class="ticker-entry-source"
                :class="`ticker-entry-source--${currentEntry.source.toLowerCase()}`"
              >{{ sourceLabel(currentEntry.source) }}</span>
              <span class="ticker-entry-price">{{ formatPoints(currentEntry.price) }} pts</span>
            </span>
          </div>
        </div>
        <div v-else key="empty" class="ticker-entry ticker-entry--empty">
          <span>{{ entriesLoaded ? 'No recent sales to show yet.' : 'Loading recent sales…' }}</span>
        </div>
      </Transition>
    </div>

    <!-- The one thing assistive tech actually hears: a calm, single
         announcement of whatever's currently showing, updated in place
         rather than read as a scrolling list. -->
    <p class="sr-only" aria-live="polite">{{ srLiveText }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const TICKER_LIMIT = 15
// Client-side polling only — see the feature's design notes: auction closes
// happen in server/socket-server.js (a separate long-running process) while
// trade acceptance happens in the main Nitro process, and there's no
// cross-process pub/sub bridge between them. Building one just for this
// ticker isn't worth it for something that doesn't need sub-second latency,
// so this polls instead of listening for a push.
const TICKER_POLL_MS = 25000
const INFLATION_POLL_MS = 30000
// Offsets the two polls so they don't both hit the server on every tick.
const INFLATION_POLL_STAGGER_MS = 8000
const ADVANCE_MS = 5000

const entries = ref([])
const entriesLoaded = ref(false)
const currentIndex = ref(0)
const inflation = ref(null)
const inflationLoaded = ref(false)
const hovering = ref(false)
const pageHidden = ref(false)
const reducedMotion = ref(false)

const currentEntry = computed(() => entries.value[currentIndex.value] || null)

// Identifies an entry across polls (there's no id in the payload — it's
// deliberately just name/price/source/time) so a refreshed list can keep
// showing "the same" entry at its new index instead of snapping back to 0
// and restarting the crossfade mid-read.
function entryKey(e) {
  return `${e.source}|${e.occurredAt}|${e.ctoonName}|${e.price}`
}
const currentKey = computed(() => (currentEntry.value ? entryKey(currentEntry.value) : 'empty'))

function sourceLabel(source) {
  return source === 'TRADE' ? 'Trade' : 'Auction'
}

function formatPoints(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

const directionArrow = computed(() => {
  const d = inflation.value?.direction
  if (d === 'up') return '▲'
  if (d === 'down') return '▼'
  return '–'
})

const srIndexText = computed(() => {
  const inf = inflation.value
  if (!inf?.available) return 'Economy index not available.'
  const dirWord = inf.direction === 'up' ? 'up' : inf.direction === 'down' ? 'down' : 'flat'
  return `Economy index ${formatPoints(inf.indexThisWeek)}, ${dirWord} ${Math.abs(inf.pctChange).toFixed(1)} percent versus last week.`
})

const srLiveText = computed(() => {
  const e = currentEntry.value
  if (!e) return entriesLoaded.value ? 'No recent economy activity to show.' : 'Loading recent economy activity.'
  return `Recent ${sourceLabel(e.source).toLowerCase()} sale: ${e.ctoonName}, ${formatPoints(e.price)} points.`
})

async function fetchTicker() {
  try {
    const res = await $fetch('/api/economy/ticker', { query: { limit: TICKER_LIMIT } })
    const list = Array.isArray(res) ? res : []
    const prevKey = currentEntry.value ? entryKey(currentEntry.value) : null
    entries.value = list
    const matchIdx = prevKey ? list.findIndex(e => entryKey(e) === prevKey) : -1
    currentIndex.value = matchIdx >= 0 ? matchIdx : 0
  } catch {
    // A failed poll shouldn't blank an otherwise-fine ticker — keep showing
    // whatever was last loaded and just try again next cycle.
  } finally {
    entriesLoaded.value = true
  }
}

async function fetchInflation() {
  try {
    inflation.value = await $fetch('/api/economy/inflation')
  } catch {
    // Same as above — leave the last good value on screen.
  } finally {
    inflationLoaded.value = true
  }
}

function advance() {
  if (entries.value.length <= 1) return
  currentIndex.value = (currentIndex.value + 1) % entries.value.length
}

function advanceManually() {
  advance()
}

let tickerHandle = null
let inflationHandle = null
let inflationStaggerHandle = null
let advanceHandle = null
let reducedMotionQuery = null

function stopAdvanceTimer() {
  if (advanceHandle) {
    clearInterval(advanceHandle)
    advanceHandle = null
  }
}

function startAdvanceTimer() {
  stopAdvanceTimer()
  if (reducedMotion.value) return // static/manually-advanced only, per prefers-reduced-motion
  advanceHandle = setInterval(() => {
    if (pageHidden.value || hovering.value) return
    advance()
  }, ADVANCE_MS)
}

function onReducedMotionChange(e) {
  reducedMotion.value = e.matches
  startAdvanceTimer()
}

function onVisibilityChange() {
  pageHidden.value = document.hidden
  // Catch back up immediately on return rather than waiting out whatever was
  // left of the previous cycle.
  if (!pageHidden.value) {
    fetchTicker()
    fetchInflation()
  }
}

onMounted(() => {
  if (window.matchMedia) {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = reducedMotionQuery.matches
    reducedMotionQuery.addEventListener?.('change', onReducedMotionChange)
  }

  pageHidden.value = document.hidden
  document.addEventListener('visibilitychange', onVisibilityChange)

  fetchTicker()
  fetchInflation()

  tickerHandle = setInterval(() => {
    if (pageHidden.value) return
    fetchTicker()
  }, TICKER_POLL_MS)

  inflationStaggerHandle = setTimeout(() => {
    inflationHandle = setInterval(() => {
      if (pageHidden.value) return
      fetchInflation()
    }, INFLATION_POLL_MS)
  }, INFLATION_POLL_STAGGER_MS)

  startAdvanceTimer()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange)
  if (tickerHandle) clearInterval(tickerHandle)
  if (inflationHandle) clearInterval(inflationHandle)
  if (inflationStaggerHandle) clearTimeout(inflationStaggerHandle)
  stopAdvanceTimer()
})
</script>

<style scoped>
/* Single flex/block root so this drops in cleanly whether the caller shows it
   inline above the stat tiles or inside a collapsible container. */
.economy-ticker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.ticker-index {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-variant-numeric: tabular-nums;
}

.ticker-index-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.ticker-index-value {
  font-size: 1.05rem;
  font-weight: 800;
}

.ticker-index-change {
  font-size: 0.85rem;
  font-weight: 700;
}

/* Colour plus the ▲/▼/– glyph already in the markup, never colour alone. */
.ticker-index--up .ticker-index-change {
  color: #8CE046;
}

.ticker-index--down .ticker-index-change {
  color: #FF8A7A;
}

.ticker-index--flat .ticker-index-change,
.ticker-index--unavailable .ticker-index-value {
  color: rgba(255, 255, 255, 0.75);
}

.ticker-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-sizing: border-box;
  cursor: pointer;
  /* Comfortably over the 44px tap-target minimum, and a fixed height budget
     so a crossfade between a two-line and one-line entry doesn't visibly
     resize the card underneath the animation. */
  min-height: 76px;
  justify-content: center;
}

.ticker-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.ticker-card-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
}

.ticker-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
}

.ticker-entry--empty {
  opacity: 0.7;
  font-size: 0.85rem;
}

.ticker-thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.ticker-entry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* Wraps instead of ellipsizing — this page already treats single-line
   truncation of real cToon names ("1 Year Anniversary Miss Sara Bellum") as a
   real display-width problem, and here there's a whole card to spend on it
   rather than one row among many. */
.ticker-entry-name {
  font-weight: 700;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.ticker-entry-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  opacity: 0.85;
}

.ticker-entry-source {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 700;
}

.ticker-entry-source--auction {
  background: rgba(51, 153, 204, 0.35);
  border: 1px solid var(--OrbitLightBlue, #3399CC);
}

.ticker-entry-source--trade {
  background: rgba(140, 224, 70, 0.2);
  border: 1px solid #8CE046;
}

.ticker-entry-price {
  font-weight: 600;
}

.ticker-fade-enter-active,
.ticker-fade-leave-active {
  transition: opacity 0.25s ease;
}

.ticker-fade-enter-from,
.ticker-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ticker-fade-enter-active,
  .ticker-fade-leave-active {
    transition: none;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .ticker-index {
    font-size: 0.9em;
  }
}
</style>
