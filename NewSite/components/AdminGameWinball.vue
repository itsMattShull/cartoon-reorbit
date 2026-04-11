<template>
  <div class="ag-root">
    <div class="ag-panel">

      <!-- Scoring -->
      <div class="ag-section">
        <div class="ag-section-title">Scoring</div>
        <div class="ag-grid-3">
          <div class="ag-field">
            <label class="ag-label">Left Cup Points</label>
            <input type="number" class="ag-input" v-model.number="leftCup" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Right Cup Points</label>
            <input type="number" class="ag-input" v-model.number="rightCup" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Gold Cup Points</label>
            <input type="number" class="ag-input" v-model.number="goldCup" />
          </div>
        </div>
      </div>

      <!-- Playfield Layers -->
      <div class="ag-section">
        <div class="ag-section-title">Playfield Layers</div>
        <p class="ag-hint" style="margin-bottom:8px">Layer order: base color → board image → color transform → overlay.</p>
        <div class="ag-grid-2">
          <div class="ag-field">
            <label class="ag-label">Base Board Color</label>
            <div class="ag-color-row">
              <input type="color" class="ag-color-swatch" v-model="boardLayer.winballColorBackboard" />
              <input type="text" class="ag-input" v-model="boardLayer.winballColorBackboard" maxlength="7" />
            </div>
          </div>
          <div class="ag-field">
            <label class="ag-label">Color Transform</label>
            <div class="ag-color-row">
              <input type="color" class="ag-color-swatch" v-model="boardLayer.winballColorTransform" />
              <input type="text" class="ag-input" v-model="boardLayer.winballColorTransform" maxlength="7" />
            </div>
          </div>
          <div class="ag-field">
            <label class="ag-label">Transform Intensity (0–1)</label>
            <input type="number" class="ag-input" min="0" max="1" step="0.01" v-model.number="boardLayer.winballColorTransformIntensity" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Overlay Color</label>
            <div class="ag-color-row">
              <input type="color" class="ag-color-swatch" v-model="boardLayer.winballOverlayColor" />
              <input type="text" class="ag-input" v-model="boardLayer.winballOverlayColor" maxlength="7" />
            </div>
          </div>
          <div class="ag-field">
            <label class="ag-label">Overlay Alpha (0–1)</label>
            <input type="number" class="ag-input" min="0" max="1" step="0.01" v-model.number="boardLayer.winballOverlayAlpha" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Image Width (%)</label>
            <input type="number" class="ag-input" min="1" max="300" step="1" v-model.number="boardLayer.winballImageWidthPercent" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Image H-Offset (%)</label>
            <input type="number" class="ag-input" step="0.5" v-model.number="boardLayer.winballImageOffsetXPercent" />
          </div>
          <div class="ag-field">
            <label class="ag-label">Image V-Offset (%)</label>
            <input type="number" class="ag-input" step="0.5" v-model.number="boardLayer.winballImageOffsetYPercent" />
          </div>
        </div>
      </div>

      <!-- Physics -->
      <div class="ag-section">
        <div class="ag-section-title">Physics</div>
        <div class="ag-grid-3">
          <div v-for="p in physicsFields" :key="p.key" class="ag-field">
            <label class="ag-label">{{ p.label }}</label>
            <p class="ag-hint">{{ p.hint }}</p>
            <input type="number" class="ag-input" :step="p.step" v-model.number="physics[p.key]" />
          </div>
        </div>
      </div>

      <!-- Colors -->
      <div class="ag-section">
        <div class="ag-section-title">Component Colors</div>
        <div class="ag-grid-3">
          <div v-for="c in colorFields" :key="c.key" class="ag-field">
            <label class="ag-label">{{ c.label }}</label>
            <div class="ag-color-row">
              <input type="color" class="ag-color-swatch" v-model="colors[c.key]" />
              <input type="text" class="ag-input" v-model="colors[c.key]" maxlength="7" />
            </div>
          </div>
        </div>
      </div>

      <!-- Backboard Image -->
      <div class="ag-section">
        <div class="ag-section-title">Backboard Image (SVG/PNG/JPEG)</div>
        <p class="ag-hint" style="margin-bottom:6px">Best size: 360×500px</p>
        <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png" @change="onBackboardChange" class="ag-input" style="padding:3px" />
        <div class="ag-actions" style="margin-top:6px">
          <GreenButton :disabled="!backboardFile || uploadingBackboard" @click="uploadBackboard">
            {{ uploadingBackboard ? 'Uploading…' : 'Upload' }}
          </GreenButton>
          <RedButton v-if="backboardPath" @click="backboardPath = ''">Remove</RedButton>
        </div>
        <div v-if="backboardPath">
          <p class="ag-path">{{ backboardPath }}</p>
          <img :src="backboardPath" class="ag-preview-img" />
        </div>
      </div>

      <!-- Bumper Images -->
      <div class="ag-section">
        <div class="ag-section-title">Bumper Images</div>
        <p class="ag-hint" style="margin-bottom:8px">Best size: 256×256px</p>
        <div class="ag-grid-3">
          <div v-for="(_, i) in [0,1,2]" :key="i" class="ag-card">
            <div class="ag-sub-title">Bumper {{ i + 1 }}</div>
            <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png" @change="onBumperChange(i, $event)" class="ag-input" style="padding:3px;margin-bottom:6px" />
            <div class="ag-actions" style="margin-top:4px">
              <GreenButton :disabled="!bumperFiles[i] || uploadingBumper[i]" @click="uploadBumper(i)">
                {{ uploadingBumper[i] ? '…' : 'Upload' }}
              </GreenButton>
              <RedButton v-if="bumperPaths[i]" @click="bumperPaths[i] = ''">Remove</RedButton>
            </div>
            <div v-if="bumperPaths[i]">
              <p class="ag-path">{{ bumperPaths[i] }}</p>
              <img :src="bumperPaths[i]" class="ag-preview-img" style="max-height:48px" />
            </div>
          </div>
        </div>
      </div>

      <!-- Bumper Geometry -->
      <div class="ag-section">
        <div class="ag-section-title">Bumper Geometry</div>
        <p class="ag-hint" style="margin-bottom:8px">Set radius to 0 to remove.</p>
        <div v-for="(_, i) in [0,1,2]" :key="i" class="ag-card">
          <div class="ag-sub-title">Bumper {{ i + 1 }}</div>
          <div class="ag-grid-4">
            <div class="ag-field"><label class="ag-label">Radius</label><input type="number" class="ag-input" step="0.5" min="0" v-model.number="bumperGeo[i].radius" /></div>
            <div class="ag-field"><label class="ag-label">Height</label><input type="number" class="ag-input" step="0.5" min="0" v-model.number="bumperGeo[i].height" /></div>
            <div class="ag-field"><label class="ag-label">X</label><input type="number" class="ag-input" step="0.5" v-model.number="bumperGeo[i].x" /></div>
            <div class="ag-field"><label class="ag-label">Z</label><input type="number" class="ag-input" step="0.5" v-model.number="bumperGeo[i].z" /></div>
          </div>
        </div>
      </div>

      <!-- Triangle Geometry -->
      <div class="ag-section">
        <div class="ag-section-title">Triangle Geometry</div>
        <p class="ag-hint" style="margin-bottom:8px">Set radius to 0 to remove.</p>
        <div v-for="(_, i) in [0,1]" :key="i" class="ag-card">
          <div class="ag-sub-title">Triangle {{ i + 1 }}</div>
          <div class="ag-grid-4">
            <div class="ag-field"><label class="ag-label">Radius</label><input type="number" class="ag-input" step="0.5" min="0" v-model.number="triGeo[i].radius" /></div>
            <div class="ag-field"><label class="ag-label">Depth</label><input type="number" class="ag-input" step="0.5" min="0" v-model.number="triGeo[i].depth" /></div>
            <div class="ag-field"><label class="ag-label">X</label><input type="number" class="ag-input" step="0.5" v-model.number="triGeo[i].x" /></div>
            <div class="ag-field"><label class="ag-label">Z</label><input type="number" class="ag-input" step="0.5" v-model.number="triGeo[i].z" /></div>
          </div>
        </div>
      </div>

      <!-- Peg Geometry -->
      <div class="ag-section">
        <div class="ag-section-title">Peg Geometry</div>
        <p class="ag-hint" style="margin-bottom:8px">12 pegs. Set radius to 0 to remove.</p>
        <div v-for="(_, i) in Array(12).fill(0)" :key="i" class="ag-card">
          <div class="ag-sub-title">Peg {{ i + 1 }}</div>
          <div class="ag-grid-4">
            <div class="ag-field"><label class="ag-label">Radius</label><input type="number" class="ag-input" step="0.5" min="0" v-model.number="pegGeo[i].radius" /></div>
            <div class="ag-field"><label class="ag-label">Height</label><input type="number" class="ag-input" step="0.5" min="0" v-model.number="pegGeo[i].height" /></div>
            <div class="ag-field"><label class="ag-label">X</label><input type="number" class="ag-input" step="0.5" v-model.number="pegGeo[i].x" /></div>
            <div class="ag-field"><label class="ag-label">Z</label><input type="number" class="ag-input" step="0.5" v-model.number="pegGeo[i].z" /></div>
          </div>
        </div>
      </div>

      <!-- Grand Prize -->
      <div class="ag-section">
        <div class="ag-section-title">Grand Prize cToon</div>
        <div class="ag-search-wrap">
          <input type="text" class="ag-input" :placeholder="grandPrize ? grandPrize.name : 'Type a cToon name…'" v-model="prizeSearch" @focus="prizeDropdown = true" @input="prizeDropdown = !!prizeSearch.trim()" />
          <ul v-if="prizeDropdown && prizeFiltered.length" class="ag-dropdown">
            <li v-for="c in prizeFiltered" :key="c.id" class="ag-dropdown-item ag-dropdown-selectable" @mousedown.prevent="selectPrize(c)">
              <img :src="c.assetPath" class="ag-thumb" />
              <div>
                <div class="ag-ctoon-name">{{ c.name }}</div>
                <div class="ag-hint">{{ c.rarity }}</div>
              </div>
            </li>
          </ul>
        </div>
        <div v-if="grandPrize" class="ag-pool-item" style="margin-top:8px">
          <div class="ag-pool-item-left">
            <img :src="grandPrize.assetPath" class="ag-thumb" />
            <div>
              <div class="ag-ctoon-name">{{ grandPrize.name }}</div>
              <div class="ag-hint">{{ grandPrize.rarity }}</div>
            </div>
          </div>
          <button class="ag-remove-btn" @click="grandPrize = null; prizeSearch = ''">Clear</button>
        </div>
      </div>

      <!-- Grand Prize Schedule -->
      <div class="ag-section">
        <div class="ag-section-title">Grand Prize Schedule</div>
        <p class="ag-hint" style="margin-bottom:8px">All times are Central Time (US). Default time is 8:00 PM (8:00 AM on Thursdays).</p>
        <div style="margin-bottom:8px">
          <GreenButton @click="openAddModal">Add Schedule</GreenButton>
        </div>
        <table class="ag-table">
          <thead><tr><th>Start (Central)</th><th>cToon</th><th></th></tr></thead>
          <tbody>
            <tr v-for="row in schedules" :key="row.id">
              <td class="ag-nowrap">{{ row.startsAtLocal }}</td>
              <td>
                <div class="ag-pool-item-left">
                  <img :src="row.ctoon.assetPath" class="ag-thumb" />
                  <div>
                    <div class="ag-ctoon-name">{{ row.ctoon.name }}</div>
                    <div class="ag-hint">{{ row.ctoon.rarity }}</div>
                  </div>
                </div>
              </td>
              <td>
                <div style="display:flex;gap:6px;justify-content:flex-end">
                  <button class="ag-page-btn" @click="openEditModal(row)">Edit</button>
                  <button class="ag-remove-btn" @click="removeSchedule(row)">Remove</button>
                </div>
              </td>
            </tr>
            <tr v-if="!schedules.length"><td colspan="3" class="ag-dim" style="padding:8px">No scheduled grand prizes.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="ag-actions">
        <GreenButton :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save Winball Settings' }}</GreenButton>
        <span v-if="toast" class="ag-toast" :class="toast.type === 'error' ? 'ag-toast-err' : 'ag-toast-ok'">{{ toast.msg }}</span>
      </div>
    </div>

    <!-- ── Add Schedule Modal ── -->
    <Teleport to="body">
      <div v-if="showAdd" class="ag-modal-overlay" @click.self="showAdd = false">
        <div class="ag-modal">
          <div class="ag-modal-title">Schedule Grand Prize</div>
          <div class="ag-search-wrap" style="margin-bottom:10px">
            <input type="text" class="ag-input" :placeholder="modalCtoon ? modalCtoon.name : 'Type a cToon name…'" v-model="modalSearch" @focus="modalDropdown = true" @input="modalDropdown = !!modalSearch.trim()" />
            <ul v-if="modalDropdown && modalFiltered.length" class="ag-dropdown">
              <li v-for="c in modalFiltered" :key="c.id" class="ag-dropdown-item ag-dropdown-selectable" @mousedown.prevent="modalCtoon = c; modalSearch = c.name; modalDropdown = false">
                <img :src="c.assetPath" class="ag-thumb" /><div><div class="ag-ctoon-name">{{ c.name }}</div></div>
              </li>
            </ul>
          </div>
          <div class="ag-grid-2" style="margin-bottom:10px">
            <div class="ag-field"><label class="ag-label">Date (Central)</label><input type="date" class="ag-input" v-model="modalDate" @change="setModalTime" /></div>
            <div class="ag-field"><label class="ag-label">Time (Central)</label><input type="time" class="ag-input" v-model="modalTime" /></div>
          </div>
          <div class="ag-actions">
            <GreenButton :disabled="savingAdd || !modalCtoon || !modalDate || !modalTime" @click="createSchedule">{{ savingAdd ? 'Saving…' : 'Add' }}</GreenButton>
            <button class="ag-page-btn" @click="showAdd = false">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Edit Schedule Modal ── -->
    <Teleport to="body">
      <div v-if="showEdit" class="ag-modal-overlay" @click.self="showEdit = false">
        <div class="ag-modal">
          <div class="ag-modal-title">Edit Grand Prize Schedule</div>
          <div class="ag-search-wrap" style="margin-bottom:10px">
            <input type="text" class="ag-input" :placeholder="editCtoon ? editCtoon.name : 'Type a cToon name…'" v-model="editSearch" @focus="editDropdown = true" @input="editDropdown = !!editSearch.trim()" />
            <ul v-if="editDropdown && editFiltered.length" class="ag-dropdown">
              <li v-for="c in editFiltered" :key="c.id" class="ag-dropdown-item ag-dropdown-selectable" @mousedown.prevent="editCtoon = c; editSearch = c.name; editDropdown = false">
                <img :src="c.assetPath" class="ag-thumb" /><div><div class="ag-ctoon-name">{{ c.name }}</div></div>
              </li>
            </ul>
          </div>
          <div class="ag-grid-2" style="margin-bottom:10px">
            <div class="ag-field"><label class="ag-label">Date (Central)</label><input type="date" class="ag-input" v-model="editDate" @change="setEditTime" /></div>
            <div class="ag-field"><label class="ag-label">Time (Central)</label><input type="time" class="ag-input" v-model="editTime" /></div>
          </div>
          <div class="ag-actions">
            <GreenButton :disabled="savingEdit || !editCtoon || !editDate || !editTime" @click="updateSchedule">{{ savingEdit ? 'Saving…' : 'Save' }}</GreenButton>
            <button class="ag-page-btn" @click="showEdit = false">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
