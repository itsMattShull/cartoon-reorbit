<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
    <div class="bg-white rounded-lg w-full max-w-5xl my-8 flex flex-col shadow-xl">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10 rounded-t-lg">
        <h2 class="text-xl font-semibold">Bulk Edit cToons
          <span class="text-gray-500 font-normal text-base ml-1">({{ rows.length }} record{{ rows.length !== 1 ? 's' : '' }})</span>
        </h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <div class="text-gray-500">Loading cToon details…</div>
      </div>

      <template v-else>
        <!-- Body -->
        <div class="p-6 space-y-6">

          <!-- ── Bulk Apply Section ─────────────────────────────── -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <h3 class="text-base font-semibold text-blue-800 mb-1">Apply to All Records</h3>
            <p class="text-sm text-blue-600 mb-4">Change any field here to update it across every record below.</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

              <!-- Rarity -->
              <div>
                <label class="block text-sm font-medium mb-1">Rarity</label>
                <select v-model="bulk.rarity" @change="applyBulk('rarity', bulk.rarity)" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                  <option value="">— no change —</option>
                  <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>

              <!-- Set -->
              <div>
                <label class="block text-sm font-medium mb-1">Set</label>
                <input v-model="bulk.set" @input="applyBulk('set', bulk.set)" list="bulk-sets-list"
                  placeholder="— no change —"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                <datalist id="bulk-sets-list">
                  <option v-for="opt in setsOptions" :key="opt" :value="opt" />
                </datalist>
              </div>

              <!-- Series -->
              <div>
                <label class="block text-sm font-medium mb-1">Series</label>
                <input v-model="bulk.series" @input="applyBulk('series', bulk.series)" list="bulk-series-list"
                  placeholder="— no change —"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                <datalist id="bulk-series-list">
                  <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
                </datalist>
              </div>

              <!-- Price (auto from rarity, display-only) -->
              <div>
                <label class="block text-sm font-medium mb-1">Price <span class="text-xs text-gray-400">(auto from rarity)</span></label>
                <input :value="bulk.rarity ? rarityPrice(bulk.rarity) : ''" readonly
                  placeholder="— set rarity first —"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-100 cursor-not-allowed" />
              </div>

              <!-- In C-mart -->
              <div class="flex items-center gap-3 pt-5">
                <label class="text-sm font-medium">In C-mart</label>
                <div class="flex items-center gap-2">
                  <button type="button" @click="applyBulk('inCmart', true)"
                    :class="['px-3 py-1.5 text-sm rounded border', bulk.inCmart === true ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 hover:bg-gray-50']">
                    Yes
                  </button>
                  <button type="button" @click="applyBulk('inCmart', false)"
                    :class="['px-3 py-1.5 text-sm rounded border', bulk.inCmart === false ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 hover:bg-gray-50']">
                    No
                  </button>
                  <button type="button" @click="bulk.inCmart = null"
                    :class="['px-3 py-1.5 text-sm rounded border', bulk.inCmart === null ? 'bg-gray-200 border-gray-400' : 'border-gray-300 hover:bg-gray-50']">
                    —
                  </button>
                </div>
              </div>

              <!-- Code Only -->
              <div class="flex items-center gap-3 pt-5">
                <label class="text-sm font-medium">Code Only</label>
                <div class="flex items-center gap-2">
                  <button type="button" @click="applyBulk('codeOnly', true)"
                    :class="['px-3 py-1.5 text-sm rounded border', bulk.codeOnly === true ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 hover:bg-gray-50']">
                    Yes
                  </button>
                  <button type="button" @click="applyBulk('codeOnly', false)"
                    :class="['px-3 py-1.5 text-sm rounded border', bulk.codeOnly === false ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 hover:bg-gray-50']">
                    No
                  </button>
                  <button type="button" @click="bulk.codeOnly = null"
                    :class="['px-3 py-1.5 text-sm rounded border', bulk.codeOnly === null ? 'bg-gray-200 border-gray-400' : 'border-gray-300 hover:bg-gray-50']">
                    —
                  </button>
                </div>
              </div>

              <!-- Per-User Limit -->
              <div>
                <label class="block text-sm font-medium mb-1">Per-User Limit</label>
                <input v-model.number="bulk.perUserLimit" type="number" min="0"
                  @input="applyBulk('perUserLimit', bulk.perUserLimit)"
                  placeholder="— no change —"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>

              <!-- Release Date -->
              <div>
                <label class="block text-sm font-medium mb-1">Release Date (CDT)</label>
                <input v-model="bulk.releaseDate" type="datetime-local"
                  @change="applyBulk('releaseDate', bulk.releaseDate)"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>

              <!-- Mint Limit Type -->
              <div>
                <label class="block text-sm font-medium mb-1">Mint Limit</label>
                <select v-model="bulk.mintLimitType" @change="applyBulk('mintLimitType', bulk.mintLimitType)" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                  <option value="">— no change —</option>
                  <option value="defined">Defined Number Limit</option>
                  <option value="timeBased">Time Based Limit</option>
                </select>
              </div>

              <!-- Quantity (only shown when defined or no change) -->
              <div v-if="bulk.mintLimitType !== 'timeBased'">
                <label class="block text-sm font-medium mb-1">Total Quantity</label>
                <input v-model.number="bulk.quantity" type="number" min="0"
                  @input="applyBulk('quantity', bulk.quantity)"
                  placeholder="— no change —"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>

              <!-- Initial Quantity (only when defined or no change) -->
              <div v-if="bulk.mintLimitType !== 'timeBased'">
                <label class="block text-sm font-medium mb-1">Initial Quantity</label>
                <input v-model.number="bulk.initialQuantity" type="number" min="0"
                  @input="applyBulk('initialQuantity', bulk.initialQuantity)"
                  placeholder="— no change —"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>

              <!-- Mint End Date (only when timeBased) -->
              <div v-if="bulk.mintLimitType === 'timeBased'">
                <label class="block text-sm font-medium mb-1">Mint End Date (CDT)</label>
                <input v-model="bulk.mintEndDate" type="datetime-local"
                  @change="applyBulk('mintEndDate', bulk.mintEndDate)"
                  class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </div>

            </div>
          </div>

          <!-- ── Individual Records ──────────────────────────────── -->
          <div>
            <h3 class="text-base font-semibold mb-3 text-gray-700">Individual Records</h3>
            <div class="space-y-4">
              <div v-for="(row, i) in rows" :key="row.id"
                class="border rounded-lg overflow-hidden">

                <!-- Row header -->
                <div class="flex items-center gap-3 bg-gray-50 px-4 py-2 border-b">
                  <img :src="row.assetPath" :alt="row.name" class="h-10 w-auto rounded object-contain flex-shrink-0" />
                  <span class="font-medium text-sm">{{ row.name }}</span>
                  <span v-if="hasChanges(row)" class="ml-auto text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-0.5 rounded-full">Modified</span>
                </div>

                <!-- Row fields -->
                <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                  <!-- Rarity -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Rarity</label>
                    <select v-model="row.current.rarity" @change="onRowRarityChange(i)"
                      :class="['w-full border rounded px-2 py-1.5 text-sm bg-white', fieldChanged(row, 'rarity') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']">
                      <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                  </div>

                  <!-- Set -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Set</label>
                    <input v-model="row.current.set" :list="`sets-list-${i}`"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'set') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                    <datalist :id="`sets-list-${i}`">
                      <option v-for="opt in setsOptions" :key="opt" :value="opt" />
                    </datalist>
                  </div>

                  <!-- Series -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Series</label>
                    <input v-model="row.current.series" :list="`series-list-${i}`"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'series') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                    <datalist :id="`series-list-${i}`">
                      <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
                    </datalist>
                  </div>

                  <!-- Price (auto from rarity) -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Price <span class="text-gray-400">(auto)</span></label>
                    <input :value="row.current.price" readonly
                      :class="['w-full border rounded px-2 py-1.5 text-sm cursor-not-allowed', fieldChanged(row, 'price') ? 'border-yellow-400 bg-yellow-100' : 'border-gray-300 bg-gray-100']" />
                  </div>

                  <!-- In C-mart -->
                  <div class="flex items-center gap-2">
                    <input type="checkbox" v-model="row.current.inCmart" :id="`inCmart-${i}`"
                      :disabled="['Prize Only','Code Only','Auction Only'].includes(row.current.rarity)"
                      class="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                    <label :for="`inCmart-${i}`"
                      :class="['text-sm', fieldChanged(row, 'inCmart') ? 'text-yellow-700 font-medium' : '']">
                      In C-mart
                    </label>
                  </div>

                  <!-- Code Only -->
                  <div class="flex items-center gap-2">
                    <input type="checkbox" v-model="row.current.codeOnly" :id="`codeOnly-${i}`"
                      class="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                    <label :for="`codeOnly-${i}`"
                      :class="['text-sm', fieldChanged(row, 'codeOnly') ? 'text-yellow-700 font-medium' : '']">
                      Code Only
                    </label>
                  </div>

                  <!-- Per-User Limit -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Per-User Limit</label>
                    <input v-model.number="row.current.perUserLimit" type="number" min="0"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'perUserLimit') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                  </div>

                  <!-- Release Date -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Release Date (CDT)</label>
                    <input v-model="row.current.releaseDate" type="datetime-local"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'releaseDate') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                  </div>

                  <!-- Mint Limit Type -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Mint Limit</label>
                    <select v-model="row.current.mintLimitType"
                      :class="['w-full border rounded px-2 py-1.5 text-sm bg-white', fieldChanged(row, 'mintLimitType') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']">
                      <option value="defined">Defined Number Limit</option>
                      <option value="timeBased">Time Based Limit</option>
                    </select>
                  </div>

                  <!-- Quantity (defined only) -->
                  <div v-if="row.current.mintLimitType !== 'timeBased'">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Total Quantity</label>
                    <input v-model.number="row.current.quantity" type="number" min="0"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'quantity') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                  </div>

                  <!-- Initial Quantity (defined only) -->
                  <div v-if="row.current.mintLimitType !== 'timeBased'">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Initial Quantity</label>
                    <input v-model.number="row.current.initialQuantity" type="number" min="0"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'initialQuantity') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                  </div>

                  <!-- Mint End Date (timeBased only) -->
                  <div v-if="row.current.mintLimitType === 'timeBased'">
                    <label class="block text-xs font-medium text-gray-500 mb-1">Mint End Date (CDT)</label>
                    <input v-model="row.current.mintEndDate" type="datetime-local"
                      :class="['w-full border rounded px-2 py-1.5 text-sm', fieldChanged(row, 'mintEndDate') ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300']" />
                  </div>

                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="border-t px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-lg sticky bottom-0">
          <span class="text-sm text-gray-500">
            {{ changedCount }} record{{ changedCount !== 1 ? 's' : '' }} modified
          </span>
          <div class="flex gap-3">
            <button @click="$emit('close')"
              class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100">
              Cancel
            </button>
            <button @click="submit" :disabled="saving || changedCount === 0"
              class="px-5 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {{ saving ? 'Saving…' : `Save ${changedCount} Record${changedCount !== 1 ? 's' : ''}` }}
            </button>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'

