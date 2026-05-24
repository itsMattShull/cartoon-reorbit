<template>
  <div class="admin-scavenger-logs bg-gray-100">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">Scavenger Logs</h1>

      <div class="bg-white rounded-lg shadow-md p-2 space-y-3">
        <div class="flex items-center gap-2">
          <label class="text-[11px] font-medium">Window:</label>
          <select v-model.number="days" class="border rounded px-1.5 py-0.5 text-xs">
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
            <option :value="90">90 days</option>
          </select>
          <button class="btn-primary" @click="loadAll" :disabled="loading">{{ loading ? 'Loading…' : 'Refresh' }}</button>
        </div>

        <!-- KPIs -->
        <section class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div class="kpi"><div class="kpi-label">Starts</div><div class="kpi-value">{{ analytics.startedCount }}</div></div>
          <div class="kpi">
            <div class="kpi-label">Nothing</div>
            <div class="kpi-value">{{ analytics.outcomes.NOTHING }}</div>
            <div class="kpi-sub">{{ rate(analytics.outcomes.NOTHING, completedTotal) }}%</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Points</div>
            <div class="kpi-value">{{ analytics.outcomes.POINTS }}</div>
            <div class="kpi-sub">{{ rate(analytics.outcomes.POINTS, completedTotal) }}%</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Exclusives</div>
            <div class="kpi-value">{{ analytics.outcomes.EXCLUSIVE_CTOON }}</div>
            <div class="kpi-sub">{{ rate(analytics.outcomes.EXCLUSIVE_CTOON, completedTotal) }}%</div>
          </div>
          <div class="kpi"><div class="kpi-label">Completion Rate</div><div class="kpi-value">{{ completionRate }}%</div></div>
        </section>

        <!-- Triggers breakdown -->
        <section>
          <h2 class="text-sm font-semibold mb-1">Triggers</h2>
          <div class="sm:hidden space-y-1.5">
            <div v-for="t in analytics.triggers" :key="t.trigger" class="border rounded bg-white p-2">
              <div class="text-[11px] font-semibold">{{ t.trigger }}</div>
              <div class="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <div><span class="text-gray-500">Starts:</span> {{ t.starts }}</div>
                <div><span class="text-gray-500">Completions:</span> {{ t.completions || 0 }}</div>
                <div><span class="text-gray-500">Completion Rate:</span> {{ rate(t.completions || 0, t.starts) }}%</div>
              </div>
            </div>
          </div>
          <div class="hidden sm:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Trigger</th>
                  <th class="px-1.5 py-1 border-b">Starts</th>
                  <th class="px-1.5 py-1 border-b">Completions</th>
                  <th class="px-1.5 py-1 border-b">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in analytics.triggers" :key="t.trigger" class="border-b">
                  <td class="px-1.5 py-1">{{ t.trigger }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ t.starts }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ t.completions || 0 }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ rate(t.completions || 0, t.starts) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Reasons breakdown -->
        <section>
          <h2 class="text-sm font-semibold mb-1">Attempt Outcomes</h2>
          <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <li class="bg-gray-50 border rounded p-2">
              <div class="flex items-baseline justify-between text-[11px]">
                <span class="font-medium">No stories</span>
                <strong class="text-xs">{{ analytics.reasonCounts.no_stories || 0 }}</strong>
              </div>
              <div class="text-[10px] text-gray-500 mt-0.5">There were no active Scavenger stories available to run.</div>
            </li>
            <li class="bg-gray-50 border rounded p-2">
              <div class="flex items-baseline justify-between text-[11px]">
                <span class="font-medium">Disabled</span>
                <strong class="text-xs">{{ analytics.reasonCounts.disabled || 0 }}</strong>
              </div>
              <div class="text-[10px] text-gray-500 mt-0.5">The feature is effectively off (chance set to 0%).</div>
            </li>
            <li class="bg-gray-50 border rounded p-2">
              <div class="flex items-baseline justify-between text-[11px]">
                <span class="font-medium">Resumed (not counted)</span>
                <strong class="text-xs">{{ analytics.reasonCounts.resumed || 0 }}</strong>
              </div>
              <div class="text-[10px] text-gray-500 mt-0.5">An existing pending hunt was resumed instead of starting a new one.</div>
            </li>
          </ul>
        </section>

        <!-- Recent Sessions -->
        <section>
          <h2 class="text-sm font-semibold mb-1">Recent Sessions</h2>
          <div class="sm:hidden space-y-1.5">
            <div v-for="s in sessions" :key="s.id" class="border rounded bg-white p-2">
              <div class="flex items-center justify-between text-[10px] text-gray-500">
                <span>{{ fmt(s.createdAt) }}</span>
                <span>{{ s.status }}</span>
              </div>
              <div class="mt-0.5 text-[11px] font-medium">{{ s.user?.username || s.user?.id }}</div>
              <div class="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <div><span class="text-gray-500">Trigger:</span> {{ s.triggerSource }}</div>
                <div><span class="text-gray-500">Result:</span> {{ s.resultType || '—' }}</div>
                <div><span class="text-gray-500">Points:</span> {{ s.pointsAwarded }}</div>
                <div class="col-span-2"><span class="text-gray-500">cToon:</span> <span v-if="s.ctoon">{{ s.ctoon.name }}</span><span v-else>—</span></div>
              </div>
            </div>
          </div>
          <div class="hidden sm:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Time</th>
                  <th class="px-1.5 py-1 border-b">User</th>
                  <th class="px-1.5 py-1 border-b">Trigger</th>
                  <th class="px-1.5 py-1 border-b">Status</th>
                  <th class="px-1.5 py-1 border-b">Result</th>
                  <th class="px-1.5 py-1 border-b">Points</th>
                  <th class="px-1.5 py-1 border-b">cToon</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in sessions" :key="s.id" class="border-b">
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ fmt(s.createdAt) }}</td>
                  <td class="px-1.5 py-1">{{ s.user?.username || s.user?.id }}</td>
                  <td class="px-1.5 py-1">{{ s.triggerSource }}</td>
                  <td class="px-1.5 py-1">{{ s.status }}</td>
                  <td class="px-1.5 py-1">{{ s.resultType || '—' }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ s.pointsAwarded }}</td>
                  <td class="px-1.5 py-1">
                    <span v-if="s.ctoon">{{ s.ctoon.name }}</span>
                    <span v-else>—</span>
                  </td>
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
import { ref, computed, onMounted } from 'vue'

