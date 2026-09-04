<template>
  <div class="bg-gray-50 text-xs">

    <div class="px-2 py-2 max-w-2xl mx-auto">
      <h1 class="text-base font-semibold mb-3">Add Auction (AuctionOnly)</h1>

      <form @submit.prevent="submitForm" class="bg-white rounded border p-3 space-y-3 relative">
        <!-- cToon selector -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">Select cToon from CartoonReOrbitOfficial</label>
          <div class="relative">
            <input
              v-model="search"
              @input="onSearchInput"
              type="text"
              class="w-full border rounded-md px-2 py-1.5 text-sm"
              placeholder="Type 3+ characters"
              autocomplete="off"
            />
            <div
              v-if="showDropdown && results.length"
              class="absolute z-10 mt-1 w-full bg-white border rounded-md shadow max-h-72 overflow-auto"
            >
              <button
                v-for="opt in results"
                :key="opt.userCtoonId"
                type="button"
                class="w-full text-left px-2 py-1.5 hover:bg-gray-50 flex items-center gap-2"
                @click="selectOption(opt)"
              >
                <img :src="opt.assetPath" alt="preview" class="w-8 h-8 rounded object-cover border flex-shrink-0" />
                <div class="min-w-0">
                  <div class="font-medium text-xs truncate flex items-center gap-1.5">
                    <span class="truncate">{{ opt.name }}</span>
                    <span v-if="opt.isSecondEdition" class="se-badge">2nd Ed.</span>
                  </div>
                <div class="text-[10px] text-gray-500">
                  {{ opt.rarity }}
                  <span v-if="opt.mintNumber !== null && opt.mintNumber !== undefined"> • Mint #{{ opt.mintNumber }}</span>
                </div>
              </div>
            </button>
          </div>
        </div>

          <div v-if="selected" class="mt-2 flex items-center gap-2">
            <img :src="selected.assetPath" class="w-10 h-10 rounded object-cover border flex-shrink-0" />
            <div>
              <div class="font-medium text-xs flex items-center gap-1.5">
                <span>{{ selected.name }}</span>
                <span v-if="selected.isSecondEdition" class="se-badge">2nd Ed.</span>
              </div>
              <div class="text-[10px] text-gray-500">
                {{ selected.rarity }}
                <span v-if="selected.mintNumber !== null && selected.mintNumber !== undefined"> • Mint #{{ selected.mintNumber }}</span>
              </div>
            </div>
            <button type="button" class="ml-auto text-blue-600 hover:underline text-xs" @click="clearSelected">Change</button>
          </div>
        </div>

        <!-- Price auto-fill -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">Price (points)</label>
          <input v-model.number="price" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
          <p class="text-[10px] text-gray-500">Auto-filled from rarity. You can override.</p>
        </div>

        <!-- Start date/hour in CST -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">Go-live (CST/CDT)</label>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <input v-model="startDate" type="date" class="w-full border rounded-md px-2 py-1.5 text-sm" required />
            </div>
            <div>
              <select v-model="startHour" class="w-full border rounded-md px-2 py-1.5 text-sm" required>
                <option disabled value="">Select hour</option>
                <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}</option>
              </select>
              <p class="text-[10px] text-gray-500">Hour only.</p>
            </div>
          </div>
        </div>

        <!-- Duration slider -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">Duration</label>
          <div class="flex items-center gap-3">
            <input v-model.number="durationDays" type="range" min="1" max="7" class="w-full" />
            <span class="w-10 text-center text-xs">{{ durationDays }}d</span>
          </div>
        </div>

        <!-- Create multiple auctions -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium">Create X Auctions</label>
          <input
            v-model.number="createCount"
            type="number"
            min="1"
            class="border rounded-md px-2 py-1.5 text-sm"
            @input="clampCreateCount"
          />
          <p class="text-[10px] text-gray-500">
            Official account owns {{ maxOwned }} available. Requesting more will prompt to mint the
            remainder on save (supply permitting).
          </p>
        </div>

        <div v-if="createCount > 1" class="flex flex-col gap-1">
          <label class="text-xs font-medium">Release Every Y Hours</label>
          <input v-model.number="releaseEveryHours" type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" />
          <p class="text-[10px] text-gray-500">Hours between each Auction Only created.</p>
        </div>

        <!-- Is Featured checkbox -->
        <div class="flex items-center gap-2">
          <input
            id="isFeatured"
            v-model="isFeatured"
            type="checkbox"
            class="h-4 w-4 border-gray-300 rounded"
          />
          <label for="isFeatured" class="text-xs font-medium text-gray-700">
            Is Featured
          </label>
        </div>
        <div v-if="isFeatured">
          <label class="text-xs font-medium block mb-1">Eligibility limit</label>
          <select v-model.number="featuredOwnLimit" class="w-full border rounded p-2 text-xs">
            <option :value="2">Standard — can't bid if you already own 2+ or received 2+ in the last 30 days</option>
            <option :value="1">Strict — can't bid if you already own 1+ or received 1+ in the last 30 days</option>
          </select>
        </div>
        <p v-else class="text-[10px] text-gray-500">
          Marks the auction as featured on the auctions page, with a bidding eligibility limit you choose above.
        </p>

        <div class="pt-3 border-t flex items-center flex-wrap gap-2">
          <button
            type="submit"
            :disabled="saving"
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Save Auction
          </button>
          <span v-if="error" class="text-red-600 text-xs">{{ error }}</span>
          <span v-if="saving" class="text-gray-500 text-xs">Saving…</span>
        </div>
      </form>
    </div>

    <!-- Shortfall decision modal -->
    <div v-if="decision" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50">
      <div class="relative bg-white w-full max-w-lg rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h2 class="text-sm font-semibold">Not enough owned copies</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="cancelDecision">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3">
          <div class="text-xs text-gray-700 space-y-2">
            <p>
              You asked to create <strong>{{ decision.requested }}</strong> auction<span v-if="decision.requested !== 1">s</span>,
              but the official account only has <strong>{{ decision.available }}</strong> available cop<span v-if="decision.available === 1">y</span><span v-else>ies</span>
              of this cToon.
            </p>
            <p class="text-gray-600">
              Supply cap:
              <strong>{{ decision.unlimited ? 'Unlimited' : decision.quantity }}</strong>
              <span v-if="!decision.unlimited"> ({{ decision.totalMinted }} minted, {{ decision.remaining }} left to mint)</span>
            </p>
            <p v-if="decision.mintable > 0" class="text-gray-600">
              “Mint Remaining Needed” would mint <strong>{{ decision.mintable }}</strong> new cop<span v-if="decision.mintable === 1">y</span><span v-else>ies</span>
              to the official account, then create <strong>{{ decision.willCreateWithMint }}</strong> auction<span v-if="decision.willCreateWithMint !== 1">s</span> total.
            </p>
            <p v-if="decision.mintable < (decision.requested - decision.available)" class="text-amber-700">
              ⚠️ The supply cap limits minting, so this creates fewer than the {{ decision.requested }} you requested.
            </p>
            <p v-if="decision.mintable === 0" class="text-amber-700">
              ⚠️ The supply cap is reached — no new copies can be minted.
            </p>
          </div>

          <div class="mt-4 flex flex-col gap-2">
            <button
              type="button"
              :disabled="saving || decision.mintable < 1"
              class="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              @click="confirmDecision('mint')"
            >
              Mint Remaining Needed &amp; Create {{ decision.willCreateWithMint }} Auction<span v-if="decision.willCreateWithMint !== 1">s</span>
            </button>
            <button
              type="button"
              :disabled="saving || decision.available < 1"
              class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              @click="confirmDecision('availableOnly')"
            >
              Only Create Auctions For Available Mints ({{ decision.available }})
            </button>
            <button
              type="button"
              :disabled="saving"
              class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
              @click="cancelDecision"
            >
              Cancel Request Completely
            </button>
            <span v-if="error" class="text-red-600 text-[11px]">{{ error }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const search = ref('')
const results = ref([])
const showDropdown = ref(false)
const selected = ref(null)

const price = ref(0)
const startDate = ref('') // YYYY-MM-DD
const startHour = ref('') // 'HH:00'
const durationDays = ref(1)
const createCount = ref(1)
const releaseEveryHours = ref(1)
const isFeatured = ref(false)
const featuredOwnLimit = ref(2)
const error = ref('')
const saving = ref(false)
const decision = ref(null)   // shortfall modal payload from the server
const basePayload = ref(null) // payload captured at submit, reused by modal choices
let searchTimer

const hourOptions = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const maxOwned = computed(() => Number(selected.value?.ownedCount ?? 0))

function clampCreateCount() {
  // Allow requesting more than currently owned — the shortfall is resolved via
  // the mint/available modal on save. Only enforce a sane minimum of 1.
  const n = Math.floor(Number(createCount.value))
  createCount.value = Number.isFinite(n) && n >= 1 ? n : 1
}

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
  createCount.value = 1
  releaseEveryHours.value = 1
  decision.value = null
}

