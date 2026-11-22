<template>
  <div class="admin-trade-reversal bg-gray-50">
    <div class="p-2 text-xs">
      <p class="mb-2 text-[11px] text-gray-600">
        Undo an accepted trade: each cToon and sealed pack goes back to the user who gave it, and the points move back.
        A trade can only be reversed once.
      </p>

      <!-- Filters -->
      <div class="mb-2 flex flex-wrap items-end gap-2">
        <div class="flex items-center">
          <label for="trUser" class="mr-1 font-medium">User:</label>
          <input
            id="trUser"
            v-model="userQuery"
            type="text"
            placeholder="Type a username..."
            class="border rounded px-1.5 py-0.5 text-xs"
          />
        </div>
        <div class="flex items-center">
          <label for="trReversed" class="mr-1 font-medium">Show:</label>
          <select id="trReversed" v-model="reversedFilter" class="border rounded px-1.5 py-0.5 text-xs">
            <option value="all">All accepted trades</option>
            <option value="no">Not reversed</option>
            <option value="yes">Reversed</option>
          </select>
        </div>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">Total: {{ total }} trades</div>

      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="listError" class="text-red-600">{{ listError }}</div>
      <div v-else-if="trades.length === 0" class="text-gray-500">No trades found.</div>
      <div v-else>
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full bg-white rounded shadow text-[11px]">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-1.5 py-1 text-left">Accepted (CST)</th>
                <th class="px-1.5 py-1 text-left">Initiator</th>
                <th class="px-1.5 py-1 text-left">Gave</th>
                <th class="px-1.5 py-1 text-left">Recipient</th>
                <th class="px-1.5 py-1 text-left">Gave</th>
                <th class="px-1.5 py-1"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in trades" :key="t.id" class="border-t" :class="{ 'bg-gray-100 text-gray-500': t.reversal }">
                <td class="px-1.5 py-1 whitespace-nowrap">{{ formatCST(t.acceptedAt) }}</td>
                <td class="px-1.5 py-1 font-medium">{{ t.initiator.username }}</td>
                <td class="px-1.5 py-1 whitespace-nowrap">{{ gaveText(t.initiatorGave) }}</td>
                <td class="px-1.5 py-1 font-medium">{{ t.recipient.username }}</td>
                <td class="px-1.5 py-1 whitespace-nowrap">{{ gaveText(t.recipientGave) }}</td>
                <td class="px-1.5 py-1 text-right whitespace-nowrap">
                  <span v-if="t.reversal" class="inline-block rounded bg-gray-200 px-1.5 py-0.5 text-[10px]" :title="reversedTitle(t)">
                    Reversed {{ formatCST(t.reversal.createdAt) }}
                  </span>
                  <button v-else class="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-[11px]" @click="openModal(t)">
                    Undo Trade
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden grid grid-cols-1 gap-2">
          <div v-for="t in trades" :key="t.id" class="border rounded p-2 shadow bg-white text-[11px]" :class="{ 'opacity-60': t.reversal }">
            <div class="text-gray-500 mb-1">{{ formatCST(t.acceptedAt) }}</div>
            <div><span class="font-medium">{{ t.initiator.username }}</span> gave {{ gaveText(t.initiatorGave) }}</div>
            <div><span class="font-medium">{{ t.recipient.username }}</span> gave {{ gaveText(t.recipientGave) }}</div>
            <div class="mt-2">
              <span v-if="t.reversal" class="inline-block rounded bg-gray-200 px-1.5 py-0.5 text-[10px]">Reversed {{ formatCST(t.reversal.createdAt) }}</span>
              <button v-else class="bg-red-600 text-white px-2 py-0.5 rounded text-[11px]" @click="openModal(t)">Undo Trade</button>
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

    <!-- Undo Trade modal: fixed header and footer, scrollable body -->
    <div v-if="modal.open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" @click.self="closeModal">
      <div class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded bg-white text-xs shadow-lg" role="dialog" aria-modal="true" aria-labelledby="trModalTitle">
        <!-- Header -->
        <div class="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
          <div>
            <h2 id="trModalTitle" class="text-sm font-semibold">
              {{ modal.phase === 'done' ? 'Trade reversed' : modal.phase === 'error' ? 'Trade reversal failed' : 'Undo trade' }}
            </h2>
            <div v-if="modal.trade" class="text-[11px] text-gray-600">
              {{ modal.trade.initiator.username }} ⇄ {{ modal.trade.recipient.username }} · accepted {{ formatCST(modal.trade.acceptedAt) }}
            </div>
          </div>
          <button class="text-base leading-none text-gray-500 hover:text-gray-800 disabled:opacity-30" :disabled="modal.phase === 'running'" aria-label="Close" @click="closeModal">×</button>
        </div>

        <!-- Body -->
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <!-- Loading the preview -->
          <div v-if="modal.phase === 'loading'" class="text-gray-500">Checking where every item in this trade is now...</div>

          <!-- Not reversible / preview failed -->
          <div v-else-if="modal.phase === 'blocked'" class="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
            {{ modal.blockedReason }}
          </div>

          <!-- Preview -->
          <template v-else-if="modal.phase === 'preview' && plan">
            <p class="mb-2 text-gray-700">
              This is what undoing the trade will do right now. Everything happens at once: if any step fails, nothing changes.
            </p>

            <div v-for="side in previewSides" :key="side.key" class="mb-3 rounded border p-2">
              <h3 class="mb-1 font-semibold">Back to {{ side.toUsername }} <span class="font-normal text-gray-500">(from {{ side.fromUsername }})</span></h3>
              <div v-if="!side.items.length" class="text-gray-500">Nothing — {{ side.toUsername }} gave no cToons or packs.</div>
              <ul v-else class="divide-y">
                <li v-for="item in side.items" :key="item.kind + item.id" class="flex items-center gap-2 py-1">
                  <img v-if="item.image" :src="item.image" alt="" class="h-8 w-8 shrink-0 rounded object-contain" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium">
                      {{ item.name }}
                      <span v-if="item.kind === 'pack'" class="text-purple-700">(pack)</span>
                      <span v-if="item.mintNumber != null" class="text-gray-500">#{{ item.mintNumber }}</span>
                    </div>
                    <div v-if="item.reason" class="text-[10px] text-gray-500">It {{ item.reason }}.</div>
                  </div>
                  <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px]" :class="outcomeClass(item.outcome)">{{ outcomeText(item) }}</span>
                </li>
              </ul>
            </div>

            <div class="rounded border p-2">
              <h3 class="mb-1 font-semibold">Points</h3>
              <div v-if="modal.trade.initiatorGave.points">{{ modal.trade.recipient.username }} returns {{ fmt(plan.points.tradePointsToInitiator) }} trade points to {{ modal.trade.initiator.username }}.</div>
              <div v-if="modal.trade.recipientGave.points">{{ modal.trade.initiator.username }} returns {{ fmt(plan.points.tradePointsToRecipient) }} trade points to {{ modal.trade.recipient.username }}.</div>
              <div v-if="plan.points.fmvOwedByRecipient">{{ modal.trade.recipient.username }} pays {{ fmt(plan.points.fmvOwedByRecipient) }} fair market value for items that are gone.</div>
              <div v-if="plan.points.fmvOwedByInitiator">{{ modal.trade.initiator.username }} pays {{ fmt(plan.points.fmvOwedByInitiator) }} fair market value for items that are gone.</div>
              <div class="mt-1 font-medium">
                <template v-if="plan.points.net.amount">
                  Net: {{ fmt(plan.points.net.amount) }} points move from {{ plan.points.net.fromUsername }} to {{ plan.points.net.toUsername }}.
                </template>
                <template v-else>No points move.</template>
              </div>
              <div class="mt-1 text-gray-600">
                {{ modal.trade.initiator.username }}: {{ fmt(plan.balances.initiator.before) }} → {{ fmt(plan.balances.initiator.after) }} ·
                {{ modal.trade.recipient.username }}: {{ fmt(plan.balances.recipient.before) }} → {{ fmt(plan.balances.recipient.after) }}
              </div>
              <div v-for="w in negativeWarnings" :key="w" class="mt-1 rounded bg-amber-50 p-1 text-amber-900">{{ w }}</div>
            </div>

            <p class="mt-2 text-[10px] text-gray-500">
              Fair market value is the average winning bid of the item's last 5 sold auctions (official-account wins left out),
              or its cMart / shop price if it has never sold at auction.
            </p>
          </template>

          <!-- Running -->
          <div v-else-if="modal.phase === 'running'">
            <div class="mb-1 font-medium">Undoing the trade...</div>
            <div class="h-3 w-full overflow-hidden rounded bg-gray-200" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full bg-red-600 transition-all duration-300" :style="{ width: progressPct + '%' }" />
            </div>
            <div class="mt-1 text-[11px] text-gray-600">{{ progressPct }}%</div>
            <ul class="mt-2 space-y-0.5 text-[11px] text-gray-700">
              <li v-for="(l, i) in modal.log" :key="i">✓ {{ l }}</li>
            </ul>
          </div>

          <!-- Error -->
          <div v-else-if="modal.phase === 'error'">
            <div class="rounded border border-red-300 bg-red-50 p-2 text-red-800">
              <div class="font-semibold">The trade was not reversed.</div>
              <div class="mt-1">{{ modal.error }}</div>
              <div class="mt-1 text-[11px]">Nothing was changed: the reversal runs all at once, so any failure undoes every step that had already run.</div>
            </div>
            <ul v-if="modal.log.length" class="mt-2 space-y-0.5 text-[11px] text-gray-500">
              <li v-for="(l, i) in modal.log" :key="i">↺ {{ l }} (rolled back)</li>
            </ul>
          </div>

          <!-- Overview -->
          <template v-else-if="modal.phase === 'done' && modal.summary">
            <div class="mb-2 rounded border border-green-300 bg-green-50 p-2 text-green-900">
              The trade between {{ modal.summary.initiator.username }} and {{ modal.summary.recipient.username }} was reversed
              {{ modal.summary.includeFairMarketValue ? 'with' : 'without' }} fair market value.
            </div>
            <div class="mb-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
              <div class="rounded border p-1.5 text-center"><div class="text-base font-semibold">{{ c.ctoonsReturned }}</div>cToons returned</div>
              <div class="rounded border p-1.5 text-center"><div class="text-base font-semibold">{{ c.packsReturned }}</div>packs returned</div>
              <div class="rounded border p-1.5 text-center"><div class="text-base font-semibold">{{ c.ctoonsValued + c.packsValued }}</div>paid at market value</div>
              <div class="rounded border p-1.5 text-center"><div class="text-base font-semibold">{{ c.ctoonsSkipped + c.packsSkipped }}</div>skipped</div>
            </div>
            <div class="mb-2">
              <template v-if="modal.summary.points.net.amount">
                {{ fmt(modal.summary.points.net.amount) }} points moved from {{ modal.summary.points.net.fromUsername }} to {{ modal.summary.points.net.toUsername }}.
              </template>
              <template v-else>No points moved.</template>
              New balances: {{ modal.summary.initiator.username }} {{ fmt(modal.summary.points.balancesAfter.initiator) }},
              {{ modal.summary.recipient.username }} {{ fmt(modal.summary.points.balancesAfter.recipient) }}.
            </div>
            <div v-if="modal.summary.withdrawnOffers" class="mb-2 text-gray-700">
              {{ modal.summary.withdrawnOffers }} open trade offer{{ modal.summary.withdrawnOffers === 1 ? '' : 's' }} holding a returned item {{ modal.summary.withdrawnOffers === 1 ? 'was' : 'were' }} withdrawn.
            </div>
            <ul class="divide-y rounded border">
              <li v-for="item in modal.summary.items" :key="item.kind + item.id" class="flex items-center gap-2 px-2 py-1">
                <img v-if="item.image" :src="item.image" alt="" class="h-7 w-7 shrink-0 rounded object-contain" />
                <div class="min-w-0 flex-1">
                  <div class="truncate">
                    {{ item.name }}<span v-if="item.kind === 'pack'" class="text-purple-700"> (pack)</span><span v-if="item.mintNumber != null" class="text-gray-500"> #{{ item.mintNumber }}</span>
                  </div>
                  <div class="text-[10px] text-gray-500">{{ doneText(item) }}</div>
                </div>
                <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px]" :class="outcomeClass(item.outcome)">{{ doneBadge(item.outcome) }}</span>
              </li>
            </ul>
          </template>
        </div>

        <!-- Footer -->
        <div class="shrink-0 border-t px-3 py-2">
          <label v-if="modal.phase === 'preview'" class="mb-2 flex items-start gap-2">
            <input v-model="includeFmv" type="checkbox" class="mt-0.5" />
            <span>
              Include fair market value for packs and cToons already auctioned or traded away from the user that received them
              <span class="block text-[10px] text-gray-500">
                Unchecked, those items are skipped and the original owner gets nothing for them.
              </span>
            </span>
          </label>
          <div class="flex justify-end gap-2">
            <template v-if="modal.phase === 'preview'">
              <button class="rounded border px-3 py-1" @click="closeModal">Cancel</button>
              <button class="rounded bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700" @click="runUndo">Undo Trade</button>
            </template>
            <button v-else-if="modal.phase === 'running'" class="rounded border px-3 py-1 opacity-50" disabled>Working...</button>
            <template v-else-if="modal.phase === 'error'">
              <button class="rounded border px-3 py-1" @click="closeModal">Close</button>
              <button v-if="modal.canRetry" class="rounded bg-gray-800 px-3 py-1 text-white" @click="openModal(modal.trade)">Check again</button>
            </template>
            <button v-else class="rounded border px-3 py-1" @click="closeModal">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'

