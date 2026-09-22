<template>
  <div class="admin-touch-trades bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-1 text-gray-900">Track Touch Trades</h1>
        <p class="text-[11px] text-gray-500 mb-3">
          Same-mint cToons traded back and forth between the same two players — an initial trade, then a trade back, at least once. Includes full trade data and each side's IP/device where available.
          Only trades made through the trade-offer system are covered; the retired live trade-room path is not.
        </p>

        <!-- Filters -->
        <form class="flex flex-wrap items-end gap-2 mb-3 border rounded p-2 bg-gray-50" @submit.prevent="applyFilters">
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">Username</label>
            <input
              v-model="usernameFilter"
              type="text"
              list="tt-user-suggestions"
              placeholder="Either player..."
              class="border rounded px-1.5 py-1 text-xs w-40"
              style="font-size: 16px;"
            />
            <datalist id="tt-user-suggestions">
              <option v-for="s in userSuggestions" :key="s" :value="s" />
            </datalist>
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">From</label>
            <input v-model="fromDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">To</label>
            <input v-model="toDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" />
          </div>
          <label class="flex items-center gap-1 text-[11px] pb-1.5">
            <input v-model="showDismissed" type="checkbox" />
            Show dismissed
          </label>
          <button type="submit" class="border rounded px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700">Apply</button>
          <span class="text-[10px] text-gray-500 pb-1.5">Max {{ maxRangeDays }}-day window.</span>
        </form>

        <div v-if="error" class="text-red-600 py-2">{{ error }}</div>
        <div v-else-if="loading" class="text-center py-6 text-gray-500">Loading…</div>

        <template v-else>
          <div class="text-[11px] text-gray-600 mb-2">
            {{ total }} flagged pair{{ total === 1 ? '' : 's' }}{{ range.from ? ` — ${fmtDate(range.from)} to ${fmtDate(range.to)}` : '' }}
          </div>

          <div v-if="!groups.length" class="text-gray-500 py-4">No touch-trades found for this window.</div>

          <!-- Accordion rows: same markup for mobile and desktop, just reflows -->
          <div v-else class="space-y-2">
            <div v-for="g in groups" :key="g.groupKey" class="border rounded-lg bg-white overflow-hidden">
              <button
                type="button"
                class="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-50 tt-row-toggle"
                :aria-expanded="openKey === g.groupKey ? 'true' : 'false'"
                @click="toggleOpen(g.groupKey)"
              >
                <img v-if="g.ctoon.assetPath" :src="g.ctoon.assetPath" :alt="g.ctoon.name" class="w-8 h-8 object-contain shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="font-medium truncate" :title="g.ctoon.name">
                    {{ g.ctoon.name || 'Unknown cToon' }} <span class="text-gray-500">#{{ g.mintNumber }}</span>
                  </div>
                  <div class="text-[10px] text-gray-500 truncate">
                    {{ g.userA.username || g.userA.id }} ⇄ {{ g.userB.username || g.userB.id }}
                    · {{ g.tradeCount }} trade{{ g.tradeCount === 1 ? '' : 's' }}
                    · {{ fmtDate(g.firstAt) }} → {{ fmtDate(g.lastAt) }}
                  </div>
                </div>
                <span class="text-gray-400 shrink-0">{{ openKey === g.groupKey ? '▲' : '▼' }}</span>
              </button>

              <div v-if="openKey === g.groupKey" class="border-t p-2 bg-gray-50">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                  <NuxtLink :to="collectionLink(g.userA)" class="text-blue-700 hover:underline text-[11px]">View {{ g.userA.username }}'s collection</NuxtLink>
                  <NuxtLink :to="usersLink(g.userA)" class="text-blue-700 hover:underline text-[11px]">Manage {{ g.userA.username }}</NuxtLink>
                  <NuxtLink :to="collectionLink(g.userB)" class="text-blue-700 hover:underline text-[11px]">View {{ g.userB.username }}'s collection</NuxtLink>
                  <NuxtLink :to="usersLink(g.userB)" class="text-blue-700 hover:underline text-[11px]">Manage {{ g.userB.username }}</NuxtLink>
                  <button
                    type="button"
                    class="ml-auto border rounded px-2 py-1 text-[11px] bg-amber-50 hover:bg-amber-100"
                    @click="toggleDismissForm(g.groupKey)"
                  >{{ dismissFormKey === g.groupKey ? 'Cancel' : 'Dismiss' }}</button>
                </div>

                <div v-if="dismissFormKey === g.groupKey" class="mb-2 p-2 border rounded bg-white flex flex-wrap items-center gap-2">
                  <input v-model="dismissNote" type="text" placeholder="Optional note (e.g. 'friends, reviewed')" class="border rounded px-1.5 py-1 text-xs flex-1 min-w-[160px]" />
                  <button type="button" class="border rounded px-2 py-1 text-[11px] bg-emerald-600 text-white hover:bg-emerald-700" :disabled="dismissing" @click="confirmDismiss(g)">
                    Confirm dismiss
                  </button>
                </div>

                <div v-for="(leg, i) in g.legs" :key="i" class="mb-2 p-2 border rounded bg-white">
                  <div class="flex items-center justify-between flex-wrap gap-1 mb-1">
                    <div class="font-medium">{{ leg.fromUsername || leg.fromUserId }} → {{ leg.toUsername || leg.toUserId }}</div>
                    <div class="text-[10px] text-gray-500">{{ fmtDateTime(leg.createdAt) }}</div>
                  </div>

                  <div v-if="leg.limitedDetail" class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mb-1">
                    Limited detail — this trade predates full trade-offer linkage.
                  </div>
                  <template v-else>
                    <div class="text-[10px] text-gray-600 mb-1" v-if="leg.pointsOffered">Points offered: {{ leg.pointsOffered }}</div>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <div class="text-[10px] font-medium text-gray-700 mb-0.5">Offered</div>
                        <div class="flex flex-wrap gap-1">
                          <div v-for="(it, idx) in leg.itemsOffered" :key="idx" class="text-center w-14">
                            <img v-if="it.assetPath" :src="it.assetPath" :alt="it.name" class="w-10 h-10 object-contain mx-auto" />
                            <div class="text-[9px] truncate" :title="it.name">{{ it.name }}</div>
                            <div v-if="it.mintNumber != null" class="text-[9px] text-gray-500">#{{ it.mintNumber }}</div>
                          </div>
                          <div v-if="!leg.itemsOffered.length" class="text-[10px] text-gray-400">—</div>
                        </div>
                      </div>
                      <div>
                        <div class="text-[10px] font-medium text-gray-700 mb-0.5">Requested</div>
                        <div class="flex flex-wrap gap-1">
                          <div v-for="(it, idx) in leg.itemsRequested" :key="idx" class="text-center w-14">
                            <img v-if="it.assetPath" :src="it.assetPath" :alt="it.name" class="w-10 h-10 object-contain mx-auto" />
                            <div class="text-[9px] truncate" :title="it.name">{{ it.name }}</div>
                            <div v-if="it.mintNumber != null" class="text-[9px] text-gray-500">#{{ it.mintNumber }}</div>
                          </div>
                          <div v-if="!leg.itemsRequested.length" class="text-[10px] text-gray-400">—</div>
                        </div>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 mt-2">
                      <div v-if="leg.initiator" class="text-[10px] border rounded p-1">
                        <div class="font-medium text-gray-700">Offer created by {{ leg.initiator.userId === leg.fromUserId ? leg.fromUsername : leg.toUsername }}</div>
                        <div>IP: {{ leg.initiator.ip || '—' }} <span :class="sourceBadgeClass(leg.initiator.source)">{{ leg.initiator.source }}</span></div>
                        <div class="truncate" :title="leg.initiator.userAgent">Device: {{ leg.initiator.userAgent || '—' }}</div>
                      </div>
                      <div v-if="leg.acceptedBy" class="text-[10px] border rounded p-1">
                        <div class="font-medium text-gray-700">Accepted by {{ leg.acceptedBy.userId === leg.fromUserId ? leg.fromUsername : leg.toUsername }}</div>
                        <div>IP: {{ leg.acceptedBy.ip || '—' }} <span :class="sourceBadgeClass(leg.acceptedBy.source)">{{ leg.acceptedBy.source }}</span></div>
                        <div class="truncate" :title="leg.acceptedBy.userAgent">Device: {{ leg.acceptedBy.userAgent || '—' }}</div>
                      </div>
                    </div>
                  </template>
                </div>
                <p class="text-[9px] text-gray-400">IP/device is self-reported by the browser and can be spoofed — treat as corroborating, not conclusive.</p>
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const maxRangeDays = 180

