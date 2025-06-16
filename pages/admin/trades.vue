<template>
  <Nav />
  <div class="p-4 mt-16">
    <!-- Trades Table / Cards -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full bg-white rounded shadow">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-2">Users</th>
            <th class="px-4 py-2">Points Offered</th>
            <th class="px-4 py-2"># Offered</th>
            <th class="px-4 py-2"># Requested</th>
            <th class="px-4 py-2">Total Offered Value</th>
            <th class="px-4 py-2">Total Requested Value</th>
            <th class="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="trade in trades" :key="trade.id" class="border-t">
            <td class="px-4 py-2">
              <span class="font-medium">{{ trade.initiator.username }}</span>
              <span class="mx-2">→</span>
              <span class="font-medium">{{ trade.recipient.username }}</span>
            </td>
            <td class="px-4 py-2">{{ trade.pointsOffered }}</td>
            <td class="px-4 py-2">{{ trade.ctoonsOffered.length }}</td>
            <td class="px-4 py-2">{{ trade.ctoonsRequested.length }}</td>
            <td class="px-4 py-2">
              {{ trade.pointsOffered + computeTotalValue(trade.ctoonsOffered) }}
            </td>
            <td class="px-4 py-2">
              {{ computeTotalValue(trade.ctoonsRequested) }}
            </td>
            <td class="px-4 py-2">
              <button
                @click="openModal(trade)"
                class="bg-blue-500 text-white px-3 py-1 rounded"
              >
                View Trade
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards -->
    <div class="md:hidden grid grid-cols-1 gap-4">
      <div v-for="trade in trades" :key="trade.id" class="border rounded p-4 shadow">
        <div class="mb-2">
          <span class="font-medium">{{ trade.initiator.username }}</span>
          <span class="mx-2">→</span>
          <span class="font-medium">{{ trade.recipient.username }}</span>
        </div>
        <div class="text-sm space-y-1">
          <div><span class="font-medium">Points:</span> {{ trade.pointsOffered }}</div>
          <div><span class="font-medium">Offered:</span> {{ trade.ctoonsOffered.length }}</div>
          <div><span class="font-medium">Requested:</span> {{ trade.ctoonsRequested.length }}</div>
          <div><span class="font-medium">Total Offered Value:</span> {{ trade.pointsOffered + computeTotalValue(trade.ctoonsOffered) }}</div>
          <div><span class="font-medium">Total Requested Value:</span> {{ computeTotalValue(trade.ctoonsRequested) }}</div>
        </div>
        <button
          @click="openModal(trade)"
          class="mt-2 bg-blue-500 text-white px-3 py-1 rounded"
        >
          View Trade
        </button>
      </div>
    </div>

    <!-- Trade Details Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-start md:items-center justify-center py-4 overflow-auto mt-14"
    >
      <div class="bg-white rounded shadow-lg w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          @click="closeModal"
          class="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
        >×</button>

        <h2 class="text-xl font-semibold mb-6">Trade Details</h2>

        <!-- Initiator & Offers Section -->
        <div class="mb-6 p-4 border rounded">
          <h3 class="font-medium mb-2">Initiator &amp; Offers</h3>
          <div><span class="font-medium">Initiator:</span> {{ selectedTrade.initiator.username }}</div>
          <div class="mt-2"><span class="font-medium">Points Offered:</span> {{ selectedTrade.pointsOffered }}</div>
          <div class="mt-1"><span class="font-medium">cToon Value:</span> {{ computeTotalValue(selectedTrade.ctoonsOffered) }}</div>
          <div class="mt-1"><span class="font-medium">Total Offered Value:</span> {{ selectedTrade.pointsOffered + computeTotalValue(selectedTrade.ctoonsOffered) }}</div>
          <div class="font-medium mt-4">cToons Offered:</div>
          <div class="grid grid-cols-3 gap-4 mt-2">
            <div v-for="item in selectedTrade.ctoonsOffered" :key="item.id" class="text-center">
              <img :src="item.assetPath" alt class="max-w-[80px] h-auto object-contain rounded mx-auto" />
              <div class="mt-1 font-medium">{{ item.name }}</div>
              <div class="text-sm text-gray-600">{{ item.rarity }}</div>
            </div>
          </div>
        </div>

        <!-- Recipient & Requests Section -->
        <div class="p-4 border rounded">
          <div><span class="font-medium">Recipient:</span> {{ selectedTrade.recipient.username }}</div>
          <div class="font-medium mt-4">cToons Requested:</div>
          <div class="grid grid-cols-3 gap-4 mt-2">
            <div v-for="item in selectedTrade.ctoonsRequested" :key="item.id" class="text-center">
              <img :src="item.assetPath" alt class="max-w-[80px] h-auto object-contain rounded mx-auto" />
              <div class="mt-1 font-medium">{{ item.name }}</div>
              <div class="text-sm text-gray-600">{{ item.rarity }}</div>
            </div>
          </div>
          <div class="mt-4"><span class="font-medium">Total Requested Value:</span> {{ computeTotalValue(selectedTrade.ctoonsRequested) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAsyncData } from '#app'
import Nav from '@/components/Nav.vue'

// Rarity value mapping
const rarityValues = {
  Common: 100,
  Uncommon: 200,
  Rare: 400,
  'Very Rare': 750,
  'Crazy Rare': 1250
}

// Trades data
const { data: tradesData } = await useAsyncData('trades', () =>
  $fetch('/api/admin/trades')
)
const trades = ref(tradesData.value || [])

// Modal state
const showModal = ref(false)
const selectedTrade = ref(null)

function openModal(trade) {
  selectedTrade.value = trade
  showModal.value = true
}
function closeModal() {
  showModal.value = false
}

// Compute total value of an array of ctoon objects
function computeTotalValue(array) {
  return array.reduce((sum, item) => sum + (rarityValues[item.rarity] || 1250), 0)
}
</script>

<style scoped>
/* Add any additional styles here */
</style>
