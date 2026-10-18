<template>
  <div class="admin-retention bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-2 text-gray-900">Retention</h1>

        <div class="flex flex-wrap items-center gap-3 mb-3">
          <div class="flex items-center gap-2">
            <label for="cohort" class="font-medium text-gray-800">Cohort:</label>
            <select
              id="cohort"
              v-model="cohort"
              class="border rounded px-1.5 py-0.5 text-xs text-gray-900"
            >
              <option v-for="opt in cohortOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="text-[11px] text-gray-500">
            Showing last {{ limit }} {{ cohortLabelPlural }}
          </div>

          <button
            type="button"
            class="border rounded px-2 py-0.5 text-xs"
            :disabled="loading"
            @click="loadRetention"
          >
            Refresh
          </button>
        </div>

        <div v-if="loading" class="text-gray-500">Loading retention...</div>
        <div v-else-if="error" class="text-red-600">{{ error }}</div>
        <div v-else>
          <div v-if="!rows.length" class="text-gray-500">No cohorts found.</div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-[980px] w-full border-collapse">
              <thead class="text-left border-b">
                <tr>
                  <th class="py-1.5 pr-3">Cohort</th>
                  <th class="py-1.5 pr-3">Users</th>
                  <th v-for="w in windows" :key="w.key" class="py-1.5 pr-3 text-center">
                    {{ w.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.cohortStart" class="border-b last:border-b-0">
                  <td class="py-2 pr-3 whitespace-nowrap font-medium">
                    {{ formatCohortLabel(row.cohortStart) }}
                  </td>
                  <td class="py-2 pr-3 tabular-nums">{{ row.cohortSize }}</td>
                  <td v-for="w in windows" :key="w.key" class="py-2 pr-3 text-center">
                    <div v-if="row.metrics[w.key]?.eligible" class="tabular-nums">
                      <div class="font-medium">{{ retentionRate(row.metrics[w.key]) }}%</div>
                      <div class="text-[11px] text-gray-500">
                        {{ row.metrics[w.key].retained }}/{{ row.metrics[w.key].eligible }}
                      </div>
                    </div>
                    <div v-else class="text-gray-400">-</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="text-[11px] text-gray-500 mt-2">
            Retention is based on each user's last activity timestamp.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const cohortOptions = [
  { value: 'week', label: 'Weekly cohorts' },
  { value: 'month', label: 'Monthly cohorts' },
  { value: 'quarter', label: 'Quarterly cohorts' }
]
const cohort = ref('week')

const cohortLimits = { week: 12, month: 12, quarter: 8 }
const limit = computed(() => cohortLimits[cohort.value] || 12)
const cohortLabelPlural = computed(() => {
  if (cohort.value === 'month') return 'months'
  if (cohort.value === 'quarter') return 'quarters'
  return 'weeks'
})

const windows = [
  { key: 'd3', label: '3 Day' },
  { key: 'w1', label: '1 Week' },
  { key: 'w2', label: '2 Week' },
  { key: 'm1', label: '1 Month' },
  { key: 'm3', label: '3 Month' },
  { key: 'm6', label: '6 Month' },
  { key: 'y1', label: '1+ Year' }
]

const rows = ref([])
const loading = ref(false)
const error = ref('')

function retentionRate(metric) {
  if (!metric?.eligible) return 0
  return Math.round((metric.retained / metric.eligible) * 100)
}

function formatCohortLabel(startStr) {
  if (!startStr) return ''
  if (cohort.value === 'month') return startStr.slice(0, 7)
  if (cohort.value === 'quarter') {
    const year = startStr.slice(0, 4)
    const month = Number.parseInt(startStr.slice(5, 7), 10) || 1
    const quarter = Math.floor((month - 1) / 3) + 1
    return `${year} Q${quarter}`
  }
  return startStr
}

async function loadRetention() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch('/api/admin/retention', {
      query: { cohort: cohort.value, limit: limit.value }
    })
    rows.value = Array.isArray(data?.rows) ? data.rows : []
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load retention'
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadRetention)
watch(cohort, loadRetention)
</script>
