<template>
  <div class="p-6 space-y-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-4xl mx-auto" style="margin-top: 50px;">
      <h1 class="text-2xl font-bold mb-1">Cheating Tool</h1>
      <p class="text-sm text-gray-500 mb-6">
        Analyzes trade rooms, trade offers, and auctions between a suspected cheater and connected accounts.
        Reports point value received and cToons still held, then lets you move them to CartoonReOrbitOfficial.
      </p>

      <!-- Input form -->
      <form @submit.prevent="runReport" class="space-y-4 bg-white border rounded p-4 mb-6">

        <!-- Target -->
        <div class="relative">
          <label class="block text-sm font-medium mb-1">Suspected cheater (target username)</label>
          <input
            ref="targetInputEl"
            v-model.trim="target"
            class="w-full border rounded px-3 py-2"
            placeholder="e.g. ZenVikingGuru"
            required
            autocomplete="off"
            @focus="targetFocused = true"
            @blur="() => setTimeout(() => { targetFocused = false }, 150)"
          />
          <div
            v-if="targetFocused && targetSuggestions.length"
            class="absolute z-20 mt-1 w-full bg-white border rounded shadow-lg"
          >
            <button
              v-for="u in targetSuggestions"
              :key="u.id"
              type="button"
              class="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
              @mousedown.prevent="selectTarget(u.username)"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium">{{ u.username }}</span>
                <span class="text-xs text-gray-500">{{ u.points?.toLocaleString() }} pts · {{ u.totalCtoons }} cToons</span>
              </div>
              <div class="text-xs text-gray-400">{{ u.discordTag }}</div>
            </button>
          </div>
        </div>

        <!-- Suspects -->
        <div>
          <label class="block text-sm font-medium mb-1">Connected accounts (suspects)</label>
          <div class="flex gap-2 relative">
            <div class="relative flex-1">
              <input
                v-model.trim="suspectInput"
                class="w-full border rounded px-3 py-2"
                placeholder="Type a username and press Add or Enter"
                autocomplete="off"
                @keydown.enter.prevent="addSuspect"
                @focus="suspectFocused = true"
                @blur="() => setTimeout(() => { suspectFocused = false }, 150)"
              />
              <div
                v-if="suspectFocused && suspectSuggestions.length"
                class="absolute z-20 mt-1 w-full bg-white border rounded shadow-lg"
              >
                <button
                  v-for="u in suspectSuggestions"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                  @mousedown.prevent="addSuspectFromSuggestion(u.username)"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium">{{ u.username }}</span>
                    <span class="text-xs text-gray-500">{{ u.points?.toLocaleString() }} pts · {{ u.totalCtoons }} cToons</span>
                  </div>
                  <div class="text-xs text-gray-400">{{ u.discordTag }}</div>
                </button>
              </div>
            </div>
            <button type="button" class="px-4 py-2 border rounded bg-gray-50 hover:bg-gray-100" @click="addSuspect">Add</button>
          </div>

          <div class="mt-2 flex flex-wrap gap-2">
            <span
              v-for="(s, i) in suspects"
              :key="s"
              class="inline-flex items-center gap-1.5 bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm"
            >
              {{ s }}
              <button type="button" class="text-orange-500 hover:text-orange-700 font-bold leading-none" @click="removeSuspect(i)">×</button>
            </span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button
            :disabled="loading || !target || suspects.length === 0"
            class="px-5 py-2 bg-indigo-600 text-white rounded font-medium disabled:opacity-50 hover:bg-indigo-700"
          >
            {{ loading ? 'Analysing…' : 'Run Analysis' }}
          </button>
          <span v-if="error" class="text-red-600 text-sm">{{ error }}</span>
        </div>
      </form>

      <!-- Report -->
      <div v-if="report" class="space-y-5">

        <!-- Section 1: cToons traded to target -->
        <div class="bg-white border rounded p-4">
          <h2 class="font-semibold text-base mb-3">
            Section 1 — cToons Traded to {{ report.target }} (TradeRoom + TradeOffer)
          </h2>
          <div v-if="report.ctoonRows.length === 0" class="text-sm text-gray-500">(none found)</div>
          <div v-else class="overflow-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left font-medium">cToon</th>
                  <th class="px-3 py-2 text-left font-medium">Rarity</th>
                  <th class="px-3 py-2 text-right font-medium">Traded</th>
                  <th class="px-3 py-2 text-right font-medium">Still Owned</th>
                  <th class="px-3 py-2 text-right font-medium">No Longer Owned</th>
                  <th class="px-3 py-2 text-right font-medium">Unit Value</th>
                  <th class="px-3 py-2 text-right font-medium">Point Value Lost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in report.ctoonRows" :key="row.ctoonId" class="border-t hover:bg-gray-50">
                  <td class="px-3 py-2 font-medium">{{ row.name }}</td>
                  <td class="px-3 py-2">
                    <span :class="rarityClass(row.rarity)" class="px-1.5 py-0.5 rounded text-xs font-medium">{{ row.rarity }}</span>
                  </td>
                  <td class="px-3 py-2 text-right">{{ row.total }}</td>
                  <td class="px-3 py-2 text-right text-green-700">{{ row.ownedCount }}</td>
                  <td class="px-3 py-2 text-right text-red-600">{{ row.notOwnedCount }}</td>
                  <td class="px-3 py-2 text-right">
                    {{ row.unitPrice.toLocaleString() }} pts
                    <div class="text-xs text-gray-400">
                      {{ row.avgPx > row.rarityPx
                        ? `avg auction (${row.avgPx.toLocaleString()} from ${row.auctionCount})`
                        : `cMart (${row.rarityPx.toLocaleString()})` }}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right font-semibold">{{ row.lostValue.toLocaleString() }} pts</td>
                </tr>
              </tbody>
              <tfoot class="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td colspan="6" class="px-3 py-2 font-semibold text-right">Subtotal (not-owned cToon value)</td>
                  <td class="px-3 py-2 text-right font-bold">{{ report.totalCtoonPointValue.toLocaleString() }} pts</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Section 2: TradeOffer points -->
        <div class="bg-white border rounded p-4">
          <h2 class="font-semibold text-base mb-3">Section 2 — Points Received via TradeOffer</h2>
          <div v-if="report.tradeOfferBreakdown.length === 0" class="text-sm text-gray-500">(none found)</div>
          <div v-else class="space-y-1">
            <div
              v-for="(row, i) in report.tradeOfferBreakdown"
              :key="i"
              class="flex items-center justify-between text-sm border-b py-1.5"
            >
              <span class="font-medium">{{ row.suspectName }}</span>
              <span class="text-gray-700">{{ row.pointsOffered.toLocaleString() }} pts offered</span>
            </div>
          </div>
          <div class="mt-2 pt-2 border-t flex justify-between font-semibold text-sm">
            <span>Subtotal</span>
            <span>{{ report.tradeOfferPointsToTarget.toLocaleString() }} pts</span>
          </div>
        </div>

        <!-- Section 3: Auction points -->
        <div class="bg-white border rounded p-4">
          <h2 class="font-semibold text-base mb-3">Section 3 — Auction Proceeds (target sold to suspects)</h2>
          <div v-if="report.auctionBreakdown.length === 0" class="text-sm text-gray-500">(none found)</div>
          <div v-else class="space-y-1">
            <div
              v-for="(row, i) in report.auctionBreakdown"
              :key="i"
              class="flex items-center justify-between text-sm border-b py-1.5"
            >
              <span>
                <span class="font-medium">{{ row.itemName }}</span>
                <span class="text-gray-400 text-xs ml-2">won by {{ row.winnerName }}</span>
              </span>
              <span class="text-gray-700">{{ row.highestBid.toLocaleString() }} pts</span>
            </div>
          </div>
          <div class="mt-2 pt-2 border-t flex justify-between font-semibold text-sm">
            <span>Subtotal</span>
            <span>{{ report.auctionPointsToTarget.toLocaleString() }} pts</span>
          </div>
        </div>

        <!-- Section 4: Pending (informational) -->
        <div class="bg-white border rounded p-4">
          <h2 class="font-semibold text-base mb-1">
            Section 4 — Pending Trades
            <span class="font-normal text-gray-500 text-sm">(informational — not included in totals)</span>
          </h2>
          <div class="mt-2 text-sm space-y-1">
            <div v-if="report.pendingRoomsDisplay.length === 0 && report.pendingOffersDisplay.length === 0" class="text-gray-500">No pending trades.</div>
            <div v-if="report.pendingRoomsDisplay.length">
              <p class="font-medium mb-1">Pending TradeRoom sessions</p>
              <div v-for="row in report.pendingRoomsDisplay" :key="row.name" class="ml-3 text-gray-700">
                {{ row.name }}: {{ row.count }} room(s)
              </div>
            </div>
            <div v-if="report.pendingOffersDisplay.length" class="mt-2">
              <p class="font-medium mb-1">Pending TradeOffers</p>
              <div v-for="(row, i) in report.pendingOffersDisplay" :key="i" class="ml-3 text-gray-700">
                {{ row.suspectName }} ({{ row.role }}) — {{ row.pointsOffered.toLocaleString() }} pts offered
              </div>
            </div>
          </div>
        </div>

        <!-- Summary -->
        <div class="bg-indigo-50 border border-indigo-200 rounded p-4">
          <h2 class="font-bold text-base mb-3 text-indigo-900">Summary</h2>
          <div class="grid sm:grid-cols-2 gap-3 text-sm">
            <div class="flex justify-between border-b border-indigo-100 py-1">
              <span class="text-gray-700">cToon trade value (not-owned)</span>
              <span class="font-semibold">{{ report.totalCtoonPointValue.toLocaleString() }} pts</span>
            </div>
            <div class="flex justify-between border-b border-indigo-100 py-1">
              <span class="text-gray-700">TradeOffer points received</span>
              <span class="font-semibold">{{ report.tradeOfferPointsToTarget.toLocaleString() }} pts</span>
            </div>
            <div class="flex justify-between border-b border-indigo-100 py-1">
              <span class="text-gray-700">Auction proceeds from suspects</span>
              <span class="font-semibold">{{ report.auctionPointsToTarget.toLocaleString() }} pts</span>
            </div>
            <div class="flex justify-between border-b border-indigo-100 py-1">
              <span class="text-gray-700">cToons target still owns (to transfer)</span>
              <span class="font-semibold">{{ report.ctoonStillOwnedCount }}</span>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-indigo-300 flex items-center justify-between">
            <div>
              <div class="text-indigo-900 font-bold text-lg">
                Total to remove from {{ report.target }}: {{ report.totalPointsToRemove.toLocaleString() }} pts
              </div>
              <div class="text-sm text-indigo-700">
                + transfer {{ report.ctoonStillOwnedCount }} cToon(s) to CartoonReOrbitOfficial
              </div>
            </div>
            <button
              class="px-5 py-2.5 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:opacity-50"
              :disabled="report.totalPointsToRemove === 0 && report.ctoonStillOwnedCount === 0"
              @click="openConfirm"
            >
              Move Points &amp; cToons
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- Confirmation / Progress / Results modal -->
    <div v-if="showConfirm" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div class="p-5">

          <!-- ── Phase: review (before applying) ── -->
          <template v-if="modalPhase === 'review'">
            <h3 class="text-lg font-bold mb-1">Confirm — Move Points &amp; cToons</h3>
            <p class="text-sm text-gray-600 mb-4">
              This will deduct points from <strong>{{ report?.target }}</strong> and add them to
              <strong>CartoonReOrbitOfficial</strong>, then transfer the cToons listed below.
              This action cannot be undone.
            </p>

            <div class="space-y-2 text-sm mb-4">
              <div class="flex justify-between py-1 border-b">
                <span>Points to deduct from <strong>{{ report?.target }}</strong></span>
                <span class="font-semibold text-red-700">{{ report?.totalPointsToRemove?.toLocaleString() }} pts</span>
              </div>
              <div class="flex justify-between py-1 border-b">
                <span>Points to add to <strong>CartoonReOrbitOfficial</strong></span>
                <span class="font-semibold text-green-700">{{ report?.totalPointsToRemove?.toLocaleString() }} pts</span>
              </div>
            </div>

            <div v-if="report?.ctoonStillOwned?.length" class="mb-4">
              <h4 class="font-semibold text-sm mb-2">cToons to transfer ({{ report.ctoonStillOwned.length }})</h4>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-auto">
                <div
                  v-for="uc in report.ctoonStillOwned"
                  :key="uc.id"
                  class="border rounded p-2 text-xs bg-gray-50"
                >
                  <div class="aspect-square bg-white border rounded mb-1.5 flex items-center justify-center overflow-hidden">
                    <img
                      v-if="uc.ctoon?.assetPath"
                      :src="imgUrl(uc.ctoon.assetPath)"
                      :alt="uc.ctoon?.name || 'cToon'"
                      class="object-contain w-full h-full"
                    />
                    <div v-else class="text-gray-300 text-xs">No image</div>
                  </div>
                  <div class="font-medium truncate">{{ uc.ctoon?.name || 'cToon' }}</div>
                  <div class="text-gray-500">{{ uc.ctoon?.rarity || '—' }}</div>
                  <div>Mint #{{ uc.mintNumber ?? '—' }}</div>
                </div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500 mb-4">No cToons to transfer (target no longer holds any).</div>

            <div class="flex justify-end gap-2">
              <button class="px-4 py-2 border rounded hover:bg-gray-50" @click="closeConfirm">Cancel</button>
              <button
                class="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
                @click="applyChanges"
              >
                Confirm &amp; Apply
              </button>
            </div>
          </template>

          <!-- ── Phase: processing (SSE progress bar) ── -->
          <template v-if="modalPhase === 'processing'">
            <h3 class="text-lg font-bold mb-4">Applying Changes…</h3>

            <!-- Overall progress bar -->
            <div class="mb-4">
              <div class="flex justify-between text-sm font-medium mb-1">
                <span>Progress</span>
                <span>{{ progressDone }} / {{ progressTotal }} steps</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
                <div
                  class="h-5 rounded-full transition-all duration-300"
                  :class="progressHasError ? 'bg-yellow-400' : 'bg-indigo-600'"
                  :style="{ width: progressPercent + '%' }"
                />
              </div>
              <div class="text-xs text-gray-500 mt-1 text-right">{{ progressPercent }}% complete</div>
            </div>

            <!-- Live step feed -->
            <div class="border rounded bg-gray-50 max-h-52 overflow-auto p-2 space-y-1 text-sm font-mono">
              <div
                v-for="(step, i) in progressSteps"
                :key="i"
                class="flex items-start gap-2"
                :class="step.success ? 'text-green-700' : 'text-red-600'"
              >
                <span class="shrink-0">{{ step.success ? '✓' : '✗' }}</span>
                <span>{{ step.label }}</span>
              </div>
              <div v-if="progressSteps.length === 0" class="text-gray-400 italic">Starting…</div>
            </div>

            <p class="text-xs text-gray-500 mt-3 text-center">Please wait — do not close this window.</p>
          </template>

          <!-- ── Phase: done (results) ── -->
          <template v-if="modalPhase === 'done'">
            <h3 class="text-lg font-bold mb-3">Result</h3>

            <!-- Fatal transport error -->
            <div v-if="applyFatalError" class="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-3">
              {{ applyFatalError }}
            </div>

            <!-- Summary card -->
            <div v-if="applyResult" class="p-3 rounded mb-3" :class="applyResult.hasErrors ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'">
              <p class="font-semibold mb-2" :class="applyResult.hasErrors ? 'text-yellow-800' : 'text-green-800'">
                {{ applyResult.hasErrors ? 'Completed with issues' : 'Completed successfully' }}
              </p>
              <div class="grid sm:grid-cols-2 gap-x-4 text-sm" :class="applyResult.hasErrors ? 'text-yellow-900' : 'text-green-900'">
                <div>Points removed: <strong>{{ applyResult.pointsRemoved?.toLocaleString() }}</strong></div>
                <div>cToons transferred: <strong>{{ applyResult.ctoonsTransferred }}</strong> / {{ applyResult.totalAttempted }}</div>
              </div>
            </div>

            <!-- Error table -->
            <div v-if="applyResult?.errors?.length" class="mb-3">
              <h4 class="font-semibold text-sm mb-1">Errors</h4>
              <div class="overflow-auto border rounded">
                <table class="min-w-full text-xs">
                  <thead class="bg-gray-100">
                    <tr>
                      <th class="px-2 py-1 text-left">Phase</th>
                      <th class="px-2 py-1 text-left">UserCtoon ID</th>
                      <th class="px-2 py-1 text-left">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(e, i) in applyResult.errors" :key="i" class="border-t">
                      <td class="px-2 py-1">{{ e.phase }}</td>
                      <td class="px-2 py-1 font-mono">{{ e.userCtoonId ?? '—' }}</td>
                      <td class="px-2 py-1">{{ e.message }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="flex justify-end">
              <button class="px-4 py-2 border rounded hover:bg-gray-50" @click="closeConfirm">Close</button>
            </div>
          </template>

        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({
  title: 'Admin - Cheating Tool',
  middleware: ['auth', 'admin'],
  layout: 'admin'
})

// ── Form state ──────────────────────────────────────────────────────────────
const target       = ref('')
const suspectInput = ref('')
const suspects     = ref([])
const loading      = ref(false)
const error        = ref('')
const report       = ref(null)

// ── Autocomplete ────────────────────────────────────────────────────────────
const usersLoaded      = ref(false)
const allUsers         = ref([])
const targetFocused    = ref(false)
const suspectFocused   = ref(false)
const targetSuggestions  = ref([])
const suspectSuggestions = ref([])
const targetInputEl    = ref(null)

async function ensureUsersLoaded() {
  if (usersLoaded.value) return
  try {
    const res = await fetch('/api/admin/users', { credentials: 'include' })
    if (!res.ok) return
    const raw = await res.json()
    allUsers.value = (raw || []).filter(u => u?.username)
    usersLoaded.value = true
  } catch {}
}

watch(target, async (v) => {
  const q = (v || '').toLowerCase()
  if (q.length < 3) { targetSuggestions.value = []; return }
  await ensureUsersLoaded()
  targetSuggestions.value = allUsers.value
    .filter(u => u.username.toLowerCase().includes(q))
    .slice(0, 8)
})

watch(suspectInput, async (v) => {
  const q = (v || '').toLowerCase()
  if (q.length < 3) { suspectSuggestions.value = []; return }
  await ensureUsersLoaded()
  suspectSuggestions.value = allUsers.value
    .filter(u =>
      u.username.toLowerCase().includes(q) &&
      u.username !== target.value &&
      !suspects.value.includes(u.username)
    )
    .slice(0, 8)
})

function selectTarget(name) {
  target.value = name
  targetSuggestions.value = []
  targetFocused.value = false
}
function addSuspect() {
  const v = suspectInput.value.trim()
  if (!v || suspects.value.includes(v)) return
  suspects.value.push(v)
  suspectInput.value = ''
  suspectSuggestions.value = []
}
function addSuspectFromSuggestion(name) {
  if (!suspects.value.includes(name)) suspects.value.push(name)
  suspectInput.value = ''
  suspectSuggestions.value = []
}
function removeSuspect(i) { suspects.value.splice(i, 1) }

// ── Run report ──────────────────────────────────────────────────────────────
async function runReport() {
  error.value = ''
  report.value = null
  loading.value = true
  try {
    const res = await fetch('/api/admin/cheating-tool-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ target: target.value, suspects: suspects.value })
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.statusMessage || `HTTP ${res.status}`)
    }
    report.value = await res.json()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// ── Confirm modal + SSE progress ────────────────────────────────────────────
const showConfirm    = ref(false)
// 'review' | 'processing' | 'done'
const modalPhase     = ref('review')

// Progress state
const progressTotal  = ref(0)
const progressDone   = ref(0)
const progressSteps  = ref([])   // { label, success }
const progressHasError = ref(false)
const progressPercent = computed(() => {
  if (!progressTotal.value) return 0
  return Math.round((progressDone.value / progressTotal.value) * 100)
})

// Result state
const applyResult    = ref(null)
const applyFatalError = ref('')

function openConfirm() {
  modalPhase.value     = 'review'
  progressTotal.value  = 0
  progressDone.value   = 0
  progressSteps.value  = []
  progressHasError.value = false
  applyResult.value    = null
  applyFatalError.value = ''
  showConfirm.value    = true
}

function closeConfirm() {
  if (modalPhase.value === 'processing') return  // can't close while running
  showConfirm.value = false
}

async function applyChanges() {
  if (!report.value) return
  modalPhase.value = 'processing'
  progressTotal.value = 0
  progressDone.value  = 0
  progressSteps.value = []
  progressHasError.value = false
  applyResult.value   = null
  applyFatalError.value = ''

  try {
    const res = await fetch('/api/admin/cheating-tool-apply-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ target: report.value.target, suspects: report.value.suspects })
    })

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      applyFatalError.value = j?.statusMessage || `HTTP ${res.status}`
      modalPhase.value = 'done'
      return
    }

    // Read SSE stream
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE lines are separated by "\n\n"; each line may be "data: {...}"
      const parts = buffer.split('\n\n')
      buffer = parts.pop()  // keep any incomplete chunk

      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            handleStreamEvent(JSON.parse(line.slice(6)))
          } catch {}
        }
      }
    }

    // Handle any remaining buffer
    for (const line of buffer.split('\n')) {
      if (!line.startsWith('data: ')) continue
      try { handleStreamEvent(JSON.parse(line.slice(6))) } catch {}
    }

  } catch (e) {
    applyFatalError.value = e.message
    modalPhase.value = 'done'
    return
  }

  // Refresh report so totals reflect the applied state
  await runReport()
}

