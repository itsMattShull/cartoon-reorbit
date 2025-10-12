<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <div class="relative min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <!-- Balloons -->
      <div v-if="showBalloons" class="balloons-container">
        <span
          v-for="b in balloons"
          :key="b.id"
          class="balloon"
          :style="{ left: b.left, animationDelay: b.delay }"
        >
          🎈
        </span>
      </div>

      <div class="w-full max-w-md bg-white rounded-lg shadow p-6">
        <h1 class="text-2xl font-semibold mb-4">Redeem Code</h1>
        <form @submit.prevent="submit">
          <label for="code" class="block text-sm font-medium text-gray-700">
            Enter your code
          </label>
          <input
            id="code"
            v-model="code"
            type="text"
            required
            class="mt-1 block w-full border rounded p-2"
            placeholder="e.g. SPRING2025"
          />
          <button
            type="submit"
            class="mt-4 w-full bg-blue-600 text-white rounded p-2 hover:bg-blue-700"
          >
            Redeem
          </button>
        </form>

        <p v-if="error" class="mt-2 text-red-600">{{ error }}</p>

        <!-- Success -->
        <div v-if="success" class="mt-6">
          <p class="font-medium text-green-800 mb-3">🎉 Success! You’ve been awarded:</p>

          <div v-if="rewards.points" class="mb-4 bg-green-100 border border-green-300 rounded p-3">
            {{ rewards.points.toLocaleString() }} points
          </div>

          <!-- cToon cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              v-for="item in rewards.ctoons"
              :key="item.ctoonId + '-' + item.mintNumber"
              class="relative bg-white rounded-lg shadow p-4 flex flex-col items-center"
            >
              <span
                class="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded"
              >
                {{ item.quantity || 1 }}×
              </span>

              <h2 class="text-base font-semibold mb-2 mt-4 text-center break-words">
                {{ item.name }}
              </h2>

              <div class="flex-grow flex items-center justify-center w-full mb-3">
                <img :src="item.assetPath" class="max-w-full h-28 object-contain" />
              </div>

              <div class="mt-auto text-xs text-center text-gray-700">
                <p class="capitalize">
                  {{ item.rarity || '—' }}<span v-if="item.set"> • {{ item.set }}</span>
                </p>
                <p class="text-gray-500">
                  Mint #{{ item.mintNumber }}<span v-if="item.isFirstEdition"> • 1st Ed</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Background unlocks -->
          <div v-if="rewards.backgrounds?.length" class="mt-6">
            <h3 class="font-medium mb-2">Backgrounds</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div v-for="bg in rewards.backgrounds" :key="bg.id" class="flex items-center gap-3 bg-white rounded-lg shadow p-3">
                <img v-if="bg.imagePath" :src="bg.imagePath" class="w-16 h-10 object-cover rounded border" />
                <div class="text-sm">
                  <div class="font-semibold">{{ bg.label || 'Untitled' }}</div>
                  <div class="text-gray-500">Unlocked</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ClientOnly>
          <div v-html="rawHTML"></div>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth'],
  layout: 'default'
})

const rawHTML = '<!-- My special production comment for this page -->'

const code = ref('')
const error = ref('')
const success = ref(false)
const rewards = ref({
  points: 0,
  ctoons: [], // Array<{ id, name, quantity, mintNumber, isFirstEdition }>
  backgrounds: []
})

// balloon state
const showBalloons = ref(false)
const balloons = ref([])

async function submit() {
  error.value = ''
  success.value = false
  rewards.value = { points: 0, ctoons: [] }

  try {
    const res = await fetch('/api/redeem', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.value.trim() })
    })
    const payload = await res.json()
    if (!res.ok) {
      error.value = payload.message || 'Invalid or expired code.'
      return
    }

    // assign rewards
    rewards.value.points = payload.points ?? 0
    rewards.value.ctoons = payload.ctoons ?? []
    rewards.value.backgrounds = payload.backgrounds ?? []
    success.value = true
    code.value = ''

    // show balloons
    balloons.value = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 90 + '%',
      delay: (Math.random() * 1.5) + 's'
    }))
    showBalloons.value = true
    setTimeout(() => {
      showBalloons.value = false
    }, 5000)

  } catch (e) {
    console.error(e)
    error.value = e.message || 'An unexpected error occurred.'
  }
}
</script>

<style scoped>
.balloons-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.balloon {
  position: absolute;
  bottom: -2rem;
  font-size: 2rem;
  animation: rise 4s ease-in forwards;
}

@keyframes rise {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-120vh) scale(1.2);
    opacity: 0;
  }
}
</style>