const groups = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref(null)
const range = ref({ from: null, to: null })

const usernameFilter = ref('')
const userSuggestions = ref([])
const fromDate = ref('')
const toDate = ref('')
const showDismissed = ref(false)

const openKey = ref(null)
const dismissFormKey = ref(null)
const dismissNote = ref('')
const dismissing = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function toYMD(d) { return d.toISOString().slice(0, 10) }

function fmtDate(d) {
  if (!d) return '—'
  try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(d)) } catch { return '—' }
}
function fmtDateTime(d) {
  if (!d) return '—'
  try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(d)) + ' CST' } catch { return '—' }
}
function sourceBadgeClass(source) {
  const base = 'inline-block px-1 rounded text-[9px] font-medium'
  if (source === 'captured') return `${base} bg-emerald-100 text-emerald-800`
  if (source === 'inferred') return `${base} bg-amber-100 text-amber-800`
  return `${base} bg-gray-200 text-gray-600`
}

function toggleOpen(key) {
  openKey.value = openKey.value === key ? null : key
  dismissFormKey.value = null
}
function toggleDismissForm(key) {
  dismissFormKey.value = dismissFormKey.value === key ? null : key
  dismissNote.value = ''
}

function collectionLink(u) {
  return { path: '/newsite/admin/manageCollection', query: { username: u.username || '' } }
}
function usersLink(u) {
  return { path: '/newsite/admin/manageUsers', query: { username: u.username || '' } }
}

