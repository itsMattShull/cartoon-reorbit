<template>
  <div class="admin-czone-search-logs bg-gray-100">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">cZone Search Logs</h1>

      <div class="bg-white rounded-lg shadow-md p-2 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-[11px] font-medium">Window:</label>
          <select v-model.number="days" class="border rounded px-1.5 py-0.5 text-xs">
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
            <option :value="90">90 days</option>
          </select>

          <label class="text-[11px] font-medium">Search:</label>
          <select v-model="selectedSearchId" class="border rounded px-1.5 py-0.5 text-xs min-w-[180px]">
            <option value="">All Searches</option>
            <option v-for="opt in searchOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>

          <button class="btn-primary" @click="loadAll" :disabled="loading">{{ loading ? 'Loading…' : 'Refresh' }}</button>
          <button class="btn-secondary" @click="downloadCsv" :disabled="downloading">{{ downloading ? 'Downloading…' : 'Download' }}</button>
        </div>

        <!-- KPIs -->
        <section class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div class="kpi">
            <div class="kpi-label">Appearances</div>
            <div class="kpi-value">{{ analytics.totals.appearances }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Captures</div>
            <div class="kpi-value">{{ analytics.totals.captures }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Unique Viewers</div>
            <div class="kpi-value">{{ analytics.totals.uniqueViewers }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Unique Captures</div>
            <div class="kpi-value">{{ analytics.totals.uniqueCaptures }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Capture Rate</div>
            <div class="kpi-value">{{ analytics.totals.captureRate }}%</div>
          </div>
        </section>

        <!-- Search summary -->
        <section>
          <h2 class="text-sm font-semibold mb-1">Search Summary (Active During Window)</h2>
          <div class="sm:hidden space-y-1.5">
            <div v-for="row in analytics.searches" :key="row.id" class="border rounded bg-white p-2">
              <div class="text-[11px] font-semibold">{{ displayName(row.name) }} — {{ formatCentral(row.startAt) }} → {{ formatCentral(row.endAt) }}</div>
              <div class="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <div><span class="text-gray-500">Appearance:</span> {{ row.appearanceRatePercent }}%</div>
                <div><span class="text-gray-500">Reset:</span> {{ resetLabel(row) }}</div>
                <div v-if="isDailyReset(row)" class="col-span-2">
                  <span class="text-gray-500">Daily Limit:</span> {{ dailyLimitLabel(row) }}
                </div>
                <div v-else><span class="text-gray-500">Cooldown:</span> {{ row.cooldownHours }}h</div>
                <div class="col-span-2"><span class="text-gray-500">Collection:</span> {{ collectionLabel(row.collectionType) }}</div>
                <div><span class="text-gray-500">Appearances:</span> {{ row.appearances }}</div>
                <div><span class="text-gray-500">Captures:</span> {{ row.captures }}</div>
                <div><span class="text-gray-500">Unique Viewers:</span> {{ row.uniqueViewers }}</div>
                <div><span class="text-gray-500">Capture Rate:</span> {{ row.captureRate }}%</div>
              </div>
            </div>
            <div v-if="!analytics.searches.length" class="text-[11px] text-gray-500">No searches in this window.</div>
          </div>

          <div class="hidden sm:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Name</th>
                  <th class="px-1.5 py-1 border-b">Start (CST)</th>
                  <th class="px-1.5 py-1 border-b">End (CST)</th>
                  <th class="px-1.5 py-1 border-b">App %</th>
                  <th class="px-1.5 py-1 border-b">Reset</th>
                  <th class="px-1.5 py-1 border-b">Collection</th>
                  <th class="px-1.5 py-1 border-b">App</th>
                  <th class="px-1.5 py-1 border-b">Cap</th>
                  <th class="px-1.5 py-1 border-b">Uniq Viewers</th>
                  <th class="px-1.5 py-1 border-b">Cap Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in analytics.searches" :key="row.id" class="border-b">
                  <td class="px-1.5 py-1 font-medium">{{ displayName(row.name) }}</td>
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatCentral(row.startAt) }}</td>
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatCentral(row.endAt) }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ row.appearanceRatePercent }}%</td>
                  <td class="px-1.5 py-1">
                    <div>{{ resetLabel(row) }}</div>
                    <div v-if="isDailyReset(row)" class="text-[10px] text-gray-500">
                      Daily: {{ dailyLimitLabel(row) }}
                    </div>
                    <div v-else class="text-[10px] text-gray-500">{{ row.cooldownHours }}h</div>
                  </td>
                  <td class="px-1.5 py-1">{{ collectionLabel(row.collectionType) }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ row.appearances }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ row.captures }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ row.uniqueViewers }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ row.captureRate }}%</td>
                </tr>
                <tr v-if="!analytics.searches.length">
                  <td class="px-1.5 py-1 text-gray-500" colspan="10">No searches in this window.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Appearance + capture breakdown -->
        <section>
          <h2 class="text-sm font-semibold mb-1">cToon Appearance &amp; Capture Breakdown</h2>
          <div class="text-[10px] text-gray-500 mb-1">
            Total appearances: {{ breakdown.totals.appearances }} · Total captures: {{ breakdown.totals.captures }}
          </div>
          <div class="sm:hidden space-y-1.5">
            <div v-for="row in breakdown.rows" :key="row.ctoonId" class="border rounded bg-white p-2">
              <div class="flex items-center justify-between text-[10px] text-gray-500">
                <span>{{ row.ctoon?.rarity || '—' }}</span>
                <span>{{ formatPercent(row.captureRate) }} capture rate</span>
              </div>
              <div class="mt-0.5 text-[11px] font-medium">{{ row.ctoon?.name || 'Unknown cToon' }}</div>
              <div class="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <div>
                  <span class="text-gray-500">Appearances:</span>
                  {{ row.appearances }}
                  <span class="text-gray-400">({{ formatPercent(row.appearancePercent) }})</span>
                </div>
                <div><span class="text-gray-500">Captures:</span> {{ row.captures }}</div>
                <div><span class="text-gray-500">Capture Rate:</span> {{ formatPercent(row.captureRate) }}</div>
              </div>
            </div>
            <div v-if="!breakdown.rows.length" class="text-[11px] text-gray-500">No appearances found.</div>
          </div>

          <div class="hidden sm:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">cToon</th>
                  <th class="px-1.5 py-1 border-b">Rarity</th>
                  <th class="px-1.5 py-1 border-b">Appearances</th>
                  <th class="px-1.5 py-1 border-b">Captures</th>
                  <th class="px-1.5 py-1 border-b">Capture Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in breakdown.rows" :key="row.ctoonId" class="border-b">
                  <td class="px-1.5 py-1">{{ row.ctoon?.name || '—' }}</td>
                  <td class="px-1.5 py-1">{{ row.ctoon?.rarity || '—' }}</td>
                  <td class="px-1.5 py-1 tabular-nums">
                    {{ row.appearances }}
                    <span class="text-[10px] text-gray-500">({{ formatPercent(row.appearancePercent) }})</span>
                  </td>
                  <td class="px-1.5 py-1 tabular-nums">{{ row.captures }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ formatPercent(row.captureRate) }}</td>
                </tr>
                <tr v-if="!breakdown.rows.length">
                  <td class="px-1.5 py-1 text-gray-500" colspan="5">No appearances found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const days = ref(30)
