<template>
  <div class="ag-root">
    <div class="ag-tabbar">
      <button class="ag-tab" :class="{ 'ag-tab-active': tab === 'config' }" @click="tab = 'config'">Config</button>
      <button class="ag-tab" :class="{ 'ag-tab-active': tab === 'logs' }"   @click="tab = 'logs'">Logs</button>
    </div>

    <!-- ── Config ── -->
    <div v-if="tab === 'config'" class="ag-panel">
      <div class="ag-section">
        <div class="ag-section-title">gToon Clash Settings</div>
        <div class="ag-grid-2">
          <div class="ag-field">
            <label class="ag-label">Points Per Win</label>
            <input type="number" class="ag-input" v-model.number="pointsPerWin" />
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
        <div class="ag-field-inline" style="flex:1;min-width:160px">
          <label class="ag-label">Search</label>
          <input type="text" class="ag-input" placeholder="Username or outcome…" v-model="searchTerm" />
        </div>
        <div class="ag-field-inline">
          <label class="ag-label">From</label>
          <input type="date" class="ag-input ag-input-sm" v-model="fromDate" />
        </div>
        <div class="ag-field-inline">
          <label class="ag-label">To</label>
          <input type="date" class="ag-input ag-input-sm" v-model="toDate" />
        </div>
      </div>

      <p class="ag-dim" style="margin-bottom:8px">Total: {{ total }} games</p>

      <div v-if="loading" class="ag-dim">Loading…</div>
      <div v-else-if="!filteredGames.length" class="ag-dim">No results.</div>
      <div v-else class="ag-table-scroll">
        <table class="ag-table">
          <thead>
            <tr>
              <th>Start</th><th>End</th><th>Player 1</th><th>Player 2</th>
              <th>Outcome</th><th>Winner</th><th>Who Left</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in filteredGames" :key="g.id">
              <td class="ag-nowrap">{{ fmtDate(g.startedAt) }}</td>
              <td class="ag-nowrap">{{ g.endedAt ? fmtDate(g.endedAt) : '—' }}</td>
              <td>{{ uname(g.player1) }}</td>
              <td>{{ p2Label(g) }}</td>
              <td>{{ outcomeLabel(g) }}</td>
              <td>{{ winnerLabel(g) }}</td>
              <td>{{ g.whoLeft?.username || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ag-pagination">
        <span class="ag-dim">Page {{ page }} of {{ totalPages }} · {{ showingRange }}</span>
        <button class="ag-page-btn" :disabled="page <= 1" @click="prevPage">Prev</button>
        <button class="ag-page-btn" :disabled="page >= totalPages" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const tab = ref('config')

// ── Config ──────────────────────────────────────────────────
const pointsPerWin = ref(1)
const saving = ref(false)
const toast  = ref(null)

async function loadConfig() {
  try {
    const cc = await $fetch('/api/admin/game-config?gameName=Clash')
    pointsPerWin.value = cc.pointsPerWin
  } catch (e) { console.error('gToons: load config failed', e) }
}

async function save() {
  saving.value = true
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: { gameName: 'Clash', pointsPerWin: pointsPerWin.value }
    })
    showToast('Saved.')
  } catch { showToast('Save failed', 'error') }
  finally { saving.value = false }
}

function showToast(msg, type = 'ok') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 2500)
}

// ── Logs ────────────────────────────────────────────────────
const games      = ref([])
const total      = ref(0)
const page       = ref(1)
const pageSize   = 100
const loading    = ref(false)
const searchTerm = ref('')
const fromDate   = ref('')
const toDate     = ref('')

const totalPages   = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0–0 of 0'
  const s = (page.value - 1) * pageSize + 1
  const e = Math.min(page.value * pageSize, total.value)
  return `${s}–${e} of ${total.value}`
})

const filteredGames = computed(() => {
  const q = searchTerm.value.trim().toLowerCase()
  if (!q) return games.value
  return games.value.filter(g =>
    uname(g.player1).toLowerCase().includes(q) ||
    p2Label(g).toLowerCase().includes(q) ||
    winnerLabel(g).toLowerCase().includes(q) ||
    outcomeLabel(g).toLowerCase().includes(q) ||
    (g.whoLeft?.username || '').toLowerCase().includes(q)
  )
})

function uname(u) { return u?.username || '—' }
function p2Label(g) { return g.player2?.username || 'AI' }
function outcomeLabel(g) {
  if (!g.outcome) return '—'
  if (g.outcome === 'tie') return 'Tie'
  if (g.outcome === 'incomplete') return '—'
  if (g.outcome === 'player') return uname(g.player1)
  if (g.outcome === 'ai') return p2Label(g)
  return g.outcome
}
function winnerLabel(g) {
  if (!g.outcome) return '—'
  if (g.outcome === 'tie') return 'Tie'
  if (g.outcome === 'incomplete') return '—'
  if (g.winner?.username) return g.winner.username
  if (g.outcome === 'ai') return p2Label(g)
  if (g.outcome === 'player') return uname(g.player1)
  return '—'
}
function fmtDate(input) {
  if (!input) return '—'
  return new Date(input).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function normDates() {
  if (!fromDate.value || !toDate.value) return
  if (new Date(fromDate.value) > new Date(toDate.value)) { const t = fromDate.value; fromDate.value = toDate.value; toDate.value = t }
}

async function fetchGames() {
  if (loading.value) return
  normDates()
  loading.value = true
  try {
    const res = await $fetch('/api/admin/gtoons-logs', {
      query: { page: page.value, limit: pageSize, from: fromDate.value || undefined, to: toDate.value || undefined }
    })
    games.value = res.items || []; total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch { games.value = []; total.value = 0 }
  finally { loading.value = false }
}

async function nextPage() { if (page.value < totalPages.value) { page.value++; await fetchGames() } }
async function prevPage() { if (page.value > 1) { page.value--; await fetchGames() } }

let filterTimer = null
watch([fromDate, toDate], () => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => { page.value = 1; fetchGames() }, 300)
})

onMounted(() => { loadConfig(); fetchGames() })
</script>

<style scoped>
@import './admin-game-shared.css';
</style>
