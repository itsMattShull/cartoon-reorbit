<template>
  <div class="ag-root">
    <div class="ag-tabbar">
      <button class="ag-tab" :class="{ 'ag-tab-active': tab === 'config' }" @click="tab = 'config'">Config</button>
      <button class="ag-tab" :class="{ 'ag-tab-active': tab === 'logs' }"   @click="tab = 'logs'">Logs</button>
    </div>

    <!-- ── Config ── -->
    <div v-if="tab === 'config'" class="ag-panel">
      <div class="ag-section">
        <div class="ag-section-title">Settings</div>
        <div class="ag-grid-3">
          <div class="ag-field">
            <label class="ag-label">Spin Cost (pts)</label>
            <input type="number" class="ag-input" v-model.number="spinCost" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Points Won</label>
            <input type="number" class="ag-input" v-model.number="pointsWon" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Max Daily Spins</label>
            <input type="number" class="ag-input" v-model.number="maxDailySpins" />
          </div>
        </div>
      </div>

      <div class="ag-section">
        <div class="ag-section-title">Wheel Image (SVG/PNG/JPEG)</div>
        <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png" @change="onImageChange" class="ag-input" style="padding:3px" />
        <div class="ag-actions" style="margin-top:6px">
          <GreenButton :disabled="!imageFile || uploadingImage" @click="uploadImage">
            {{ uploadingImage ? 'Uploading…' : 'Upload Image' }}
          </GreenButton>
          <RedButton v-if="imagePath" @click="imagePath = ''">Remove</RedButton>
        </div>
        <div v-if="imagePath">
          <p class="ag-path">{{ imagePath }}</p>
          <img :src="imagePath" class="ag-preview-img" />
        </div>
      </div>

      <div class="ag-section">
        <div class="ag-section-title">Spin Sound (MP3/WAV/OGG)</div>
        <div class="ag-field" style="margin-bottom:8px">
          <label class="ag-label">Sound Behavior</label>
          <select class="ag-input" v-model="soundMode">
            <option value="repeat">Repeat Sound</option>
            <option value="once">Play Once</option>
          </select>
        </div>
        <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,.mp3,.wav,.ogg" @change="onSoundChange" class="ag-input" style="padding:3px" />
        <div class="ag-actions" style="margin-top:6px">
          <GreenButton :disabled="!soundFile || uploadingSound" @click="uploadSound">
            {{ uploadingSound ? 'Uploading…' : 'Upload Sound' }}
          </GreenButton>
          <RedButton v-if="soundPath" @click="soundPath = ''">Remove</RedButton>
        </div>
        <div v-if="soundPath">
          <p class="ag-path">{{ soundPath }}</p>
          <audio :src="soundPath" controls class="ag-audio"></audio>
        </div>
      </div>

      <div class="ag-section">
        <div class="ag-section-title">Exclusive cToon Pool</div>
        <div class="ag-search-wrap">
          <input type="text" class="ag-input" placeholder="Type to search…" v-model="searchTerm" @focus="searchFocused = true" @blur="searchFocused = false" />
          <ul v-if="searchTerm && searchFocused" class="ag-dropdown">
            <li v-if="!filteredCtoons.length" class="ag-dropdown-item ag-dim">No results.</li>
            <li v-for="c in filteredCtoons" :key="c.id" class="ag-dropdown-item ag-dropdown-selectable" @mousedown.prevent="addToPool(c)">
              <img :src="c.assetPath" class="ag-thumb" />
              <div>
                <div class="ag-ctoon-name">{{ c.name }}</div>
                <div class="ag-hint">{{ c.rarity }}</div>
              </div>
            </li>
          </ul>
        </div>
        <div class="ag-tag-list">
          <span v-for="c in poolCtoons" :key="c.id" class="ag-tag">
            {{ c.name }}
            <button class="ag-tag-remove" @click="removeFromPool(c)">✕</button>
          </span>
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

      <div class="ag-section">
        <div class="ag-section-title">Results Breakdown <span class="ag-dim">({{ total }} spins)</span></div>
        <div v-if="loading" class="ag-dim">Loading…</div>
        <div v-else-if="!rows.length" class="ag-dim">No spins in this range.</div>
        <table v-else class="ag-table">
          <thead><tr><th>Result</th><th>Count</th><th>%</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.result">
              <td>{{ labelFor(r.result) }}</td>
              <td>{{ r.count }}</td>
              <td>{{ pct(r.count) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
const tab = ref('config')

// ── Config state ──────────────────────────────────────────────
const spinCost     = ref(100)
const pointsWon    = ref(250)
const maxDailySpins = ref(2)
const poolCtoons   = ref([])
const allCtoons    = ref([])
const searchTerm   = ref('')
const searchFocused = ref(false)
const saving       = ref(false)
const toast        = ref(null)

const imageFile     = ref(null)
const uploadingImage = ref(false)
const imagePath     = ref('')
const soundFile     = ref(null)
const uploadingSound = ref(false)
const soundPath     = ref('')
const soundMode     = ref('repeat')

const filteredCtoons = computed(() => {
  const t = searchTerm.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c => (c.quantity === null || c.quantity === '') && c.name.toLowerCase().includes(t) && !poolCtoons.value.some(p => p.id === c.id))
    .slice(0, 8)
})
function addToPool(c) { poolCtoons.value.push(c); searchTerm.value = '' }
function removeFromPool(c) { poolCtoons.value = poolCtoons.value.filter(x => x.id !== c.id) }

function onImageChange(e) { imageFile.value = e.target.files?.[0] || null }
async function uploadImage() {
  if (!imageFile.value) return
  uploadingImage.value = true
  try {
    const fd = new FormData()
    fd.append('image', imageFile.value); fd.append('label', 'winwheel')
    const res = await $fetch('/api/admin/winwheel-image', { method: 'POST', body: fd })
    imagePath.value = res.assetPath
    showToast('Image uploaded.')
  } catch { showToast('Upload failed', 'error') }
  finally { uploadingImage.value = false; imageFile.value = null }
}

function onSoundChange(e) { soundFile.value = e.target.files?.[0] || null }
async function uploadSound() {
  if (!soundFile.value) return
  uploadingSound.value = true
  try {
    const fd = new FormData()
    fd.append('sound', soundFile.value); fd.append('label', 'winwheel-sound')
    const res = await $fetch('/api/admin/winwheel-sound', { method: 'POST', body: fd })
    soundPath.value = res.assetPath
    showToast('Sound uploaded.')
  } catch { showToast('Upload failed', 'error') }
  finally { uploadingSound.value = false; soundFile.value = null }
}

async function loadConfig() {
  try {
    allCtoons.value = await $fetch('/api/admin/game-ctoons?select=id,name,rarity,assetPath,quantity')
    const ww = await $fetch('/api/admin/game-config?gameName=Winwheel')
    spinCost.value      = ww.spinCost
    pointsWon.value     = ww.pointsWon
    maxDailySpins.value = ww.maxDailySpins
    imagePath.value     = ww.winWheelImagePath || ''
    soundPath.value     = ww.winWheelSoundPath || ''
    soundMode.value     = ww.winWheelSoundMode || 'repeat'
    poolCtoons.value    = (ww.exclusiveCtoons || []).map(o => o.ctoon)
  } catch (e) { console.error('Winwheel: load config failed', e) }
}

async function save() {
  saving.value = true
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName: 'Winwheel',
        spinCost: spinCost.value,
        pointsWon: pointsWon.value,
        maxDailySpins: maxDailySpins.value,
        exclusiveCtoons: poolCtoons.value.map(c => c.id),
        winWheelImagePath: imagePath.value || null,
        winWheelSoundPath: soundPath.value || null,
        winWheelSoundMode: soundMode.value || 'repeat'
      }
    })
    showToast('Saved.')
  } catch { showToast('Save failed', 'error') }
  finally { saving.value = false }
}

