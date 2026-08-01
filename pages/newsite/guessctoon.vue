<template>
  <div>
    <NuxtLayout name="newsite-template" :show-adbar="true" :show-nav="true">
      <div class="gc-wrapper">
        <!-- Loading -->
        <div v-if="uiState === 'loading'" class="gc-center">
          <div class="gc-spinner" aria-label="Loading game…"></div>
        </div>

        <!-- No plays left -->
        <div v-else-if="uiState === 'noplays'" class="gc-center">
          <div class="gc-card">
            <h1 class="gc-title">Guess that cToon!</h1>
            <p class="gc-card-text">No plays left today.</p>
            <p class="gc-muted">Resets {{ resetLabel }}</p>
          </div>
        </div>

        <!-- Start -->
        <div v-else-if="uiState === 'start'" class="gc-center">
          <div class="gc-card">
            <h1 class="gc-title">Guess that cToon!</h1>
            <p class="gc-card-text">
              Name the cToon before the clock runs out. Get them right in a row to build your
              streak — one wrong answer ends the run.
            </p>
            <div class="gc-badges">
              <span class="gc-badge">{{ playsLeft }} play{{ playsLeft !== 1 ? 's' : '' }} left</span>
              <span v-if="allTimeHigh != null" class="gc-badge gc-badge--alt">Best streak: {{ allTimeHigh }}</span>
            </div>
            <p class="gc-muted">
              {{ config.secondsPerQuestion }}s per cToon · {{ config.maxQuestions }} to go perfect · Resets {{ resetLabel }}
            </p>
            <button class="gc-btn-start" :disabled="starting" @click="startGame">
              {{ starting ? 'Loading…' : 'Play' }}
            </button>
            <p v-if="startError" class="gc-error" role="alert">{{ startError }}</p>
          </div>
        </div>

        <!-- Playing -->
        <template v-else-if="uiState === 'playing'">
          <div class="gc-timer" aria-hidden="true">
            <div
              :key="barKey"
              class="gc-timer-fill"
              :class="{ 'gc-timer-fill--urgent': urgent }"
              :style="timerStyle"
            ></div>
          </div>

          <div class="gc-hud">
            <div class="gc-hud-item">
              <span class="gc-hud-label">Streak</span>
              <span class="gc-hud-value gc-streak">{{ streak }}</span>
            </div>
            <div class="gc-hud-item gc-hud-item--center">
              <span class="gc-hud-label">cToon</span>
              <span class="gc-hud-value">{{ questionIndex + 1 }}<span class="gc-hud-sub">/{{ totalQuestions }}</span></span>
            </div>
            <div class="gc-hud-item gc-hud-item--right">
              <span class="gc-hud-label">Best</span>
              <span class="gc-hud-value">{{ allTimeHigh ?? '—' }}</span>
            </div>
          </div>

          <div class="gc-stage">
            <img
              v-if="question"
              :key="question.questionIndex"
              class="gc-stage-img"
              :src="imageUrl(question.imageToken)"
              alt=""
              decoding="async"
              fetchpriority="high"
              draggable="false"
              @load="imgReady = true"
              @error="imgReady = true"
            />
            <div v-if="!imgReady" class="gc-stage-skeleton" aria-hidden="true"></div>
            <div v-if="reveal" class="gc-stamp" :class="reveal.correct ? 'gc-stamp--yes' : 'gc-stamp--no'">
              {{ reveal.correct ? 'CORRECT!' : (reveal.timedOut ? 'TIME!' : 'NOPE!') }}
            </div>
          </div>

          <div
            class="gc-answers"
            role="group"
            :aria-labelledby="`gc-q-${questionIndex}`"
            :data-locked="locked ? 'true' : 'false'"
          >
            <h2 :id="`gc-q-${questionIndex}`" class="gc-sr-only">
              Question {{ questionIndex + 1 }}. Which cToon is this?
            </h2>
            <button
              v-for="(choice, i) in (question?.choices || [])"
              :key="`${questionIndex}-${i}`"
              type="button"
              class="gc-answer"
              :class="answerClass(i)"
              :aria-disabled="locked ? 'true' : 'false'"
              @click="submitAnswer(i)"
            >
              <span class="gc-answer-badge" aria-hidden="true">{{ LETTERS[i] }}</span>
              <span class="gc-answer-label">{{ choice }}</span>
            </button>
          </div>

          <p class="gc-sr-only" role="status" aria-live="polite">{{ announcement }}</p>
        </template>

        <!-- Game over -->
        <div v-else-if="uiState === 'gameover'" class="gc-center">
          <div class="gc-card">
            <h1 class="gc-title gc-title--small">
              {{ finalResult?.perfect ? 'Perfect Run!' : 'Run Over' }}
            </h1>
            <p class="gc-final-label">Streak</p>
            <p class="gc-final-streak">{{ finalResult?.streak ?? 0 }}</p>

            <p v-if="finalResult && !finalResult.perfect && finalResult.correctName" class="gc-card-text">
              It was <strong>{{ finalResult.correctName }}</strong>.
            </p>
            <p v-if="isPersonalBest" class="gc-pb">New personal best!</p>
            <p v-if="finalResult?.pointsAwarded" class="gc-muted">
              +{{ finalResult.pointsAwarded }} points
            </p>
            <p
              v-else-if="finalResult && finalResult.minStreakForPoints > (finalResult.streak ?? 0)"
              class="gc-muted"
            >
              Reach a streak of {{ finalResult.minStreakForPoints }} to earn points.
            </p>

            <div class="gc-actions">
              <button v-if="playsLeft > 0" class="gc-btn-start" :disabled="starting" @click="startGame">
                {{ starting ? 'Loading…' : 'Play Again' }}
              </button>
              <span v-else class="gc-muted">No plays left · Resets {{ resetLabel }}</span>
              <NuxtLink to="/newsite/leaderboards" class="gc-btn-secondary">Leaderboard</NuxtLink>
              <NuxtLink to="/newsite/Games" class="gc-btn-secondary">Games Home</NuxtLink>
            </div>
            <p class="gc-muted">{{ playsLeft }} play{{ playsLeft !== 1 ? 's' : '' }} left today</p>
          </div>
        </div>
      </div>
    </NuxtLayout>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

