<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <h1 class="text-2xl font-semibold mb-4">Create New Claim Code</h1>
      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- Code -->
        <div>
          <label class="block font-medium mb-1">Code</label>
          <input
            v-model="code"
            type="text"
            required
            class="w-full border rounded p-2"
            placeholder="e.g. SPRING2025"
          />
        </div>

        <!-- Max Claims -->
        <div>
          <label class="block font-medium mb-1">Max Claims</label>
          <input
            v-model.number="maxClaims"
            type="number"
            min="1"
            required
            class="w-full border rounded p-2"
          />
        </div>

        <!-- Expires At -->
        <div>
          <label class="block font-medium mb-1">Expires At</label>
          <input
            v-model="expiresAt"
            type="datetime-local"
            class="w-full border rounded p-2"
          />
          <p class="text-sm text-gray-500">
            Leave blank for no expiration
          </p>
        </div>

        <!-- Points Reward -->
        <div>
          <label class="block font-medium mb-1">Points Reward</label>
          <input
            v-model.number="points"
            type="number"
            min="0"
            class="w-full border rounded p-2 bg-gray-100"
          />
        </div>

        <!-- cToon Rewards -->
        <div>
          <label class="block font-medium mb-1">cToon Rewards</label>
          <datalist id="ctoont-list">
            <option
              v-for="ct in ctoonOptions"
              :key="ct.id"
              :value="ct.name"
            />
          </datalist>
          <div
            v-for="(rc, idx) in ctoonRewards"
            :key="idx"
            class="flex items-center space-x-2 mb-2"
          >
            <input
              v-model="rc.ctoonName"
              list="ctoont-list"
              type="text"
              required
              class="flex-1 border rounded p-2"
              placeholder="Type or select cToon name"
            />
            <input
              v-model.number="rc.quantity"
              type="number"
              min="1"
              class="w-20 border rounded p-2"
              placeholder="Qty"
            />
            <button
              type="button"
              @click="removeCtoonReward(idx)"
              class="text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
          <button
            type="button"
            @click="addCtoonReward"
            class="text-blue-600 hover:underline text-sm"
          >
            + Add another cToon
          </button>
        </div>

        <!-- Submit & Errors -->
        <div class="pt-4 border-t">
          <button
            type="submit"
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Save Code
          </button>
          <p v-if="error" class="mt-2 text-red-600">{{ error }}</p>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin']
})

const router = useRouter()

// form state
const code = ref('')
const maxClaims = ref(1)
const expiresAt = ref('')        // datetime-local string, optional
const points = ref(0)
const ctoonRewards = ref([
  { ctoonName: '', quantity: 1 }
])
const error = ref('')

// list of all cToons from the DB
const ctoonOptions = ref([])

onMounted(async () => {
  try {
    const res = await fetch('/api/admin/list-ctoons', { credentials: 'include' })
    if (res.ok) {
      ctoonOptions.value = await res.json()  // expected [{ id, name }]
    }
  } catch (e) {
    console.error('Failed to load cToons', e)
  }
})

// add/remove cToon reward entries
function addCtoonReward() {
  ctoonRewards.value.push({ ctoonName: '', quantity: 1 })
}
function removeCtoonReward(index) {
  ctoonRewards.value.splice(index, 1)
}

// form submission
async function submitForm() {
  error.value = ''

  // basic validation
  if (!code.value.trim()) {
    error.value = 'Code is required.'
    return
  }
  if (maxClaims.value < 1) {
    error.value = 'Max Claims must be at least 1.'
    return
  }
  let expiresIso = null
  if (expiresAt.value) {
    const dt = new Date(expiresAt.value)
    if (isNaN(dt.getTime())) {
      error.value = 'Invalid expiration date.'
      return
    }
    if (dt <= new Date()) {
      error.value = 'Expiration must be in the future.'
      return
    }
    expiresIso = dt.toISOString()
  }

  // prepare ctoon array, looking up IDs by name
  const validCtoons = []
  for (const r of ctoonRewards.value) {
    const name = r.ctoonName.trim()
    if (!name || r.quantity < 1) continue
    const match = ctoonOptions.value.find(ct => ct.name === name)
    if (!match) {
      error.value = `Unrecognized cToon: “${name}”`
      return
    }
    validCtoons.push({
      ctoonId: match.id,
      quantity: r.quantity
    })
  }

  // build payload
  const payload = {
    code: code.value.trim(),
    maxClaims: maxClaims.value,
    expiresAt: expiresIso,
    rewards: [
      {
        points: points.value,
        ctoons: validCtoons
      }
    ]
  }

  try {
    const res = await fetch('/api/admin/codes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || 'Failed to create code')
    }
    router.push('/admin/codes')
  } catch (e) {
    console.error(e)
    error.value = e.message
  }
}
</script>

<style scoped>
.max-w-2xl {
  max-width: 640px;
}
</style>