function clearSelected() {
  selected.value = null
  search.value = ''
  price.value = 0
  results.value = []
  createCount.value = 1
  releaseEveryHours.value = 1
  decision.value = null
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
  decision.value = null
  if (!selected.value) { error.value = 'Select a cToon.'; return }
  if (!startDate.value || !startHour.value) { error.value = 'Set a start date and hour.'; return }

  const count = Number(createCount.value || 1)
  if (!Number.isInteger(count) || count < 1) { error.value = 'Create count must be at least 1.'; return }
  let releaseHours = 0
  if (count > 1) {
    releaseHours = Number(releaseEveryHours.value || 0)
    if (!Number.isInteger(releaseHours) || releaseHours < 1) {
      error.value = 'Release interval must be at least 1 hour.'
      return
    }
  }

  const startsAtUtc = chicagoLocalToUtcISO(startDate.value, startHour.value)
  const starts = new Date(startsAtUtc)
  if (starts <= new Date()) { error.value = 'Start must be in the future.'; return }

  basePayload.value = {
    userCtoonId: selected.value.userCtoonId,
    ctoonId: selected.value.ctoonId,
    pricePoints: Number(price.value || 0),
    durationDays: Number(durationDays.value || 1),
    isFeatured: Boolean(isFeatured.value),
    featuredOwnLimit: Number(featuredOwnLimit.value || 2),
    startsAtUtc,
    createCount: count,
    releaseEveryHours: releaseHours
  }

  await send(null)
}

