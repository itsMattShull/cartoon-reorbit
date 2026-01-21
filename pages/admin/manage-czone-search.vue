<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 class="text-2xl font-semibold">Manage cZone Search</h1>
          <p class="text-sm text-gray-500">Times display in Central Time (CST/CDT).</p>
        </div>
        <button
          class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          @click="openCreate"
        >
          Create Search
        </button>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <input id="show-all" type="checkbox" v-model="showAll" class="h-4 w-4" />
        <label for="show-all" class="text-sm text-gray-700">Show All Searches</label>
      </div>

      <div v-if="error" class="text-red-600 mb-4">
        {{ error.message || 'Failed to load cZone Searches' }}
      </div>
      <div v-if="pending" class="text-gray-500">Loading...</div>

      <div v-if="searches.length">
        <!-- Mobile cards -->
        <div class="space-y-4 sm:hidden">
          <div v-for="row in searches" :key="row.id" class="border rounded-lg p-4 bg-white">
            <div class="text-sm font-semibold text-gray-900">{{ displayName(row.name) }}</div>
            <div class="text-xs text-gray-500">Start (CST)</div>
            <div class="font-medium text-gray-900">{{ formatCentral(row.startAt) }}</div>
            <div class="mt-2 text-xs text-gray-500">End (CST)</div>
            <div class="font-medium text-gray-900">{{ formatCentral(row.endAt) }}</div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div><span class="font-semibold">Appearance:</span> {{ row.appearanceRatePercent }}%</div>
              <div><span class="font-semibold">Cooldown:</span> {{ row.cooldownHours }}h</div>
              <div class="col-span-2"><span class="font-semibold">Collection:</span> {{ collectionLabel(row.collectionType) }}</div>
              <div class="col-span-2"><span class="font-semibold">Prize Pool:</span> {{ row.prizePool.length }} cToons</div>
            </div>
            <div class="mt-3 flex gap-3">
              <button class="text-blue-600 hover:text-blue-800" @click="openEdit(row)">Edit</button>
              <button class="text-red-600 hover:text-red-800" @click="remove(row)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="hidden sm:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-4">Name</th>
                <th class="py-2 pr-4">Start (CST)</th>
                <th class="py-2 pr-4">End (CST)</th>
                <th class="py-2 pr-4">Appearance %</th>
                <th class="py-2 pr-4">Cooldown</th>
                <th class="py-2 pr-4">Collection</th>
                <th class="py-2 pr-4">Prize Pool</th>
                <th class="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in searches" :key="row.id" class="border-b last:border-b-0">
                <td class="py-3 pr-4 font-medium">{{ displayName(row.name) }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatCentral(row.startAt) }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatCentral(row.endAt) }}</td>
                <td class="py-3 pr-4">{{ row.appearanceRatePercent }}%</td>
                <td class="py-3 pr-4">{{ row.cooldownHours }}h</td>
                <td class="py-3 pr-4">{{ collectionLabel(row.collectionType) }}</td>
                <td class="py-3 pr-4">{{ row.prizePool.length }} cToons</td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  <button class="text-blue-600 hover:text-blue-800 mr-3" @click="openEdit(row)">Edit</button>
                  <button class="text-red-600 hover:text-red-800" @click="remove(row)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else-if="!pending" class="text-gray-500">No cZone Searches found.</div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">{{ modalTitle }}</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="closeModal">Close</button>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <div class="space-y-4">
            <div>
              <label class="block mb-1 font-medium">Search Name</label>
              <input v-model="form.name" type="text" class="w-full border rounded px-3 py-2" placeholder="e.g. Fall Gold Hunt" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block mb-1 font-medium">Start (CST)</label>
                <input v-model="form.startAt" type="datetime-local" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block mb-1 font-medium">End (CST)</label>
                <input v-model="form.endAt" type="datetime-local" class="w-full border rounded px-3 py-2" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block mb-1 font-medium">Appearance Rate %</label>
                <input v-model.number="form.appearanceRatePercent" type="number" min="0" max="100" step="0.01" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block mb-1 font-medium">Cooldown (Hours)</label>
                <input v-model.number="form.cooldownHours" type="number" min="0" step="1" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block mb-1 font-medium">Collection Type</label>
                <select v-model="form.collectionType" class="w-full border rounded px-3 py-2">
                  <option value="ONCE">Collect Each cToon Once</option>
                  <option value="MULTIPLE">Collect Each cToon Multiple Times</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block mb-1 font-medium">Prize Pool</label>
              <div class="relative">
                <input
                  v-model="ctoonSearchTerm"
                  type="text"
                  placeholder="Type 3+ characters to search cToons"
                  class="w-full border rounded px-3 py-2"
                  @focus="searchFocused = true"
                  @blur="searchFocused = false"
                />
                <ul v-if="ctoonSearchTerm.length >= 3 && searchFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
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
                      <p class="text-xs text-gray-500">{{ ctoon.rarity }}</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div v-if="!form.prizePool.length" class="text-sm text-gray-500 mt-2">Add at least one cToon to the prize pool.</div>
              <div class="mt-3 space-y-2">
                <div
                  v-for="(row, idx) in form.prizePool"
                  :key="row.ctoonId"
                  class="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50 rounded p-2"
                >
                  <div class="flex items-center gap-3 flex-1">
                    <img :src="row.ctoon.assetPath" class="h-10 w-auto rounded" />
                    <div>
                      <div class="font-medium">{{ row.ctoon.name }}</div>
                      <div class="text-xs text-gray-500">{{ row.ctoon.rarity }}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs text-gray-500">Chance %</label>
                    <input v-model.number="row.chancePercent" type="number" min="0" max="100" step="0.01" class="w-28 border rounded px-2 py-1" />
                  </div>
                  <button class="text-red-600 hover:text-red-800 text-sm" @click="removeCtoon(idx)">Remove</button>
                </div>
              </div>
            </div>

            <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded border" @click="closeModal">Cancel</button>
          <button
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving"
            @click="saveSearch"
          >
            <span v-if="!saving">Save</span>
            <span v-else>Saving...</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - Manage cZone Search', middleware: ['auth', 'admin'], layout: 'default' })

