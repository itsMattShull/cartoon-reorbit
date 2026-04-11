<template>
  <div class="min-h-screen bg-gray-50 p-3 sm:p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto mt-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">Dissolve Queue</h1>
        <button @click="loadData" class="text-sm text-blue-600 underline">Refresh</button>
      </div>

      <!-- Summary cards -->
      <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div v-for="cat in categories" :key="cat.key"
             class="bg-white rounded-lg shadow p-4">
          <div class="text-sm font-semibold text-gray-500 mb-1">{{ cat.label }}</div>
          <div class="text-2xl font-bold">{{ stats.byCategory[cat.key]?.total ?? 0 }}</div>
          <div class="text-xs text-gray-500 mt-1">
            <span class="text-emerald-600">{{ stats.byCategory[cat.key]?.scheduled ?? 0 }} scheduled</span>
            <span class="mx-1">·</span>
            <span class="text-orange-500">{{ stats.byCategory[cat.key]?.unscheduled ?? 0 }} unscheduled</span>
          </div>
        </div>
      </div>

      <!-- Upcoming scheduled auctions -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-4 border-b">
          <h2 class="font-semibold">Upcoming Scheduled Auctions</h2>
          <p class="text-xs text-gray-500 mt-0.5">Next 20 entries, times in CST</p>
        </div>
        <div v-if="upcoming.length" class="divide-y">
          <div v-for="entry in upcoming" :key="entry.id"
               class="px-4 py-3 text-sm">
            <div class="flex items-start gap-3">
              <div class="shrink-0 w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img v-if="entry.ctoonImage" :src="entry.ctoonImage" :alt="entry.ctoonName"
                     class="w-full h-full object-contain" loading="lazy" />
                <span v-else class="text-gray-300 text-lg">?</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" :title="entry.ctoonName">{{ entry.ctoonName || '—' }}</div>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ entry.rarity }}
                  <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                  <span class="ml-2 px-1.5 py-0.5 rounded text-xs font-medium"
                        :class="categoryChip(entry.category)">{{ entry.category }}</span>
                  <span v-if="entry.isFeatured" class="ml-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Featured</span>
                </div>
                <div class="text-xs text-gray-500 mt-1 sm:hidden">{{ fmtCST(entry.scheduledFor) }}</div>
              </div>
              <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                <div class="hidden sm:block text-xs text-gray-600">{{ fmtCST(entry.scheduledFor) }}</div>
                <button
                  @click="cancelEntry(entry.id)"
                  class="text-xs text-red-500 hover:text-red-700"
                  :disabled="cancellingId === entry.id"
                >{{ cancellingId === entry.id ? '…' : 'Unschedule' }}</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-sm text-gray-400">No upcoming scheduled auctions</div>
      </div>

      <!-- All Queue Entries (search + pagination) -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-4 border-b">
          <h2 class="font-semibold">All Queue Entries</h2>
          <p class="text-xs text-gray-500 mt-0.5">
            <template v-if="searchQuery.length > 0 || categoryFilter !== 'ALL'">
              {{ filteredEntries.length }} of {{ allEntries.length }} entries match
            </template>
            <template v-else>
              {{ allEntries.length }} total entries
            </template>
          </p>
        </div>

        <!-- Filters: category + search -->
        <div class="p-4 border-b" ref="searchContainer">
          <div class="flex flex-wrap items-center gap-3 mb-3">
            <select
              v-model="categoryFilter"
              class="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Categories</option>
              <option value="POKEMON">Pokémon</option>
              <option value="CRAZY_RARE">Crazy Rare</option>
            </select>
          </div>
          <div class="relative w-full sm:w-80">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by cToon name…"
              class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-300"
              @focus="showSuggestions = searchQuery.trim().length >= 3"
              @keydown.escape="showSuggestions = false"
            />
            <button
              v-if="searchQuery"
              @click="clearSearch"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl leading-none"
            >×</button>

            <!-- Autocomplete dropdown -->
            <div
              v-if="showSuggestions && searchSuggestions.length"
              class="absolute z-20 top-full mt-1 left-0 w-full sm:w-96 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto"
            >
              <button
                v-for="suggestion in searchSuggestions"
                :key="suggestion.id"
                @mousedown.prevent="selectSuggestion(suggestion)"
                class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
              >
                <div class="shrink-0 w-9 h-9 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                  <img v-if="suggestion.ctoonImage" :src="suggestion.ctoonImage" :alt="suggestion.ctoonName"
                       class="w-full h-full object-contain" loading="lazy" />
                  <span v-else class="text-gray-300 text-sm">?</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium truncate">{{ suggestion.ctoonName || '—' }}</div>
                  <div class="text-xs text-gray-500">Mint #{{ suggestion.mintNumber ?? '?' }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Entries list -->
        <div v-if="paginatedEntries.length" class="divide-y">
          <div v-for="entry in paginatedEntries" :key="entry.id" class="px-4 py-3 text-sm">
            <div class="flex items-start gap-3">
              <div class="shrink-0 w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img v-if="entry.ctoonImage" :src="entry.ctoonImage" :alt="entry.ctoonName"
                     class="w-full h-full object-contain" loading="lazy" />
                <span v-else class="text-gray-300 text-lg">?</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" :title="entry.ctoonName">{{ entry.ctoonName || '—' }}</div>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ entry.rarity }}
                  <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                  <span class="ml-2 px-1.5 py-0.5 rounded text-xs font-medium"
                        :class="categoryChip(entry.category)">{{ entry.category }}</span>
                  <span v-if="entry.isFeatured" class="ml-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Featured</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ entry.scheduledFor ? fmtCST(entry.scheduledFor) : 'Not scheduled' }}
                </div>
              </div>
              <div class="shrink-0">
                <button
                  @click="cancelEntry(entry.id)"
                  class="text-xs text-red-500 hover:text-red-700"
                  :disabled="cancellingId === entry.id"
                >{{ cancellingId === entry.id ? '…' : (entry.scheduledFor ? 'Unschedule' : 'Remove') }}</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-sm text-gray-400">
          {{ (searchQuery.length > 0 || categoryFilter !== 'ALL') ? 'No entries match your filters' : 'No entries in the dissolve queue' }}
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="p-4 border-t flex items-center justify-between">
          <div class="text-xs text-gray-500">
            Showing {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredEntries.length) }} of {{ filteredEntries.length }}
          </div>
          <div class="flex items-center gap-1">
            <button @click="goToPage(1)" :disabled="currentPage === 1"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">«</button>
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">‹</button>
            <span class="px-3 text-xs text-gray-600">{{ currentPage }} / {{ totalPages }}</span>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === totalPages"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">›</button>
            <button @click="goToPage(totalPages)" :disabled="currentPage === totalPages"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">»</button>
          </div>
        </div>
      </div>

      <!-- Reschedule All form -->
      <div class="bg-white rounded-lg shadow p-4 sm:p-5">
        <h2 class="font-semibold mb-1">Reschedule All</h2>
        <p class="text-xs text-gray-500 mb-4">
          Set a new schedule for all unscheduled entries. Toggle "Reschedule all" to also reset existing scheduled entries.
        </p>

        <div class="space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Start date (local)</label>
            <input v-model="form.startAtLocal" type="datetime-local"
                   class="w-full sm:flex-1 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Cadence (days)</label>
            <input v-model.number="form.cadenceDays" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Pokémon / cadence</label>
            <input v-model.number="form.pokemonPerCadence" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Crazy Rare / cadence</label>
            <input v-model.number="form.crazyRarePerCadence" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Other / cadence</label>
            <input v-model.number="form.otherPerCadence" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex items-center gap-2">
            <input v-model="form.reschedule" type="checkbox" id="reschedule-all"
                   class="rounded border-gray-300" />
            <label for="reschedule-all" class="text-xs text-gray-600">
              Reschedule all (including already-scheduled entries)
            </label>
          </div>
        </div>

        <div v-if="scheduleError" class="mt-3 text-xs text-red-600">{{ scheduleError }}</div>
        <div v-if="scheduleSuccess" class="mt-3 text-xs text-emerald-600">{{ scheduleSuccess }}</div>

        <div class="mt-4">
          <button
            @click="applySchedule"
            :disabled="scheduling"
            class="w-full sm:w-auto px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
          >{{ scheduling ? 'Scheduling…' : 'Apply Schedule' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRequestHeaders } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({ title: 'Admin - Dissolve Queue', middleware: ['auth', 'admin'], layout: 'default' })

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const stats      = ref(null)
const upcoming   = ref([])
const allEntries = ref([])

// Search
const searchQuery     = ref('')
const showSuggestions = ref(false)
const searchContainer = ref(null)

// Category filter
const categoryFilter = ref('ALL')

// Pagination
const currentPage = ref(1)
const pageSize    = 50

const categories = [
  { key: 'POKEMON',    label: 'Pokémon' },
  { key: 'CRAZY_RARE', label: 'Crazy Rare' },
  { key: 'OTHER',      label: 'Other' },
]

// Filter across all entries (not just current page)
const filteredEntries = computed(() => {
  let result = allEntries.value
  if (categoryFilter.value !== 'ALL') {
    result = result.filter(e => e.category === categoryFilter.value)
  }
  if (!searchQuery.value.trim()) return result
  const q = searchQuery.value.trim().toLowerCase()
  return result.filter(e => (e.ctoonName || '').toLowerCase().includes(q))
})

// Autocomplete suggestions: up to 8 results, only shown at 3+ chars
const searchSuggestions = computed(() => {
  if (searchQuery.value.trim().length < 3) return []
  return filteredEntries.value.slice(0, 8)
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredEntries.value.length / pageSize)))

