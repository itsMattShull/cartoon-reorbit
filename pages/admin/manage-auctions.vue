<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
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

      <div v-if="upcomingAuctions.length" class="bg-white rounded-lg shadow divide-y">
        <div
          v-for="a in upcomingAuctions"
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
            <div class="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                class="px-3 py-1 text-sm rounded border border-blue-600 text-blue-700 hover:bg-blue-50"
                @click="openEdit(a)"
              >
                Edit
              </button>
              <button
                type="button"
                class="px-3 py-1 text-sm rounded border border-red-600 text-red-700 hover:bg-red-50"
                @click="deleteAuction(a)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-else class="text-gray-500 mt-6">No upcoming auctions.</p>
      <p v-if="error" class="text-red-600 mt-4">{{ error }}</p>
    </div>

    <div v-if="showEdit" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold">Edit Auction</h2>
          <button class="text-gray-500 hover:text-gray-700" @click="closeEdit">X</button>
        </div>

        <form @submit.prevent="saveEdit" class="space-y-4">
          <div>
            <label class="block font-medium mb-1">Price (points)</label>
            <input v-model.number="editPrice" type="number" min="0" class="w-full border rounded p-2" />
          </div>

          <div>
            <label class="block font-medium mb-1">Go-live (CST/CDT)</label>
            <div class="grid grid-cols-2 gap-3">
              <input v-model="editStartDate" type="date" class="w-full border rounded p-2" required />
              <select v-model="editStartHour" class="w-full border rounded p-2" required>
                <option disabled value="">Select hour</option>
                <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-medium mb-1">Duration</label>
            <div class="flex items-center gap-3">
              <input v-model.number="editDurationDays" type="range" min="1" max="5" class="w-full" />
              <span class="w-10 text-center">{{ editDurationDays }}d</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input id="editIsFeatured" v-model="editIsFeatured" type="checkbox" class="h-4 w-4 border-gray-300 rounded" />
            <label for="editIsFeatured" class="text-sm font-medium text-gray-700">Is Featured</label>
          </div>

          <div class="pt-3 border-t">
            <button
              type="submit"
              :disabled="editSaving"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Save Changes
            </button>
            <button type="button" class="ml-2 px-4 py-2 rounded border" @click="closeEdit">Cancel</button>
            <span v-if="editError" class="ml-3 text-red-600">{{ editError }}</span>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({ title: 'Admin - Manage Auctions', middleware: ['auth', 'admin'], layout: 'default' })

const auctions = ref([])
const upcomingAuctions = computed(() => {
  const now = Date.now()
  return auctions.value.filter(a => new Date(a.startsAt).getTime() > now)
})
const error = ref('')
const showEdit = ref(false)
const editing = ref(null)
const editPrice = ref(0)
const editStartDate = ref('')
const editStartHour = ref('')
const editDurationDays = ref(1)
const editIsFeatured = ref(false)
const editError = ref('')
const editSaving = ref(false)

const hourOptions = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

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

function utcToChicagoDateHour(iso) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  })
  const parts = {}
  for (const p of dtf.formatToParts(new Date(iso))) {
    if (p.type !== 'literal') parts[p.type] = p.value
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: `${parts.hour}:00`
  }
}

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

function openEdit(a) {
  if (new Date(a.startsAt).getTime() <= Date.now()) return
  editing.value = a
  editPrice.value = Number(a.pricePoints || 0)
  editIsFeatured.value = !!a.isFeatured
  const { date, hour } = utcToChicagoDateHour(a.startsAt)
  editStartDate.value = date
  editStartHour.value = hour
  const diffDays = Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 86400000)
  editDurationDays.value = Math.min(5, Math.max(1, diffDays || 1))
  editError.value = ''
  showEdit.value = true
}

function closeEdit() {
  showEdit.value = false
  editing.value = null
  editError.value = ''
}

async function saveEdit() {
  if (!editing.value) return
  editError.value = ''
  if (!editStartDate.value || !editStartHour.value) {
    editError.value = 'Set a start date and hour.'
    return
  }
  const startsAtUtc = chicagoLocalToUtcISO(editStartDate.value, editStartHour.value)
  const starts = new Date(startsAtUtc)
  if (starts <= new Date()) {
    editError.value = 'Start must be in the future.'
    return
  }

  const payload = {
    pricePoints: Number(editPrice.value || 0),
    durationDays: Number(editDurationDays.value || 1),
    isFeatured: Boolean(editIsFeatured.value),
    startsAtUtc
  }

  try {
    editSaving.value = true
    const res = await fetch(`/api/admin/auction-only/${editing.value.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Update failed')
    }
    showEdit.value = false
    editing.value = null
    await load()
  } catch (e) {
    editError.value = e.message
  } finally {
    editSaving.value = false
  }
}

async function deleteAuction(a) {
  if (!confirm('Delete this upcoming auction?')) return
  try {
    const res = await fetch(`/api/admin/auction-only/${a.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Delete failed')
    }
    await load()
  } catch (e) {
    error.value = e.message
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
