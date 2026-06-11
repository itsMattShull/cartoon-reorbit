<template>
  <div class="winwheel-content">
        <!-- Skeleton state -->
        <template v-if="loading">
          <div class="controls-area">
            <div class="skeleton-btn animate-pulse"></div>
            <div class="skeleton-link animate-pulse"></div>
            <div class="skeleton-link animate-pulse"></div>
          </div>
          <div class="wheel-area">
            <div class="animate-pulse wheel-skeleton"></div>
            <div class="pointer-placeholder animate-pulse"></div>
          </div>
        </template>

        <!-- Real content -->
        <template v-else>
          <div class="controls-area">
            <button
              class="btn-spin"
              @click="spinWheel"
              :disabled="!canSpin"
            >
              <template v-if="spinCost === null">Loading…</template>
              <template v-else-if="spinsLeft === 0">Next spin in {{ countdown }}</template>
              <template v-else>Spin ({{ Number(spinCost).toLocaleString() }} pts)</template>
            </button>

            <div class="controls-links">
              <span class="link-muted" @click="showHelpModal = true">How does it work?</span>
              <span class="link-accent" @click="showExclusiveModal = true">View Exclusive cToons</span>
            </div>
          </div>

          <div class="wheel-area">
            <img
              ref="wheel"
              :src="wheelSrc"
              class="wheel-img"
              :style="{
                transform: `rotate(${rotation}deg)`,
                transition: spinTransition
              }"
              alt="Win Wheel"
            />
            <div class="pointer-wrap">
              <img src="/images/pointer.svg" alt="Pointer" class="pointer-img" />
            </div>
          </div>
        </template>
      </div>

      <!-- Scavenger Hunt Modal -->
      <ScavengerHuntModal v-if="hasShownResult && !showResultModal && scavenger.isOpen && scavenger.sessionId" />

      <!-- Result Modal -->
      <transition name="fade">
        <div v-if="showResultModal" class="modal-overlay" @click.self="closeModal">
          <div class="modal-box">
            <div class="modal-header">
              <h2 class="modal-title">
                <template v-if="spinResult.type === 'nothing'">You got nothing 😢</template>
                <template v-else-if="spinResult.type === 'points'">
                  <span v-if="spinResult.amount < spinCost">Small Prize: +{{ Number(spinResult.amount).toLocaleString() }} pts! 🎉</span>
                  <span v-else>You won {{ Number(spinResult.amount).toLocaleString() }} pts! 🏆</span>
                </template>
                <template v-else>You won a cToon! 🎉</template>
              </h2>
            </div>
            <div class="modal-body">
              <template v-if="spinResult.type === 'nothing'">
                <img src="/images/nothing1225.gif" alt="Nothing" class="nothing-gif" />
              </template>
              <div v-if="spinResult.ctoon" class="modal-ctoon">
                <CtoonAsset
                  :src="spinResult.ctoon.assetPath"
                  :alt="spinResult.ctoon.name"
                  :name="spinResult.ctoon.name"
                  :ctoon-id="spinResult.ctoon.id"
                  image-class="modal-ctoon-img"
                />
                <p class="modal-ctoon-name">{{ spinResult.ctoon.name }}</p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-modal" @click="closeModal">Close</button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Help Modal -->
      <transition name="fade">
        <div v-if="showHelpModal" class="modal-overlay" @click.self="showHelpModal = false">
          <div class="modal-box">
            <div class="modal-header">
              <h2 class="modal-title">How the Win Wheel Works</h2>
            </div>
            <div class="modal-body">
              <ul class="help-list">
                <li>Each spin costs <strong>{{ Number(spinCost).toLocaleString() }} points</strong>.</li>
                <li>You can spin up to <strong>{{ maxDailySpins }} times</strong> per day (resets at 8&nbsp;AM CST).</li>
                <li>Possible outcomes:
                  <ul class="help-sublist">
                    <li><strong>Nothing</strong>: no reward.</li>
                    <li><strong>Points</strong>: win {{ Number(pointsWon).toLocaleString() }} points back.</li>
                    <li><strong>Least Desirable cToon</strong>: we pick a common cToon with the fewest mints.</li>
                    <li><strong>Exclusive cToon</strong>: a random exclusive cToon.</li>
                  </ul>
                </li>
              </ul>
            </div>
            <div class="modal-footer">
              <button class="btn-modal" @click="showHelpModal = false">Got it!</button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Exclusive Pool Modal -->
      <transition name="fade">
        <div v-if="showExclusiveModal" class="modal-overlay" @click.self="showExclusiveModal = false">
          <div class="modal-box modal-box--wide">
            <div class="modal-header modal-header--row">
              <h2 class="modal-title">Exclusive cToons</h2>
              <button class="btn-close" @click="showExclusiveModal = false">✕</button>
            </div>
            <div class="modal-body modal-body--scroll">
              <div v-if="exclusivePool.length === 0" class="exclusive-empty">
                No exclusive cToons configured.
              </div>
              <div v-else class="exclusive-grid">
                <div
                  v-for="item in exclusivePool"
                  :key="item.id"
                  class="exclusive-card"
                >
                  <span class="exclusive-badge" :class="item.owned ? 'badge--owned' : 'badge--unowned'">
                    {{ item.owned ? 'Owned' : 'Unowned' }}
                  </span>
                  <CtoonAsset
                    :src="item.assetPath"
                    :alt="item.name"
                    :name="item.name"
                    :ctoon-id="item.id"
                    image-class="exclusive-img"
                  />
                  <div class="exclusive-name">{{ item.name }}</div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-modal" @click="showExclusiveModal = false">Close</button>
            </div>
          </div>
        </div>
      </transition>

      <Teleport to="body">
        <transition name="ww-toast-fade">
          <div v-if="toast.visible" class="ww-toast" :class="toast.type">
            {{ toast.message }}
          </div>
        </transition>
      </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import CtoonAsset from '@/components/CtoonAsset.vue'
