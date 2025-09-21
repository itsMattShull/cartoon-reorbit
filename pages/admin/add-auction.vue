<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <h1 class="text-2xl font-semibold mb-4">Add Auction (AuctionOnly)</h1>

      <form @submit.prevent="submitForm" class="space-y-6 relative">
        <!-- cToon selector -->
        <div>
          <label class="block font-medium mb-1">Select cToon from CartoonReOrbitOfficial</label>
          <div class="relative">
            <input
              v-model="search"
              @input="onSearchInput"
              type="text"
              class="w-full border rounded p-2"
              placeholder="Type 3+ characters"
              autocomplete="off"
            />
            <div
              v-if="showDropdown && results.length"
              class="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-72 overflow-auto"
            >
              <button
                v-for="opt in results"
                :key="opt.userCtoonId"
                type="button"
                class="w-full text-left px-2 py-2 hover:bg-gray-50 flex items-center gap-3"
                @click="selectOption(opt)"
              >
                <img :src="opt.assetPath" alt="preview" class="w-10 h-10 rounded object-cover border" />
                <div class="min-w-0">
                  <div class="font-medium truncate">{{ opt.name }}</div>
                  <div class="text-xs text-gray-500">{{ opt.rarity }}</div>
                </div>
              </button>
            </div>
          </div>

          <div v-if="selected" class="mt-3 flex items-center gap-3">
            <img :src="selected.assetPath" class="w-14 h-14 rounded object-cover border" />
            <div>
              <div class="font-medium">{{ selected.name }}</div>
              <div class="text-sm text-gray-500">{{ selected.rarity }}</div>
            </div>
            <button type="button" class="ml-auto text-blue-600 hover:underline text-sm" @click="clearSelected">Change</button>
          </div>
        </div>

        <!-- Price auto-fill -->
        <div>
          <label class="block font-medium mb-1">Price (points)</label>
          <input v-model.number="price" type="number" min="0" class="w-full border rounded p-2" />
          <p class="text-xs text-gray-500 mt-1">Auto-filled from rarity. You can override.</p>
        </div>

        <!-- Start date/hour in CST -->
        <div>
          <label class="block font-medium mb-1">Go-live (CST/CDT)</label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <input v-model="startDate" type="date" class="w-full border rounded p-2" required />
            </div>
            <div>
              <select v-model="startHour" class="w-full border rounded p-2" required>
                <option disabled value="">Select hour</option>
                <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
              </select>
              <p class="text-xs text-gray-500">Hour only.</p>
            </div>
          </div>
        </div>

        <!-- Duration slider -->
        <div>
          <label class="block font-medium mb-1">Duration</label>
          <div class="flex items-center gap-3">
            <input v-model.number="durationDays" type="range" min="1" max="5" class="w-full" />
            <span class="w-10 text-center">{{ durationDays }}d</span>
          </div>
        </div>

        <div class="pt-4 border-t">
          <button
            type="submit"
            :disabled="saving"
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Save Auction
          </button>
          <span v-if="error" class="ml-3 text-red-600">{{ error }}</span>
          <span v-if="saving" class="ml-3 text-gray-500">Saving…</span>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

const search = ref('')
const results = ref([])
const showDropdown = ref(false)
const selected = ref(null)

const price = ref(0)
const startDate = ref('') // YYYY-MM-DD
const startHour = ref('') // 'HH:00'
const durationDays = ref(1)
const error = ref('')
const saving = ref(false)
let searchTimer

const hourOptions = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

function rarityPrice(r) {
  const s = (r || '').toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (s === 'common') return 25
  if (s === 'uncommon') return 50
  if (s === 'rare') return 100
  if (s === 'very rare') return 187
  if (s === 'crazy rare') return 312
  return 50
}

function onSearchInput() {
  showDropdown.value = false
  results.value = []
  const q = search.value.trim()
  if (q.length < 3) return
  clearTimeout(searchTimer)
  searchTimer = setTimeout(fetchOwned, 200)
}

async function fetchOwned() {
  const q = encodeURIComponent(search.value.trim())
  const url = `/api/admin/auction-only/owned?q=${q}`
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to search')
    const data = await res.json()
    results.value = data
    showDropdown.value = true
  } catch (e) {
    console.error(e)
  }
}

function selectOption(opt) {
  selected.value = opt
  search.value = opt.name
  showDropdown.value = false
  price.value = rarityPrice(opt.rarity)
}

function clearSelected() {
  selected.value = null
  search.value = ''
  price.value = 0
  results.value = []
}

// Convert a local date/hour in America/Chicago to a UTC ISO string
function chicagoLocalToUtcISO(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10))
  const [hh] = timeStr.split(':').map(n => parseInt(n, 10))

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

  let utcMs = Date.UTC(y, m - 1, d, hh, 0, 0)
  for (let i = 0; i < 3; i++) {
    const p = partsInChicago(new Date(utcMs))
    const gotMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const wantMs = Date.UTC(y, m - 1, d, hh, 0, 0)
    const diff = wantMs - gotMs
    utcMs += diff
    if (Math.abs(diff) < 1000) break
  }
  return new Date(utcMs).toISOString()
}

async function submitForm() {
  error.value = ''
  if (!selected.value) { error.value = 'Select a cToon.'; return }
  if (!startDate.value || !startHour.value) { error.value = 'Set a start date and hour.'; return }

  const startsAtUtc = chicagoLocalToUtcISO(startDate.value, startHour.value)
  const starts = new Date(startsAtUtc)
  if (starts <= new Date()) { error.value = 'Start must be in the future.'; return }

  const payload = {
    userCtoonId: selected.value.userCtoonId,
    ctoonId: selected.value.ctoonId,
    pricePoints: Number(price.value || 0),
    durationDays: Number(durationDays.value || 1),
    startsAtUtc
  }

  try {
    saving.value = true
    const res = await fetch('/api/admin/auction-only', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Save failed')
    }
    window.location.href = '/admin/manage-auctions'
  } catch (e) {
    console.error(e)
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>