function showToast(msg, type = 'ok') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 2500)
}

// ── Logs state ────────────────────────────────────────────────
const from    = ref('')
const to      = ref('')
const rows    = ref([])
const loading = ref(false)
const total   = computed(() => rows.value.reduce((s, r) => s + r.count, 0))

const LABELS = { nothing: 'Nothing', points: 'Points', ctoonLeast: 'cToon (Least Rare)', ctoonExclusive: 'cToon (Exclusive)' }
const labelFor = key => LABELS[key] || key
const pct = count => total.value ? `${((count / total.value) * 100).toFixed(1)}%` : '—'

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function setLastNDays(n) {
  const end = new Date(), start = new Date()
  start.setDate(end.getDate() - (n - 1))
  from.value = toYMD(start); to.value = toYMD(end)
  fetchLogs()
}
async function fetchLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams({ start: from.value, end: to.value })
    const data = await $fetch(`/api/admin/win-wheel-logs?${params}`)
    rows.value = (data.data || []).map(d => ({ result: d.result, count: d.count })).sort((a, b) => b.count - a.count)
  } catch { rows.value = [] }
  finally { loading.value = false }
}
function applyRange() {
  if (!from.value || !to.value) return
  if (new Date(from.value) > new Date(to.value)) { const t = from.value; from.value = to.value; to.value = t }
  fetchLogs()
}

onMounted(() => { loadConfig(); setLastNDays(30) })
</script>

<style scoped>
@import './admin-game-shared.css';
</style>