async function fetchGroups() {
  loading.value = true
  error.value = null
  try {
    const query = {
      page: page.value,
      limit: pageSize,
      username: usernameFilter.value.trim() || undefined,
      from: fromDate.value || undefined,
      to: toDate.value || undefined,
      showDismissed: showDismissed.value ? '1' : undefined
    }
    const res = await $fetch('/api/admin/touch-trades', { query })
    groups.value = res.groups || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
    range.value = { from: res.from, to: res.to }
    if (!fromDate.value && res.from) fromDate.value = toYMD(new Date(res.from))
    if (!toDate.value && res.to) toDate.value = toYMD(new Date(res.to))
  } catch (err) {
    groups.value = []
    total.value = 0
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load touch-trades'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  fetchGroups()
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchGroups()
}
function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchGroups()
}

async function confirmDismiss(g) {
  dismissing.value = true
  try {
    await $fetch('/api/admin/touch-trades/dismiss', {
      method: 'POST',
      body: {
        ctoonId: g.ctoon.id,
        mintNumber: g.mintNumber,
        userAId: g.userA.id,
        userBId: g.userB.id,
        note: dismissNote.value.trim() || undefined
      }
    })
    dismissFormKey.value = null
    if (!showDismissed.value) {
      groups.value = groups.value.filter(x => x.groupKey !== g.groupKey)
      total.value = Math.max(0, total.value - 1)
    }
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to dismiss'
  } finally {
    dismissing.value = false
  }
}

async function fetchUserSuggestions() {
  const term = usernameFilter.value.trim()
  if (!term) { userSuggestions.value = []; return }
  try {
    const res = await $fetch('/api/admin/user-mentions', { query: { q: term, limit: 10 } })
    userSuggestions.value = (res.items || []).map(i => i.username).filter(Boolean)
  } catch {
    userSuggestions.value = []
  }
}
let suggestionDebounceId = null
watch(usernameFilter, () => {
  if (suggestionDebounceId) clearTimeout(suggestionDebounceId)
  suggestionDebounceId = setTimeout(fetchUserSuggestions, 200)
})

onBeforeUnmount(() => {
  if (suggestionDebounceId) clearTimeout(suggestionDebounceId)
})

onMounted(() => {
  fetchGroups()
})
</script>

<style scoped>
.admin-touch-trades {
  width: 100%;
  min-height: 100%;
}
.tt-row-toggle { min-height: 44px; }
.touch-btn { min-height: 32px; }
</style>
