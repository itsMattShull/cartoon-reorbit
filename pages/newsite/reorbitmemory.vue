<template>
  <div>
    <NuxtLayout name="newsite-template" :show-adbar="true" :show-nav="true">
      <div class="memory-wrapper">
        <!-- Loading state -->
        <div v-if="uiState === 'loading'" class="center-content">
          <div class="spinner" aria-label="Loading game…"></div>
        </div>

        <!-- No plays left -->
        <div v-else-if="uiState === 'noplays'" class="center-content">
          <div class="start-card">
            <h1 class="game-title">ReOrbit Memory</h1>
            <p class="no-plays-text">No plays left today.</p>
            <p class="reset-text">Resets {{ resetLabel }}</p>
          </div>
        </div>

        <!-- Start screen -->
        <div v-else-if="uiState === 'start'" class="center-content">
          <div class="start-card">
            <h1 class="game-title">ReOrbit Memory</h1>
            <p class="start-sub">Flip two cards at a time. Find every matching pair in as few moves as possible!</p>
            <div class="plays-info">
              <span class="plays-badge">{{ playsLeft }} play{{ playsLeft !== 1 ? 's' : '' }} left</span>
              <span class="reset-text">· Resets {{ resetLabel }}</span>
            </div>
            <button class="btn-start" @click="startGame" :disabled="starting">
              {{ starting ? 'Shuffling…' : 'Play' }}
            </button>
          </div>
        </div>

        <!-- Active game -->
        <div v-else-if="uiState === 'playing'" class="game-area" role="main" aria-label="ReOrbit Memory game board">
          <div class="hud" role="status" aria-live="polite" aria-atomic="true">
            <div class="hud-row">
              <div class="hud-item">
                <span class="hud-label">Moves</span>
                <span class="hud-value">{{ moves }}</span>
              </div>
              <div v-if="timeSeconds" class="hud-item" :class="{ 'hud-item--warning': timeLeft <= 10 }">
                <span class="hud-label">Time</span>
                <span class="hud-value">{{ timeLeft }}s</span>
              </div>
              <div class="hud-item">
                <span class="hud-label">Plays Left</span>
                <span class="hud-value">{{ playsLeft }}</span>
              </div>
            </div>
          </div>

          <div
            class="card-grid"
            :style="{ '--cols': cols }"
          >
            <button
              v-for="(card, i) in cards"
              :key="i"
              type="button"
              class="card"
              :class="{ 'card--flipped': card.state !== 'down', 'card--matched': card.state === 'matched' }"
              :disabled="card.state !== 'down' || busy"
              :aria-label="card.state === 'matched' ? 'Matched card' : 'Face-down card'"
              @click="onCardTap(i)"
            >
              <div class="card-inner">
                <div class="card-face card-face--back">
                  <img v-if="cardBackImagePath" :src="cardBackImagePath" alt="" draggable="false" />
                  <div v-else class="card-face--placeholder"></div>
                </div>
                <div class="card-face card-face--front">
                  <img v-if="card.src" :src="card.src" alt="" draggable="false" />
                  <div v-else class="card-face--loading"></div>
                </div>
              </div>
            </button>
          </div>

          <p class="sr-only" aria-live="polite">{{ announce }}</p>
        </div>
      </div>
    </NuxtLayout>

    <!-- Game Over Modal -->
    <Teleport to="body">
      <div v-if="uiState === 'gameover'" class="modal-backdrop" @click.self="uiState = 'start'">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Game Over">
          <button class="modal-close" type="button" @click="goToGamesHome" aria-label="Close and return to Games Home">&times;</button>
          <h2 class="modal-title">{{ finalCompleted ? 'Solved!' : "Time's Up" }}</h2>
          <div class="modal-score-row">
            <span class="modal-score-label">{{ finalCompleted ? 'Your Moves' : 'Board Not Finished' }}</span>
            <span v-if="finalCompleted" class="modal-score-value">{{ finalMoves }}</span>
          </div>
          <template v-if="finalCompleted">
            <div class="modal-divider"></div>
            <div class="modal-leaderboard">
              <div class="modal-lb-row">
                <span class="modal-lb-label">This Week's Best</span>
                <span class="modal-lb-value">{{ weekBest != null ? weekBest : '—' }}</span>
              </div>
              <div class="modal-lb-row">
                <span class="modal-lb-label">Your All-Time Best</span>
                <span class="modal-lb-value">{{ allTimeBest != null ? allTimeBest : '—' }}</span>
              </div>
            </div>
            <div class="modal-points-notice" :class="{ 'modal-points-notice--zero': pointsAwarded === 0 }">
              <template v-if="pointsAwarded > 0">+{{ pointsAwarded }} game points earned!</template>
              <template v-else>No game points earned (daily limit reached)</template>
            </div>
          </template>
          <div class="modal-actions">
            <button v-if="playsLeft > 0" class="btn-start" @click="startGame">
              Play Again ({{ playsLeft }} left)
            </button>
            <button v-else class="btn-secondary" @click="uiState = 'noplays'">
              No Plays Left
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
definePageMeta({ ssr: false })