const props = defineProps({
  ctoonIds: { type: Array, required: true },
  setsOptions: { type: Array, default: () => [] },
  seriesOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved'])

// ── Constants ────────────────────────────────────────────────────────
const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']
const RARITY_PRICE_MAP = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }

// ── State ────────────────────────────────────────────────────────────
const loading = ref(true)
const saving = ref(false)
const rows = ref([])
const rarityDefaults = ref(null)

// Bulk apply section — null means "no change applied yet"
const bulk = reactive({
  rarity: '',
  set: '',
  series: '',
  inCmart: null,
  codeOnly: null,
  perUserLimit: null,
  quantity: null,
  initialQuantity: null,
  releaseDate: '',
  mintLimitType: '',
  mintEndDate: '',
})

// ── Date helpers (America/Chicago) ───────────────────────────────────
function toDateTimeLocal(utcVal) {
  if (!utcVal) return ''
  try {
    const dt = new Date(utcVal)
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Chicago',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
    const parts = Object.fromEntries(fmt.formatToParts(dt).map(p => [p.type, p.value]))
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  } catch { return '' }
}

function nthSundayDay(year, monthNumber) {
  const monthIdx = monthNumber - 1
  const first = new Date(Date.UTC(year, monthIdx, 1))
  const firstDow = first.getUTCDay()
  const firstSunday = 1 + ((7 - firstDow) % 7)
  if (monthNumber === 3) return firstSunday + 7
  if (monthNumber === 11) return firstSunday
  return firstSunday
}
function isChicagoDst(y, m, d) {
  if (m < 3 || m > 11) return false
  if (m > 3 && m < 11) return true
  if (m === 3) return d >= nthSundayDay(y, 3)
  if (m === 11) return d < nthSundayDay(y, 11)
  return false
}
function localToUtcIso(localStr) {
  if (!localStr) return null
  const [datePart, timePart] = localStr.split('T')
  const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10))
  const [hh, mm] = timePart.split(':').map(n => parseInt(n, 10))
  const offset = isChicagoDst(y, m, d) ? '-05:00' : '-06:00'
  return new Date(`${datePart}T${timePart}:00${offset}`).toISOString()
}