// ── State ────────────────────────────────────────────────────
const leftCup  = ref(0)
const rightCup = ref(0)
const goldCup  = ref(0)
const saving   = ref(false)
const toast    = ref(null)

const boardLayer = ref({
  winballColorBackboard: '#F0E6FF',
  winballColorTransform: '#ffffff',
  winballColorTransformIntensity: 0,
  winballOverlayColor: '#ffffff',
  winballOverlayAlpha: 0,
  winballImageWidthPercent: 100,
  winballImageOffsetXPercent: 0,
  winballImageOffsetYPercent: 0
})

const physicsFields = [
  { key: 'winballGravity',             label: 'Gravity',               hint: 'default 15',    step: 0.5  },
  { key: 'winballBallMass',            label: 'Ball Mass',             hint: 'default 8',     step: 0.5  },
  { key: 'winballBallLinearDamping',   label: 'Linear Damping',        hint: 'default 0.2',   step: 0.01 },
  { key: 'winballBallAngularDamping',  label: 'Angular Damping',       hint: 'default 0',     step: 0.01 },
  { key: 'winballBallWallRestitution', label: 'Wall Bounciness',       hint: 'default 1.2',   step: 0.05 },
  { key: 'winballPlungerMaxPull',      label: 'Plunger Max Pull',      hint: 'default 0.6',   step: 0.05 },
  { key: 'winballPlungerImpactFactor', label: 'Plunger Impact Factor', hint: 'default 0.2',   step: 0.01 },
  { key: 'winballPlungerForce',        label: 'Plunger Force',         hint: 'default 500',   step: 10   }
]
const physics = ref({
  winballGravity: 15, winballBallMass: 8, winballBallLinearDamping: 0.2,
  winballBallAngularDamping: 0, winballBallWallRestitution: 1.2,
  winballPlungerMaxPull: 0.6, winballPlungerImpactFactor: 0.2, winballPlungerForce: 500
})

