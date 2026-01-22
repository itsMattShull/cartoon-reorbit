<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: cZone Search Logs</h1>

    <div class="bg-white rounded-lg shadow-md max-w-6xl mx-auto p-6 space-y-8">
      <div class="flex flex-wrap items-center gap-3">
        <label class="text-sm font-medium">Window:</label>
        <select v-model.number="days" class="border rounded px-2 py-1">
          <option :value="7">7 days</option>
          <option :value="30">30 days</option>
          <option :value="90">90 days</option>
        </select>

        <label class="text-sm font-medium">Search:</label>
        <select v-model="selectedSearchId" class="border rounded px-2 py-1 min-w-[220px]">
          <option value="">All Searches</option>
          <option v-for="opt in searchOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
        </select>

        <button class="btn-primary" @click="loadAll" :disabled="loading">{{ loading ? 'Loading…' : 'Refresh' }}</button>
      </div>

      <!-- KPIs -->
      <section class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
        <h2 class="text-xl font-semibold mb-2">Search Summary (Active During Window)</h2>
        <div class="sm:hidden space-y-3">
          <div v-for="row in analytics.searches" :key="row.id" class="border rounded bg-white p-3">
            <div class="text-sm font-semibold">{{ displayName(row.name) }} — {{ formatCentral(row.startAt) }} → {{ formatCentral(row.endAt) }}</div>
            <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div><span class="text-gray-500">Appearance:</span> {{ row.appearanceRatePercent }}%</div>
              <div><span class="text-gray-500">Cooldown:</span> {{ row.cooldownHours }}h</div>
              <div class="col-span-2"><span class="text-gray-500">Collection:</span> {{ collectionLabel(row.collectionType) }}</div>
              <div><span class="text-gray-500">Appearances:</span> {{ row.appearances }}</div>
              <div><span class="text-gray-500">Captures:</span> {{ row.captures }}</div>
              <div><span class="text-gray-500">Unique Viewers:</span> {{ row.uniqueViewers }}</div>
              <div><span class="text-gray-500">Capture Rate:</span> {{ row.captureRate }}%</div>
            </div>
          </div>
          <div v-if="!analytics.searches.length" class="text-sm text-gray-500">No searches in this window.</div>
        </div>

        <div class="hidden sm:block overflow-auto">
          <table class="min-w-[980px] w-full border rounded">
            <thead class="bg-gray-50 text-left text-sm">
              <tr>
                <th class="px-3 py-2 border-b">Name</th>
                <th class="px-3 py-2 border-b">Start (CST)</th>
                <th class="px-3 py-2 border-b">End (CST)</th>
                <th class="px-3 py-2 border-b">Appearance %</th>
                <th class="px-3 py-2 border-b">Cooldown</th>
                <th class="px-3 py-2 border-b">Collection</th>
                <th class="px-3 py-2 border-b">Appearances</th>
                <th class="px-3 py-2 border-b">Captures</th>
                <th class="px-3 py-2 border-b">Unique Viewers</th>
                <th class="px-3 py-2 border-b">Capture Rate</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr v-for="row in analytics.searches" :key="row.id" class="border-b">
                <td class="px-3 py-2 font-medium">{{ displayName(row.name) }}</td>
                <td class="px-3 py-2 whitespace-nowrap">{{ formatCentral(row.startAt) }}</td>
                <td class="px-3 py-2 whitespace-nowrap">{{ formatCentral(row.endAt) }}</td>
                <td class="px-3 py-2">{{ row.appearanceRatePercent }}%</td>
                <td class="px-3 py-2">{{ row.cooldownHours }}h</td>
                <td class="px-3 py-2">{{ collectionLabel(row.collectionType) }}</td>
                <td class="px-3 py-2">{{ row.appearances }}</td>
                <td class="px-3 py-2">{{ row.captures }}</td>
                <td class="px-3 py-2">{{ row.uniqueViewers }}</td>
                <td class="px-3 py-2">{{ row.captureRate }}%</td>
              </tr>
              <tr v-if="!analytics.searches.length">
                <td class="px-3 py-2 text-gray-500" colspan="10">No searches in this window.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Appearance + capture breakdown -->
      <section>
        <h2 class="text-xl font-semibold mb-2">cToon Appearance & Capture Breakdown</h2>
        <div class="text-xs text-gray-500 mb-3">
          Total appearances: {{ breakdown.totals.appearances }} · Total captures: {{ breakdown.totals.captures }}
        </div>
        <div class="sm:hidden space-y-3">
          <div v-for="row in breakdown.rows" :key="row.ctoonId" class="border rounded bg-white p-3">
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span>{{ row.ctoon?.rarity || '—' }}</span>
              <span>{{ formatPercent(row.captureRate) }} capture rate</span>
            </div>
            <div class="mt-1 text-sm font-medium">{{ row.ctoon?.name || 'Unknown cToon' }}</div>
            <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span class="text-gray-500">Appearances:</span>
                {{ row.appearances }}
                <span class="text-gray-400">({{ formatPercent(row.appearancePercent) }})</span>
              </div>
              <div><span class="text-gray-500">Captures:</span> {{ row.captures }}</div>
              <div><span class="text-gray-500">Capture Rate:</span> {{ formatPercent(row.captureRate) }}</div>
            </div>
          </div>
          <div v-if="!breakdown.rows.length" class="text-sm text-gray-500">No appearances found.</div>
        </div>

        <div class="hidden sm:block overflow-auto">
          <table class="min-w-[720px] w-full border rounded">
            <thead class="bg-gray-50 text-left text-sm">
              <tr>
                <th class="px-3 py-2 border-b">cToon</th>
                <th class="px-3 py-2 border-b">Rarity</th>
                <th class="px-3 py-2 border-b">Appearances</th>
                <th class="px-3 py-2 border-b">Captures</th>
                <th class="px-3 py-2 border-b">Capture Rate</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr v-for="row in breakdown.rows" :key="row.ctoonId" class="border-b">
                <td class="px-3 py-2">{{ row.ctoon?.name || '—' }}</td>
                <td class="px-3 py-2">{{ row.ctoon?.rarity || '—' }}</td>
                <td class="px-3 py-2">
                  {{ row.appearances }}
                  <span class="text-xs text-gray-500">({{ formatPercent(row.appearancePercent) }})</span>
                </td>
                <td class="px-3 py-2">{{ row.captures }}</td>
                <td class="px-3 py-2">{{ formatPercent(row.captureRate) }}</td>
              </tr>
              <tr v-if="!breakdown.rows.length">
                <td class="px-3 py-2 text-gray-500" colspan="5">No appearances found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - cZone Search Logs', middleware: ['auth', 'admin'], layout: 'default' })

const days = ref(30)
const selectedSearchId = ref('')
const loading = ref(false)

const analytics = ref({
  totals: { appearances: 0, captures: 0, uniqueViewers: 0, uniqueCaptures: 0, captureRate: 0 },
  searches: []
})
const breakdown = ref({ rows: [], totals: { appearances: 0, captures: 0 } })
const searchOptions = ref([])

function collectionLabel(value) {
  return value === 'ONCE' ? 'Collect Each cToon Once' : 'Collect Each cToon Multiple Times'
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

onMounted(async () => {
  await loadSearchOptions()
  await loadAll()
})
</script>

<style scoped>
.btn-primary{ background-color:#2563EB; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.kpi{ background:#f9fafb; border:1px solid #e5e7eb; border-radius:.5rem; padding:.75rem }
.kpi-label{ font-size:.75rem; color:#6b7280; text-transform:uppercase; letter-spacing:.04em }
.kpi-value{ font-size:1.25rem; font-weight:600; color:#111827 }
</style>