definePageMeta({ ssr: false })

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

const uiState = ref('loading') // loading | noplays | start | playing | gameover
const starting = ref(false)
const startError = ref('')

const config = ref({ secondsPerQuestion: 12, maxQuestions: 25, minStreakForPoints: 3, playsPerPeriod: 3 })
const playsLeft = ref(0)
const playsResetAt = ref(null)
const allTimeHigh = ref(null)

const question = ref(null)
const questionIndex = ref(0)
const totalQuestions = ref(0)
const streak = ref(0)
const imgReady = ref(false)
const locked = ref(false)
const reveal = ref(null)
const finalResult = ref(null)
const isPersonalBest = ref(false)
const announcement = ref('')

const barKey = ref(0)
const barDurationMs = ref(12000)
const barStartScale = ref(1)
const urgent = ref(false)
const reduceMotion = ref(false)

let deadlineAt = 0
let urgentTimer = null
let timeoutTimer = null

const timerStyle = computed(() => ({
  '--gc-duration': `${barDurationMs.value}ms`,
  '--gc-start-scale': String(barStartScale.value)
}))

const resetLabel = computed(() => {
  if (!playsResetAt.value) return 'daily'
  try {
    return new Date(playsResetAt.value).toLocaleString(undefined, {
      weekday: 'short', hour: 'numeric', minute: '2-digit'
    })
  } catch {
    return 'daily'
  }
})

function imageUrl (token) {
  return token ? `/api/game/guessctoon/image/${token}` : ''
}

function answerClass (i) {
  if (!reveal.value) return ''
  if (i === reveal.value.correctIndex) return 'gc-answer--correct'
  if (i === reveal.value.chosen && !reveal.value.correct) return 'gc-answer--wrong'
  return 'gc-answer--muted'
}

function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function clearTimers () {
  if (urgentTimer) { clearTimeout(urgentTimer); urgentTimer = null }
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
}

