<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16">
    <Nav />

    <div class="max-w-5xl mx-auto mt-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-semibold">Manage Auctions (AuctionOnly)</h1>
        <NuxtLink
          to="/admin/add-auction"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Auction
        </NuxtLink>
      </div>

      <div v-if="auctions.length" class="bg-white rounded-lg shadow divide-y">
        <div
          v-for="a in auctions"
          :key="a.id"
          class="p-4 flex items-center gap-4"
        >
          <img
            :src="a.ctoon.assetPath"
            class="w-14 h-14 rounded object-cover border"
            alt="cToon"
          />
          <div class="min-w-0 flex-1">
            <div class="font-medium truncate">{{ a.ctoon.name }}</div>
            <div class="text-xs text-gray-500 truncate">
              {{ a.ctoon.rarity }}
            </div>
            <div class="text-sm text-gray-600 mt-1">
              <span class="font-medium">Starts:</span> {{ fmtCST(a.startsAt) }}
              <span class="mx-2">•</span>
              <span class="font-medium">Ends:</span> {{ fmtCST(a.endsAt) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-lg font-semibold">
              {{ formatPts(a.pricePoints) }}
            </div>
          </div>
        </div>
      </div>

      <p v-else class="text-gray-500 mt-6">No auctions yet.</p>
      <p v-if="error" class="text-red-600 mt-4">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

const auctions = ref([])
const error = ref('')

function fmtCST(iso) {
  const d = new Date(iso)
  return d.toLocaleString([], {
    timeZone: 'America/Chicago',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatPts(n) {
  try {
    return `${Number(n).toLocaleString()} pts`
  } catch {
    return `${n} pts`
  }
}

async function load() {
  try {
    const res = await fetch('/api/admin/auction-only', { credentials: 'include' })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || 'Failed to load auctions')
    }
    auctions.value = await res.json()
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>