const colorFields = [
  { key: 'winballColorBackground', label: 'Background' },
  { key: 'winballColorWalls',      label: 'Walls'      },
  { key: 'winballColorBall',       label: 'Ball'       },
  { key: 'winballColorBumpers',    label: 'Bumpers'    },
  { key: 'winballColorLeftCup',    label: 'Left Cup'   },
  { key: 'winballColorRightCup',   label: 'Right Cup'  },
  { key: 'winballColorGoldCup',    label: 'Gold Cup'   },
  { key: 'winballColorCap',        label: 'Cap'        }
]
const colors = ref({
  winballColorBackground: '#ffffff', winballColorWalls: '#4b4b4b', winballColorBall: '#ff0000',
  winballColorBumpers: '#8c8cff', winballColorLeftCup: '#8c8cff', winballColorRightCup: '#8c8cff',
  winballColorGoldCup: '#FFD700', winballColorCap: '#ffd000'
})

const backboardFile      = ref(null)
const uploadingBackboard = ref(false)
const backboardPath      = ref('')
const bumperFiles        = ref([null, null, null])
const uploadingBumper    = ref([false, false, false])
const bumperPaths        = ref(['', '', ''])

const bumperGeo = ref([
  { radius: 6, height: 6, x: -8, z: -9 },
  { radius: 6, height: 6, x: -1, z:  0 },
  { radius: 6, height: 6, x:  6, z: -9 }
])
const triGeo = ref([
  { radius: 6, depth: 6, x: -15, z: -2 },
  { radius: 0, depth: 6, x:  15, z: -2 }
])
const pegGeo = ref([
  { radius: 1.5, height: 4, x: -11, z: -17 }, { radius: 1.5, height: 4, x:  -3, z: -17 },
  { radius: 1.5, height: 4, x:   5, z: -17 }, { radius: 1.5, height: 4, x:  12, z: -17 },
  { radius: 1.5, height: 4, x: -12, z:  -6 }, { radius: 1.5, height: 4, x:  -5, z:  -6 },
  { radius: 1.5, height: 4, x:   2, z:  -6 }, { radius: 1.5, height: 4, x:  10, z:  -6 },
  { radius: 1.5, height: 4, x: -12, z:   4 }, { radius: 1.5, height: 4, x:  -5, z:   5 },
  { radius: 1.5, height: 4, x:   3, z:   4 }, { radius: 1.5, height: 4, x:  11, z:   4 }
])