// The countdown bar is decoration; the server's clock is the authority. This only keeps the
// visual in sync and fires an automatic submit when the local clock says time is up.
function armTimer (durationMs) {
  clearTimers()
  deadlineAt = Date.now() + durationMs
  barDurationMs.value = durationMs
  barStartScale.value = 1
  urgent.value = false
  // Remounting the fill element restarts the CSS animation cleanly — resetting a property
  // in the same tick gets batched and the animation silently never replays.
  barKey.value++

  const untilUrgent = durationMs - 3000
  if (untilUrgent > 0) urgentTimer = setTimeout(() => { urgent.value = true }, untilUrgent)
  else urgent.value = true

  timeoutTimer = setTimeout(() => { submitAnswer(-1) }, durationMs + 250)
}

// Backgrounding a tab pauses CSS animations but not wall-clock time, so a player returning
// to the tab would see a half-full bar against an already-expired server deadline.
function onVisibility () {
  if (document.hidden || uiState.value !== 'playing' || locked.value) return
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) { submitAnswer(-1); return }
  clearTimers()
  barStartScale.value = Math.max(0, Math.min(1, remaining / (config.value.secondsPerQuestion * 1000)))
  barDurationMs.value = remaining
  barKey.value++
  urgent.value = remaining <= 3000
  if (!urgent.value) urgentTimer = setTimeout(() => { urgent.value = true }, remaining - 3000)
  timeoutTimer = setTimeout(() => { submitAnswer(-1) }, remaining + 250)
}

function onKey (e) {
  if (uiState.value !== 'playing' || locked.value) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const count = question.value?.choices?.length || 0
  let i = '123456'.indexOf(e.key)
  if (i < 0) i = 'abcdef'.indexOf(String(e.key).toLowerCase())
  if (i >= 0 && i < count) {
    e.preventDefault()
    submitAnswer(i)
  }
}

function buzz (pattern) {
  try { navigator.vibrate?.(pattern) } catch {}
}

function prefetch (token) {
  if (!token) return
  // A detached Image populates the HTTP cache without being animated or composited —
  // hidden <img> elements in the DOM keep decoding GIF frames.
  const img = new Image()
  img.src = imageUrl(token)
}

function setQuestion (q, remainingMs) {
  question.value = q
  questionIndex.value = q.questionIndex
  imgReady.value = false
  prefetch(q.prefetchToken)
  armTimer(remainingMs ?? config.value.secondsPerQuestion * 1000)
  announcement.value =
    `Question ${q.questionIndex + 1}. ` +
    q.choices.map((c, i) => `${LETTERS[i]}, ${c}.`).join(' ')
}

async function loadStatus () {
  try {
    const s = await $fetch('/api/game/guessctoon/status')
    config.value = s.config
    playsLeft.value = s.playsLeft
    playsResetAt.value = s.playsResetAt
    allTimeHigh.value = s.allTimeHigh
    return s
  } catch {
    return null
  }
}

async function startGame () {
  if (starting.value) return
  starting.value = true
  startError.value = ''
  try {
    const res = await $fetch('/api/game/guessctoon/start', { method: 'POST' })
    totalQuestions.value = res.totalQuestions
    config.value = { ...config.value, secondsPerQuestion: res.secondsPerQuestion }
    streak.value = 0
    reveal.value = null
    finalResult.value = null
    isPersonalBest.value = false
    locked.value = false
    playsLeft.value = Math.max(0, playsLeft.value - 1)
    uiState.value = 'playing'
    await nextTick()
    setQuestion(res.question, res.secondsPerQuestion * 1000)
  } catch (err) {
    const status = err?.statusCode || err?.response?.status
    if (status === 429) {
      await loadStatus()
      uiState.value = 'noplays'
    } else {
      startError.value = err?.statusMessage || err?.data?.statusMessage || 'Could not start a game. Try again.'
    }
  } finally {
    starting.value = false
  }
}

