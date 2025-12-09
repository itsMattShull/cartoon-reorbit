<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Global Settings</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
      <!-- Tabs -->
      <div class="border-b mb-6">
        <nav class="flex gap-4">
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Global Points' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Global Points'">Global Points</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Rarity Settings' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Rarity Settings'">Rarity Settings</button>
        </nav>
      </div>

      <!-- Global Points tab -->
      <section v-if="activeTab==='Global Points'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Configure global point awards. These values control daily login bonus, cZone visit points, and game cap.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Login Points</label>
            <input type="number" class="input" v-model.number="dailyLoginPoints" />
            <p class="text-xs text-gray-500 mt-1">Awarded once per 24h window (8pm CST reset).</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Login Points (New Users)</label>
            <input type="number" class="input" v-model.number="dailyNewUserPoints" />
            <p class="text-xs text-gray-500 mt-1">For accounts created within the last 7 days.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">cZone Visit Points</label>
            <input type="number" class="input" v-model.number="czoneVisitPoints" />
            <p class="text-xs text-gray-500 mt-1">Awarded per unique zone owner within the daily window.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Game Point Cap</label>
            <input type="number" class="input" v-model.number="dailyPointLimit" />
            <p class="text-xs text-gray-500 mt-1">Max points from games per 24h window.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Max cZone Visits Per Day</label>
            <input type="number" class="input" v-model.number="czoneVisitMaxPerDay" />
            <p class="text-xs text-gray-500 mt-1">Maximum unique cZones that award visit points per day.</p>
          </div>
        </div>
        <div>
          <button class="btn-primary" :disabled="savingGlobal" @click="saveGlobal">
            <span v-if="!savingGlobal">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Rarity Settings tab -->
      <section v-if="activeTab==='Rarity Settings'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Configure default values per rarity tier. These defaults prefill Add cToon and Bulk Upload forms.
        </p>
        <!-- Desktop table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-full border-separate border-spacing-y-1">
            <thead>
              <tr class="text-left text-sm text-gray-600">
                <th class="px-3 py-2">Rarity</th>
                <th class="px-3 py-2">Total Qty</th>
                <th class="px-3 py-2">Initial Qty</th>
                <th class="px-3 py-2">Per-User Limit</th>
                <th class="px-3 py-2">In cMart</th>
                <th class="px-3 py-2">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rarityOrder" :key="r" class="bg-gray-50">
                <td class="px-3 py-2 font-medium">{{ r }}</td>
                <td class="px-3 py-2"><input type="number" class="input" v-model.number="rarityDefaults[r].totalQuantity" /></td>
                <td class="px-3 py-2"><input type="number" class="input" v-model.number="rarityDefaults[r].initialQuantity" /></td>
                <td class="px-3 py-2"><input type="number" class="input" v-model.number="rarityDefaults[r].perUserLimit" /></td>
                <td class="px-3 py-2 text-center"><input type="checkbox" v-model="rarityDefaults[r].inCmart" /></td>
                <td class="px-3 py-2"><input type="number" class="input" v-model.number="rarityDefaults[r].price" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="space-y-3 sm:hidden">
          <div
            v-for="r in rarityOrder"
            :key="r"
            class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <div class="font-semibold text-gray-800 mb-2">{{ r }}</div>
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label class="block text-xs text-gray-600 mb-1">Total Qty</label>
                <input type="number" class="input" v-model.number="rarityDefaults[r].totalQuantity" />
              </div>
              <div>
                <label class="block text-xs text-gray-600 mb-1">Initial Qty</label>
                <input type="number" class="input" v-model.number="rarityDefaults[r].initialQuantity" />
              </div>
              <div>
                <label class="block text-xs text-gray-600 mb-1">Per-User Limit</label>
                <input type="number" class="input" v-model.number="rarityDefaults[r].perUserLimit" />
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="rarityDefaults[r].inCmart" :id="`inCmart-${r}`" />
                <label class="text-sm text-gray-700" :for="`inCmart-${r}`">In cMart</label>
              </div>
              <div>
                <label class="block text-xs text-gray-600 mb-1">Price</label>
                <input type="number" class="input" v-model.number="rarityDefaults[r].price" />
              </div>
            </div>
          </div>
        </div>
        <div>
          <button class="btn-primary" :disabled="savingRarity" @click="saveRarity">
            <span v-if="!savingRarity">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <div v-if="toast" :class="['fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded',
                                 toast.type==='error'?'bg-red-100 text-red-700':'bg-green-100 text-green-700']">
        {{ toast.msg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const activeTab = ref('Global Points')
const toast  = ref(null)
const savingGlobal = ref(false)
const savingRarity = ref(false)

// Global Points state
const dailyLoginPoints     = ref(500)
const dailyNewUserPoints   = ref(1000)
const czoneVisitPoints     = ref(20)
const dailyPointLimit      = ref(250)
const czoneVisitMaxPerDay  = ref(10)

async function loadGlobal() {
  try {
    const g = await $fetch('/api/admin/global-config')
    // fallbacks if fields missing (pre-migration)
    dailyLoginPoints.value     = Number(g?.dailyLoginPoints     ?? 500)
    dailyNewUserPoints.value   = Number(g?.dailyNewUserPoints   ?? 1000)
    czoneVisitPoints.value     = Number(g?.czoneVisitPoints     ?? 20)
    dailyPointLimit.value      = Number(g?.dailyPointLimit      ?? 250)
    czoneVisitMaxPerDay.value  = Number(g?.czoneVisitMaxPerDay  ?? 10)
  } catch (e) {
    console.error('Failed to load global config', e)
  }
}

async function saveGlobal() {
  savingGlobal.value = true; toast.value = null
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyLoginPoints:     Number(dailyLoginPoints.value),
        dailyNewUserPoints:   Number(dailyNewUserPoints.value),
        czoneVisitPoints:     Number(czoneVisitPoints.value),
        dailyPointLimit:      Number(dailyPointLimit.value),
        czoneVisitMaxPerDay:  Number(czoneVisitMaxPerDay.value)
      }
    })
    toast.value = { type: 'ok', msg: 'Global points saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingGlobal.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadGlobal)

// Rarity defaults
const rarityOrder = [
  'Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Auction Only', 'Prize Only', 'Code Only'
]
const rarityDefaults = ref({
  'Common':       { totalQuantity: 160, initialQuantity: 160, perUserLimit: 7, inCmart: true,  price: 100 },
  'Uncommon':     { totalQuantity: 120, initialQuantity: 120, perUserLimit: 5, inCmart: true,  price: 200 },
  'Rare':         { totalQuantity: 80,  initialQuantity: 80,  perUserLimit: 3, inCmart: true,  price: 400 },
  'Very Rare':    { totalQuantity: 60,  initialQuantity: 60,  perUserLimit: 2, inCmart: true,  price: 750 },
  'Crazy Rare':   { totalQuantity: 40,  initialQuantity: 40,  perUserLimit: 1, inCmart: true,  price: 1250 },
  'Auction Only': { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 },
  'Prize Only':   { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 },
  'Code Only':    { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 }
})

async function loadRarityDefaults() {
  try {
    const res = await $fetch('/api/admin/rarity-defaults')
    if (res?.defaults) rarityDefaults.value = res.defaults
  } catch (e) {
    console.error('Failed to load rarity defaults', e)
  }
}

async function saveRarity() {
  savingRarity.value = true; toast.value = null
  try {
    await $fetch('/api/admin/rarity-defaults', {
      method: 'POST',
      body: { defaults: rarityDefaults.value }
    })
    toast.value = { type: 'ok', msg: 'Rarity defaults saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingRarity.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadRarityDefaults)
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
</style>