import { useAuth } from '@/composables/useAuth'
import ScavengerHuntModal from '@/components/ScavengerHuntModal.vue'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Win Wheel',
  description: 'Spin the Win Wheel on Cartoon ReOrbit for a chance at points and exclusive cToons.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const toast = reactive({ visible: false, message: '', type: 'error' })
let toastTimer = null
function showToast(message, type = 'error') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.message = message
  toast.type = type
  toast.visible = true
  toastTimer = setTimeout(() => { toast.visible = false }, 3500)
}

const sliceCount     = 6
const sliceAngle     = 360 / sliceCount
const startOffset    = -90
const spinDurationMs = 4000

const { user, fetchSelf } = useAuth()

const loading = ref(true)

let fallbackAudio = null
let spinSoundTimer = null
let audioCtx = null
let spinBuffer = null
let spinBufferPromise = null
const activeSpinSources = new Set()

const spinCost          = ref(null)
const spinsLeft         = ref(0)
const nextReset         = ref(null)
const countdown         = ref('')
const rotation          = ref(0)
const isSpinning        = ref(false)
const showResultModal   = ref(false)
const showHelpModal     = ref(false)
const showExclusiveModal = ref(false)
const spinResult        = ref({ type: '', amount: 0, ctoon: null })
let countdownTimer      = null
const maxDailySpins     = ref(0)
const pointsWon         = ref(0)
const hasShownResult    = ref(false)

const scavenger = useScavengerHunt()

const winWheelImagePath = ref('')
const winWheelSoundPath = ref('')
const winWheelSoundMode = ref('repeat')
const exclusivePool     = ref([])

const wheelSrc = computed(() => winWheelImagePath.value || '/images/wheel.svg')
const spinTransition = computed(() =>
  isSpinning.value
    ? `transform ${spinDurationMs / 1000}s cubic-bezier(0.33, 1, 0.68, 1)`
    : 'none'
)

async function fetchStatus() {
  const res = await $fetch('/api/game/winwheel/status')
  const {
    spinsLeft: sl,
    nextReset: nr,
    spinCost: cost,
    maxDailySpins: maxSpins,
    pointsWon: pts,
    winWheelImagePath: wheelPath,
    winWheelSoundPath: soundPath,
    winWheelSoundMode: soundMode,
    exclusivePool: pool
  } = res

  const prevSoundPath      = winWheelSoundPath.value
  spinsLeft.value          = sl
  nextReset.value          = new Date(nr)
  spinCost.value           = cost
  maxDailySpins.value      = maxSpins
  pointsWon.value          = pts
  winWheelImagePath.value  = wheelPath || ''
  winWheelSoundPath.value  = soundPath || ''
  if (winWheelSoundPath.value !== prevSoundPath) {
    spinBuffer = null
    spinBufferPromise = null
    fallbackAudio = null
  }
  winWheelSoundMode.value  = soundMode || 'repeat'
  exclusivePool.value      = Array.isArray(pool) ? pool : []
  updateCountdown()
}

