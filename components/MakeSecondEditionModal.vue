<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
    <div class="bg-white rounded-lg w-full max-w-4xl my-8 flex flex-col shadow-xl">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10 rounded-t-lg">
        <h2 class="text-xl font-semibold">Make 2nd Edition cToons</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <div class="text-gray-500">Loading cToon details…</div>
      </div>

      <!-- Over-limit state -->
      <div v-else-if="tooMany" class="p-6">
        <p class="text-red-600 text-sm">
          {{ ctoonIds.length }} cToons are currently filtered, which is more than the {{ maxBatch }}-record limit for
          this action. Narrow your Set/Series/search filter and try again.
        </p>
        <div class="mt-4 flex justify-end">
          <button @click="$emit('close')" class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100">Close</button>
        </div>
      </div>

      <template v-else>
        <div class="p-6 space-y-5">

          <!-- Set Name (required) -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label class="block text-sm font-semibold text-blue-800 mb-1">
              Set Name for 2nd Editions <span class="text-red-600">*</span>
            </label>
            <input
              v-model="setName"
              type="text"
              placeholder="e.g. Summer 2026 Second Editions"
              class="w-full border rounded px-3 py-2 text-sm"
              :class="showSetNameError ? 'border-red-400' : 'border-gray-300'"
              @input="showSetNameError = false"
            />
            <p v-if="showSetNameError" class="text-xs text-red-600 mt-1">Set Name is required.</p>
            <p class="text-xs text-blue-600 mt-1">
              Every created cToon uses this Set value. All other details (image, name, rarity, series, etc.) are copied
              from the original.
            </p>
          </div>

          <!-- Excluded banner -->
          <div v-if="excluded.length" class="border border-amber-300 bg-amber-50 rounded-lg">
            <button
              type="button"
              @click="showExcluded = !showExcluded"
              class="w-full flex items-center justify-between px-4 py-3 text-sm text-amber-800 font-medium text-left"
            >
              <span>{{ excluded.length }} cToon{{ excluded.length !== 1 ? 's' : '' }} excluded (already a Second Edition or already paired)</span>
              <span class="flex-shrink-0 ml-2">{{ showExcluded ? '▲' : '▼' }}</span>
            </button>
            <ul v-if="showExcluded" class="px-4 pb-3 space-y-1.5">
              <li v-for="row in excluded" :key="row.id" class="text-xs text-amber-700 flex items-center gap-2">
                <img :src="row.assetPath" :alt="row.name" class="h-6 w-auto object-contain flex-shrink-0" />
                <span class="truncate">{{ row.name }}</span>
                <span class="text-amber-500 flex-shrink-0">— {{ row.reason }}</span>
              </li>
            </ul>
          </div>

          <!-- Eligible rows -->
          <div v-if="eligible.length">
            <div class="flex items-center justify-between mb-3 gap-2">
              <h3 class="text-sm font-semibold text-gray-700">
                {{ selectedCount }} of {{ eligible.length }} selected
              </h3>
              <div class="flex gap-3 text-xs flex-shrink-0">
                <button type="button" @click="selectAll" class="text-indigo-600 hover:underline">Select all</button>
                <button type="button" @click="selectNone" class="text-indigo-600 hover:underline">Select none</button>
              </div>
            </div>

            <div class="space-y-2">
              <div v-for="row in eligible" :key="row.id" class="border rounded-lg overflow-hidden">
                <label class="flex items-center gap-3 px-3 py-3 min-h-[56px] cursor-pointer bg-gray-50">
                  <input type="checkbox" v-model="row.selected" class="h-5 w-5 rounded border-gray-300 text-indigo-600 flex-shrink-0" />
                  <img :src="row.assetPath" :alt="row.name" class="h-10 w-auto object-contain flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate">{{ row.name }}</div>
                    <div class="text-xs text-gray-500 truncate">
                      {{ row.rarity }}
                      · Qty {{ row.mintLimitType === 'timeBased' ? 'Time-based' : (row.quantity ?? '∞') }}
                      · Init {{ row.mintLimitType === 'timeBased' ? '—' : (row.initialQuantity ?? '∞') }}
                      · Limit {{ row.perUserLimit ?? '∞' }}
                    </div>
                  </div>
                  <button
                    type="button"
                    @click.prevent="row.expanded = !row.expanded"
                    class="text-xs text-indigo-600 hover:underline flex-shrink-0 px-2 py-2"
                  >
                    {{ row.expanded ? 'Done' : 'Edit' }}
                  </button>
                </label>

                <div v-if="row.expanded" class="p-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Mint Limit</label>
                    <select v-model="row.mintLimitType" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                      <option value="defined">Defined Number Limit</option>
                      <option value="timeBased">Time Based Limit</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Per-User Limit</label>
                    <input v-model.number="row.perUserLimit" type="number" min="0" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  </div>
                  <template v-if="row.mintLimitType !== 'timeBased'">
                    <div>
                      <label class="block text-xs font-medium text-gray-500 mb-1">Total Quantity</label>
                      <input v-model.number="row.quantity" type="number" min="0" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 mb-1">Initial Quantity</label>
                      <input v-model.number="row.initialQuantity" type="number" min="0" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                    </div>
                  </template>
                  <div v-else>
                    <label class="block text-xs font-medium text-gray-500 mb-1">Mint End Date (CDT)</label>
                    <input v-model="row.mintEndDate" type="datetime-local" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-gray-500 py-8 text-sm">
            No eligible cToons in the current filter — every matching cToon is already a Second Edition or already has one.
          </div>

        </div>

        <!-- Footer -->
        <div class="border-t px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-lg sticky bottom-0 gap-3">
          <span class="text-sm text-gray-500">{{ selectedCount }} record{{ selectedCount !== 1 ? 's' : '' }} selected</span>
          <div class="flex gap-3">
            <button @click="$emit('close')" class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-100">
              Cancel
            </button>
            <button
              @click="submit"
              :disabled="saving || selectedCount === 0"
              class="px-5 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ saving ? 'Creating…' : `Create ${selectedCount} Second Edition${selectedCount !== 1 ? 's' : ''}` }}
            </button>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  ctoonIds: { type: Array, required: true },
})
const emit = defineEmits(['close', 'saved'])

