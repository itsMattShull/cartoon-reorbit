<template>
  <div class="admin-trade-auction-bans bg-gray-50">
    <div class="p-2 text-xs">
      <p class="mb-2 text-[11px] text-gray-600">
        Two banned users can't trade with each other, and neither can bid on an auction the other one created.
        Creating a ban withdraws their pending trades with each other. Deleting a ban lifts it and restores nothing.
      </p>

      <!-- Filter + create -->
      <div class="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div class="flex items-center">
          <label for="tabUser" class="mr-1 font-medium">User:</label>
          <input
            id="tabUser"
            v-model="userQuery"
            type="text"
            placeholder="Type a username..."
            class="border rounded px-1.5 py-0.5 text-xs"
          />
        </div>
        <button class="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-[11px] font-medium" @click="openCreate">
          Create Ban
        </button>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">Total: {{ total }} ban{{ total === 1 ? '' : 's' }}</div>
      <div v-if="flash" class="mb-2 rounded border border-green-300 bg-green-50 p-1.5 text-[11px] text-green-900">{{ flash }}</div>

      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="listError" class="text-red-600">{{ listError }}</div>
      <div v-else-if="bans.length === 0" class="text-gray-500">No bans found.</div>
      <div v-else>
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full bg-white rounded shadow text-[11px]">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-1.5 py-1 text-left">Users</th>
                <th class="px-1.5 py-1 text-left">Reason</th>
                <th class="px-1.5 py-1 text-left">Created by</th>
                <th class="px-1.5 py-1 text-left">Created (CST)</th>
                <th class="px-1.5 py-1"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in bans" :key="b.id" class="border-t">
                <td class="px-1.5 py-1 font-medium whitespace-nowrap">{{ nameOf(b.userA) }} ⇄ {{ nameOf(b.userB) }}</td>
                <td class="px-1.5 py-1 text-gray-700">{{ b.reason || '—' }}</td>
                <td class="px-1.5 py-1 whitespace-nowrap">{{ b.createdByUsername || '—' }}</td>
                <td class="px-1.5 py-1 whitespace-nowrap">{{ formatCST(b.createdAt) }}</td>
                <td class="px-1.5 py-1 text-right whitespace-nowrap">
                  <button class="border border-red-600 text-red-700 hover:bg-red-50 px-2 py-0.5 rounded text-[11px]" @click="openDelete(b)">
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden grid grid-cols-1 gap-2">
          <div v-for="b in bans" :key="b.id" class="border rounded p-2 shadow bg-white text-[11px]">
            <div class="font-medium">{{ nameOf(b.userA) }} ⇄ {{ nameOf(b.userB) }}</div>
            <div v-if="b.reason" class="mt-0.5 text-gray-700">{{ b.reason }}</div>
            <div class="mt-0.5 text-gray-500">By {{ b.createdByUsername || 'an admin' }} · {{ formatCST(b.createdAt) }}</div>
            <div class="mt-2">
              <button class="border border-red-600 text-red-700 px-2 py-0.5 rounded text-[11px]" @click="openDelete(b)">Delete</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="!loading" class="mt-3 flex items-center justify-between">
        <div class="text-[11px] text-gray-600">Page {{ page }} of {{ totalPages }}</div>
        <div class="space-x-1">
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="goPage(page - 1)">Prev</button>
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="goPage(page + 1)">Next</button>
        </div>
      </div>
    </div>

    <!-- Create Ban modal: fixed header and footer, scrollable body -->
    <div v-if="create.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" @click.self="closeCreate">
      <div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded bg-white text-xs shadow-lg" role="dialog" aria-modal="true" aria-labelledby="tabCreateTitle">
        <!-- Header -->
        <div class="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
          <div>
            <h2 id="tabCreateTitle" class="text-sm font-semibold">{{ create.result ? 'Ban created' : 'Ban trades/auctions' }}</h2>
            <div class="text-[11px] text-gray-600">Two users who can't trade or bid on each other's auctions</div>
          </div>
          <button class="text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30" :disabled="create.saving" aria-label="Close" @click="closeCreate">×</button>
        </div>

        <!-- Body -->
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <template v-if="create.result">
            <div class="rounded border border-green-300 bg-green-50 p-2 text-green-900">
              {{ nameOf(create.result.ban.userA) }} and {{ nameOf(create.result.ban.userB) }} can no longer trade with each other
              or bid on each other's auctions.
            </div>
            <ul class="mt-2 space-y-0.5 text-gray-700">
              <li>{{ countText(create.result.withdrawnTrades, 'pending trade') }} between them {{ create.result.withdrawnTrades === 1 ? 'was' : 'were' }} withdrawn.</li>
              <li>{{ countText(create.result.autoBidsStopped, 'auto-bid') }} on each other's auctions {{ create.result.autoBidsStopped === 1 ? 'was' : 'were' }} turned off.</li>
            </ul>
          </template>

          <template v-else>
            <p class="mb-3 text-gray-700">
              Pick the two users. Type at least 3 characters to search.
            </p>

            <div v-for="(p, i) in pickers" :key="i" class="relative mb-3">
              <label :for="`tabPicker${i}`" class="mb-0.5 block font-medium">User {{ i + 1 }}</label>
              <div v-if="p.selected" class="flex items-center justify-between rounded border bg-gray-50 px-2 py-1">
                <span>
                  <span class="font-medium">{{ p.selected.username }}</span>
                  <span v-if="p.selected.banned" class="ml-1 text-[10px] text-red-700">(site banned)</span>
                  <span v-else-if="p.selected.active === false" class="ml-1 text-[10px] text-gray-500">(inactive)</span>
                </span>
                <button class="text-[11px] text-blue-700 hover:underline" :disabled="create.saving" @click="clearPicker(i)">Change</button>
              </div>
              <template v-else>
                <input
                  :id="`tabPicker${i}`"
                  v-model="p.query"
                  type="text"
                  autocomplete="off"
                  placeholder="Username..."
                  class="w-full border rounded px-1.5 py-1 text-xs"
                  @focus="p.open = true"
                  @blur="closeDropdownSoon(i)"
                  @keydown.down.prevent="moveHighlight(i, 1)"
                  @keydown.up.prevent="moveHighlight(i, -1)"
                  @keydown.enter.prevent="pickHighlighted(i)"
                  @keydown.esc="p.open = false"
                />
                <div
                  v-if="p.open && p.query.trim().length >= MIN_QUERY"
                  class="absolute left-0 right-0 z-10 mt-0.5 max-h-48 overflow-y-auto rounded border bg-white shadow"
                >
                  <div v-if="p.searching" class="px-2 py-1 text-gray-500">Searching...</div>
                  <div v-else-if="p.error" class="px-2 py-1 text-red-600">{{ p.error }}</div>
                  <div v-else-if="!visibleResults(i).length" class="px-2 py-1 text-gray-500">No matching usernames.</div>
                  <template v-else>
                    <button
                      v-for="(u, j) in visibleResults(i)"
                      :key="u.id"
                      type="button"
                      class="block w-full px-2 py-1 text-left hover:bg-gray-100"
                      :class="{ 'bg-gray-100': j === p.highlight }"
                      @mousedown.prevent="pickUser(i, u)"
                    >
                      {{ u.username }}
                      <span v-if="u.banned" class="ml-1 text-[10px] text-red-700">(site banned)</span>
                      <span v-else-if="u.active === false" class="ml-1 text-[10px] text-gray-500">(inactive)</span>
                    </button>
                  </template>
                </div>
              </template>
            </div>

            <label for="tabReason" class="mb-0.5 block font-medium">Reason <span class="font-normal text-gray-500">(optional, only admins see it)</span></label>
            <textarea
              id="tabReason"
              v-model="create.reason"
              rows="3"
              :maxlength="MAX_REASON"
              class="w-full border rounded px-1.5 py-1 text-xs"
            />

            <div class="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
              <div class="font-semibold">What happens when you create it</div>
              <ul class="mt-1 list-disc pl-4 space-y-0.5">
                <li>Neither user can start, counter or accept a trade with the other.</li>
                <li>Neither user can bid or set an auto-bid on an auction the other one created.</li>
                <li>Their pending trades with each other are withdrawn, without a notice to either user.</li>
                <li>Their auto-bids on each other's active auctions are turned off. Bids already placed stay.</li>
              </ul>
            </div>

            <div v-if="create.error" class="mt-2 rounded border border-red-300 bg-red-50 p-2 text-red-800">{{ create.error }}</div>
          </template>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 justify-end gap-2 border-t px-3 py-2">
          <button v-if="create.result" class="rounded border px-3 py-1" @click="closeCreate">Close</button>
          <template v-else>
            <button class="rounded border px-3 py-1" :disabled="create.saving" @click="closeCreate">Cancel</button>
            <button
              class="rounded bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="!canCreate || create.saving"
              @click="submitCreate"
            >
              {{ create.saving ? 'Creating...' : 'Create Ban' }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Delete confirmation: fixed header and footer, scrollable body -->
    <div v-if="del.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" @click.self="closeDelete">
      <div class="flex max-h-[85vh] w-full max-w-md flex-col rounded bg-white text-xs shadow-lg" role="dialog" aria-modal="true" aria-labelledby="tabDeleteTitle">
        <div class="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
          <h2 id="tabDeleteTitle" class="text-sm font-semibold">Delete ban</h2>
          <button class="text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30" :disabled="del.saving" aria-label="Close" @click="closeDelete">×</button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <p>
            {{ nameOf(del.ban.userA) }} and {{ nameOf(del.ban.userB) }} will be able to trade with each other and bid on
            each other's auctions again.
          </p>
          <p class="mt-1 text-gray-600">Trades withdrawn and auto-bids turned off by this ban stay that way.</p>
          <div v-if="del.error" class="mt-2 rounded border border-red-300 bg-red-50 p-2 text-red-800">{{ del.error }}</div>
        </div>
        <div class="flex shrink-0 justify-end gap-2 border-t px-3 py-2">
          <button class="rounded border px-3 py-1" :disabled="del.saving" @click="closeDelete">Cancel</button>
          <button class="rounded bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50" :disabled="del.saving" @click="submitDelete">
            {{ del.saving ? 'Deleting...' : 'Delete Ban' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const MIN_QUERY = 3
const MAX_REASON = 500

// ── List ────────────────────────────────────────────────────────────────────
const bans = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 25
const loading = ref(false)
const listError = ref('')
const userQuery = ref('')
const flash = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function fetchBans () {
  loading.value = true
  listError.value = ''
  try {
    const res = await $fetch('/api/admin/trade-auction-bans', {
      query: { page: page.value, limit: pageSize, user: userQuery.value.trim() || undefined }
    })
    bans.value = res.items || []
    total.value = res.total || 0
  } catch (err) {
    bans.value = []
    total.value = 0
    listError.value = errMessage(err, 'Could not load bans.')
  } finally {
    loading.value = false
  }
}

function goPage (p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  fetchBans()
}

let listDebounce = null
watch(userQuery, () => {
  clearTimeout(listDebounce)
  listDebounce = setTimeout(() => { page.value = 1; fetchBans() }, 300)
})
onMounted(fetchBans)

// ── Create modal ────────────────────────────────────────────────────────────
const newPicker = () => ({ query: '', results: [], searching: false, error: '', open: false, highlight: 0, selected: null })
const pickers = reactive([newPicker(), newPicker()])
const create = reactive({ open: false, reason: '', saving: false, error: '', result: null })

const canCreate = computed(() =>
  !!pickers[0].selected && !!pickers[1].selected && pickers[0].selected.id !== pickers[1].selected.id)

function openCreate () {
  pickers.splice(0, 2, newPicker(), newPicker())
  Object.assign(create, { open: true, reason: '', saving: false, error: '', result: null })
}

function closeCreate () {
  if (create.saving) return
  const created = !!create.result
  create.open = false
  if (created) {
    flash.value = ''
    page.value = 1
    fetchBans()
  }
}

// One timer, abort controller and request counter per picker, so a slow search for
// an earlier query can never overwrite the results for what is typed now.
const searchTimers = [null, null]
const searchAborts = [null, null]
const searchTokens = [0, 0]

pickers.forEach((_, i) => {
  watch(() => pickers[i].query, (q) => {
    const p = pickers[i]
    clearTimeout(searchTimers[i])
    p.error = ''
    p.highlight = 0
    const trimmed = (q || '').trim()
    if (trimmed.length < MIN_QUERY) {
      searchAborts[i]?.abort()
      searchTokens[i]++
      p.results = []
      p.searching = false
      return
    }
    p.searching = true
    searchTimers[i] = setTimeout(() => runSearch(i, trimmed), 250)
  })
})

async function runSearch (i, q) {
  searchAborts[i]?.abort()
  const abort = new AbortController()
  searchAborts[i] = abort
  const token = ++searchTokens[i]
  const p = pickers[i]
  try {
    const res = await $fetch('/api/admin/users/search', { params: { q }, signal: abort.signal })
    if (token !== searchTokens[i]) return
    p.results = res?.users || []
  } catch (err) {
    if (token !== searchTokens[i]) return
    p.results = []
    p.error = errMessage(err, 'Search failed.')
  } finally {
    if (token === searchTokens[i]) p.searching = false
  }
}

// The other picker's user can't be picked again here.
function visibleResults (i) {
  const otherId = pickers[1 - i].selected?.id
  return pickers[i].results.filter(u => u.id !== otherId)
}

function pickUser (i, u) {
  const p = pickers[i]
  p.selected = u
  p.open = false
  create.error = ''
}

function clearPicker (i) {
  Object.assign(pickers[i], newPicker(), { open: true })
}

function moveHighlight (i, delta) {
  const n = visibleResults(i).length
  if (!n) return
  pickers[i].open = true
  pickers[i].highlight = (pickers[i].highlight + delta + n) % n
}

function pickHighlighted (i) {
  const u = visibleResults(i)[pickers[i].highlight]
  if (u) pickUser(i, u)
}

const blurTimers = [null, null]
function closeDropdownSoon (i) {
  clearTimeout(blurTimers[i])
  blurTimers[i] = setTimeout(() => { pickers[i].open = false }, 150)
}

async function submitCreate () {
  if (!canCreate.value || create.saving) return
  create.saving = true
  create.error = ''
  try {
    create.result = await $fetch('/api/admin/trade-auction-bans', {
      method: 'POST',
      body: { userIds: [pickers[0].selected.id, pickers[1].selected.id], reason: create.reason.trim() || null }
    })
  } catch (err) {
    create.error = errMessage(err, 'Could not create the ban.')
  } finally {
    create.saving = false
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────
const del = reactive({ open: false, ban: null, saving: false, error: '' })

function openDelete (ban) {
  Object.assign(del, { open: true, ban, saving: false, error: '' })
}

function closeDelete () {
  if (del.saving) return
  del.open = false
}

async function submitDelete () {
  if (del.saving) return
  del.saving = true
  del.error = ''
  try {
    await $fetch(`/api/admin/trade-auction-bans/${del.ban.id}`, { method: 'DELETE' })
    flash.value = `Ban between ${nameOf(del.ban.userA)} and ${nameOf(del.ban.userB)} deleted.`
    del.saving = false
    del.open = false
    if (bans.value.length === 1 && page.value > 1) page.value--
    fetchBans()
  } catch (err) {
    del.error = errMessage(err, 'Could not delete the ban.')
    del.saving = false
  }
}

onBeforeUnmount(() => {
  clearTimeout(listDebounce)
  searchTimers.forEach(clearTimeout)
  blurTimers.forEach(clearTimeout)
  searchAborts.forEach(a => a?.abort())
})

// ── Display helpers ─────────────────────────────────────────────────────────
const nameOf = (u) => u?.username || '(no username)'
const countText = (n, noun) => `${n || 0} ${noun}${n === 1 ? '' : 's'}`

function formatCST (d) {
  if (!d) return '-'
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(d))
  } catch { return '-' }
}

function errMessage (err, fallback) {
  return err?.data?.statusMessage || err?.statusMessage || err?.data?.message || err?.message || fallback
}
</script>

<style scoped>
.admin-trade-auction-bans {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