const uiState    = ref('loading') // loading | start | playing | gameover | noplays
const starting   = ref(false)
const moves      = ref(0)
const timeLeft   = ref(null)
const playsLeft  = ref(0)
const resetLabel = ref('')
const announce   = ref('')
const busy       = ref(false) // true while a flip request is in flight — blocks further taps

const cols = ref(4)
const rows = ref(4)
const timeSeconds = ref(null)
const flipBackDelayMs = ref(800)
const cardBackImagePath = ref(null)

const finalMoves     = ref(0)
const finalCompleted = ref(true)
const weekBest       = ref(null)
const allTimeBest    = ref(null)
const pointsAwarded  = ref(0)

// cards[i] = { state: 'down' | 'up' | 'matched', src: string|null }
const cards = ref([])

let timerStart    = null
let timerId       = null
let ending        = false

function vibrate(pattern) { try { navigator.vibrate?.(pattern) } catch {} }
// Warm the browser cache for every card-front image right after /start, before the player's
// first tap, so flips render instantly instead of popping in over the network.
function preloadImages(paths) {
  for (const src of paths || []) {
    const img = new Image()
    img.src = src
  }
}
function onImgLoad() {} // hook kept for future use; images are small enough not to need a skeleton swap

function goToGamesHome() {
  navigateTo('/newsite/games')
}

function formatReset(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d)
}

async function fetchStatus() {
  try {
    const data = await $fetch('/api/game/reorbitmemory/status', { credentials: 'include' })
    playsLeft.value  = data.playsLeft
    weekBest.value   = data.weekBest
    allTimeBest.value = data.allTimeBest
    cols.value       = data.config.cols
    rows.value       = data.config.rows
    cardBackImagePath.value = data.config.cardBackImagePath
    resetLabel.value = formatReset(data.playsResetAt)
    uiState.value = data.playsLeft > 0 ? 'start' : 'noplays'
  } catch {
    uiState.value = 'start'
  }
}

