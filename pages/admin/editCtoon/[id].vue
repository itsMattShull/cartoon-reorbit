<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow mt-16">
      <h1 class="text-2xl font-semibold mb-4">Edit cToon</h1>
      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- Image Display (no re-upload) -->
        <div>
          <label class="block mb-1 font-medium">Current Image</label>
          <img :src="assetPath" alt="cToon Image" class="h-32">
        </div>

        <!-- Type (readonly) -->
        <div>
          <label class="block mb-1 font-medium">Type</label>
          <input v-model="type" disabled class="w-full border rounded p-2 bg-gray-100" />
        </div>

        <!-- Name -->
        <div>
          <label class="block mb-1 font-medium">Name</label>
          <input v-model="name" required class="w-full border rounded p-2" />
        </div>

        <!-- Series -->
        <div>
          <label class="block mb-1 font-medium">Series</label>
          <input v-model="series" list="series-list" required class="w-full border rounded p-2" />
          <datalist id="series-list">
            <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
          </datalist>
        </div>

        <!-- Rarity -->
        <div>
          <label class="block mb-1 font-medium">Rarity</label>
          <select v-model="rarity" required class="w-full border rounded p-2">
            <option disabled value="">Select rarity</option>
            <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <!-- Price (readonly) -->
        <div>
          <label class="block mb-1 font-medium">Price</label>
          <input type="number" v-model.number="price" readonly class="w-full border rounded p-2 bg-gray-100" />
        </div>

        <!-- Release Date & Time (CDT) -->
        <div>
          <label class="block mb-1 font-medium">Release Date &amp; Time (CDT)</label>
          <input type="datetime-local" v-model="releaseDate" required class="w-full border rounded p-2" />
        </div>

        <!-- Per-User Limit -->
        <div>
          <label class="block mb-1 font-medium">Per-User Limit</label>
          <input v-model.number="perUserLimit" type="number" min="0" class="w-full border rounded p-2" />
        </div>

        <!-- Total Quantity -->
        <div>
          <label class="block mb-1 font-medium">Total Quantity in Store</label>
          <input v-model.number="quantity" type="number" min="0" class="w-full border rounded p-2" />
        </div>

        <!-- Initial Quantity -->
        <div>
          <label class="block mb-1 font-medium">Initial Quantity</label>
          <input v-model.number="initialQuantity" type="number" min="0" class="w-full border rounded p-2" />
        </div>

        <!-- In C-mart -->
        <div class="flex items-center">
          <input v-model="inCmart" type="checkbox" class="mr-2" :disabled="['Prize Only','Code Only','Auction Only'].includes(rarity)" />
          <span>In C-mart</span>
        </div>

        <!-- Set -->
        <div>
          <label class="block mb-1 font-medium">Set</label>
          <input v-model="setField" required class="w-full border rounded p-2" />
        </div>

        <!-- Characters -->
        <div>
          <label class="block mb-1 font-medium">Characters (comma-separated)</label>
          <textarea v-model="characters" rows="2" class="w-full border rounded p-2"></textarea>
        </div>

        <!-- Submit -->
        <div class="text-right">
          <button class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">Update cToon</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: ['auth', 'admin'],
      layout: 'default'
})

import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'

const route = useRoute()
const router = useRouter()

const id = route.params.id

const name = ref('')
const type = ref('')
const series = ref('')
const rarity = ref('')
const price = ref(0)
const releaseDate = ref('')
const perUserLimit = ref(null)
const quantity = ref(null)
const initialQuantity = ref(null)
const inCmart = ref(false)
const assetPath = ref('')
const setField = ref('')
const characters = ref('')
const seriesOptions = ref([])
const rarityOptions = ['Common','Uncommon','Rare','Very Rare','Crazy Rare','Prize Only','Code Only','Auction Only']

// ── HELPERS ─────────────────────────────────────────────────────────────────
// Turn a UTC ISO string into the "YYYY-MM-DDTHH:mm" string that
// <input type="datetime-local"> expects—rendered in America/Chicago.
function toDateTimeLocal(utcString) {
  const dt = new Date(utcString)
  // Swedish locale gives "YYYY-MM-DD HH:mm" in 24hr. Split & swap:
  const formatted = new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).format(dt)
  const [date, time] = formatted.split(' ')
  return `${date}T${time}`
}

// Take the naive "YYYY-MM-DDTHH:mm" (which we mean as America/Chicago)
// and turn it into a true UTC-ISO string:
function localToUtcIso(localDateTime) {
  const dt = new Date(localDateTime) // parsed in the browser’s local zone
  // Re-interpret that same clock-time in Chicago:
  const dtInZone = new Date(
    dt.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  )
  const offset = dtInZone.getTime() - dt.getTime()
  const utcMillis = dt.getTime() - offset
  return new Date(utcMillis).toISOString()
}
// ─────────────────────────────────────────────────────────────────────────────

onMounted(async () => {
  const res = await fetch(`/api/admin/ctoon/${id}`, { credentials: 'include' })
  const { ctoon } = await res.json()
  if (!ctoon) {
    alert('Failed to load cToon.')
    return
  }
  name.value = ctoon.name
  type.value = ctoon.type
  series.value = ctoon.series
  rarity.value = ctoon.rarity
  price.value = ctoon.price
  releaseDate.value     = toDateTimeLocal(ctoon.releaseDate)
  perUserLimit.value = ctoon.perUserLimit
  quantity.value = ctoon.quantity
  initialQuantity.value = ctoon.initialQuantity
  inCmart.value = ctoon.inCmart
  assetPath.value = ctoon.assetPath
  setField.value = ctoon.set
  characters.value = (ctoon.characters || []).join(', ')

  const seriesRes = await fetch('/api/admin/series', { credentials: 'include' })
  seriesOptions.value = await seriesRes.json()
})

watch(rarity, val => {
  const prices = { Common:100, Uncommon:200, Rare:400, 'Very Rare':750, 'Crazy Rare':1250 }
  price.value = prices[val] || 0
})

async function submitForm() {
  const utcRelease = localToUtcIso(releaseDate.value)

  await fetch(`/api/admin/ctoon/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.value,
      series: series.value,
      rarity: rarity.value,
      price: price.value,
      releaseDate: utcRelease,
      perUserLimit: perUserLimit.value,
      quantity: quantity.value,
      initialQuantity: initialQuantity.value,
      inCmart: inCmart.value,
      set: setField.value,
      characters: characters.value.split(',').map(c => c.trim())
    })
  })
  router.push('/admin/ctoons')
}

</script>