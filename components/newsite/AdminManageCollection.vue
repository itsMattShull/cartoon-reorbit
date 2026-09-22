<template>
  <div class="admin-manage-collection bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-1 text-gray-900">Manage Collection</h1>
        <p class="text-[11px] text-gray-500 mb-3">
          Look up any player's full collection — the same valuation stats and items shown on their own My Collection page. Read-only.
        </p>

        <!-- Search -->
        <form class="flex flex-wrap items-end gap-2 mb-3" @submit.prevent="lookupUser">
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">Username</label>
            <input
              v-model="usernameInput"
              type="text"
              list="mc-user-suggestions"
              placeholder="Enter a username..."
              class="border rounded px-1.5 py-1 text-xs w-56"
              style="font-size: 16px;"
            />
            <datalist id="mc-user-suggestions">
              <option v-for="s in userSuggestions" :key="s" :value="s" />
            </datalist>
          </div>
          <button type="submit" class="border rounded px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700" :disabled="!usernameInput.trim() || loadingUser">
            View
          </button>
        </form>

        <div v-if="userError" class="text-red-600 py-2">{{ userError }}</div>
        <div v-else-if="loadingUser" class="text-center py-6 text-gray-500">Loading…</div>

        <template v-else-if="target">
          <!-- Worth toggle + panel -->
          <div class="mb-3">
            <button
              type="button"
              class="worth-toggle"
              :aria-expanded="worthOpen ? 'true' : 'false'"
              aria-controls="mc-admin-worth-panel"
              @click="worthOpen = !worthOpen"
            >
              <span class="font-semibold">{{ target.username }}</span>
              <span v-if="worth" class="worth-amount">{{ formatCompact(worth.totals.avgAuctionSold) }} pts est.</span>
              <span class="worth-caret" :class="{ 'worth-caret--open': worthOpen }" aria-hidden="true">▾</span>
            </button>

            <div v-if="worthOpen && worth" id="mc-admin-worth-panel" class="worth-panel">
              <div v-for="m in worthMetrics" :key="m.key" class="worth-row">
                <div class="worth-row-main">
                  <span>{{ m.label }}</span>
                  <span class="tabular-nums font-semibold">{{ formatFull(worth.totals[m.key]) }} pts</span>
                </div>
                <div class="text-[10px] text-gray-500">{{ m.note(worth) }}</div>
              </div>
              <div class="text-[10px] text-gray-500 mt-1 pt-1 border-t">
                {{ worth.distinctCount }} cToon type{{ worth.distinctCount === 1 ? '' : 's' }},
                {{ worth.itemCount }} item{{ worth.itemCount === 1 ? '' : 's' }} total.
                <template v-if="worth.truncated"> Estimated from a subset — this collection is too large to price in full.</template>
              </div>
            </div>
          </div>

          <!-- Item filters -->
          <div class="flex flex-wrap items-end gap-2 mb-2 border rounded p-2 bg-gray-50">
            <div class="flex flex-col gap-0.5">
              <label class="font-medium text-gray-800">Name</label>
              <input v-model="nameFilter" type="text" placeholder="Filter by name" class="border rounded px-1.5 py-0.5 text-xs" />
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="font-medium text-gray-800">Rarity</label>
              <select v-model="rarityFilter" class="border rounded px-1.5 py-0.5 text-xs">
                <option value="">All rarities</option>
                <option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
            <label class="flex items-center gap-1 text-[11px] pb-0.5">
              <input v-model="duplicatesOnly" type="checkbox" />
              Duplicates only
            </label>
            <label class="flex items-center gap-1 text-[11px] pb-0.5">
              <input v-model="untradeableOnly" type="checkbox" />
              Untradeable/locked only
            </label>
          </div>

          <div v-if="itemsError" class="text-red-600 py-2">{{ itemsError }}</div>
          <div v-else-if="loadingItems" class="text-center py-6 text-gray-500">Loading items…</div>
          <template v-else>
            <div class="text-[11px] text-gray-600 mb-1">
              {{ total }} item{{ total === 1 ? '' : 's' }}
            </div>

            <div v-if="!items.length" class="text-gray-500 py-4">No items match these filters.</div>

            <!-- Desktop table -->
            <div v-else class="hidden md:block overflow-x-auto">
              <table class="min-w-full bg-white rounded shadow text-[11px]">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="px-1.5 py-1"></th>
                    <th class="px-1.5 py-1 text-left">Name</th>
                    <th class="px-1.5 py-1 text-left">Rarity</th>
                    <th class="px-1.5 py-1 text-left">Set</th>
                    <th class="px-1.5 py-1 text-right">Mint #</th>
                    <th class="px-1.5 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="it in items" :key="it.id" class="border-t">
                    <td class="px-1.5 py-1"><img v-if="it.assetPath" :src="it.assetPath" :alt="it.name" class="w-8 h-8 object-contain" /></td>
                    <td class="px-1.5 py-1 max-w-[220px] truncate" :title="it.name">{{ it.name }}</td>
                    <td class="px-1.5 py-1">{{ it.rarity || '—' }}</td>
                    <td class="px-1.5 py-1">{{ it.set || '—' }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums">{{ it.mintNumber ?? '—' }}</td>
                    <td class="px-1.5 py-1">
                      <span :class="statusBadgeClass(it)">{{ statusLabel(it) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile cards -->
            <div v-if="items.length" class="md:hidden grid grid-cols-2 gap-2">
              <div v-for="it in items" :key="it.id" class="bg-white border rounded-lg shadow p-1.5 mc-card">
                <img v-if="it.assetPath" :src="it.assetPath" :alt="it.name" class="w-full h-20 object-contain" />
                <div class="mt-1 font-medium leading-tight truncate" :title="it.name">{{ it.name }}</div>
                <div class="flex items-center justify-between mt-0.5">
                  <span class="text-[10px] text-gray-500">#{{ it.mintNumber ?? '—' }}</span>
                  <span :class="statusBadgeClass(it)">{{ statusLabel(it) }}</span>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div class="mt-3 flex items-center justify-between">
              <div class="text-[11px] text-gray-600">Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}</div>
              <div class="space-x-1">
                <button class="px-2 py-0.5 border rounded text-[11px] touch-btn" :disabled="page <= 1" @click="prevPage">Prev</button>
                <button class="px-2 py-0.5 border rounded text-[11px] touch-btn" :disabled="page >= totalPages" @click="nextPage">Next</button>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']

const route = useRoute()
const router = useRouter()

const usernameInput = ref(route.query.username ? String(route.query.username) : '')
const userSuggestions = ref([])

const target = ref(null)
const loadingUser = ref(false)
const userError = ref(null)

const worth = ref(null)
const worthOpen = ref(false)
const worthMetrics = [
  { key: 'avgAuctionSold', label: 'Avg. auction sale', note: (w) => `${w.priced.avgAuctionSold} of ${w.itemCount} items sold in an auction; rest show cMart price.` },
  { key: 'lastAuctionSold', label: 'Last auction sold', note: (w) => `${w.priced.lastAuctionSold} of ${w.itemCount} items have a recorded auction sale; rest show cMart price.` },
  { key: 'avgTraded', label: 'Avg. trade value (est.)', note: (w) => `${w.priced.avgTraded} of ${w.itemCount} items have enough trade history; rest show cMart price.` },
  { key: 'faceValue', label: 'cMart / face price', note: () => 'Original listed price for every item.' }
]

const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 60
const loadingItems = ref(false)
const itemsError = ref(null)

const nameFilter = ref('')
const rarityFilter = ref('')
const duplicatesOnly = ref(false)
const untradeableOnly = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function formatCompact(n) {
  if (n == null) return '0'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
function formatFull(n) {
  return new Intl.NumberFormat('en-US').format(n ?? 0)
}

function statusLabel(it) {
  if (it.lockedByUserId) return 'Locked'
  return it.isTradeable ? 'Tradeable' : 'Untradeable'
}
function statusBadgeClass(it) {
  const base = 'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium'
  if (it.lockedByUserId) return `${base} bg-amber-100 text-amber-800`
  return it.isTradeable ? `${base} bg-emerald-100 text-emerald-800` : `${base} bg-gray-200 text-gray-700`
}

async function lookupUser() {
  const username = usernameInput.value.trim()
  if (!username) return
  loadingUser.value = true
  userError.value = null
  target.value = null
  worth.value = null
  worthOpen.value = false
  try {
    router.replace({ query: { ...route.query, username } }).catch(() => {})
    const [worthRes] = await Promise.all([
      $fetch('/api/admin/collection-worth', { query: { username } }),
      fetchItems(username, true)
    ])
    worth.value = worthRes
    target.value = { username: worthRes.username || username }
  } catch (err) {
    userError.value = err?.data?.statusMessage || err?.message || 'Failed to load this user\'s collection'
  } finally {
    loadingUser.value = false
  }
}

async function fetchItems(usernameOverride, resetPage = false) {
  const username = (usernameOverride || target.value?.username || usernameInput.value).trim()
  if (!username) return
  if (resetPage) page.value = 1
  loadingItems.value = true
  itemsError.value = null
  try {
    const res = await $fetch('/api/admin/target-collection', {
      query: {
        username,
        page: page.value,
        limit: pageSize,
        name: nameFilter.value.trim() || undefined,
        rarity: rarityFilter.value || undefined,
        duplicatesOnly: duplicatesOnly.value ? 'true' : undefined,
        includeUntradeable: 'true'
      }
    })
    let rows = res.items || []
    if (untradeableOnly.value) rows = rows.filter(it => !it.isTradeable || it.lockedByUserId)
    items.value = rows
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch (err) {
    items.value = []
    total.value = 0
    itemsError.value = err?.data?.statusMessage || err?.message || 'Failed to load items'
  } finally {
    loadingItems.value = false
  }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchItems()
}
function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchItems()
}

async function fetchUserSuggestions() {
  const term = usernameInput.value.trim()
  if (!term) { userSuggestions.value = []; return }
  try {
    const res = await $fetch('/api/admin/user-mentions', { query: { q: term, limit: 10 } })
    userSuggestions.value = (res.items || []).map(i => i.username).filter(Boolean)
  } catch {
    userSuggestions.value = []
  }
}

let suggestionDebounceId = null
watch(usernameInput, () => {
  if (suggestionDebounceId) clearTimeout(suggestionDebounceId)
  suggestionDebounceId = setTimeout(fetchUserSuggestions, 200)
})

let filterDebounceId = null
watch([nameFilter, rarityFilter, duplicatesOnly, untradeableOnly], () => {
  if (!target.value) return
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => fetchItems(null, true), 300)
})

onMounted(() => {
  if (usernameInput.value.trim()) lookupUser()
})
</script>

<style scoped>
.admin-manage-collection {
  width: 100%;
  min-height: 100%;
}

.worth-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 11px;
  min-height: 34px;
}
.worth-amount { color: #1d4ed8; font-weight: 700; font-variant-numeric: tabular-nums; }
.worth-caret { transition: transform 0.15s ease; font-size: 10px; color: #6b7280; }
.worth-caret--open { transform: rotate(180deg); }

.worth-panel {
  margin-top: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  max-height: 300px;
  overflow-y: auto;
}
.worth-row { padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
.worth-row:last-of-type { border-bottom: none; }
.worth-row-main { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }

.mc-card { display: flex; flex-direction: column; }

.touch-btn { min-height: 32px; }
</style>