async function submitAnswer (choice) {
  if (locked.value || uiState.value !== 'playing' || !question.value) return
  locked.value = true
  clearTimers()
  buzz(8)

  let res
  try {
    res = await $fetch('/api/game/guessctoon/answer', {
      method: 'POST',
      body: { questionIndex: questionIndex.value, choice }
    })
  } catch (err) {
    const status = err?.statusCode || err?.response?.status
    // A rejected duplicate/too-fast answer is a no-op, not an error the player should see
    // mid-question — re-arm and let them answer.
    if (status === 429) {
      locked.value = false
      const remaining = Math.max(0, deadlineAt - Date.now())
      if (remaining > 0) armTimer(remaining)
      else submitAnswer(-1)
      return
    }
    await loadStatus()
    uiState.value = playsLeft.value > 0 ? 'start' : 'noplays'
    locked.value = false
    return
  }

  reveal.value = {
    correct: res.correct,
    correctIndex: res.correctIndex,
    chosen: choice,
    timedOut: Boolean(res.timedOut)
  }
  streak.value = res.streak
  buzz(res.correct ? [10, 30, 10] : [20, 40, 20])
  announcement.value = res.correct
    ? `Correct. ${res.correctName}. Streak ${res.streak}.`
    : `${res.timedOut ? 'Out of time' : 'Wrong'}. The answer was ${res.correctName}. Final streak ${res.streak}.`

  await wait(reduceMotion.value ? 500 : 900)

  if (res.gameOver) {
    finalResult.value = {
      streak: res.streak,
      perfect: res.perfect,
      correctName: res.correctName,
      pointsAwarded: res.pointsAwarded,
      minStreakForPoints: res.minStreakForPoints
    }
    isPersonalBest.value = allTimeHigh.value == null || res.streak > allTimeHigh.value
    if (isPersonalBest.value) allTimeHigh.value = res.streak
    reveal.value = null
    uiState.value = 'gameover'
    locked.value = false
    return
  }

  reveal.value = null
  setQuestion(res.question, res.remainingMs)
  await nextTick()
  // Unlock only once the new buttons have actually painted, so a thumb already descending
  // toward the old layout cannot register on the new question.
  requestAnimationFrame(() => { locked.value = false })
}

// Abandoning mid-run banks whatever streak was earned rather than silently discarding it.
function bankOnExit () {
  if (uiState.value !== 'playing') return
  try {
    navigator.sendBeacon?.('/api/game/guessctoon/end', new Blob([], { type: 'application/json' }))
  } catch {}
}

onMounted(async () => {
  reduceMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false
  const s = await loadStatus()
  if (!s) { uiState.value = 'start'; return }
  uiState.value = s.playsLeft > 0 ? 'start' : 'noplays'

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', bankOnExit)
})

onBeforeUnmount(() => {
  clearTimers()
  bankOnExit()
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pagehide', bankOnExit)
})
</script>

<style>
/* Self-hosted, already shipped with the Winball page. Avoids adding a second render-blocking
   Google Fonts request on top of the layout's Nunito import. */
@font-face {
  font-family: "FuturaBdCnBT";
  src: url("/newwinball/fonts/84_Futura BdCn BT.ttf") format("truetype");
  font-weight: 700;
  font-display: swap;
}

/* Unscoped: reaches into the layout's .main-content. The body class is set by
   newsite-template from the route name. svh (not dvh) so the stage does not resize as the
   iOS URL bar collapses mid-question. */
@media (max-width: 768px) {
  body.page-newsite-guessctoon .main-content {
    min-height: calc(100svh - 190px);
    max-width: 100% !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
  }
}
</style>

<style scoped>
.gc-wrapper {
  --ink: clamp(2px, 0.9vw, 4px);
  --gc-btn-h: 56px;
  --gc-gap: 8px;

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 420px;
  overflow-x: hidden;
  box-sizing: border-box;
  background: #001230;
  overscroll-behavior: contain;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* Static halftone. Tiled once and rasterised — never animated, and never
   background-attachment: fixed, which repaints the whole area on every scroll frame. */
.gc-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: radial-gradient(circle at 1.5px 1.5px, rgba(255, 255, 255, 0.10) 1.2px, transparent 1.3px);
  background-size: 7px 7px;
}
.gc-wrapper > * { position: relative; z-index: 1; }

/* ── Cards / shared ─────────────────────────────────────────── */

.gc-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 10px;
  box-sizing: border-box;
}

.gc-card {
  width: 100%;
  max-width: 460px;
  text-align: center;
  padding: 20px 16px;
  box-sizing: border-box;
  background: #0A47A1;
  border: var(--ink) solid #000;
  border-radius: 14px;
  box-shadow: 0 6px 0 #000;
}

