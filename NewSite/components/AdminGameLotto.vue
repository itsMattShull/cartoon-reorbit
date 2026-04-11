<template>
  <div class="ag-root">
    <!-- Inner tabs -->
    <div class="ag-tabbar">
      <button class="ag-tab" :class="{ 'ag-tab-active': tab === 'config' }" @click="tab = 'config'">Config</button>
      <button class="ag-tab" :class="{ 'ag-tab-active': tab === 'logs' }"   @click="tab = 'logs'">Logs</button>
    </div>

    <!-- ── Config ── -->
    <div v-if="tab === 'config'" class="ag-panel">
      <div class="ag-grid-2">
        <div class="ag-field">
          <label class="ag-label">Base Odds</label>
          <p class="ag-hint">Default: 1.00</p>
          <input type="number" step="0.01" class="ag-input" v-model.number="baseOdds" />
        </div>
        <div class="ag-field">
          <label class="ag-label">Increment Rate</label>
          <p class="ag-hint">Default: 0.02</p>
          <input type="number" step="0.001" class="ag-input" v-model.number="incrementRate" />
        </div>
        <div class="ag-field">
          <label class="ag-label">Count Per Day</label>
          <p class="ag-hint">Default: 5</p>
          <input type="number" class="ag-input" v-model.number="countPerDay" />
        </div>
        <div class="ag-field">
          <label class="ag-label">Cost (pts)</label>
          <p class="ag-hint">Default: 50</p>
          <input type="number" class="ag-input" v-model.number="cost" />
        </div>
        <div class="ag-field">
          <label class="ag-label">Points on Win</label>
          <p class="ag-hint">Default: 5000</p>
          <input type="number" class="ag-input" v-model.number="pointsWinnings" />
        </div>
      </div>

      <!-- cToon Prize Pool -->
      <div class="ag-section">
        <div class="ag-section-title">cToon Prize Pool</div>
        <p class="ag-hint" style="margin-bottom:8px">When a user wins they receive points AND a random cToon from this pool.</p>

        <div class="ag-search-wrap">
          <input
            type="text"
            class="ag-input"
            placeholder="Search by name, rarity, or set…"
            v-model="searchTerm"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <ul v-if="searchTerm && searchFocused" class="ag-dropdown">
            <li v-if="searching" class="ag-dropdown-item ag-dim">Searching…</li>
            <li v-else-if="!searchResults.length" class="ag-dropdown-item ag-dim">No results.</li>
            <li
              v-for="c in searchResults" :key="c.id"
              class="ag-dropdown-item ag-dropdown-selectable"
              @mousedown.prevent="addToPool(c)"
            >
              <img :src="c.assetPath" class="ag-thumb" />
              <div>
                <div class="ag-ctoon-name">{{ c.name }}</div>
                <div class="ag-hint">{{ c.rarity }} · {{ c.set }}</div>
              </div>
            </li>
          </ul>
        </div>

        <div class="ag-pool-list">
          <div v-for="c in pool" :key="c.id" class="ag-pool-item">
            <div class="ag-pool-item-left">
              <img :src="c.assetPath" class="ag-thumb" />
              <div>
                <div class="ag-ctoon-name">{{ c.name }}</div>
                <div class="ag-hint">
                  <span v-if="c.inCmart">In cMart</span><span v-else>Not in cMart</span>
                  <span v-if="c.quantity !== null"> · {{ c.quantity - c.totalMinted }} remaining</span>
                </div>
              </div>
            </div>
            <button class="ag-remove-btn" @click="removeFromPool(c.id)">Remove</button>
          </div>
        </div>
      </div>

      <div class="ag-actions">
        <GreenButton :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save' }}</GreenButton>
        <span v-if="toast" class="ag-toast" :class="toast.type === 'error' ? 'ag-toast-err' : 'ag-toast-ok'">{{ toast.msg }}</span>
      </div>
    </div>

    <!-- ── Logs ── -->
    <div v-if="tab === 'logs'" class="ag-panel">
      <div class="ag-date-row">
        <div class="ag-field-inline">
          <label class="ag-label">From</label>
          <input type="date" class="ag-input ag-input-sm" v-model="from" />
        </div>
        <div class="ag-field-inline">
          <label class="ag-label">To</label>
          <input type="date" class="ag-input ag-input-sm" v-model="to" />
        </div>
        <GreenButton @click="applyRange">Apply</GreenButton>
        <button class="ag-link" @click="setLastNDays(30)">Last 30 days</button>
      </div>

      <div class="ag-grid-2" style="margin-bottom:16px">
        <div class="ag-section">
          <div class="ag-section-title">Outcome Breakdown <span class="ag-dim">({{ totalOutcomes }} plays)</span></div>
          <div v-if="summaryLoading" class="ag-dim">Loading…</div>
          <table v-else class="ag-table">
            <thead><tr><th>Outcome</th><th>Count</th><th>%</th></tr></thead>
            <tbody>
              <tr v-for="r in summaryRows" :key="r.key">
                <td>{{ r.label }}</td>
                <td>{{ r.count }}</td>
                <td>{{ pct(r.count, totalOutcomes) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ag-section">
        <div class="ag-section-title-row">
          <span class="ag-section-title">Lotto Logs</span>
          <span class="ag-dim" style="font-size:0.72rem">{{ showingRange }}</span>
        </div>
        <div v-if="logsLoading" class="ag-dim">Loading…</div>
        <div v-else-if="!logs.length" class="ag-dim">No logs in this range.</div>
        <div v-else class="ag-table-scroll">
          <table class="ag-table">
            <thead>
              <tr><th>Time (CDT)</th><th>User</th><th>Outcome</th><th>Odds Before</th><th>Odds After</th></tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td class="ag-nowrap">{{ fmtDate(log.createdAt) }}</td>
                <td>{{ displayUser(log.user) }}</td>
                <td>{{ labelFor(log.outcome) }}</td>
                <td>{{ fmtOdds(log.oddsBefore) }}</td>
                <td>{{ fmtOdds(log.oddsAfter) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ag-pagination">
          <span class="ag-dim">Page {{ page }} of {{ totalPages }}</span>
          <button class="ag-page-btn" :disabled="page <= 1" @click="prevPage">Prev</button>
          <button class="ag-page-btn" :disabled="page >= totalPages" @click="nextPage">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const tab = ref('config')

// ── Config state ──────────────────────────────────────────────
const baseOdds      = ref(1.0)
const incrementRate = ref(0.02)
const countPerDay   = ref(5)
const cost          = ref(50)
const pointsWinnings = ref(5000)
const saving        = ref(false)
const toast         = ref(null)
const pool          = ref([])
const searchTerm    = ref('')
const searchResults = ref([])
const searching     = ref(false)
const searchFocused = ref(false)

async function loadConfig() {
  try {
    const res = await $fetch('/api/admin/lotto-settings')
    baseOdds.value       = Number(res?.baseOdds ?? 1.0)
    incrementRate.value  = Number(res?.incrementRate ?? 0.02)
    countPerDay.value    = Number(res?.countPerDay ?? 5)
    cost.value           = Number(res?.cost ?? 50)
    pointsWinnings.value = Number(res?.lottoPointsWinnings ?? 5000)
    pool.value           = res?.ctoonPool || []
  } catch (e) { console.error('Lotto: load config failed', e) }
}

async function save() {
  saving.value = true; toast.value = null
  try {
    await $fetch('/api/admin/lotto-settings', {
      method: 'POST',
      body: {
        baseOdds: Number(baseOdds.value),
        incrementRate: Number(incrementRate.value),
        countPerDay: Number(countPerDay.value),
        cost: Number(cost.value),
        lottoPointsWinnings: Number(pointsWinnings.value),
        ctoonPoolIds: pool.value.map(c => c.id)
      }
    })
    toast.value = { type: 'ok', msg: 'Saved.' }
  } catch (e) {
    toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false
    setTimeout(() => { toast.value = null }, 2500)
  }
}

let searchTimer = null
watch(searchTerm, (val) => {
  clearTimeout(searchTimer)
  if (val.trim().length < 2) { searchResults.value = []; return }
  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const results = await $fetch(`/api/admin/search-ctoons?q=${encodeURIComponent(val.trim())}`)
      const poolIds = new Set(pool.value.map(c => c.id))
      searchResults.value = results.filter(r => !poolIds.has(r.id))
    } catch { searchResults.value = [] }
    finally { searching.value = false }
  }, 300)
})

function addToPool(c) {
  if (!pool.value.some(p => p.id === c.id)) pool.value.push(c)
  searchTerm.value = ''; searchResults.value = []
}
function removeFromPool(id) { pool.value = pool.value.filter(c => c.id !== id) }

// ── Logs state ────────────────────────────────────────────────
const from          = ref('')
const to            = ref('')
const page          = ref(1)
const pageSize      = 50
const summaryLoading = ref(false)
const logsLoading   = ref(false)
const summary       = ref([])
const totalLogs     = ref(0)
const logs          = ref([])

const OUTCOMES = [
  { key: 'NOTHING', label: 'Nothing' },
  { key: 'POINTS',  label: 'Points'  },
  { key: 'CTOON',   label: 'cToon'   }
]
const totalOutcomes = computed(() => summary.value.reduce((s, r) => s + r.count, 0))
const summaryRows   = computed(() => {
  const m = new Map(summary.value.map(r => [r.outcome, r.count]))
  return OUTCOMES.map(o => ({ key: o.key, label: o.label, count: m.get(o.key) || 0 }))
})
const totalPages  = computed(() => Math.max(1, Math.ceil(totalLogs.value / pageSize)))
const showingRange = computed(() => {
  if (!totalLogs.value) return '0–0 of 0'
  const s = (page.value - 1) * pageSize + 1
  const e = Math.min(page.value * pageSize, totalLogs.value)
  return `${s}–${e} of ${totalLogs.value}`
})

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function setLastNDays(n) {
  const end = new Date(), start = new Date()
  start.setDate(end.getDate() - (n - 1))
  from.value = toYMD(start); to.value = toYMD(end)
  page.value = 1; loadAll()
}
function pct(count, total) { return total ? `${((count/total)*100).toFixed(1)}%` : '—' }
function fmtDate(dt) {
  return new Date(dt).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'America/Chicago', timeZoneName:'short' })
}
function fmtOdds(val) {
  if (val == null || isNaN(Number(val))) return '—'
  return `${Number(val).toFixed(2)}%`
}
function labelFor(outcome) { return OUTCOMES.find(o => o.key === outcome)?.label ?? outcome }
function displayUser(u) { return u?.username || u?.discordTag || u?.id || '—' }

async function fetchSummary() {
  summaryLoading.value = true
  try {
    const res = await $fetch('/api/admin/lotto-logs-summary', { query: { start: from.value, end: to.value } })
    summary.value = res.data || []
  } catch { summary.value = [] }
  finally { summaryLoading.value = false }
}
async function fetchLogs() {
  logsLoading.value = true
  try {
    const res = await $fetch('/api/admin/lotto-logs', { query: { start: from.value, end: to.value, page: page.value, limit: pageSize } })
    logs.value = res.items || []; totalLogs.value = res.total || 0
  } catch { logs.value = []; totalLogs.value = 0 }
  finally { logsLoading.value = false }
}
async function loadAll() { await Promise.all([fetchSummary(), fetchLogs()]) }
function applyRange() {
  if (!from.value || !to.value) return
  if (new Date(from.value) > new Date(to.value)) { const t = from.value; from.value = to.value; to.value = t }
  page.value = 1; loadAll()
}
async function nextPage() { if (page.value < totalPages.value) { page.value++; await fetchLogs() } }
async function prevPage() { if (page.value > 1) { page.value--; await fetchLogs() } }

onMounted(() => { loadConfig(); setLastNDays(30) })
</script>

<style scoped>
@import './admin-game-shared.css';
</style>
