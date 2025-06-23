<template>
  <Nav />
  <div class="p-4 mt-16">
    <!-- Filter Dropdowns -->
    <div class="mb-4 flex flex-wrap items-center space-x-4">
      <!-- User Filter -->
      <div class="flex items-center">
        <label for="userFilter" class="mr-2 font-medium">User:</label>
        <select
          id="userFilter"
          v-model="selectedUser"
          class="border rounded px-2 py-1"
        >
          <option value="">All</option>
          <option
            v-for="user in users"
            :key="user"
            :value="user"
          >
            {{ user }}
          </option>
        </select>
      </div>

      <!-- Status Filter -->
      <div class="flex items-center">
        <label for="statusFilter" class="mr-2 font-medium">Status:</label>
        <select
          id="statusFilter"
          v-model="selectedStatus"
          class="border rounded px-2 py-1"
        >
          <option value="">All</option>
          <option
            v-for="status in statusOptions"
            :key="status"
            :value="status"
          >
            {{ status }}
          </option>
        </select>
      </div>
    </div>

    <!-- Trades Table / Cards -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full bg-white rounded shadow">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-2">Users</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Points Offered</th>
            <th class="px-4 py-2"># Offered</th>
            <th class="px-4 py-2"># Requested</th>
            <th class="px-4 py-2">Total Offered Value</th>
            <th class="px-4 py-2">Total Requested Value</th>
            <th class="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="trade in filteredTrades"
            :key="trade.id"
            class="border-t"
            :class="{
              'bg-yellow-100':
                computeTotalValue(trade.ctoonsOffered) <
                (trade.pointsOffered + computeTotalValue(trade.ctoonsRequested)) * 0.8
            }"
          >
            <td class="px-4 py-2 break-words">
              <span class="font-medium">{{ trade.initiator.username }}</span>
              <span class="mx-2">→</span>
              <span class="font-medium">{{ trade.recipient.username }}</span>
            </td>
            <td class="px-4 py-2">{{ trade.status }}</td>
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
      <div
        v-for="trade in filteredTrades"
        :key="trade.id"
        class="border rounded p-4 shadow break-words"
        :class="{
          'bg-yellow-100':
            computeTotalValue(trade.ctoonsOffered) <
            (trade.pointsOffered + computeTotalValue(trade.ctoonsRequested)) * 0.8
        }"
      >
        <div class="mb-2">
          <span class="font-medium">{{ trade.initiator.username }}</span>
          <span class="mx-2">→</span>
          <span class="font-medium">{{ trade.recipient.username }}</span>
        </div>
        <div class="mb-2 text-sm text-gray-500">
          <span class="font-medium">Status:</span> {{ trade.status }}
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
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-auto"
    >
      <div class="bg-white rounded shadow-lg w-full max-w-2xl relative max-h-[80vh]">
        <!-- Sticky Header -->
        <div class="sticky top-0 z-20 bg-white flex justify-between items-center p-4 border-b">
          <h2 class="text-xl font-semibold">Trade Details</h2>
          <button
            @click="closeModal"
            class="text-gray-500 hover:text-gray-800"
          >
            ×
          </button>
        </div>
        <!-- Scrollable Content -->
        <div class="p-6 overflow-y-auto" style="max-height: calc(80vh - 64px);">
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAsyncData } from '#app'
import Nav from '@/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

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

// Filter state
const selectedUser = ref('')
const selectedStatus = ref('')

// Compute unique users for filter
const users = computed(() => {
  const set = new Set()
  trades.value.forEach(t => {
    set.add(t.initiator.username)
    set.add(t.recipient.username)
  })
  return Array.from(set)
})

// Trade status options
const statusOptions = ['PENDING', 'ACCEPTED', 'REJECTED']

// Filtered trades
const filteredTrades = computed(() =>
  trades.value.filter(t => {
    if (selectedUser.value) {
      if (t.initiator.username !== selectedUser.value && t.recipient.username !== selectedUser.value) return false
    }
    if (selectedStatus.value && t.status !== selectedStatus.value) return false
    return true
  })
)

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