// ── Price helpers ─────────────────────────────────────────────────────
function rarityPrice(rarity) {
  const d = rarityDefaults.value?.[rarity]
  if (d) return Number(d.price ?? 0)
  return RARITY_PRICE_MAP[rarity] ?? 0
}

// ── Load data ────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const [detailsRes, rdRes] = await Promise.all([
      fetch('/api/admin/ctoons/bulk-details', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: props.ctoonIds }),
      }),
      fetch('/api/rarity-defaults').catch(() => null),
    ])

    if (rdRes?.ok) {
      const rdJson = await rdRes.json()
      rarityDefaults.value = rdJson?.defaults || null
    }

    if (!detailsRes.ok) throw new Error('Failed to load cToon details')
    const ctoons = await detailsRes.json()

    // Build rows preserving the order of ctoonIds
    const map = Object.fromEntries(ctoons.map(c => [c.id, c]))
    rows.value = props.ctoonIds
      .filter(id => map[id])
      .map(id => {
        const c = map[id]
        const original = {
          rarity: c.rarity || '',
          set: c.set || '',
          series: c.series || '',
          inCmart: Boolean(c.inCmart),
          codeOnly: Boolean(c.codeOnly),
          price: c.price ?? 0,
          perUserLimit: c.perUserLimit ?? null,
          quantity: c.quantity ?? null,
          initialQuantity: c.initialQuantity ?? null,
          releaseDate: toDateTimeLocal(c.releaseDate),
          mintLimitType: c.mintLimitType || 'defined',
          mintEndDate: toDateTimeLocal(c.mintEndDate),
        }
        return {
          id: c.id,
          name: c.name,
          assetPath: c.assetPath,
          original,
          current: { ...original },
        }
      })
  } catch (err) {
    console.error('[BulkEditCtoonModal] load error', err)
  } finally {
    loading.value = false
  }
})