.gc-title {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(28px, 9vw, 46px);
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #FFCC33;
  margin: 0 0 12px;
  transform: rotate(-1.5deg);
  text-shadow:
    -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000,
    -2px 0 0 #000, 2px 0 0 #000,
    -2px 2px 0 #000, 0 2px 0 #000, 2px 2px 0 #000,
    0 5px 0 rgba(0, 0, 0, 0.35);
}
.gc-title--small { font-size: clamp(24px, 7vw, 36px); }

.gc-card-text {
  font-size: 15px;
  line-height: 1.4;
  margin: 0 0 12px;
  color: #fff;
}

.gc-muted {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  margin: 8px 0 0;
}

.gc-error {
  margin: 10px 0 0;
  font-size: 14px;
  font-weight: 700;
  color: #FFD3D0;
}

.gc-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 6px;
}

.gc-badge {
  display: inline-block;
  padding: 5px 12px;
  border: 2px solid #000;
  border-radius: 999px;
  background: #66CC00;
  color: #06240A;
  font-size: 13px;
  font-weight: 800;
}
.gc-badge--alt { background: #FFCC33; color: #2A1B00; }

.gc-btn-start {
  display: inline-block;
  margin-top: 14px;
  padding: 14px 34px;
  min-height: 52px;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: 24px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #06240A;
  background: #66CC00;
  border: var(--ink) solid #000;
  border-radius: 12px;
  box-shadow: 0 5px 0 #000;
  cursor: pointer;
  touch-action: manipulation;
}
.gc-btn-start:active { transform: translateY(3px); box-shadow: 0 2px 0 #000; }
.gc-btn-start:disabled { opacity: 0.6; cursor: default; }

.gc-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 18px;
  border: 2px solid #000;
  border-radius: 10px;
  background: #3399CC;
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  text-decoration: none;
  box-shadow: 0 3px 0 #000;
  touch-action: manipulation;
}

.gc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-top: 14px;
}

.gc-final-label {
  margin: 4px 0 0;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.8);
}

.gc-final-streak {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(56px, 20vw, 96px);
  line-height: 1;
  margin: 0 0 8px;
  color: #FFCC33;
  font-variant-numeric: tabular-nums;
  text-shadow:
    -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000,
    -2px 0 0 #000, 2px 0 0 #000,
    -2px 2px 0 #000, 0 2px 0 #000, 2px 2px 0 #000;
}