// ── List ────────────────────────────────────────────────────────────────────
const trades = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 25
const loading = ref(false)
const listError = ref('')
const userQuery = ref('')
const reversedFilter = ref('all')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function fetchTrades () {
  loading.value = true
  listError.value = ''
  try {
    const res = await $fetch('/api/admin/trade-reversal/trades', {
      query: { page: page.value, limit: pageSize, user: userQuery.value.trim() || undefined, reversed: reversedFilter.value }
    })
    trades.value = res.items || []
    total.value = res.total || 0
  } catch (err) {
    trades.value = []
    total.value = 0
    listError.value = errMessage(err, 'Could not load trades.')
  } finally {
    loading.value = false
  }
}

function goPage (p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  fetchTrades()
}

let debounceId = null
watch([userQuery, reversedFilter], () => {
  clearTimeout(debounceId)
  debounceId = setTimeout(() => { page.value = 1; fetchTrades() }, 300)
})
onBeforeUnmount(() => clearTimeout(debounceId))
onMounted(fetchTrades)

// ── Modal ───────────────────────────────────────────────────────────────────
// phase: loading | blocked | preview | running | error | done
const modal = reactive({
  open: false, phase: 'loading', trade: null, preview: null, blockedReason: '',
  progressDone: 0, progressTotal: 0, log: [], error: '', canRetry: false, summary: null
})
const includeFmv = ref(false)