// ── Bulk apply ────────────────────────────────────────────────────────
function applyBulk(field, value) {
  if (value === '' || value === null || value === undefined) return
  for (const row of rows.value) {
    row.current[field] = value
    // Auto-price on rarity change
    if (field === 'rarity') {
      row.current.price = rarityPrice(value)
    }
  }
}

function onRowRarityChange(i) {
  const rarity = rows.value[i].current.rarity
  rows.value[i].current.price = rarityPrice(rarity)
}

// Watch bulk rarity to also update bulk price display (no side-effects on rows here — applyBulk handles that)
watch(() => bulk.inCmart, val => { if (val !== null) applyBulk('inCmart', val) })
watch(() => bulk.codeOnly, val => { if (val !== null) applyBulk('codeOnly', val) })

// ── Change detection ──────────────────────────────────────────────────
const COMPARABLE_FIELDS = [
  'rarity', 'set', 'series', 'inCmart', 'codeOnly', 'price',
  'perUserLimit', 'quantity', 'initialQuantity',
  'releaseDate', 'mintLimitType', 'mintEndDate',
]

function fieldChanged(row, field) {
  const orig = row.original[field]
  const curr = row.current[field]
  if (orig === null || orig === undefined) return curr !== null && curr !== undefined && curr !== ''
  if (typeof orig === 'boolean') return orig !== curr
  if (typeof orig === 'number') return orig !== Number(curr)
  return String(orig ?? '') !== String(curr ?? '')
}

function hasChanges(row) {
  return COMPARABLE_FIELDS.some(f => fieldChanged(row, f))
}

const changedCount = computed(() => rows.value.filter(hasChanges).length)

// ── Submit ────────────────────────────────────────────────────────────
async function submit() {
  saving.value = true
  try {
    const updates = rows.value
      .filter(hasChanges)
      .map(row => {
        const item = { id: row.id }
        for (const field of COMPARABLE_FIELDS) {
          if (!fieldChanged(row, field)) continue
          const val = row.current[field]
          if (field === 'releaseDate' || field === 'mintEndDate') {
            item[field] = val ? localToUtcIso(val) : null
          } else {
            item[field] = val
          }
        }
        return item
      })

    if (!updates.length) return

    const res = await fetch('/api/admin/ctoons/bulk-edit', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.statusMessage || 'Bulk edit failed')
    }

    const data = await res.json()
    emit('saved', data)
  } catch (err) {
    console.error('[BulkEditCtoonModal] submit error', err)
    alert(err.message || 'An error occurred while saving.')
  } finally {
    saving.value = false
  }
}
</script>