.gc-pb {
  margin: 6px 0 0;
  font-weight: 800;
  color: #66CC00;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Timer ──────────────────────────────────────────────────── */

.gc-timer {
  flex: 0 0 auto;
  height: 10px;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 2px solid #000;
  overflow: hidden;
}

.gc-timer-fill {
  height: 100%;
  transform-origin: left center;
  will-change: transform;
  background: #66CC00;
  animation: gc-drain var(--gc-duration, 12000ms) linear forwards;
}

/* Pattern shift as well as colour, so "almost out of time" is not colour-only. */
.gc-timer-fill--urgent {
  background: repeating-linear-gradient(45deg, #E8342A 0 6px, #B3221A 6px 12px);
}

@keyframes gc-drain {
  from { transform: scaleX(var(--gc-start-scale, 1)); }
  to   { transform: scaleX(0); }
}

/* ── HUD ────────────────────────────────────────────────────── */

.gc-hud {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
}

.gc-hud-item { display: flex; flex-direction: column; min-width: 0; }
.gc-hud-item--center { align-items: center; }
.gc-hud-item--right { align-items: flex-end; }

.gc-hud-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}

.gc-hud-value {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: 22px;
  line-height: 1.1;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.gc-hud-sub { font-size: 13px; color: rgba(255, 255, 255, 0.6); }

/* Reserved width so 9 → 10 never shifts the row. */
.gc-streak { color: #FFCC33; min-width: 3ch; }

/* ── Stage ──────────────────────────────────────────────────── */

/* Fixed height + object-fit: contain. cToon art ranges from 55×50 to 200×117 (a ~9× aspect
   spread), so an intrinsically-sized image would resize the page every question and push
   the answer buttons out from under the player's thumb. */
.gc-stage {
  position: relative;
  flex: 0 0 auto;
  height: clamp(120px, 26svh, 220px);
  width: 100%;
  display: grid;
  place-items: center;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.gc-stage-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* These are small GIFs shown 3-4× up; nearest-neighbour reads as deliberate retro
     pixel art rather than a blurry upscale. */
  image-rendering: pixelated;
  -webkit-user-drag: none;
  /* Suppresses the iOS long-press sheet — "Copy Image Address" mid-countdown is both a UX
     annoyance and an invitation to poke at the image URL. */
  -webkit-touch-callout: none;
  pointer-events: none;
}

.gc-stage-skeleton {
  position: absolute;
  inset: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

/* Absolutely positioned so the reveal contributes nothing to layout. */
.gc-stamp {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) rotate(-6deg) scale(0.6);
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  padding: 6px 18px;
  border: 3px solid #000;
  border-radius: 8px;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(26px, 8vw, 44px);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  animation: gc-stamp-in 260ms cubic-bezier(0.2, 1.6, 0.4, 1) forwards;
}
.gc-stamp--yes { background: #66CC00; color: #06240A; }
.gc-stamp--no  { background: #E8342A; color: #fff; }

@keyframes gc-stamp-in {
  to { transform: translate(-50%, -50%) rotate(-6deg) scale(1); opacity: 1; }
}

/* ── Answers ────────────────────────────────────────────────── */

.gc-answers {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--gc-gap);
  padding: 0 8px 12px;
  box-sizing: border-box;
}

/* pointer-events on the group rather than `disabled` on the buttons: disabling a focused
   button drops focus to <body>, which silently ejects keyboard players every question. */
.gc-answers[data-locked="true"] { pointer-events: none; }

.gc-answer {
  /* Fixed height, never min-height — identical geometry on every question is what stops
     mis-taps when the layout would otherwise reflow around longer names. */
  height: var(--gc-btn-h);
  min-width: 0;
  display: grid;
  grid-template-columns: 30px 1fr;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  box-sizing: border-box;
  font: 700 15px/1.15 var(--font-family, 'Nunito', sans-serif);
  text-align: left;
  color: #1a1000;
  background: #FFCC33;
  border: var(--ink) solid #000;
  border-radius: 10px;
  box-shadow: 0 4px 0 #000;
  cursor: pointer;
  touch-action: manipulation;
  transition: background 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.gc-answer:active { transform: translateY(3px); box-shadow: 0 1px 0 #000; }

.gc-answer-badge {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid #000;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.12);
  font-size: 14px;
  font-weight: 900;
}

.gc-answer-label {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

/* Result is encoded three ways — colour, glyph and strikethrough — so it does not depend
   on colour vision. */
.gc-answer--correct {
  background: #2E7D32;
  color: #fff;
  box-shadow: 0 0 0 3px #A5FF6B, 0 4px 0 #000;
}
.gc-answer--correct .gc-answer-badge { font-size: 0; }
.gc-answer--correct .gc-answer-badge::after { content: '✓'; font-size: 16px; }

.gc-answer--wrong {
  background: #B3221A;
  color: #fff;
  box-shadow: 0 0 0 3px #FF8A80, 0 4px 0 #000;
}
.gc-answer--wrong .gc-answer-badge { font-size: 0; }
.gc-answer--wrong .gc-answer-badge::after { content: '✕'; font-size: 16px; }
.gc-answer--wrong .gc-answer-label { text-decoration: line-through; }

.gc-answer--muted { opacity: 0.45; }

/* ── Misc ───────────────────────────────────────────────────── */

.gc-spinner {
  width: 42px;
  height: 42px;
  border: 5px solid rgba(255, 255, 255, 0.25);
  border-top-color: #FFCC33;
  border-radius: 50%;
  animation: gc-spin 800ms linear infinite;
}
@keyframes gc-spin { to { transform: rotate(360deg); } }

.gc-sr-only {
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

/* Two columns once there is genuinely room. Deliberately not tied to the layout's 768px
   mobile breakpoint — that one is also evaluated in JS against a zoom-adjusted width, and
   the two can disagree. */
@media (min-width: 641px) {
  .gc-answers { grid-template-columns: 1fr 1fr; }
  .gc-answer { height: 64px; font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .gc-timer-fill { animation: none; transform: scaleX(var(--gc-start-scale, 1)); }
  .gc-stamp { animation: none; opacity: 1; transform: translate(-50%, -50%) rotate(-6deg); }
  .gc-answer { transition: none; }
  .gc-spinner { animation: none; }
  .gc-title { transform: none; }
}
</style>
