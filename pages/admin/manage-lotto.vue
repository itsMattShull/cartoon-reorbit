<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Manage Lotto</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <p class="text-sm text-gray-600 mb-4">View and update Lotto configuration values.</p>

      <div class="grid grid-cols-1 gap-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">Base Odds</label>
            <input type="number" step="0.01" class="input" v-model.number="baseOdds" />
            <p class="text-xs text-gray-500 mt-1">Default: 1.00</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700">Increment Rate</label>
            <input type="number" step="0.001" class="input" v-model.number="incrementRate" />
            <p class="text-xs text-gray-500 mt-1">Default: 0.02</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700">Count Per Day</label>
            <input type="number" class="input" v-model.number="countPerDay" />
            <p class="text-xs text-gray-500 mt-1">Default: 5</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700">Cost</label>
            <input type="number" class="input" v-model.number="cost" />
            <p class="text-xs text-gray-500 mt-1">Default: 50</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700">Points Awarded on Win</label>
            <input type="number" class="input" v-model.number="lottoPointsWinnings" />
            <p class="text-xs text-gray-500 mt-1">Default: 5000</p>
          </div>
        </div>

        <!-- cToon Prize Pool -->
        <div class="col-span-2 mt-6">
          <h2 class="text-xl font-semibold mb-2">cToon Prize Pool</h2>
          <p class="text-sm text-gray-600 mb-4">Search for cToons to add to the lottery prize pool. When a user wins, they will receive points AND one cToon randomly selected from this pool.</p>

          <!-- Search Input -->
          <div class="relative">
            <input
              type="text"
              v-model="ctoonSearchTerm"
              placeholder="Search by name, rarity, or set..."
              class="input w-full"
              @focus="searchFocused = true"
              @blur="searchFocused = false"
            />
            <!-- Search Results Dropdown -->
            <ul v-if="ctoonSearchTerm && searchFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
              <li v-if="searchingCtoons" class="px-3 py-2 text-gray-500">Searching...</li>
              <li v-else-if="!ctoonSearchResults.length" class="px-3 py-2 text-gray-500">No results found.</li>
              <li
                v-for="ctoon in ctoonSearchResults"
                :key="ctoon.id"
                class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
                @mousedown.prevent="addCtoonToPool(ctoon)"
              >
                <img :src="ctoon.assetPath" class="h-10 w-auto rounded" />
                <div>
                  <p class="font-medium">{{ ctoon.name }}</p>
                  <p class="text-xs text-gray-500">{{ ctoon.rarity }} • {{ ctoon.set }}</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Selected Pool -->
        <div class="col-span-2 mt-2 space-y-2">
          <div v-for="ctoon in ctoonPool" :key="ctoon.id" class="flex items-center justify-between bg-gray-50 p-2 rounded">
            <div class="flex items-center gap-3">
              <img :src="ctoon.assetPath" class="h-10 w-auto rounded" />
              <div>
                <p class="font-medium">{{ ctoon.name }}</p>
                <p class="text-xs" :class="ctoon.inCmart ? 'text-green-600' : 'text-blue-600'">
                  <span v-if="ctoon.inCmart">In cMart</span>
                  <span v-else>Not in cMart</span>
                  <span v-if="ctoon.quantity !== null"> • {{ ctoon.quantity - ctoon.totalMinted }} remaining</span>
                </p>
              </div>
            </div>
            <button @click="removeCtoonFromPool(ctoon.id)" class="text-red-500 hover:text-red-700 text-sm">Remove</button>
          </div>
        </div>
        <div class="pt-2">
          <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Apply' }}</button>
        </div>

        <div v-if="toast" :class="['rounded px-3 py-2', toast.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700']">
          {{ toast.msg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const baseOdds = ref(1.0)
const incrementRate = ref(0.02)
const countPerDay = ref(5)
const cost = ref(50)
const lottoPointsWinnings = ref(5000)
const saving = ref(false)
const toast = ref(null)
const ctoonPool = ref([])

const ctoonSearchTerm = ref('')
const ctoonSearchResults = ref([])
const searchingCtoons = ref(false)
const searchFocused = ref(false)

async function load() {
  try {
    const res = await $fetch('/api/admin/lotto-settings')
    baseOdds.value = Number(res?.baseOdds ?? 1.0)
    incrementRate.value = Number(res?.incrementRate ?? 0.02)
    countPerDay.value = Number(res?.countPerDay ?? 5)
    cost.value = Number(res?.cost ?? 50)
    lottoPointsWinnings.value = Number(res?.lottoPointsWinnings ?? 5000)
    ctoonPool.value = res?.ctoonPool || []
  } catch (e) {
    console.error('Failed to load lotto settings', e)
  }
}

async function save() {
  saving.value = true; toast.value = null
  try {
    await $fetch('/api/admin/lotto-settings', {
      method: 'POST',
      body: {
        baseOdds: Number(baseOdds.value),
        incrementRate: Number(incrementRate.value),
        countPerDay: Number(countPerDay.value),
        cost: Number(cost.value),
        lottoPointsWinnings: Number(lottoPointsWinnings.value),
        ctoonPoolIds: ctoonPool.value.map(c => c.id)
      }
    })
    toast.value = { type: 'ok', msg: 'Lotto settings saved.' }
  } catch (e) {
    console.error(e)
    toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false
    setTimeout(() => { toast.value = null }, 2500)
  }
}

let searchDebounceTimer = null
watch(ctoonSearchTerm, (newVal) => {
  clearTimeout(searchDebounceTimer)
  if (newVal.trim().length < 2) {
    ctoonSearchResults.value = []
    return
  }
  searchingCtoons.value = true
  searchDebounceTimer = setTimeout(async () => {
    try {
      const results = await $fetch(`/api/admin/search-ctoons?q=${encodeURIComponent(newVal.trim())}`)
      // Filter out ctoons already in the pool
      const poolIds = new Set(ctoonPool.value.map(c => c.id))
      ctoonSearchResults.value = results.filter(r => !poolIds.has(r.id))
    } catch (e) {
      console.error('cToon search failed', e)
      ctoonSearchResults.value = []
    } finally {
      searchingCtoons.value = false
    }
  }, 300)
})

function addCtoonToPool(ctoon) {
  if (!ctoonPool.value.some(c => c.id === ctoon.id)) {
    ctoonPool.value.push(ctoon)
  }
  ctoonSearchTerm.value = ''
  ctoonSearchResults.value = []
}

function removeCtoonFromPool(ctoonId) {
  ctoonPool.value = ctoonPool.value.filter(c => c.id !== ctoonId)
}

onMounted(load)
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none; background-color: white; }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
</style>
