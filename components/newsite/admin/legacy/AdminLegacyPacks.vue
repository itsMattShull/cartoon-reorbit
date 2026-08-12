<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h1 class="text-base font-semibold">Packs</h1>

        <!-- Create New Pack button -->
        <NuxtLink
          to="/newsite/admin/packs/new"
          class="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <!-- Plus icon -->
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-3.5 w-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create New Pack
        </NuxtLink>
      </div>

      <!-- Content -->
      <div>
        <!-- Loading / error states -->
        <div v-if="pending" class="flex items-center justify-center py-10 text-gray-500">
          Loading packs…
        </div>
        <div v-else-if="error" class="flex items-center justify-center py-10 text-red-600">
          {{ error.message || 'Failed to fetch packs' }}
        </div>

        <!-- Data views -->
        <div v-else>
          <div class="mb-2 text-[11px] text-gray-600">
            Total Results: {{ total }} packs
          </div>

          <!-- TABLE VIEW (lg and up) -->
          <div class="overflow-x-auto rounded-lg border bg-white shadow hidden lg:block">
            <table class="min-w-full text-xs">
              <thead>
                <tr>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Asset</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Name</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Price</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Rarity Breakdown</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Status</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Schedule (CST)</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Purchased</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Limits / User</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Created</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="pack in packs" :key="pack.id" class="hover:bg-gray-50">
                  <td class="px-2 py-1.5">
                    <img
                      v-if="pack.imagePath"
                      :src="pack.imagePath"
                      :alt="pack.name"
                      class="h-10 w-auto mx-auto rounded border"
                    />
                  </td>
                  <td class="px-2 py-1.5 font-medium text-gray-900">{{ pack.name }}</td>
                  <td class="px-2 py-1.5">{{ formatPrice(pack.price) }}</td>
                  <td class="px-2 py-1.5 whitespace-nowrap">{{ formatRarity(pack.rarityConfigs) }}</td>
                  <td class="px-2 py-1.5">
                    <span class="status-badge" :class="`status-${packStatus(pack).tone}`">
                      {{ packStatus(pack).label }}
                    </span>
                  </td>
                  <td class="px-2 py-1.5 whitespace-nowrap text-[11px]">
                    <div><span class="text-gray-500">Start:</span> {{ formatCst(pack.scheduledAt) }}</div>
                    <div><span class="text-gray-500">End:</span> {{ formatCst(pack.scheduledOffAt) }}</div>
                  </td>
                  <td class="px-2 py-1.5 whitespace-nowrap">{{ pack.purchasedCount.toLocaleString() }}</td>
                  <td class="px-2 py-1.5 whitespace-nowrap text-[11px]">
                    <div>{{ pack.dailyPurchaseLimit != null ? `${pack.dailyPurchaseLimit}/day` : 'Unlimited/day' }}</div>
                    <div>{{ pack.maxBuysPerUser != null ? `${pack.maxBuysPerUser} total` : 'Unlimited total' }}</div>
                  </td>
                  <td class="px-2 py-1.5 whitespace-nowrap">{{ formatDate(pack.createdAt) }}</td>
                  <td class="px-2 py-1.5">
                    <NuxtLink
                      :to="`/newsite/admin/packs/edit/${pack.id}`"
                      class="inline-flex items-center gap-1 px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50"
                    >
                      Edit
                    </NuxtLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- CARD VIEW (below lg) -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 block lg:hidden">
            <div
              v-for="pack in packs"
              :key="pack.id"
              class="bg-white border rounded-lg shadow p-2"
            >
              <div class="flex gap-2">
                <!-- Pack Image -->
                <img
                  v-if="pack.imagePath"
                  :src="pack.imagePath"
                  :alt="pack.name"
                  class="max-w-[60px] w-full object-contain rounded border flex-shrink-0"
                />
                <div class="flex-1 flex flex-col justify-between min-w-0">
                  <!-- Info -->
                  <div class="space-y-0.5">
                    <h2 class="text-xs font-semibold truncate">{{ pack.name }}</h2>
                    <p class="text-[11px] flex items-center gap-1.5">
                      <strong>Status:</strong>
                      <span class="status-badge" :class="`status-${packStatus(pack).tone}`">
                        {{ packStatus(pack).label }}
                      </span>
                    </p>
                    <p class="text-[11px]"><strong>Price:</strong> {{ formatPrice(pack.price) }}</p>
                    <p class="text-[11px]"><strong>Rarity:</strong> {{ formatRarity(pack.rarityConfigs) }}</p>
                    <p class="text-[11px]"><strong>Start (CST):</strong> {{ formatCst(pack.scheduledAt) }}</p>
                    <p class="text-[11px]"><strong>End (CST):</strong> {{ formatCst(pack.scheduledOffAt) }}</p>
                    <p class="text-[11px]"><strong>Purchased:</strong> {{ pack.purchasedCount.toLocaleString() }}</p>
                    <p class="text-[11px]">
                      <strong>Limits:</strong>
                      {{ pack.dailyPurchaseLimit != null ? `${pack.dailyPurchaseLimit}/day` : 'Unlimited/day' }},
                      {{ pack.maxBuysPerUser != null ? `${pack.maxBuysPerUser} total` : 'Unlimited total' }}
                    </p>
                    <p class="text-[11px]"><strong>Created:</strong> {{ formatDate(pack.createdAt) }}</p>
                  </div>
                  <!-- Edit Button -->
                  <NuxtLink
                    :to="`/newsite/admin/packs/edit/${pack.id}`"
                    class="mt-2 inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Edit
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="packs.length" class="mt-3 flex items-center justify-between">
            <div class="text-[11px] text-gray-600">
              Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
            </div>
            <div class="space-x-1">
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="page <= 1" @click="prevPage">Prev</button>
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="page >= totalPages" @click="nextPage">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const packs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const pending = ref(false)
const error = ref(null)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

async function fetchPacks() {
  pending.value = true
  error.value = null
  try {
    const res = await $fetch('/api/admin/packs', {
      query: { page: page.value, limit: pageSize }
    })
    packs.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch (err) {
    error.value = err
    packs.value = []
    total.value = 0
  } finally {
    pending.value = false
  }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchPacks()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchPacks()
}

/* helper formatters */
function formatPrice (p) {
  return `${p.toLocaleString()} Points`
}
function formatRarity (arr) {
  return arr?.length ? arr.map(r => `${r.rarity} ×${r.count}`).join(', ') : '–'
}
function formatDate (d) {
  return new Date(d).toLocaleDateString()
}
function formatCst (d) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(d)) + ' CST'
}
function packStatus (p) {
  const now = new Date()
  const start = p.scheduledAt ? new Date(p.scheduledAt) : null
  const end = p.scheduledOffAt ? new Date(p.scheduledOffAt) : null

  if (start && now < start) return { label: 'Scheduled', tone: 'blue' }
  if (end && now >= end) return { label: 'Ended', tone: 'gray' }
  if (!start && !end) return p.inCmart ? { label: 'Live', tone: 'green' } : { label: 'Not Listed', tone: 'gray' }
  return { label: 'Live', tone: 'green' }
}

onMounted(() => {
  fetchPacks()
})
</script>

<style scoped>
.status-badge {
  display: inline-block;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}
.status-green { background: #dcfce7; color: #15803d; }
.status-blue  { background: #dbeafe; color: #1d4ed8; }
.status-gray  { background: #f3f4f6; color: #4b5563; }
</style>