function updateCountdown() {
  if (!nextReset.value) { countdown.value = ''; return }
  const diff = nextReset.value.getTime() - Date.now()
  if (diff <= 0) { countdown.value = ''; return }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  countdown.value = [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

onMounted(async () => {
  scavenger.reset()
  await fetchSelf({ force: true })
  try {
    await fetchStatus()
  } catch (err) {
    console.error('Failed to fetch win wheel status', err)
  }
  countdownTimer = setInterval(updateCountdown, 1000)
  loading.value = false
})

onBeforeUnmount(() => {
  clearInterval(countdownTimer)
  stopSpinSound()
})

const userPoints = computed(() => user.value?.points || 0)
const canSpin = computed(() =>
  spinCost.value !== null &&
  !isSpinning.value &&
  userPoints.value >= spinCost.value &&
  spinsLeft.value > 0
)

async function spinWheel() {
  if (!canSpin.value) return
  hasShownResult.value = false
  startSpinSound()
  user.value.points -= spinCost.value
  spinsLeft.value--
  isSpinning.value = true

  try {
    const { result, points, sliceIndex, ctoon } = await $fetch('/api/game/winwheel/spin', { method: 'POST' })
    spinResult.value = { type: result, amount: points || 0, ctoon: ctoon || null }
    await scavenger.maybeTrigger('winwheel_spin', { open: false })
    const fullTurns = 5
    const wedgeMid  = startOffset + sliceAngle / 2 + sliceIndex * sliceAngle
    rotation.value  = fullTurns * 360 - wedgeMid
    setTimeout(async () => {
      stopSpinSound()
      await fetchSelf({ force: true })
      await fetchStatus()
      hasShownResult.value = true
      showResultModal.value = true
    }, spinDurationMs)
  } catch (err) {
    console.error(err)
    showToast(err?.data?.statusMessage || err?.statusMessage || 'Spin failed — please try again.', 'error')
    user.value.points += spinCost.value
    spinsLeft.value++
    isSpinning.value = false
    stopSpinSound()
  }
}

function closeModal() {
  showResultModal.value = false
  rotation.value        = 0
  isSpinning.value      = false
  scavenger.openIfPending()
}

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    return audioCtx
  }
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  audioCtx = new Ctx()
  return audioCtx
}

function prepareSpinSoundBuffer() {
  if (!winWheelSoundPath.value) return Promise.resolve(null)
  if (spinBuffer) return Promise.resolve(spinBuffer)
  if (spinBufferPromise) return spinBufferPromise
  const ctx = ensureAudioContext()
  if (!ctx) return Promise.resolve(null)
  const soundPath = winWheelSoundPath.value
  spinBufferPromise = fetch(soundPath)
    .then(res => res.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab))
    .then(buf => { spinBuffer = buf; return buf })
    .catch(err => { console.warn('Failed to load spin sound buffer', err); return null })
    .finally(() => { spinBufferPromise = null })
  return spinBufferPromise
}

function playSpinSoundBuffer() {
  if (!spinBuffer || !audioCtx) return false
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  const src = audioCtx.createBufferSource()
  src.buffer = spinBuffer
  src.connect(audioCtx.destination)
  src.start(0)
  activeSpinSources.add(src)
  src.onended = () => activeSpinSources.delete(src)
  return true
}

function getFallbackAudio() {
  if (!fallbackAudio && winWheelSoundPath.value) {
    fallbackAudio = new Audio(winWheelSoundPath.value)
    fallbackAudio.preload = 'auto'
  }
  return fallbackAudio
}

function playSpinSoundOnce() {
  try {
    if (playSpinSoundBuffer()) return
    const audio = getFallbackAudio()
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(err => { console.warn('Spin audio play prevented by browser:', err) })
    }
  } catch (e) {
    console.warn('Unable to play spin audio', e)
  }
}

