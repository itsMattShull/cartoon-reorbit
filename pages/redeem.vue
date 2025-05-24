<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <div class="relative min-h-screen flex items-center justify-center bg-gray-50 p-4 mt-16">
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

        <div
          v-if="success"
          class="mt-4 p-4 bg-green-100 border border-green-300 rounded"
        >
          <p class="font-medium text-green-800">🎉 Success! You’ve been awarded:</p>
          <ul class="mt-2 list-disc list-inside space-y-1">
            <li v-if="rewards.points">
              {{ rewards.points.toLocaleString() }} points
            </li>
            <li
              v-for="item in rewards.ctoons"
              :key="item.id + '-' + item.mintNumber"
              class="flex items-center space-x-2"
            >
              <span class="font-medium">{{ item.quantity }}×</span>
              <span>{{ item.name }}
                <small class="text-gray-500">
                  (#{{ item.mintNumber }}{{ item.isFirstEdition ? ' • 1st Ed' : '' }})
                </small>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({
  middleware: ['auth'],
  layout: 'default'
})

const code = ref('')
const error = ref('')
const success = ref(false)
const rewards = ref({
  points: 0,
  ctoons: [] // Array<{ id, name, quantity, mintNumber, isFirstEdition }>
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