// Posts the captured payload. `mode` is null on first submit, or 'mint' /
// 'availableOnly' when the admin resolves a shortfall via the modal.
async function send(mode) {
  if (!basePayload.value) return
  error.value = ''
  const payload = { ...basePayload.value, ...(mode ? { mintMode: mode } : {}) }
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
      throw new Error(err.message || err.statusMessage || 'Save failed')
    }
    const data = await res.json().catch(() => ({}))
    if (data?.needsDecision) {
      decision.value = data
      return
    }
    decision.value = null
    if (typeof data?.count === 'number' && typeof data?.requested === 'number' && data.count < data.requested) {
      const mintedNote = data.minted > 0 ? ` (minted ${data.minted} new)` : ''
      alert(`Created ${data.count} of ${data.requested} requested auction(s)${mintedNote}.`)
    }
    window.location.href = '/newsite/admin/auctions'
  } catch (e) {
    console.error(e)
    error.value = e.message
  } finally {
    saving.value = false
  }
}

function confirmDecision(mode) {
  send(mode)
}

function cancelDecision() {
  decision.value = null
  error.value = ''
}
</script>

<style scoped>
.se-badge {
  display: inline-block;
  flex-shrink: 0;
  background: #7c3aed;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1.2;
  padding: 1px 6px;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
</style>
