<template>
  <Nav />

  <div class="p-4 mt-16">
    <!-- Filter Dropdowns -->
    <div class="mb-4 flex flex-wrap items-center space-x-4">
      <!-- Creator Filter -->
      <div class="flex items-center">
        <label for="creatorFilter" class="mr-2 font-medium">Creator:</label>
        <select
          id="creatorFilter"
          v-model="selectedCreator"
          class="border rounded px-2 py-1"
        >
          <option value="">All</option>
          <option
            v-for="creator in creators"
            :key="creator.id"
            :value="creator.username"
          >
            {{ creator.username }}
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

      <!-- Has Bidder Filter -->
      <div class="flex items-center">
        <label for="bidderFilter" class="mr-2 font-medium">Has Bidder:</label>
        <select
          id="bidderFilter"
          v-model="selectedHasBidder"
          class="border rounded px-2 py-1"
        >
          <option v-for="opt in hasBidderOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Desktop Table -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full bg-white rounded shadow">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-2">cToon</th>
            <th class="px-4 py-2">Creator</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Created</th>
            <th class="px-4 py-2">Duration</th>
            <th class="px-4 py-2">Hours Left</th>
            <th class="px-4 py-2">Highest Bidder</th>
            <th class="px-4 py-2">Highest Bid</th>
            <th class="px-4 py-2"># of Bids</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="auc in filteredAuctions"
            :key="auc.id"
            class="border-t"
          >
            <td class="px-4 py-2">
              <img
                :src="auc.userCtoon.ctoon.assetPath"
                alt="cToon image"
                class="w-12 h-12 object-cover rounded"
              />
            </td>
            <td class="px-4 py-2">{{ auc.creator?.username || '—' }}</td>
            <td class="px-4 py-2">{{ auc.status }}</td>
            <td class="px-4 py-2">{{ formatDate(auc.createdAt) }}</td>
            <td class="px-4 py-2">{{ auc.duration }} days</td>
            <td class="px-4 py-2">{{ hoursLeft(auc.endAt) }}</td>
            <td class="px-4 py-2">{{ auc.highestBidder?.username || '—' }}</td>
            <td class="px-4 py-2">{{ auc.highestBid }}</td>
            <td class="px-4 py-2">{{ auc.bids.length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards -->
    <div class="md:hidden grid grid-cols-1 gap-4">
      <div
        v-for="auc in filteredAuctions"
        :key="auc.id"
        class="border rounded p-4 shadow"
      >
        <div class="flex items-center mb-4">
          <img
            :src="auc.userCtoon.ctoon.assetPath"
            alt="cToon image"
            class="w-16 h-16 object-cover rounded mr-4"
          />
          <div>
            <div class="font-semibold text-lg">
              {{ auc.userCtoon.ctoon.name }}
            </div>
            <div class="text-sm text-gray-500">
              {{ hoursLeft(auc.endAt) }} hours left
            </div>
          </div>
        </div>
        <div class="space-y-1 text-sm text-gray-700">
          <div>
            <span class="font-medium">Creator:</span>
            {{ auc.creator?.username || '—' }}
          </div>
          <div>
            <span class="font-medium">Status:</span>
            {{ auc.status }}
          </div>
          <div>
            <span class="font-medium">Created:</span>
            {{ formatDate(auc.createdAt) }}
          </div>
          <div>
            <span class="font-medium">Duration:</span>
            {{ auc.duration }} days
          </div>
          <div>
            <span class="font-medium">Top Bidder:</span>
            {{ auc.highestBidder?.username || '—' }}
          </div>
          <div>
            <span class="font-medium">Highest Bid:</span>
            {{ auc.highestBid }}
          </div>
          <div>
            <span class="font-medium"># of Bids:</span>
            {{ auc.bids.length }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAsyncData } from '#app'
import Nav from '@/components/Nav.vue'

// Fetch auctions
const { data: auctionsData, error } = await useAsyncData('auctions', () =>
  $fetch('/api/admin/auctions')
)
const auctions = ref(auctionsData.value || [])
watch(auctionsData, val => auctions.value = val || [])

// Filter options
const selectedCreator = ref('')
const selectedStatus = ref('')
const selectedHasBidder = ref('')
const statusOptions = ['ACTIVE', 'CLOSED', 'CANCELLED']
const hasBidderOptions = [
  { value: '', label: 'All' },
  { value: 'has', label: 'With Bidder' },
  { value: 'none', label: 'No Bidder' }
]

// Unique creators
const creators = computed(() => {
  const map = {}
  auctions.value.forEach(a => {
    if (a.creator?.username) map[a.creator.username] = a.creator
  })
  return Object.values(map)
})

// Filtered list
const filteredAuctions = computed(() =>
  auctions.value.filter(a => {
    if (selectedCreator.value && a.creator?.username !== selectedCreator.value) return false
    if (selectedStatus.value && a.status !== selectedStatus.value) return false
    if (selectedHasBidder.value === 'has' && !a.highestBidder) return false
    if (selectedHasBidder.value === 'none' && a.highestBidder) return false
    return true
  })
)

// Helpers
const hoursLeft = endAt => {
  const diff = new Date(endAt) - new Date()
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60)) : 0
}
const formatDate = dt => new Date(dt).toLocaleDateString()
</script>

<style scoped>
/* Custom styles if needed */
</style>