function handleStreamEvent(data) {
  if (data.type === 'start') {
    progressTotal.value = data.totalSteps
    return
  }

  if (data.type === 'step') {
    progressDone.value++
    const success = data.success !== false
    if (!success) progressHasError.value = true

    let label = ''
    if (data.phase === 'points') {
      if (data.skipped) {
        label = 'Points — nothing to deduct'
      } else if (success) {
        label = `Points — deducted ${data.pointsRemoved?.toLocaleString()} pts`
      } else {
        label = `Points — FAILED: ${data.error}`
      }
    } else if (data.phase === 'ctoon') {
      if (success) {
        label = `Transferred: ${data.name}${data.mintNumber != null ? ` #${data.mintNumber}` : ''} (${data.rarity})`
      } else {
        label = `FAILED: ${data.name} — ${data.error}`
      }
    }

    progressSteps.value.push({ label, success })
    return
  }

  if (data.type === 'complete') {
    applyResult.value = data
    modalPhase.value  = 'done'
    return
  }

  if (data.type === 'error') {
    applyFatalError.value = data.message
    modalPhase.value = 'done'
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function imgUrl(path) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const base =
    (import.meta.env.PUBLIC_BASE_URL) ||
    (import.meta.env.PROD ? 'https://www.cartoonreorbit.com' : `http://localhost:${import.meta.env.VITE_SOCKET_PORT || 3000}`)
  return `${base}${path}`
}

function rarityClass(rarity) {
  const r = (rarity || '').toLowerCase()
  if (r === 'common')      return 'bg-gray-100 text-gray-700'
  if (r === 'uncommon')    return 'bg-green-100 text-green-700'
  if (r === 'rare')        return 'bg-blue-100 text-blue-700'
  if (r === 'very rare')   return 'bg-purple-100 text-purple-700'
  if (r === 'crazy rare')  return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}
</script>
