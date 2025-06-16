<template>
  <div class="p-4">
    <!-- Filter Dropdown -->
    <div class="mb-4 flex items-center">
      <label for="creatorFilter" class="mr-2 font-medium">Filter by creator:</label>
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

    <!-- Desktop Table -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full bg-white rounded shadow">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-2">cToon</th>
            <th class="px-4 py-2">Creator</th>
            <th class="px-4 py-2">Status</th>
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
            <td class="px-4 py-2">{{ auc.creator.username }}</td>
            <td class="px-4 py-2">{{ auc.status }}</td>
            <td class="px-4 py-2">{{ hoursLeft(auc.endAt) }}</td>
            <td class="px-4 py-2">
              {{ auc.highestBidder?.username || '—' }}
            </td>
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
            {{ auc.creator.username }}
          </div>
          <div>
            <span class="font-medium">Status:</span>
            {{ auc.status }}
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
import { ref, computed } from 'vue'
import { useAsyncData } from '#app'

// Fetch all auctions with related data
const { data: auctionsData } = await useAsyncData('auctions', () =>
  $fetch('/api/admin/auctions')
)
const auctions = ref(auctionsData.value || [])

// Derive unique creators for the dropdown
const creators = computed(() => {
  const map = {}
  auctions.value.forEach(a => {
    if (a.creator?.username) map[a.creator.username] = a.creator
  })
  return Object.values(map)
})

// Filter state
const selectedCreator = ref('')
const filteredAuctions = computed(() =>
  auctions.value.filter(a =>
    selectedCreator.value
      ? a.creator.username === selectedCreator.value
      : true
  )
)

// Helper: hours left before end
const hoursLeft = endAt => {
  const diff = new Date(endAt) - new Date()
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60)) : 0
}
</script>

<style scoped>
/* You can add custom styles here if needed */
</style>
