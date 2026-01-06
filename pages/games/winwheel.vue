<template>
  <div class="flex flex-col h-screen">
    <Nav />

    <!-- Jingle audio -->
    <audio
      v-if="winWheelSoundPath"
      ref="spinAudio"
      :src="winWheelSoundPath"
      preload="auto"
    ></audio>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col items-center overflow-hidden relative">
      <!-- Skeleton state -->
      <template v-if="loading">
        <!-- Controls skeleton (same vertical placement as real content) -->
        <div class="mt-8 z-20 text-center">
          <div class="mt-24 flex flex-col items-center gap-4 animate-pulse">
            <!-- Button -->
            <div class="w-40 h-11 rounded bg-gray-200"></div>

            <!-- Links -->
            <div class="mt-1 text-sm flex flex-col items-center justify-center gap-3">
              <div class="w-40 h-4 rounded bg-gray-200"></div>
              <div class="w-44 h-4 rounded bg-gray-200"></div>
            </div>
          </div>
        </div>

        <!-- Wheel skeleton (same container as real wheel) -->
        <div class="absolute -bottom-24 w-full overflow-hidden h-[70%]">
          <div class="w-full flex justify-center">
            <div class="animate-pulse w-[70%] max-w-md aspect-square bg-gray-200 rounded-full"></div>
          </div>
          <!-- Pointer overlay placeholder -->
          <div
            class="absolute left-1/2 transform -translate-x-1/2 pointer-events-none top-2 md:top-8"
          >
            <div class="w-8 h-5 bg-gray-300 rounded-md animate-pulse"></div>
          </div>
        </div>
      </template>

      <!-- Real content -->
      <template v-else>
        <!-- Controls: Spin Button & Points -->
        <div class="mt-8 z-20 text-center">
          <button
            class="px-6 py-3 bg-indigo-600 text-white font-semibold rounded disabled:opacity-50 mt-24"
            @click="spinWheel"
            :disabled="!canSpin"
          >
            <template v-if="spinCost === null">
              Loading…
            </template>
            <template v-else-if="spinsLeft === 0">
              Next spin in {{ countdown }}
            </template>
            <template v-else>
              Spin ({{ spinCost }} pts)
            </template>
          </button>

          <div class="mt-1 text-sm flex flex-col items-center justify-center gap-4">
            <p
              class="text-gray-500 underline cursor-pointer"
              @click="showHelpModal = true"
            >
              How does it work?
            </p>
            <p
              class="text-indigo-700 underline cursor-pointer"
              @click="showExclusiveModal = true"
            >
              View Exclusive cToons
            </p>
          </div>
        </div>

        <!-- Wheel Container: only top half visible -->
        <div class="absolute -bottom-24 w-full overflow-hidden h-[70%]">
          <img
            ref="wheel"
            :src="wheelSrc"
            class="w-full h-auto"
            :style="{
              transform: `rotate(${rotation}deg)`,
              transition: spinTransition
            }"
            alt="Win Wheel"
          />
          <!-- Pointer Overlay at top-center -->
          <div
            class="absolute left-1/2 transform -translate-x-1/2 pointer-events-none top-2 md:top-8"
          >
            <img src="/images/pointer.svg" alt="Pointer" class="w-8 h-auto" />
          </div>
        </div>

        <!-- Result Modal -->
        <div
          v-if="showResultModal"
          class="fixed inset-0 bg-black/60 z-50 p-4 flex items-center justify-center"
        >
          <div class="bg-white rounded-lg shadow-lg w-full max-w-sm flex flex-col overflow-hidden max-h-[90svh] sm:max-h-[80vh]">
            <!-- Header -->
            <div class="shrink-0 p-6 border-b">
              <h2 class="text-2xl font-bold">
                <template v-if="spinResult.type === 'nothing'">You got nothing 😢</template>
                <template v-else-if="spinResult.type === 'points'">
                  <span v-if="spinResult.amount < spinCost">Small Prize: +{{ spinResult.amount }} pts! 🎉</span>
                  <span v-else>You won {{ spinResult.amount }} pts! 🏆</span>
                </template>
                <template v-else>You won a cToon! 🎉</template>
              </h2>
            </div>
  
            <!-- Scrollable body -->
            <div class="flex-1 overflow-y-auto p-6">
              <template v-if="spinResult.type === 'nothing'">
                <img src="/images/nothing1225.gif" alt="Nothing" class="max-w-full h-auto mx-auto mb-4" />
              </template>
            <div v-if="spinResult.ctoon" class="text-center">
                <CtoonAsset
                  :src="spinResult.ctoon.assetPath"
                  :alt="spinResult.ctoon.name"
                  :name="spinResult.ctoon.name"
                  :ctoon-id="spinResult.ctoon.id"
                  image-class="w-24 h-24 mx-auto mb-2"
                />
                <p class="font-semibold">{{ spinResult.ctoon.name }}</p>
              </div>
            </div>

            <!-- Footer -->
            <div class="shrink-0 p-4 border-t text-right">
              <button class="px-4 py-2 bg-indigo-600 text-white rounded" @click="closeModal">Close</button>
            </div>
          </div>
        </div>

        <!-- Help Modal -->
        <div
          v-if="showHelpModal"
          class="fixed inset-0 bg-black/60 z-50 p-4 flex items-center justify-center"
        >
          <div class="bg-white rounded-lg shadow-lg w-full max-w-md flex flex-col overflow-hidden max-h-[90svh] sm:max-h-[80vh]">
            <!-- Header -->
            <div class="shrink-0 p-6 border-b">
              <h2 class="text-xl font-bold">How the Win Wheel Works</h2>
            </div>

            <!-- Scrollable body -->
            <div class="flex-1 overflow-y-auto p-6">
              <ul class="list-disc list-inside space-y-2 text-sm text-gray-700">
                <li>Each spin costs <strong>{{ spinCost }} points</strong>.</li>
                <li>You can spin up to <strong>{{ maxDailySpins }} times</strong> per day (resets at 8&nbsp;AM CST).</li>
                <li>Possible outcomes:
                  <ul class="list-circle list-inside ml-4">
                    <li><strong>Nothing</strong>: no reward.</li>
                    <li><strong>Points</strong>: win {{ pointsWon }} points back.</li>
                    <li><strong>Least Desirable cToon</strong>: we pick a common cToon with the fewest mints.</li>
                    <li><strong>Exclusive cToon</strong>: a random exclusive cToon</li>
                  </ul>
                </li>
              </ul>
            </div>

            <!-- Footer -->
            <div class="shrink-0 p-4 border-t text-right">
              <button class="px-4 py-2 bg-indigo-600 text-white rounded" @click="showHelpModal = false">Got it!</button>
            </div>
          </div>
        </div>

        <!-- Exclusive Pool Modal -->
        <div
          v-if="showExclusiveModal"
          class="fixed inset-0 bg-black/60 z-50 p-4 flex items-center justify-center"
        >
          <div class="bg-white rounded-lg shadow-lg w-full max-w-3xl flex flex-col overflow-hidden max-h-[90svh] sm:max-h-[80vh]">
            <!-- Header -->
            <div class="shrink-0 p-4 border-b flex items-center justify-between">
              <h2 class="text-xl font-bold">Exclusive cToons</h2>
              <button class="text-gray-600 hover:text-gray-900" @click="showExclusiveModal = false">✕</button>
            </div>

            <!-- Scrollable body -->
            <div class="flex-1 overflow-y-auto p-4">
              <div v-if="exclusivePool.length === 0" class="text-sm text-gray-600">
                No exclusive cToons configured.
              </div>

              <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div
                  v-for="item in exclusivePool"
                  :key="item.id"
                  class="relative border rounded-lg p-3 shadow-sm text-center"
                >
                  <!-- Badge -->
                  <span
                    class="absolute top-2 right-2 text-xs px-2 py-1 rounded-full"
                    :class="item.owned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'"
                  >
                    {{ item.owned ? 'Owned' : 'Unowned' }}
                  </span>

                  <CtoonAsset
                    :src="item.assetPath"
                    :alt="item.name"
                    :name="item.name"
                    :ctoon-id="item.id"
                    image-class="w-full h-40 object-contain mb-2"
                  />
                  <div class="text-sm font-semibold text-gray-800 text-center">{{ item.name }}</div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="shrink-0 p-4 border-t text-right">
              <button class="px-4 py-2 bg-indigo-600 text-white rounded" @click="showExclusiveModal = false">Close</button>
            </div>
          </div>
        </div>
      </template>
        <!-- Scavenger Hunt Modal (only after result shown and then closed) -->
        <ScavengerHuntModal v-if="hasShownResult && !showResultModal && scavenger.isOpen && scavenger.sessionId" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Nav from '@/components/Nav.vue'