const plan = computed(() => {
  if (!modal.preview?.reversible) return null
  return includeFmv.value ? modal.preview.withFairMarketValue : modal.preview.withoutFairMarketValue
})

const previewSides = computed(() => {
  if (!plan.value || !modal.trade) return []
  const t = modal.trade
  return [
    { key: 'toInitiator', toUsername: t.initiator.username, fromUsername: t.recipient.username, items: plan.value.items.filter(i => i.role === 'OFFERED') },
    { key: 'toRecipient', toUsername: t.recipient.username, fromUsername: t.initiator.username, items: plan.value.items.filter(i => i.role === 'REQUESTED') }
  ]
})

const negativeWarnings = computed(() => {
  if (!plan.value || !modal.trade) return []
  const out = []
  const b = plan.value.balances
  if (b.initiator.after < 0) out.push(`${modal.trade.initiator.username} will be left with ${fmt(b.initiator.after)} points (below zero).`)
  if (b.recipient.after < 0) out.push(`${modal.trade.recipient.username} will be left with ${fmt(b.recipient.after)} points (below zero).`)
  return out
})

const progressPct = computed(() => modal.progressTotal ? Math.round((modal.progressDone / modal.progressTotal) * 100) : 0)
const c = computed(() => modal.summary?.counts || {})