const allCtoons    = ref([])
const grandPrize   = ref(null)
const prizeSearch  = ref('')
const prizeDropdown = ref(false)
const prizeFiltered = computed(() => {
  const t = prizeSearch.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value.filter(c => c.name.toLowerCase().includes(t)).slice(0, 8)
})
function selectPrize(c) { grandPrize.value = c; prizeSearch.value = c.name; prizeDropdown.value = false }

const schedules = ref([])

// ── Schedule modal state ──────────────────────────────────────
const DEFAULT_TIME   = '20:00'
const THURSDAY_TIME  = '08:00'
function defaultTime(dateStr) {
  if (!dateStr) return DEFAULT_TIME
  const d = new Date(`${dateStr}T00:00:00`)
  return !isNaN(d) && d.getDay() === 4 ? THURSDAY_TIME : DEFAULT_TIME
}

const showAdd     = ref(false)
const savingAdd   = ref(false)
const modalCtoon  = ref(null)
const modalSearch = ref('')
const modalDropdown = ref(false)
const modalDate   = ref('')
const modalTime   = ref(DEFAULT_TIME)
const modalFiltered = computed(() => {
  const t = modalSearch.value.trim().toLowerCase()
  return t ? allCtoons.value.filter(c => c.name.toLowerCase().includes(t)).slice(0, 8) : []
})
function setModalTime() { modalTime.value = defaultTime(modalDate.value) }
function openAddModal() {
  modalCtoon.value = null; modalSearch.value = ''; modalDropdown.value = false
  const today = new Date()
  modalDate.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  modalTime.value = defaultTime(modalDate.value)
  showAdd.value = true
}