import CtoonAsset from '@/components/CtoonAsset.vue'
import { useAuth } from '@/composables/useAuth'
import ScavengerHuntModal from '@/components/ScavengerHuntModal.vue'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

definePageMeta({
  title: 'WinWheel',
  middleware: 'auth',
  layout: 'default'
})

const sliceCount   = 6
const sliceAngle   = 360 / sliceCount
const startOffset  = -90
const spinDurationMs = 4000

const { user, fetchSelf } = useAuth()

const loading = ref(true)

// audio ref for jingle
const spinAudio = ref(null)
let spinSoundTimer = null
// Web Audio buffer for rapid retrigger (Safari-friendly)
let audioCtx = null
let spinBuffer = null
let spinBufferPromise = null
const activeSpinSources = new Set()

// reactive state
const spinCost         = ref(null)
const spinsLeft        = ref(0)
const nextReset        = ref(null)
const countdown        = ref('')
const rotation         = ref(0)
const isSpinning       = ref(false)
const showResultModal  = ref(false)
const showHelpModal    = ref(false)
const showExclusiveModal = ref(false)
const spinResult       = ref({ type: '', amount: 0, ctoon: null })
let countdownTimer     = null
const maxDailySpins    = ref(0)
const pointsWon        = ref(0)
const hasShownResult   = ref(false)