const selectedSearchId = ref('')
const loading = ref(false)
const downloading = ref(false)

const analytics = ref({
  totals: { appearances: 0, captures: 0, uniqueViewers: 0, uniqueCaptures: 0, captureRate: 0 },
  searches: []
})
const breakdown = ref({ rows: [], totals: { appearances: 0, captures: 0 } })
const searchOptions = ref([])

function collectionLabel(value) {
  if (value === 'ONCE') return 'Once'
  if (value === 'CUSTOM_PER_CTOON') return 'Custom Per cToon'
  return 'Multiple Times'
}

function normalizeResetType(value) {
  return value === 'DAILY_AT_RESET' ? 'DAILY_AT_RESET' : 'COOLDOWN_HOURS'
}

function isDailyReset(row) {
  return normalizeResetType(row?.resetType) === 'DAILY_AT_RESET'
}

function resetLabel(row) {
  return isDailyReset(row) ? 'Daily at 8pm CT' : 'Cooldown'
}

function dailyLimitLabel(row) {
  const limit = Number(row?.dailyCollectLimit ?? 0)
  return limit > 0 ? String(limit) : 'Unlimited'
}

function formatCentral(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  })
}

function displayName(name) {
  const cleaned = String(name || '').trim()
  return cleaned || 'Untitled'
}

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`

async function loadSearchOptions() {
  try {
    const data = await $fetch('/api/admin/czone-searches', { query: { showAll: '1' } })
    searchOptions.value = (Array.isArray(data) ? data : []).map((row) => ({
      id: row.id,
      label: `${displayName(row.name)} — ${formatCentral(row.startAt)} → ${formatCentral(row.endAt)}`
    }))
  } catch {
    searchOptions.value = []
  }
}

async function loadAll() {
  loading.value = true
  try {
    const query = { days: days.value }
    if (selectedSearchId.value) query.searchId = selectedSearchId.value
    const [an, ev] = await Promise.all([
      $fetch('/api/admin/czone-search-logs/analytics', { query }),
      $fetch('/api/admin/czone-search-logs/events', { query })
    ])
    analytics.value = an
    breakdown.value = ev
  } finally {
    loading.value = false
  }
}

async function downloadCsv() {
  downloading.value = true
  try {
    const query = new URLSearchParams({ days: days.value })
    if (selectedSearchId.value) query.set('searchId', selectedSearchId.value)
    const response = await fetch(`/api/admin/czone-search-logs/download?${query}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'czone-search-logs.csv'
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    downloading.value = false
  }
}

onMounted(async () => {
  await loadSearchOptions()
  await loadAll()
})
</script>

<style scoped>
.admin-czone-search-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
.btn-primary {
  background-color: #2563EB;
  color: #fff;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
}
.btn-primary:disabled { opacity: 0.5; }
.btn-secondary {
  background-color: #6B7280;
  color: #fff;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
}
.btn-secondary:disabled { opacity: 0.5; }
.kpi { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; }
.kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi-value { font-size: 14px; font-weight: 600; color: #111827; }
</style>