const showEdit       = ref(false)
const savingEdit     = ref(false)
const editingRow     = ref(null)
const editCtoon      = ref(null)
const editSearch     = ref('')
const editDropdown   = ref(false)
const editDate       = ref('')
const editTime       = ref(DEFAULT_TIME)
const editFiltered   = computed(() => {
  const t = editSearch.value.trim().toLowerCase()
  return t ? allCtoons.value.filter(c => c.name.toLowerCase().includes(t)).slice(0, 8) : []
})
function setEditTime() { editTime.value = defaultTime(editDate.value) }
function openEditModal(row) {
  editingRow.value = row
  editCtoon.value = row.ctoon || null
  editSearch.value = row.ctoon?.name || ''
  editDropdown.value = false
  const parts = (row.startsAtLocal || '').trim().split(' ')
  editDate.value = parts[0] || ''
  editTime.value = parts[1] || defaultTime(parts[0])
  showEdit.value = true
}

// ── Image uploads ──────────────────────────────────────────────
function onBackboardChange(e) { backboardFile.value = e.target.files?.[0] || null }
async function uploadBackboard() {
  if (!backboardFile.value) return
  uploadingBackboard.value = true
  try {
    const fd = new FormData(); fd.append('image', backboardFile.value); fd.append('label', 'winball-backboard')
    const res = await $fetch('/api/admin/winball-backboard-image', { method: 'POST', body: fd })
    backboardPath.value = res.assetPath; showToast('Backboard uploaded.')
  } catch { showToast('Upload failed', 'error') }
  finally { uploadingBackboard.value = false; backboardFile.value = null }
}