const days = ref(30)
const analytics = ref({ startedCount: 0, outcomes: { NOTHING: 0, POINTS: 0, EXCLUSIVE_CTOON: 0 }, reasonCounts: {}, triggers: [] })
const sessions = ref([])
const loading = ref(false)

const completedTotal = computed(() => {
  const oc = analytics.value?.outcomes || {}
  return (oc.NOTHING || 0) + (oc.POINTS || 0) + (oc.EXCLUSIVE_CTOON || 0)
})
const completionRate = computed(() => {
  const oc = analytics.value?.outcomes || {}
  const completed = (oc.NOTHING || 0) + (oc.POINTS || 0) + (oc.EXCLUSIVE_CTOON || 0)
  return rate(completed, analytics.value.startedCount)
})

function rate(a, b) {
  if (!b) return 0
  return Math.round((a / b) * 100)
}
function fmt(dt) {
  return new Date(dt).toLocaleString()
}

async function loadAll() {
  loading.value = true
  try {
    const [an, sess] = await Promise.all([
      $fetch('/api/admin/scavenger/analytics', { query: { days: days.value } }),
      $fetch('/api/admin/scavenger/sessions', { query: { days: days.value, limit: 100 } })
    ])
    analytics.value = an
    sessions.value = sess
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.admin-scavenger-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
.btn-primary {
  background-color: #6366F1;
  color: white;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.kpi { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 6px 8px; }
.kpi-label { font-size: 10px; color: #6B7280; }
.kpi-value { font-size: 14px; font-weight: 700; color: #111827; }
.kpi-sub { font-size: 10px; color: #6B7280; }
</style>