// scavenger
const scavenger = useScavengerHunt()

// wheel image path
const winWheelImagePath = ref('')
const winWheelSoundPath = ref('')
const winWheelSoundMode = ref('repeat')

// exclusive pool
const exclusivePool = ref([])

// computed img src with fallback
const wheelSrc = computed(() => winWheelImagePath.value || '/images/wheel.svg')
const spinTransition = computed(() =>
  isSpinning.value
    ? `transform ${spinDurationMs / 1000}s cubic-bezier(0.33, 1, 0.68, 1)`
    : 'none'
)

// fetch status
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

  const prevSoundPath     = winWheelSoundPath.value
  spinsLeft.value         = sl
  nextReset.value         = new Date(nr)
  spinCost.value          = cost
  maxDailySpins.value     = maxSpins
  pointsWon.value         = pts
  winWheelImagePath.value = wheelPath || ''
  winWheelSoundPath.value = soundPath || ''
  if (winWheelSoundPath.value !== prevSoundPath) {
    spinBuffer = null
    spinBufferPromise = null
  }
  winWheelSoundMode.value = soundMode || 'repeat'
  exclusivePool.value     = Array.isArray(pool) ? pool : []
  updateCountdown()
}

function updateCountdown() {
  if (!nextReset.value) { countdown.value = ''; return }
  const diff = nextReset.value.getTime() - Date.now()
  if (diff <= 0) { countdown.value = ''; return }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  countdown.value = [h, m, s].map(n => String(n).padStart(2,'0')).join(':')
}

onMounted(async () => {
  // Clear any stale scavenger state on page entry
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

  // New spin: ensure we wait for this round's result modal first
  hasShownResult.value = false

  startSpinSound()

  // optimistic
  user.value.points -= spinCost.value
  spinsLeft.value--
  isSpinning.value = true

  try {
    const { result, points, sliceIndex, ctoon } = await $fetch(
      '/api/game/winwheel/spin', { method: 'POST' }
    )
    spinResult.value = { type: result, amount: points||0, ctoon: ctoon||null }

    // Consider Scavenger Hunt, but open after this modal closes
    await scavenger.maybeTrigger('winwheel_spin', { open: false })

    // animate
    const fullTurns = 5
    const wedgeMid  = startOffset + sliceAngle/2 + sliceIndex*sliceAngle
    rotation.value  = fullTurns*360 - wedgeMid

    setTimeout(async () => {
      stopSpinSound()
      await fetchSelf({ force: true })
      await fetchStatus()
      hasShownResult.value = true
      showResultModal.value = true
    }, spinDurationMs)
  } catch (err) {
    console.error(err)
    alert(err.statusMessage || 'Spin failed — please try again.')
    // rollback
    user.value.points += spinCost.value
    spinsLeft.value++
    isSpinning.value = false
    stopSpinSound()
  }
}

function closeModal() {
  showResultModal.value = false
  rotation.value       = 0
  isSpinning.value     = false
  // If a scavenger session is pending, open it now
  scavenger.openIfPending()
}

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
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
    .then(buf => {
      spinBuffer = buf
      return buf
    })
    .catch(err => {
      console.warn('Failed to load spin sound buffer', err)
      return null
    })
    .finally(() => {
      spinBufferPromise = null
    })
  return spinBufferPromise
}

function playSpinSoundBuffer() {
  if (!spinBuffer || !audioCtx) return false
  const src = audioCtx.createBufferSource()
  src.buffer = spinBuffer
  src.connect(audioCtx.destination)
  src.start(0)
  activeSpinSources.add(src)
  src.onended = () => activeSpinSources.delete(src)
  return true
}

function playSpinSoundOnce() {
  try {
    if (playSpinSoundBuffer()) return
    if (!spinAudio.value) return
    spinAudio.value.pause()
    spinAudio.value.currentTime = 0
    const playPromise = spinAudio.value.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(err => {
        console.warn('Spin audio play prevented by browser:', err)
      })
    }
  } catch (e) {
    console.warn('Unable to play spin audio', e)
  }
}

function startSpinSound() {
  if (!winWheelSoundPath.value) return
  stopSpinSound()
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
  if (spinSoundTimer) {
    clearTimeout(spinSoundTimer)
    spinSoundTimer = null
  }
  if (activeSpinSources.size > 0) {
    activeSpinSources.forEach(src => {
      try {
        src.stop(0)
      } catch {}
    })
    activeSpinSources.clear()
  }
  if (spinAudio.value) {
    spinAudio.value.pause()
    spinAudio.value.currentTime = 0
  }
}
</script>

<style scoped>
/* all layout and sizing via Tailwind CSS */
</style>