function onBumperChange(idx, e) { bumperFiles.value[idx] = e.target.files?.[0] || null }
async function uploadBumper(idx) {
  if (!bumperFiles.value[idx]) return
  uploadingBumper.value[idx] = true
  try {
    const fd = new FormData(); fd.append('image', bumperFiles.value[idx]); fd.append('bumperIndex', String(idx + 1))
    const res = await $fetch('/api/admin/winball-bumper-image', { method: 'POST', body: fd })
    bumperPaths.value[idx] = res.assetPath; showToast(`Bumper ${idx + 1} uploaded.`)
  } catch { showToast('Upload failed', 'error') }
  finally { uploadingBumper.value[idx] = false; bumperFiles.value[idx] = null }
}

// ── Schedule CRUD ──────────────────────────────────────────────
async function loadSchedules() {
  const res = await $fetch('/api/admin/winball-grand-prize')
  schedules.value = res.items || []
}
async function createSchedule() {
  if (!modalCtoon.value || !modalDate.value || !modalTime.value) return
  savingAdd.value = true
  try {
    await $fetch('/api/admin/winball-grand-prize', {
      method: 'POST',
      body: { ctoonId: modalCtoon.value.id, startsAtLocal: `${modalDate.value} ${modalTime.value}` }
    })
    await loadSchedules(); showAdd.value = false; showToast('Schedule added.')
  } catch { showToast('Failed to add', 'error') }
  finally { savingAdd.value = false }
}
async function updateSchedule() {
  if (!editingRow.value?.id || !editCtoon.value || !editDate.value || !editTime.value) return
  savingEdit.value = true
  try {
    await $fetch(`/api/admin/winball-grand-prize/${editingRow.value.id}`, {
      method: 'PUT',
      body: { ctoonId: editCtoon.value.id, startsAtLocal: `${editDate.value} ${editTime.value}` }
    })
    await loadSchedules(); showEdit.value = false; showToast('Schedule updated.')
  } catch { showToast('Failed to update', 'error') }
  finally { savingEdit.value = false }
}
async function removeSchedule(row) {
  try {
    await $fetch(`/api/admin/winball-grand-prize/${row.id}`, { method: 'DELETE' })
    schedules.value = schedules.value.filter(r => r.id !== row.id); showToast('Removed.')
  } catch { showToast('Failed to remove', 'error') }
}