async function startGame() {
  if (starting.value) return
  starting.value = true
  try {
    const data = await $fetch('/api/game/reorbitmemory/start', { method: 'POST', credentials: 'include' })
    cols.value = data.cols
    rows.value = data.rows
    cardBackImagePath.value = data.cardBackImagePath
    timeSeconds.value = data.timeSeconds
    flipBackDelayMs.value = data.flipBackDelayMs ?? 800

    const total = data.pairs * 2
    cards.value = Array.from({ length: total }, () => ({ state: 'down', src: null }))
    preloadImages(data.frontImages)
    moves.value = 0
    ending = false
    announce.value = ''
    busy.value = false

    await fetchStatus() // refresh plays left
    playsLeft.value = Math.max(0, playsLeft.value - 1) // optimistic

    uiState.value = 'playing'
    timerStart = Date.now()
    if (timeSeconds.value) {
      timeLeft.value = timeSeconds.value
      timerId = setInterval(() => {
        const elapsed = (Date.now() - timerStart) / 1000
        timeLeft.value = Math.max(0, Math.ceil(timeSeconds.value - elapsed))
        if (timeLeft.value === 0) endGame()
      }, 250)
    } else {
      timeLeft.value = null
    }
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Failed to start game'
    alert(msg)
  } finally {
    starting.value = false
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function onCardTap(i) {
  if (uiState.value !== 'playing' || busy.value) return
  const card = cards.value[i]
  if (!card || card.state !== 'down') return

  busy.value = true
  vibrate(8)
  try {
    const result = await $fetch('/api/game/reorbitmemory/flip', {
      method: 'POST',
      credentials: 'include',
      body: { index: i }
    })

    if (result.firstFlip) {
      cards.value[i] = { state: 'up', src: result.assetPath }
      moves.value = result.moves
      busy.value = false
      return
    }

    // Second flip — server has already evaluated the pair.
    cards.value[i] = { state: 'up', src: result.assetPath }
    if (result.firstIndex != null && cards.value[result.firstIndex]) {
      cards.value[result.firstIndex] = { state: 'up', src: result.firstAssetPath }
    }
    moves.value = result.moves

    if (result.matched) {
      vibrate([10, 30, 10])
      announce.value = 'Match!'
      cards.value[i].state = 'matched'
      if (result.firstIndex != null && cards.value[result.firstIndex]) {
        cards.value[result.firstIndex].state = 'matched'
      }
      if (result.gameOver) {
        await wait(350) // let the flip settle before the modal appears
        endGame()
        return
      }
    } else {
      announce.value = 'No match'
      await wait(flipBackDelayMs.value)
      // Only revert if the card hasn't been re-flipped/matched in the meantime.
      if (cards.value[i]?.state === 'up') cards.value[i] = { state: 'down', src: null }
      if (result.firstIndex != null && cards.value[result.firstIndex]?.state === 'up') {
        cards.value[result.firstIndex] = { state: 'down', src: null }
      }
    }
  } catch {
    // Stale/invalid tap (e.g. a race with the server) — just drop it, no visual change needed
    // since the card never left the 'down' state on screen.
  } finally {
    busy.value = false
  }
}

async function endGame() {
  if (ending) return
  ending = true
  if (timerId) { clearInterval(timerId); timerId = null }

  finalMoves.value = moves.value

  try {
    const result = await $fetch('/api/game/reorbitmemory/end', { method: 'POST', credentials: 'include' })
    finalCompleted.value = result.completed
    finalMoves.value = result.moves
    pointsAwarded.value = result.pointsAwarded ?? 0
    if (result.completed) {
      const status = await $fetch('/api/game/reorbitmemory/status', { credentials: 'include' })
      weekBest.value    = status.weekBest
      allTimeBest.value = status.allTimeBest
      playsLeft.value   = status.playsLeft
    }
  } catch {
    finalCompleted.value = false
    pointsAwarded.value = 0
  }

  uiState.value = 'gameover'
}

onMounted(async () => {
  await fetchStatus()
})

onUnmounted(() => {
  if (timerId) { clearInterval(timerId); timerId = null }
})
</script>

<style scoped>
.memory-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  position: relative;
  background: #001230;
}

.center-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.start-card {
  background: rgba(10, 25, 55, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 2rem 2.5rem;
  text-align: center;
  max-width: 340px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.game-title {
  font-size: clamp(1.4rem, 5vw, 2rem);
  font-weight: 800;
  color: #fff;
  margin: 0 0 0.5rem;
  background: linear-gradient(135deg, #2adf9c, #fff 50%, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.start-sub {
  color: rgba(255,255,255,0.65);
  font-size: 0.875rem;
  margin: 0 0 1.25rem;
}

.plays-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.plays-badge {
  background: rgba(42, 223, 156, 0.15);
  border: 1px solid rgba(42, 223, 156, 0.4);
  color: #2adf9c;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
}

.reset-text {
  color: rgba(255,255,255,0.4);
  font-size: 0.75rem;
}

.no-plays-text {
  color: rgba(255,255,255,0.7);
  font-size: 1rem;
  margin: 0 0 0.5rem;
}

.btn-start {
  background: linear-gradient(135deg, #1a6e3c, #3399cc);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border: none;
  border-radius: 12px;
  padding: 0.75rem 2.5rem;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  min-width: 140px;
}
.btn-start:hover { filter: brightness(1.15); }
.btn-start:active { transform: scale(0.97); }
.btn-start:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.7);
  font-weight: 600;
  font-size: 0.9rem;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  padding: 0.65rem 2rem;
  cursor: pointer;
}

.spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #2adf9c;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.game-area {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 400px;
  gap: 0;
  background: #001230;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

.hud {
  display: flex;
  justify-content: center;
  padding: 6px 8px;
  background: rgba(0, 10, 30, 0.8);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.hud-row {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.hud-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 4px 10px;
  min-width: 64px;
}

.hud-item--warning {
  border-color: rgba(255, 80, 80, 0.5);
  background: rgba(255, 80, 80, 0.1);
  animation: pulse-warn 1s ease-in-out infinite;
}
@keyframes pulse-warn {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

.hud-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  line-height: 1;
}

.hud-value {
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

/* Card grid */
.card-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  grid-auto-rows: auto;
  gap: clamp(4px, 1.5vw, 10px);
  padding: clamp(6px, 2vw, 14px);
  align-content: center;
  justify-content: center;
  align-items: start;
  min-height: 0;
  overflow-y: auto;
  max-width: 560px;
  margin: 0 auto;
  width: 100%;
}

.card {
  position: relative;
  aspect-ratio: 4 / 4;
  min-width: 0;
  min-height: 0;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  perspective: 800px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.card:disabled { cursor: default; }

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.32s cubic-bezier(0.4, 0.2, 0.2, 1);
}
.card--flipped .card-inner {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  overflow: hidden;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
}
.card-face img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.card-face--back {
  background: linear-gradient(135deg, #1a3a8f, #1a6a8a);
}
.card-face--placeholder {
  width: 60%;
  height: 60%;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
}
.card-face--front {
  background: #0a1937;
  transform: rotateY(180deg);
}
.card-face--loading {
  width: 40%;
  height: 40%;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.15);
  border-top-color: #2adf9c;
  animation: spin 0.7s linear infinite;
}

.card--matched .card-face--front {
  outline: 2px solid #ffd700;
  outline-offset: -2px;
}
.card--matched {
  opacity: 0.92;
}

/* No 3D transform support / reduced motion: crossfade instead of a flip */
@media (prefers-reduced-motion: reduce) {
  .card-inner { transition: none; }
  .card-face { transition: opacity 0.15s linear; backface-visibility: visible; -webkit-backface-visibility: visible; }
  .card-face--front { transform: none; opacity: 0; }
  .card--flipped .card-inner { transform: none; }
  .card--flipped .card-face--back { opacity: 0; }
  .card--flipped .card-face--front { opacity: 1; }
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

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.modal-card {
  position: relative;
  background: rgba(10, 25, 55, 0.97);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 20px;
  padding: 2rem;
  width: 100%;
  max-width: 360px;
  max-height: min(90dvh, 520px);
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7);
  text-align: center;
}

.modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
  font-size: 1.4rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #fff;
  margin: 0 0 1.25rem;
  background: linear-gradient(135deg, #ffd700, #fff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.modal-score-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 1.25rem;
}

.modal-score-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.5);
}

.modal-score-value {
  font-size: 3rem;
  font-weight: 900;
  color: #ffd700;
  line-height: 1;
}

.modal-divider {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: 0 0 1.25rem;
}

.modal-leaderboard { margin-bottom: 1rem; }

.modal-lb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.modal-lb-row:last-child { border-bottom: none; }

.modal-lb-label {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.6);
}

.modal-lb-value {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

.modal-points-notice {
  font-size: 0.85rem;
  font-weight: 600;
  color: #66cc00;
  background: rgba(102, 204, 0, 0.1);
  border: 1px solid rgba(102, 204, 0, 0.25);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  margin-bottom: 1.25rem;
}
.modal-points-notice--zero {
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.modal-actions { display: flex; justify-content: center; }
</style>