const searches = ref([])
const pending = ref(false)
const error = ref(null)
const showAll = ref(false)

const showModal = ref(false)
const saving = ref(false)
const formError = ref('')

const form = reactive({
  id: null,
  name: '',
  startAt: '',
  endAt: '',
  appearanceRatePercent: 0,
  cooldownHours: 0,
  collectionType: 'MULTIPLE',
  prizePool: []
})

const ctoonSearchTerm = ref('')
const ctoonSearchResults = ref([])
const searchingCtoons = ref(false)
const searchFocused = ref(false)

const modalTitle = computed(() => (form.id ? 'Edit cZone Search' : 'Create cZone Search'))

function collectionLabel(value) {
  return value === 'ONCE' ? 'Collect Each cToon Once' : 'Collect Each cToon Multiple Times'
}

function formatCentral(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  })
}

function displayName(name) {
  const cleaned = String(name || '').trim()
  return cleaned || 'Untitled'
}

function isoToCSTLocal(iso) {
  const date = new Date(iso)
  const parts = date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).split(', ')
  const [m, d, y] = parts[0].split('/')
  const time = parts[1]
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${time}`
}

function cstLocalToUtcISO(localValue) {
  const [dateStr, timeStr] = String(localValue || '').split('T')
  if (!dateStr || !timeStr) return ''
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10))
  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10))

  const partsInChicago = (date) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    })
    const obj = {}
    for (const p of dtf.formatToParts(date)) obj[p.type] = p.value
    return {
      year: Number(obj.year),
      month: Number(obj.month),
      day: Number(obj.day),
      hour: Number(obj.hour),
      minute: Number(obj.minute),
      second: Number(obj.second)
    }
  }

  let utcMs = Date.UTC(y, m - 1, d, hh, mm, 0)
  for (let i = 0; i < 3; i++) {
    const p = partsInChicago(new Date(utcMs))
    const gotMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const wantMs = Date.UTC(y, m - 1, d, hh, mm, 0)
    const diff = wantMs - gotMs
    utcMs += diff
    if (Math.abs(diff) < 1000) break
  }
  return new Date(utcMs).toISOString()
}

async function loadSearches() {
  pending.value = true
  error.value = null
  try {
    const data = await $fetch('/api/admin/czone-searches', { query: { showAll: showAll.value ? '1' : '0' } })
    searches.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

function resetForm() {
  form.id = null
  form.name = ''
  form.startAt = ''
  form.endAt = ''
  form.appearanceRatePercent = 0
  form.cooldownHours = 0
  form.collectionType = 'MULTIPLE'
  form.prizePool = []
  formError.value = ''
  ctoonSearchTerm.value = ''
  ctoonSearchResults.value = []
}

function openCreate() {
  resetForm()
  showModal.value = true
}

function openEdit(row) {
  form.id = row.id
  form.name = row.name || ''
  form.startAt = isoToCSTLocal(row.startAt)
  form.endAt = isoToCSTLocal(row.endAt)
  form.appearanceRatePercent = Number(row.appearanceRatePercent)
  form.cooldownHours = Number(row.cooldownHours)
  form.collectionType = row.collectionType || 'MULTIPLE'
  form.prizePool = row.prizePool.map((p) => ({
    ctoonId: p.ctoonId,
    chancePercent: Number(p.chancePercent),
    ctoon: p.ctoon
  }))
  formError.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

function removeCtoon(idx) {
  form.prizePool.splice(idx, 1)
}

async function saveSearch() {
  formError.value = ''
  const startIso = cstLocalToUtcISO(form.startAt)
  const endIso = cstLocalToUtcISO(form.endAt)
  const nameValue = String(form.name || '').trim()
  if (!startIso || !endIso) {
    formError.value = 'Please select a start and end date/time.'
    return
  }
  if (!nameValue) {
    formError.value = 'Please enter a search name.'
    return
  }
  if (new Date(endIso) <= new Date(startIso)) {
    formError.value = 'End date/time must be after start date/time.'
    return
  }
  if (!form.prizePool.length) {
    formError.value = 'Add at least one cToon to the prize pool.'
    return
  }
  if (!form.prizePool.some(p => Number(p.chancePercent) > 0)) {
    formError.value = 'At least one prize pool cToon must have a chance above 0%.'
    return
  }
  const cooldownValue = Number(form.cooldownHours)
  if (!Number.isInteger(cooldownValue) || cooldownValue < 0) {
    formError.value = 'Cooldown must be a whole number of hours (0 or higher).'
    return
  }

  const payload = {
    name: nameValue,
    startAt: startIso,
    endAt: endIso,
    appearanceRatePercent: Number(form.appearanceRatePercent),
    cooldownHours: cooldownValue,
    collectionType: form.collectionType,
    prizePool: form.prizePool.map(p => ({
      ctoonId: p.ctoonId,
      chancePercent: Number(p.chancePercent)
    }))
  }

  saving.value = true
  try {
    if (form.id) {
      await $fetch(`/api/admin/czone-searches/${form.id}`, { method: 'PUT', body: payload })
    } else {
      await $fetch('/api/admin/czone-searches', { method: 'POST', body: payload })
    }
    await loadSearches()
    closeModal()
  } catch (err) {
    formError.value = err?.data?.statusMessage || 'Failed to save cZone Search.'
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  if (!confirm('Delete this cZone Search? This cannot be undone.')) return
  try {
    await $fetch(`/api/admin/czone-searches/${row.id}`, { method: 'DELETE' })
    await loadSearches()
  } catch (err) {
    error.value = err
  }
}

let searchDebounce = null
watch(ctoonSearchTerm, (val) => {
  clearTimeout(searchDebounce)
  const term = val.trim()
  if (term.length < 3) {
    ctoonSearchResults.value = []
    searchingCtoons.value = false
    return
  }
  searchingCtoons.value = true
  searchDebounce = setTimeout(async () => {
    try {
      const results = await $fetch('/api/admin/search-ctoons', { query: { q: term } })
      const poolIds = new Set(form.prizePool.map(p => p.ctoonId))
      ctoonSearchResults.value = (Array.isArray(results) ? results : []).filter(r => !poolIds.has(r.id))
    } catch {
      ctoonSearchResults.value = []
    } finally {
      searchingCtoons.value = false
    }
  }, 300)
})

function addCtoonToPool(ctoon) {
  if (!form.prizePool.some(p => p.ctoonId === ctoon.id)) {
    form.prizePool.push({
      ctoonId: ctoon.id,
      chancePercent: 0,
      ctoon
    })
  }
  ctoonSearchTerm.value = ''
  ctoonSearchResults.value = []
}

watch(showAll, loadSearches)

onMounted(loadSearches)
</script>