// ── Load & Save ────────────────────────────────────────────────
async function loadConfig() {
  try {
    allCtoons.value = await $fetch('/api/admin/game-ctoons?select=id,name,rarity,assetPath,quantity')
    const wb = await $fetch('/api/admin/game-config?gameName=Winball')
    leftCup.value  = wb.leftCupPoints
    rightCup.value = wb.rightCupPoints
    goldCup.value  = wb.goldCupPoints
    if (wb.grandPrizeCtoon) { grandPrize.value = wb.grandPrizeCtoon; prizeSearch.value = wb.grandPrizeCtoon.name }
    backboardPath.value = wb.winballBackboardImagePath || ''
    bumperPaths.value = [wb.winballBumper1ImagePath || '', wb.winballBumper2ImagePath || '', wb.winballBumper3ImagePath || '']
    for (const k of Object.keys(boardLayer.value)) { if (wb[k] != null) boardLayer.value[k] = wb[k] }
    for (const f of colorFields)   { if (wb[f.key]) colors.value[f.key] = wb[f.key] }
    for (const f of physicsFields) { if (wb[f.key] != null) physics.value[f.key] = wb[f.key] }
    const bg = bumperGeo.value
    for (let i = 0; i < 3; i++) {
      const n = i + 1
      if (wb[`winballBumper${n}Radius`] != null) bg[i].radius = wb[`winballBumper${n}Radius`]
      if (wb[`winballBumper${n}Height`] != null) bg[i].height = wb[`winballBumper${n}Height`]
      if (wb[`winballBumper${n}X`]      != null) bg[i].x      = wb[`winballBumper${n}X`]
      if (wb[`winballBumper${n}Z`]      != null) bg[i].z      = wb[`winballBumper${n}Z`]
    }
    for (let i = 0; i < 2; i++) {
      const n = i + 1
      if (wb[`winballTriangle${n}Radius`] != null) triGeo.value[i].radius = wb[`winballTriangle${n}Radius`]
      if (wb[`winballTriangle${n}Depth`]  != null) triGeo.value[i].depth  = wb[`winballTriangle${n}Depth`]
      if (wb[`winballTriangle${n}X`]      != null) triGeo.value[i].x      = wb[`winballTriangle${n}X`]
      if (wb[`winballTriangle${n}Z`]      != null) triGeo.value[i].z      = wb[`winballTriangle${n}Z`]
    }
    for (let i = 0; i < 12; i++) {
      const n = i + 1
      if (wb[`winballPeg${n}Radius`] != null) pegGeo.value[i].radius = wb[`winballPeg${n}Radius`]
      if (wb[`winballPeg${n}Height`] != null) pegGeo.value[i].height = wb[`winballPeg${n}Height`]
      if (wb[`winballPeg${n}X`]      != null) pegGeo.value[i].x      = wb[`winballPeg${n}X`]
      if (wb[`winballPeg${n}Z`]      != null) pegGeo.value[i].z      = wb[`winballPeg${n}Z`]
    }
  } catch (e) { console.error('Winball: load config failed', e) }
}

