<template>
  <div class="flex flex-col h-screen">
    <Nav />

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col items-center overflow-hidden relative">
      <!-- Controls: Spin Button & Points -->
      <div class="mt-8 z-20">
        <button
          class="px-6 py-3 bg-indigo-600 text-white font-semibold rounded disabled:opacity-50 mt-16"
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

        <div class="mt-2 text-lg font-semibold text-gray-800 text-center">
          Your Points: {{ userPoints }}
        </div>
      </div>

      <!-- Wheel Container: only top half visible -->
      <div class="absolute -bottom-24 w-full overflow-hidden h-[70%]">
        <img
          ref="wheel"
          src="/images/wheel.svg"
          class="w-full h-auto"
          :style="{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning
              ? 'transform 4s cubic-bezier(0.33, 1, 0.68, 1)'
              : 'none'
          }"
        />
        <!-- Pointer Overlay at top-center -->
        <div class="absolute top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
          <img src="/images/pointer.svg" alt="Pointer" class="w-8 h-auto" />
        </div>
      </div>

      <!-- Result Modal -->
      <div
        v-if="showResultModal"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      >
        <div class="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center">
          <h2 class="text-2xl font-bold mb-4">
            <template v-if="spinResult.type === 'nothing'">
              You got nothing 😢
            </template>
            <template v-else-if="spinResult.type === 'points'">
              <span v-if="spinResult.amount < spinCost">
                Small Prize: +{{ spinResult.amount }} pts! 🎉
              </span>
              <span v-else>
                You won {{ spinResult.amount }} pts! 🏆
              </span>
            </template>
            <template v-else>
              You won a cToon! 🎉
            </template>
          </h2>

          <div v-if="spinResult.ctoon" class="mb-4">
            <img
              :src="spinResult.ctoon.assetPath"
              :alt="spinResult.ctoon.name"
              class="w-24 h-24 mx-auto mb-2"
            />
            <p class="font-semibold">{{ spinResult.ctoon.name }}</p>
          </div>

          <button
            class="mt-6 px-4 py-2 bg-indigo-600 text-white rounded"
            @click="closeModal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Nav from '@/components/Nav.vue'
import { useAuth } from '@/composables/useAuth'

const sliceCount  = 6
const sliceAngle  = 360 / sliceCount
const startOffset = -90  // slice 0 starts at top (-90°)

const { user, fetchSelf } = useAuth()

// dynamic spinCost from server
const spinCost = ref(null)
const spinsLeft = ref(0)
const nextReset = ref(null)
const countdown = ref('')
let countdownTimer = null

function updateCountdown() {
  if (!nextReset.value) {
    countdown.value = ''
    return
  }
  const diff = nextReset.value.getTime() - Date.now()
  if (diff <= 0) {
    // reset available
    countdown.value = ''
    return
  }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  countdown.value = [h, m, s].map(n => String(n).padStart(2,'0')).join(':')
}

async function fetchStatus() {
  const { spinsLeft: sl, nextReset: nr, spinCost: cost } =
    await $fetch('/api/game/winwheel/status')
  spinsLeft.value = sl
  nextReset.value = new Date(nr)
  spinCost.value  = cost
  updateCountdown()
}

onMounted(async () => {
  await fetchSelf()
  await fetchStatus()
  countdownTimer = setInterval(updateCountdown, 1000)
})
onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const userPoints      = computed(() => user.value?.points || 0)
const rotation        = ref(0)
const isSpinning      = ref(false)
const showResultModal = ref(false)
const spinResult      = ref({ type: '', amount: 0, ctoon: null })

const canSpin = computed(() =>
  spinCost.value !== null &&
  !isSpinning.value &&
  userPoints.value >= spinCost.value &&
  spinsLeft.value > 0
)

async function spinWheel() {
  if (!canSpin.value) return

  // optimistic UI and decrement
  user.value.points -= spinCost.value
  spinsLeft.value--
  isSpinning.value = true

  try {
    const { result, points, sliceIndex, ctoon } = await $fetch(
      '/api/game/winwheel/spin',
      { method: 'POST' }
    )
    spinResult.value = {
      type: result,
      amount: points || 0,
      ctoon: ctoon || null
    }

    // wheel animation
    const fullTurns = 5
    const wedgeMid = startOffset + sliceAngle/2 + sliceIndex*sliceAngle
    rotation.value = fullTurns*360 - wedgeMid

    setTimeout(async () => {
      await fetchSelf()
      await fetchStatus()
      showResultModal.value = true
    }, 4000)

  } catch (err) {
    console.error(err)
    alert(err.statusMessage || 'Spin failed — please try again.')
    // rollback
    user.value.points += spinCost.value
    spinsLeft.value++
    isSpinning.value = false
  }
}

function closeModal() {
  showResultModal.value = false
  rotation.value     = 0
  isSpinning.value   = false
}
</script>

<style scoped>
/* all layout and sizing via Tailwind CSS */
</style>