const maxBatch = 150
const tooMany = computed(() => props.ctoonIds.length > maxBatch)

const loading = ref(true)
const saving = ref(false)
const setName = ref('')
const showSetNameError = ref(false)
const showExcluded = ref(false)
const eligible = ref([])
const excluded = ref([])

// ── Date helpers (America/Chicago) — same convention as BulkEditCtoonModal ──
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
  const [y, m] = datePart.split('-').map(n => parseInt(n, 10))
  const d = parseInt(datePart.split('-')[2], 10)
  const offset = isChicagoDst(y, m, d) ? '-05:00' : '-06:00'
  return new Date(`${datePart}T${timePart}:00${offset}`).toISOString()
}

// ── Load data ─────────────────────────────────────────────────────────
onMounted(async () => {
  if (tooMany.value) { loading.value = false; return }
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

    let rarityDefaults = null
    if (rdRes?.ok) {
      const rdJson = await rdRes.json()
      rarityDefaults = rdJson?.defaults || null
    }

    if (!detailsRes.ok) throw new Error('Failed to load cToon details')
    const ctoons = await detailsRes.json()

    const map = Object.fromEntries(ctoons.map(c => [c.id, c]))
    const elig = []
    const excl = []
    for (const id of props.ctoonIds) {
      const c = map[id]
      if (!c) continue
      if (c.isSecondEdition) {
        excl.push({ id: c.id, name: c.name, assetPath: c.assetPath, reason: 'Already a Second Edition' })
        continue
      }
      if (c.hasSecondEdition) {
        excl.push({ id: c.id, name: c.name, assetPath: c.assetPath, reason: 'Already has a Second Edition' })
        continue
      }
      const d = rarityDefaults?.[c.rarity]
      elig.push({
        id: c.id,
        name: c.name,
        assetPath: c.assetPath,
        rarity: c.rarity,
        selected: true,
        expanded: false,
        mintLimitType: 'defined',
        quantity: d?.totalQuantity ?? null,
        initialQuantity: d?.initialQuantity ?? null,
        perUserLimit: d?.perUserLimit ?? null,
        mintEndDate: '',
      })
    }
    eligible.value = elig
    excluded.value = excl
  } catch (err) {
    console.error('[MakeSecondEditionModal] load error', err)
  } finally {
    loading.value = false
  }
})

const selectedCount = computed(() => eligible.value.filter(r => r.selected).length)

function selectAll() { eligible.value.forEach(r => { r.selected = true }) }
function selectNone() { eligible.value.forEach(r => { r.selected = false }) }

// ── Submit ────────────────────────────────────────────────────────────
async function submit() {
  if (!setName.value.trim()) { showSetNameError.value = true; return }
  if (!selectedCount.value) return

  saving.value = true
  try {
    const records = eligible.value
      .filter(r => r.selected)
      .map(r => ({
        id: r.id,
        mintLimitType: r.mintLimitType,
        quantity: r.mintLimitType === 'timeBased' ? null : r.quantity,
        initialQuantity: r.mintLimitType === 'timeBased' ? null : r.initialQuantity,
        perUserLimit: r.perUserLimit,
        mintEndDate: r.mintLimitType === 'timeBased' && r.mintEndDate ? localToUtcIso(r.mintEndDate) : null,
      }))

    const res = await fetch('/api/admin/ctoons/make-second-edition', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setName: setName.value.trim(), records }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.statusMessage || 'Failed to create Second Editions')
    }

    const data = await res.json()
    emit('saved', data)
  } catch (err) {
    console.error('[MakeSecondEditionModal] submit error', err)
    alert(err.message || 'An error occurred while creating Second Editions.')
  } finally {
    saving.value = false
  }
}
</script>