async function save() {
  saving.value = true
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName: 'Winball',
        leftCupPoints: leftCup.value,
        rightCupPoints: rightCup.value,
        goldCupPoints: goldCup.value,
        grandPrizeCtoonId: grandPrize.value?.id || null,
        winballBackboardImagePath: backboardPath.value || null,
        winballBumper1ImagePath: bumperPaths.value[0] || null,
        winballBumper2ImagePath: bumperPaths.value[1] || null,
        winballBumper3ImagePath: bumperPaths.value[2] || null,
        winballBumper1Radius: bumperGeo.value[0].radius, winballBumper1Height: bumperGeo.value[0].height, winballBumper1X: bumperGeo.value[0].x, winballBumper1Z: bumperGeo.value[0].z,
        winballBumper2Radius: bumperGeo.value[1].radius, winballBumper2Height: bumperGeo.value[1].height, winballBumper2X: bumperGeo.value[1].x, winballBumper2Z: bumperGeo.value[1].z,
        winballBumper3Radius: bumperGeo.value[2].radius, winballBumper3Height: bumperGeo.value[2].height, winballBumper3X: bumperGeo.value[2].x, winballBumper3Z: bumperGeo.value[2].z,
        winballTriangle1Radius: triGeo.value[0].radius, winballTriangle1Depth: triGeo.value[0].depth, winballTriangle1X: triGeo.value[0].x, winballTriangle1Z: triGeo.value[0].z,
        winballTriangle2Radius: triGeo.value[1].radius, winballTriangle2Depth: triGeo.value[1].depth, winballTriangle2X: triGeo.value[1].x, winballTriangle2Z: triGeo.value[1].z,
        ...Object.fromEntries(pegGeo.value.flatMap((p, i) => [
          [`winballPeg${i+1}Radius`, p.radius], [`winballPeg${i+1}Height`, p.height],
          [`winballPeg${i+1}X`, p.x], [`winballPeg${i+1}Z`, p.z]
        ])),
        ...boardLayer.value,
        ...colors.value,
        ...physics.value
      }
    })
    showToast('Winball settings saved.')
  } catch { showToast('Save failed', 'error') }
  finally { saving.value = false }
}

function showToast(msg, type = 'ok') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 2500)
}

onMounted(async () => { await loadConfig(); await loadSchedules() })
</script>

<style scoped>
@import './admin-game-shared.css';
</style>

<style>
.ag-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.ag-modal {
  background: var(--OrbitLightBlue);
  border: 2px solid var(--OrbitDarkBlue);
  border-radius: 8px;
  padding: 20px;
  width: 420px;
  max-width: 90vw;
}
.ag-modal-title {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
  margin-bottom: 14px;
}
</style>