async function openModal (trade) {
  Object.assign(modal, {
    open: true, phase: 'loading', trade, preview: null, blockedReason: '',
    progressDone: 0, progressTotal: 0, log: [], error: '', canRetry: false, summary: null
  })
  includeFmv.value = false
  try {
    const res = await $fetch(`/api/admin/trade-reversal/trades/${trade.id}`)
    modal.trade = res.trade || trade
    modal.preview = res
    if (!res.reversible) {
      modal.phase = 'blocked'
      modal.blockedReason = res.reason || 'This trade cannot be reversed.'
    } else {
      modal.phase = 'preview'
    }
  } catch (err) {
    modal.phase = 'blocked'
    modal.blockedReason = errMessage(err, 'Could not load this trade.')
  }
}

function closeModal () {
  if (modal.phase === 'running') return
  const changed = modal.phase === 'done'
  modal.open = false
  if (changed) fetchTrades()
}

async function runUndo () {
  modal.phase = 'running'
  modal.progressDone = 0
  modal.progressTotal = 0
  modal.log = []
  let finished = false
  try {
    const res = await fetch(`/api/admin/trade-reversal/trades/${modal.trade.id}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ includeFairMarketValue: includeFmv.value })
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return fail(j?.statusMessage || j?.message || `The server answered ${res.status}.`, res.status >= 500)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const handleChunk = (part) => {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue
        let ev
        try { ev = JSON.parse(line.slice(5).trim()) } catch { continue }
        if (handleEvent(ev)) finished = true
      }
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop()
      parts.forEach(handleChunk)
    }
    if (buffer) handleChunk(buffer)
    if (!finished) {
      fail('The connection closed before the server said whether the reversal finished. Reload the list to see if the trade shows as reversed before trying again.', false)
    }
  } catch (err) {
    if (!finished) fail(`Lost the connection to the server (${err?.message || err}). Reload the list to see if the trade shows as reversed before trying again.`, false)
  }
}

// Returns true once the stream has reached a final event.
function handleEvent (ev) {
  if (ev.type === 'start') { modal.progressTotal = ev.totalSteps; return false }
  if (ev.type === 'step') {
    modal.progressTotal = ev.totalSteps
    modal.progressDone = ev.done
    if (ev.label) modal.log.push(ev.label)
    return false
  }
  if (ev.type === 'complete') {
    modal.progressDone = modal.progressTotal
    modal.summary = ev.summary
    modal.phase = 'done'
    return true
  }
  if (ev.type === 'error') {
    fail(ev.message || 'Unknown error.', true)
    return true
  }
  return false
}

function fail (message, canRetry) {
  modal.error = message
  modal.canRetry = canRetry
  modal.phase = 'error'
}

// ── Display helpers ─────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-US')

function gaveText (g) {
  const parts = []
  if (g.ctoons) parts.push(`${g.ctoons} cToon${g.ctoons === 1 ? '' : 's'}`)
  if (g.packs) parts.push(`${g.packs} pack${g.packs === 1 ? '' : 's'}`)
  if (g.points) parts.push(`${fmt(g.points)} pts`)
  return parts.length ? parts.join(', ') : 'nothing'
}

function reversedTitle (t) {
  const r = t.reversal
  return `Reversed by ${r.adminUsername || 'an admin'} ${r.includeFairMarketValue ? 'with' : 'without'} fair market value`
}

function outcomeText (item) {
  switch (item.outcome) {
    case 'RETURN': return 'Will be returned'
    case 'ALREADY_BACK': return 'Already back'
    case 'FMV': return `Pays ${fmt(item.fairMarketValue)} pts value`
    case 'SKIP': return 'Skipped'
    default: return item.outcome
  }
}

function doneBadge (outcome) {
  return { RETURN: 'Returned', ALREADY_BACK: 'Already back', FMV: 'Paid value', SKIP: 'Skipped' }[outcome] || outcome
}

function doneText (item) {
  switch (item.outcome) {
    case 'RETURN': return `Moved from ${item.fromUsername} back to ${item.toUsername}.`
    case 'ALREADY_BACK': return `${item.toUsername} already had it again.`
    case 'FMV': return `It ${item.reason}, so ${item.fromUsername} paid ${item.toUsername} ${fmt(item.fairMarketValue)} points for it.`
    case 'SKIP': return `It ${item.reason}, so it was skipped.`
    default: return ''
  }
}

function outcomeClass (outcome) {
  return {
    RETURN: 'bg-green-100 text-green-800',
    ALREADY_BACK: 'bg-gray-100 text-gray-700',
    FMV: 'bg-blue-100 text-blue-800',
    SKIP: 'bg-amber-100 text-amber-800'
  }[outcome] || 'bg-gray-100'
}

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
.admin-trade-reversal {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