const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredEntries.value.slice(start, start + pageSize)
})

// Reset to page 1 and manage suggestion visibility when search changes
watch(searchQuery, (val) => {
  currentPage.value = 1
  showSuggestions.value = val.trim().length >= 3
})

// Reset to page 1 when category filter changes
watch(categoryFilter, () => {
  currentPage.value = 1
})

function handleDocumentClick(e) {
  if (searchContainer.value && !searchContainer.value.contains(e.target)) {
    showSuggestions.value = false
  }
}

function clearSearch() {
  searchQuery.value     = ''
  showSuggestions.value = false
  currentPage.value     = 1
}

function selectSuggestion(suggestion) {
  searchQuery.value     = suggestion.ctoonName || ''
  showSuggestions.value = false
  currentPage.value     = 1
}

function goToPage(page) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

function defaultStartLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const form = ref({
  startAtLocal:        defaultStartLocal(),
  cadenceDays:         7,
  pokemonPerCadence:   2,
  crazyRarePerCadence: 1,
  otherPerCadence:     10,
  reschedule:          false,
})

const scheduling      = ref(false)
const scheduleError   = ref('')
const scheduleSuccess = ref('')
const cancellingId    = ref(null)

async function loadData() {
  try {
    const data = await $fetch('/api/admin/dissolve-queue', { headers })
    stats.value      = data
    upcoming.value   = data.upcoming || []
    allEntries.value = data.entries  || []
  } catch (e) {
    console.error('Failed to load dissolve queue', e)
  }
}

