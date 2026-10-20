<!-- components/newsite/AdminCmartMetrics.vue
     Admin page for the "Standardize Metric in cMart" feature (see Add/Edit cToon's own toggle of
     the same name): shows the data needed to pick sensible per-rarity percentages — active player
     count, median/avg points per active player — and lets an admin tune those percentages, with a
     live preview of the mint quantity each one currently produces. -->
<template>
  <div class="bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3 space-y-4">
        <div>
          <h1 class="text-base font-semibold text-gray-900">cMart Metrics</h1>
          <p class="text-[11px] text-gray-500 mt-0.5">
            Controls "Standardize Metric in cMart" on the Add/Edit cToon forms: when that toggle is
            on, a cToon's Total/Initial Quantity is computed as this percentage of the current
            active-player count instead of being hand-typed, recomputed fresh every time it's
            saved.
          </p>
        </div>

        <div v-if="loading" class="text-gray-500 py-6 text-center">Loading…</div>
        <div v-else-if="loadError" class="text-red-600">{{ loadError }}</div>
        <template v-else>
          <!-- Stat tiles -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="border rounded-lg p-3">
              <div class="text-[11px] text-gray-500 uppercase tracking-wide">Active Players</div>
              <div class="text-xl font-semibold tabular-nums">{{ formatNumber(data.activePlayerCount) }}</div>
              <div class="text-[11px] text-gray-500 mt-0.5">Activity in the last {{ data.activePlayerWindowDays }} days</div>
            </div>
            <div class="border rounded-lg p-3">
              <div class="text-[11px] text-gray-500 uppercase tracking-wide">Median Points / Active Player</div>
              <div class="text-xl font-semibold tabular-nums">{{ formatNumber(data.medianPointsPerPlayer) }}</div>
              <div class="text-[11px] text-gray-500 mt-0.5">Half of active players hold less than this</div>
            </div>
            <div class="border rounded-lg p-3">
              <div class="text-[11px] text-gray-500 uppercase tracking-wide">Avg Points / Active Player</div>
              <div class="text-xl font-semibold tabular-nums">{{ formatNumber(data.avgPointsPerPlayer) }}</div>
              <div class="text-[11px] text-gray-500 mt-0.5">Skewed upward by big holders — median above is more typical</div>
            </div>
          </div>

          <!-- Percentage table -->
          <div>
            <p class="text-xs text-gray-600 mb-2">
              Mint quantity for a standardized cToon = <strong>active players × percentage</strong>, rounded,
              minimum 1 (and never shrunk below copies already minted, when editing an existing cToon).
            </p>

            <!-- Desktop table -->
            <div class="overflow-x-auto hidden sm:block">
              <table class="min-w-full text-xs">
                <thead>
                  <tr>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Rarity</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Percentage</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Mint Quantity Right Now</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rarityOrder" :key="r" class="border-b">
                    <td class="px-2 py-1.5 font-medium">{{ r }}</td>
                    <td class="px-2 py-1.5">
                      <div class="flex items-center gap-1">
                        <input type="number" min="1" max="1000" class="border rounded-md px-2 py-1 text-xs w-20" v-model.number="percentages[r]" />
                        <span class="text-gray-500">%</span>
                      </div>
                    </td>
                    <td class="px-2 py-1.5 tabular-nums">{{ formatNumber(previewQuantity(r)) }} copies</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile cards -->
            <div class="space-y-2 sm:hidden">
              <div v-for="r in rarityOrder" :key="r" class="bg-white border rounded-lg shadow p-2">
                <div class="font-semibold text-xs text-gray-800 mb-1.5">{{ r }}</div>
                <div class="grid grid-cols-1 gap-2">
                  <div class="flex flex-col gap-1">
                    <label class="text-xs font-medium">Percentage</label>
                    <div class="flex items-center gap-1">
                      <input type="number" min="1" max="1000" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="percentages[r]" />
                      <span class="text-gray-500">%</span>
                    </div>
                  </div>
                  <div class="text-[11px] text-gray-600">Mint quantity right now: <span class="font-medium tabular-nums">{{ formatNumber(previewQuantity(r)) }}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="saving"
              @click="save"
            >
              <span v-if="!saving">Save</span><span v-else>Saving…</span>
            </button>
          </div>
        </template>

        <div v-if="toast" :class="['fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 text-xs rounded-md max-w-[90vw] text-center break-words',
                                   toast.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700']">
          {{ toast.msg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { STANDARDIZABLE_RARITIES as rarityOrder } from '~/utils/cmartStandardizedRarities'

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const toast = ref(null)
const data = ref(null)
const percentages = reactive({})

function formatNumber(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString()
}

function previewQuantity(rarity) {
  if (!data.value) return null
  const pct = Number(percentages[rarity])
  if (!Number.isFinite(pct)) return null
  return Math.max(1, Math.round(data.value.activePlayerCount * pct / 100))
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmart-metrics')
    data.value = res
    for (const r of rarityOrder) percentages[r] = res.percentages?.[r] ?? 0
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load cMart metrics.'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  toast.value = null
  try {
    const res = await $fetch('/api/admin/cmart-metrics', {
      method: 'POST',
      body: { percentages: { ...percentages } }
    })
    // Re-sync from the server's (validated/normalized) response rather than trusting the form
    // state as-is.
    for (const r of rarityOrder) percentages[r] = res.percentages?.[r] ?? percentages[r]
    toast.value = { type: 'ok', msg: 'cMart metrics saved.' }
  } catch (e) {
    toast.value = { type: 'error', msg: e?.data?.statusMessage || 'Save failed.' }
  } finally {
    saving.value = false
    setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(load)
</script>
