<template>
  <div class="bg-gray-50 text-xs">

    <div class="px-2 py-2">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h1 class="text-base font-semibold">Manage Auctions (AuctionOnly)</h1>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50"
            @click="openHistory"
          >
            History
          </button>
          <button
            type="button"
            class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50"
            @click="openErrorLog"
          >
            Error Log
          </button>
          <NuxtLink
            to="/newsite/admin/auctions/new"
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Add Auction
          </NuxtLink>
        </div>
      </div>

      <div v-if="upcomingAuctions.length" class="flex justify-end mb-2">
        <button
          type="button"
          class="px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50"
          @click="activeModal = 'removeAll'"
        >
          Remove All ({{ upcomingAuctions.length }})
        </button>
      </div>

      <div v-if="upcomingAuctions.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <div
          v-for="a in upcomingAuctions"
          :key="a.id"
          class="bg-white border rounded-lg shadow p-2 flex flex-col gap-2"
        >
          <div class="flex items-start gap-2">
            <img
              :src="a.ctoon.assetPath"
              class="w-12 h-12 rounded object-cover border flex-shrink-0"
              alt="cToon"
            />
            <div class="min-w-0 flex-1">
              <div class="font-medium text-xs truncate">{{ a.ctoon.name }}</div>
              <div class="text-[10px] text-gray-500 truncate">
                {{ a.ctoon.rarity }}
                <span v-if="a.mintNumber !== null && a.mintNumber !== undefined"> • Mint #{{ a.mintNumber }}</span>
              </div>
            </div>
          </div>
          <div class="text-[10px] text-gray-600 space-y-0.5">
            <div><span class="text-gray-500">Starts:</span> {{ fmtCST(a.startsAt) }}</div>
            <div><span class="text-gray-500">Ends:</span> {{ fmtCST(a.endsAt) }}</div>
          </div>
          <div class="flex items-center justify-between gap-2 mt-auto pt-1">
            <div class="text-sm font-semibold">
              {{ formatPts(a.pricePoints) }}
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50"
                @click="openEdit(a)"
              >
                Edit
              </button>
              <button
                type="button"
                class="px-2 py-1 text-[11px] border rounded-md text-red-700 border-red-200 hover:bg-red-50"
                @click="deleteAuction(a)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-else class="text-gray-500 py-6 text-center">No upcoming auctions.</p>
      <p v-if="error" class="text-red-600 mt-2 text-xs">{{ error }}</p>
    </div>

    <!-- Edit modal -->
    <div v-if="activeModal === 'edit'" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
      <div class="relative bg-white w-full max-w-lg rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h2 class="text-sm font-semibold">Edit Auction</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeModal">✕</button>
        </div>

        <form @submit.prevent="saveEdit" class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Price (points)</label>
            <input v-model.number="editPrice" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Go-live (CST/CDT)</label>
            <div class="grid grid-cols-2 gap-2">
              <input v-model="editStartDate" type="date" class="border rounded-md px-2 py-1.5 text-sm" required />
              <select v-model="editStartHour" class="border rounded-md px-2 py-1.5 text-sm" required>
                <option disabled value="">Select hour</option>
                <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Duration</label>
            <div class="flex items-center gap-3">
              <input v-model.number="editDurationDays" type="range" min="1" max="7" class="w-full" />
              <span class="w-10 text-center text-xs">{{ editDurationDays }}d</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input id="editIsFeatured" v-model="editIsFeatured" type="checkbox" class="h-4 w-4 border-gray-300 rounded" />
            <label for="editIsFeatured" class="text-xs font-medium text-gray-700">Is Featured</label>
          </div>
          <p class="text-[10px] text-gray-500">
            Marks the auction as featured on the auctions page. Users cannot bid if they
            currently own 2+ of this cToon or have received 2+ in the last 30 days.
          </p>

          <div class="pt-3 border-t flex flex-wrap items-center gap-2">
            <button
              type="submit"
              :disabled="editSaving"
              class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save Changes
            </button>
            <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closeModal">Cancel</button>
            <span v-if="editError" class="text-red-600 text-[11px]">{{ editError }}</span>
          </div>
        </form>
      </div>
    </div>

    <!-- Remove All confirmation modal -->
    <div v-if="activeModal === 'removeAll'" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
      <div class="relative bg-white w-full max-w-md rounded-lg shadow-lg p-5">
        <h2 class="text-sm font-semibold mb-2">Remove All Upcoming Auctions?</h2>
        <p class="text-xs text-gray-600">
          This permanently deletes all {{ upcomingAuctions.length }} upcoming AuctionOnly
          listing(s) shown on this page (none of them have gone live yet). This cannot be undone.
        </p>
        <p v-if="removeAllError" class="text-red-600 text-[11px] mt-2 whitespace-pre-wrap break-words">{{ removeAllError }}</p>
        <div class="pt-3 mt-2 border-t flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="px-3 py-1 text-xs rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300"
            :disabled="removeAllBusy"
            @click="removeAllUpcoming"
          >
            {{ removeAllBusy ? 'Removing…' : 'Yes, Remove All' }}
          </button>
          <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" :disabled="removeAllBusy" @click="closeModal">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Error Log modal -->
    <div v-if="activeModal === 'errorLog'" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
      <div class="relative bg-white w-full max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 gap-2">
          <h2 class="text-sm font-semibold">Error Log</h2>
          <div class="flex items-center gap-2">
            <button
              v-if="errorLog.length"
              type="button"
              class="px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50"
              @click="clearErrorLog"
            >
              Clear Log
            </button>
            <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeModal">✕</button>
          </div>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3">
          <div v-if="errorLogLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <template v-else>
            <div v-if="errorLog.length" class="bg-gray-50 rounded-lg border divide-y">
              <div v-for="e in errorLog" :key="e.id" class="p-2">
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    class="px-1.5 py-0 rounded text-[10px] font-medium"
                    :class="errorContextBadgeClass(e.context)"
                  >
                    {{ errorContextLabel(e.context) }}
                  </span>
                  <span class="text-gray-500">{{ fmtCST(e.createdAt) }}</span>
                  <span v-if="e.auctionOnlyId" class="text-gray-400 truncate max-w-full">• {{ e.auctionOnlyId }}</span>
                </div>
                <pre class="text-[11px] text-red-700 mt-1.5 whitespace-pre-wrap break-words">{{ e.message }}</pre>
              </div>
            </div>
            <p v-else class="text-gray-500 py-6 text-center">No errors logged.</p>
          </template>
          <p v-if="errorLogError" class="text-red-600 mt-2 text-xs">{{ errorLogError }}</p>
        </div>
      </div>
    </div>

    <!-- History modal -->
    <div v-if="activeModal === 'history'" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
      <div class="relative bg-white w-full max-w-3xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 gap-2">
          <h2 class="text-sm font-semibold">History (last 7 days)</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeModal">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3">
          <div v-if="historyLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <template v-else>
            <div v-if="history.length" class="bg-gray-50 rounded-lg border divide-y">
              <div v-for="h in history" :key="h.id" class="p-2">
                <div class="flex flex-col gap-2">
                  <div class="flex items-start gap-2 min-w-0 flex-wrap">
                    <img
                      v-if="h.ctoon?.assetPath"
                      :src="h.ctoon.assetPath"
                      class="w-10 h-10 rounded object-cover border shrink-0"
                      alt="cToon"
                    />
                    <div class="min-w-0 flex-1 basis-40">
                      <div class="font-medium text-xs truncate">{{ h.ctoon?.name || 'Unknown cToon' }}</div>
                      <div class="text-[10px] text-gray-500 break-words">
                        <span v-if="h.mintNumber !== null && h.mintNumber !== undefined">Mint #{{ h.mintNumber }} • </span>
                        <span v-if="h.ownerUsername">{{ h.ownerUsername }} • </span>
                        {{ fmtCST(h.startsAt) }}
                      </div>
                    </div>
                    <span
                      class="px-1.5 py-0 rounded text-[10px] font-medium border-l-4 shrink-0 whitespace-nowrap"
                      :class="historyStatusBadgeClass(h.status)"
                    >
                      {{ historyStatusLabel(h.status) }}
                    </span>
                  </div>

                  <div class="flex flex-wrap items-center gap-1.5">
                    <button
                      v-if="h.status === 'stuck' && confirmingStartId !== h.id"
                      type="button"
                      class="px-2 py-1 text-[11px] border rounded-md text-green-700 border-green-200 hover:bg-green-50"
                      :disabled="startingId === h.id"
                      @click="confirmingStartId = h.id"
                    >
                      Start Now
                    </button>

                    <template v-else-if="confirmingStartId === h.id">
                      <button
                        type="button"
                        class="px-2 py-1 text-[11px] rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        :disabled="startingId === h.id"
                        @click="startHistoryItem(h)"
                      >
                        {{ startingId === h.id ? 'Starting…' : 'Confirm Start' }}
                      </button>
                      <button
                        type="button"
                        class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50"
                        :disabled="startingId === h.id"
                        @click="confirmingStartId = null"
                      >
                        Cancel
                      </button>
                    </template>

                    <button
                      v-if="h.removable && confirmingId !== h.id"
                      type="button"
                      class="px-2 py-1 text-[11px] border rounded-md text-red-700 border-red-200 hover:bg-red-50"
                      :disabled="removingId === h.id"
                      @click="confirmingId = h.id"
                    >
                      Remove
                    </button>

                    <template v-else-if="confirmingId === h.id">
                      <button
                        type="button"
                        class="px-2 py-1 text-[11px] rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        :disabled="removingId === h.id"
                        @click="removeHistoryItem(h)"
                      >
                        {{ removingId === h.id ? 'Removing…' : 'Confirm Remove' }}
                      </button>
                      <button
                        type="button"
                        class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50"
                        :disabled="removingId === h.id"
                        @click="confirmingId = null"
                      >
                        Cancel
                      </button>
                    </template>

                    <span
                      v-if="h.status !== 'stuck' && !h.removable && confirmingId !== h.id"
                      class="text-[10px] text-gray-400 italic"
                    >
                      Not removable
                    </span>
                  </div>
                </div>

                <p v-if="h.blockedReason && confirmingId !== h.id" class="text-[10px] text-gray-500 mt-1.5">
                  {{ h.blockedReason }}
                </p>
                <p v-if="historyErrors[h.id]" class="text-[11px] text-red-700 mt-1.5 whitespace-pre-wrap break-words">
                  {{ historyErrors[h.id] }}
                </p>
              </div>
            </div>
            <p v-else class="text-gray-500 py-6 text-center">No auctions were scheduled to go live in the last 7 days.</p>
          </template>
          <p v-if="historyError" class="text-red-600 mt-2 text-xs">{{ historyError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'

const auctions = ref([])
const upcomingAuctions = computed(() => {
  const now = Date.now()
  return auctions.value
    .filter(a => new Date(a.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
})
const error = ref('')

// Only one modal can be open at a time: null | 'edit' | 'errorLog' | 'history' | 'removeAll'
const activeModal = ref(null)

const removeAllBusy = ref(false)
const removeAllError = ref('')

const errorLog = ref([])
const errorLogError = ref('')
const errorLogLoading = ref(false)

const history = ref([])
const historyError = ref('')
const historyLoading = ref(false)
const confirmingId = ref(null)
const removingId = ref(null)
const confirmingStartId = ref(null)
const startingId = ref(null)
const historyErrors = ref({})

const editing = ref(null)
const editPrice = ref(0)
const editStartDate = ref('')
const editStartHour = ref('')
const editDurationDays = ref(1)
const editIsFeatured = ref(false)
const editError = ref('')
const editSaving = ref(false)

const hourOptions = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

watch(activeModal, (val) => {
  if (typeof document === 'undefined') return
  document.documentElement.style.overflow = val ? 'hidden' : ''
})
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.documentElement.style.overflow = ''
})

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

function errorContextLabel(context) {
  if (context === 'activation') return 'Go-live'
  if (context === 'removal') return 'Removal'
  if (context === 'process') return 'Process Crash'
  return 'Scheduling'
}

function errorContextBadgeClass(context) {
  if (context === 'activation') return 'bg-orange-100 text-orange-800'
  if (context === 'removal') return 'bg-red-100 text-red-800'
  if (context === 'process') return 'bg-red-200 text-red-900'
  return 'bg-purple-100 text-purple-800'
}

const HISTORY_STATUS_META = {
  pending: { label: 'Pending', class: 'bg-gray-100 text-gray-800 border-gray-400' },
  stuck: { label: 'Stuck / Never Went Live', class: 'bg-yellow-100 text-yellow-800 border-yellow-500' },
  live_untracked: { label: 'Live (untracked)', class: 'bg-blue-100 text-blue-800 border-blue-500' },
  live_no_bids: { label: 'Live — No Bids', class: 'bg-blue-100 text-blue-800 border-blue-500' },
  live_with_bids: { label: 'Live — Has Bids', class: 'bg-green-100 text-green-800 border-green-500' },
  closed: { label: 'Completed', class: 'bg-green-100 text-green-800 border-green-500' },
  cancelled: { label: 'Cancelled', class: 'bg-gray-100 text-gray-800 border-gray-400' },
  unknown: { label: 'Unknown', class: 'bg-red-100 text-red-800 border-red-500' }
}

function historyStatusLabel(status) {
  return HISTORY_STATUS_META[status]?.label || status
}

function historyStatusBadgeClass(status) {
  return HISTORY_STATUS_META[status]?.class || 'bg-gray-100 text-gray-800 border-gray-400'
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

function closeModal() {
  activeModal.value = null
  editing.value = null
  editError.value = ''
  confirmingId.value = null
  confirmingStartId.value = null
  removeAllError.value = ''
}

async function removeAllUpcoming() {
  removeAllError.value = ''
  removeAllBusy.value = true
  try {
    const res = await fetch('/api/admin/auction-only/bulk', {
      method: 'DELETE',
      credentials: 'include'
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(body.message || body.statusMessage || `Remove All failed (status ${res.status})`)
    }
    activeModal.value = null
    await load()
  } catch (e) {
    removeAllError.value = e.message
  } finally {
    removeAllBusy.value = false
  }
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
  activeModal.value = 'edit'
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
      throw new Error(err.message || err.statusMessage || 'Update failed')
    }
    closeModal()
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
      throw new Error(err.message || err.statusMessage || 'Delete failed')
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

function openErrorLog() {
  activeModal.value = 'errorLog'
  loadErrorLog()
}

async function loadErrorLog() {
  errorLogError.value = ''
  errorLogLoading.value = true
  try {
    const res = await fetch('/api/admin/auction-only/errors', { credentials: 'include' })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || 'Failed to load error log')
    }
    errorLog.value = await res.json()
  } catch (e) {
    errorLogError.value = e.message
  } finally {
    errorLogLoading.value = false
  }
}

async function clearErrorLog() {
  if (!confirm('Clear the error log?')) return
  try {
    const res = await fetch('/api/admin/auction-only/errors', {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || 'Failed to clear error log')
    }
    errorLog.value = []
  } catch (e) {
    errorLogError.value = e.message
  }
}

function openHistory() {
  activeModal.value = 'history'
  loadHistory()
}

async function loadHistory() {
  historyError.value = ''
  historyLoading.value = true
  try {
    const res = await fetch('/api/admin/auction-only/history', { credentials: 'include' })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || 'Failed to load history')
    }
    history.value = await res.json()
  } catch (e) {
    historyError.value = e.message
  } finally {
    historyLoading.value = false
  }
}

async function startHistoryItem(h) {
  historyErrors.value = { ...historyErrors.value, [h.id]: '' }
  startingId.value = h.id
  try {
    const res = await fetch(`/api/admin/auction-only/${h.id}/start`, {
      method: 'POST',
      credentials: 'include'
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || err.statusMessage || `Start failed (status ${res.status})`)
    }
    confirmingStartId.value = null
    await loadHistory()
  } catch (e) {
    historyErrors.value = { ...historyErrors.value, [h.id]: e.message }
  } finally {
    startingId.value = null
  }
}

async function removeHistoryItem(h) {
  historyErrors.value = { ...historyErrors.value, [h.id]: '' }
  removingId.value = h.id
  try {
    const res = await fetch(`/api/admin/auction-only/${h.id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || err.statusMessage || `Remove failed (status ${res.status})`)
    }
    history.value = history.value.filter(row => row.id !== h.id)
    confirmingId.value = null
    await load()
  } catch (e) {
    historyErrors.value = { ...historyErrors.value, [h.id]: e.message }
  } finally {
    removingId.value = null
  }
}

onMounted(() => {
  load()
})
</script>