function startSpinSound() {
  if (!winWheelSoundPath.value) return
  stopSpinSound()
  ensureAudioContext()
  void prepareSpinSoundBuffer()
  if (winWheelSoundMode.value === 'once') {
    playSpinSoundOnce()
    return
  }
  const start = performance.now()
  const minInterval = 110
  const maxInterval = 550
  const slowWindowMs = 2500
  const tick = () => {
    const elapsed = performance.now() - start
    if (elapsed >= spinDurationMs) return
    playSpinSoundOnce()
    const slowStart = Math.max(0, spinDurationMs - slowWindowMs)
    let nextDelay = minInterval
    if (elapsed >= slowStart) {
      const t = Math.min(1, (elapsed - slowStart) / slowWindowMs)
      nextDelay = minInterval + (maxInterval - minInterval) * t
    }
    spinSoundTimer = setTimeout(tick, nextDelay)
  }
  tick()
}

function stopSpinSound() {
  if (spinSoundTimer) { clearTimeout(spinSoundTimer); spinSoundTimer = null }
  if (activeSpinSources.size > 0) {
    activeSpinSources.forEach(src => { try { src.stop(0) } catch {} })
    activeSpinSources.clear()
  }
  if (fallbackAudio) { fallbackAudio.pause(); fallbackAudio.currentTime = 0 }
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
.winwheel-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
}

/* Controls */
.controls-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 28px 16px 0;
  z-index: 10;
}

.btn-spin {
  background: #336699;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px 32px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.btn-spin:hover:not(:disabled) {
  background: #3399cc;
  transform: scale(1.02);
}

.btn-spin:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-spin:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controls-links {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.link-muted {
  color: #aac8e0;
  text-decoration: underline;
  cursor: pointer;
}

.link-muted:hover {
  color: #cce0f0;
}

.link-accent {
  color: #66cc00;
  text-decoration: underline;
  cursor: pointer;
}

.link-accent:hover {
  color: #88ee22;
}

/* Wheel */
.wheel-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
  position: relative;
  padding-top: 48px;
}

.wheel-img {
  width: 80%;
  max-width: 480px;
  height: auto;
}

.pointer-wrap {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.pointer-img {
  width: 32px;
  height: auto;
}

/* Skeletons */
.skeleton-btn {
  width: 160px;
  height: 44px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
}

.skeleton-link {
  width: 140px;
  height: 16px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
}

.wheel-skeleton {
  width: 70%;
  max-width: 420px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.pointer-placeholder {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 20px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal-box {
  background: #fff;
  border-radius: 10px;
  width: 100%;
  max-width: 400px;
  max-height: 90svh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #1a1a2e;
}

.modal-box--wide {
  max-width: 680px;
}

.modal-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-header--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #336699;
}

.modal-body {
  padding: 20px 24px;
  flex: 1;
  overflow-y: auto;
}

.modal-body--scroll {
  overflow-y: auto;
}

.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.btn-modal {
  background: #336699;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 24px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-modal:hover {
  background: #3399cc;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: #555;
  line-height: 1;
  padding: 2px 4px;
}

.btn-close:hover {
  color: #111;
}

.nothing-gif {
  max-width: 100%;
  height: auto;
  margin: 0 auto 12px;
  display: block;
}

.modal-ctoon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.modal-ctoon-name {
  font-weight: 600;
}

/* Help list */
.help-list {
  list-style: disc;
  padding-left: 20px;
  font-size: 0.9rem;
  color: #333;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.help-sublist {
  list-style: circle;
  padding-left: 20px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Exclusive pool */
.exclusive-empty {
  font-size: 0.9rem;
  color: #666;
}

.exclusive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.exclusive-card {
  position: relative;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.exclusive-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.badge--owned {
  background: #dcfce7;
  color: #15803d;
}

.badge--unowned {
  background: #f3f4f6;
  color: #374151;
}

.exclusive-img {
  width: 100%;
  height: 120px;
  object-fit: contain;
  margin-bottom: 8px;
}

.exclusive-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #1a1a2e;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Spin error toast */
.ww-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  z-index: 9999;
  pointer-events: none;
  white-space: pre-wrap;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.ww-toast.error   { background: #dc2626; color: #fff; }
.ww-toast.success { background: #16a34a; color: #fff; }

.ww-toast-fade-enter-active,
.ww-toast-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.ww-toast-fade-enter-from,
.ww-toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

@media (max-width: 768px) {
  .wheel-img {
    width: 90%;
  }
}
</style>