onMounted(() => {
  loadData()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

async function applySchedule() {
  scheduling.value    = true
  scheduleError.value = ''
  scheduleSuccess.value = ''
  try {
    const f = form.value
    const res = await $fetch('/api/admin/dissolve-queue/schedule', {
      method: 'POST',
      body: {
        startAtUtc:          new Date(f.startAtLocal).toISOString(),
        cadenceDays:         f.cadenceDays,
        pokemonPerCadence:   f.pokemonPerCadence,
        crazyRarePerCadence: f.crazyRarePerCadence,
        otherPerCadence:     f.otherPerCadence,
        reschedule:          f.reschedule,
      }
    })
    scheduleSuccess.value = `Scheduled ${res.scheduled} entries.`
    await loadData()
  } catch (e) {
    scheduleError.value = e?.data?.statusMessage || 'Failed to apply schedule.'
  } finally {
    scheduling.value = false
  }
}

async function cancelEntry(id) {
  cancellingId.value = id
  try {
    await $fetch(`/api/admin/dissolve-queue/${id}`, { method: 'DELETE' })
    upcoming.value = upcoming.value.filter(e => e.id !== id)
    await loadData()
  } catch (e) {
    console.error('Failed to unschedule entry', e)
  } finally {
    cancellingId.value = null
  }
}

function fmtCST(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    timeZone: 'America/Chicago',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' CST'
}

function categoryChip(cat) {
  if (cat === 'POKEMON')    return 'bg-blue-100 text-blue-700'
  if (cat === 'CRAZY_RARE') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}
</script>
