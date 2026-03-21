<template>
  <div class="mc">

    <!-- ── Toolbar ─────────────────────────────────────────────── -->
    <div class="mc-toolbar">
      <input
        v-model="search"
        class="mc-search"
        placeholder="Search name / set / series…"
        type="text"
      />
      <GreenButton @click="openUploadPicker">Upload cToon</GreenButton>
      <RedButton :disabled="!selectedIds.length" @click="toggleMarkSelected">
        {{ allSelectedMarked ? 'Unmark for Deletion' : 'Mark for Deletion' }}
      </RedButton>
      <RedButton @click="deleteModalOpen = true">Delete cToons</RedButton>
      <span class="mc-count">{{ selectedIds.length }} selected</span>
      <span v-if="markedForDeletion.length" class="mc-count mc-count-marked">
        · {{ markedForDeletion.length }} marked
      </span>
    </div>

    <!-- ── cToon Table ──────────────────────────────────────────── -->
    <div class="mc-table-wrap" ref="tableWrapEl">
      <table class="mc-table">
        <thead>
          <tr>
            <th class="mc-th-check">
              <input
                type="checkbox"
                :checked="allChecked"
                :indeterminate.prop="someChecked"
                @change="toggleAll"
              />
            </th>
            <th style="width:50px">Image</th>
            <th
              v-for="col in COLS"
              :key="col.key"
              class="mc-sortable"
              :class="sortKey === col.key ? (sortAsc ? 'sort-asc' : 'sort-desc') : ''"
              @click="applySort(col.key)"
            >{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td :colspan="COLS.length + 2" class="mc-center">Loading…</td>
          </tr>
          <tr v-else-if="!filteredCtoons.length">
            <td :colspan="COLS.length + 2" class="mc-center">No cToons found.</td>
          </tr>
          <template v-else>
            <tr
              v-for="c in filteredCtoons"
              :key="c.id"
              :class="{ 'mc-row-marked': markedForDeletion.includes(c.id) }"
              @click="openDrawer(c)"
            >
              <td class="mc-td-check" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(c.id)"
                  @change="toggleSelect(c.id)"
                />
              </td>
              <td class="mc-td-img">
                <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="mc-thumb" />
                <div v-else class="mc-thumb-empty">—</div>
              </td>
              <td>{{ c.name }}</td>
              <td>{{ c.set || '—' }}</td>
              <td>{{ c.series || '—' }}</td>
              <td>{{ formatDate(c.releaseDate) }}</td>
              <td>
                <span class="mc-badge" :class="`mc-rarity-${raritySlug(c.rarity)}`">{{ c.rarity }}</span>
              </td>
              <td>{{ c.totalMinted }}</td>
              <td>{{ c.quantity == null ? '∞' : c.quantity }}</td>
              <td>
                <span class="mc-badge" :class="c.inCmart ? 'mc-badge-yes' : 'mc-badge-no'">
                  {{ c.inCmart ? 'Yes' : 'No' }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- ── Edit Drawer (slides in from right, absolute inside mc) ─ -->
    <div class="mc-drawer" :class="{ open: drawerOpen }">
      <div class="mc-drawer-header">
        <span>Edit cToon</span>
        <button class="mc-drawer-close" @click="closeDrawer">✕</button>
      </div>

      <template v-if="editForm">
        <div class="mc-drawer-body">
          <!-- Image preview / replace -->
          <img
            v-if="editImagePreview"
            :src="editImagePreview"
            class="mc-drawer-preview"
            alt="Preview"
          />
          <img
            v-else-if="editForm.assetPath"
            :src="editForm.assetPath"
            :alt="editForm.name"
            class="mc-drawer-preview"
          />
          <div v-else class="mc-drawer-preview-ph">No image</div>

          <div class="mc-field">
            <label>Replace Image (PNG / GIF only)</label>
            <input type="file" accept=".png,.gif" @change="onEditImage" />
          </div>

          <div class="mc-field-row">
            <input type="checkbox" id="d-incmart" v-model="editForm.inCmart" />
            <label for="d-incmart" class="mc-inline-label">In cMart</label>
          </div>

          <div class="mc-field"><label>Name *</label><input type="text" v-model="editForm.name" /></div>
          <div class="mc-field">
            <label>Set *</label>
            <input type="text" v-model="editForm.set" list="mc-sets-list" autocomplete="off" />
          </div>
          <div class="mc-field">
            <label>Series *</label>
            <input type="text" v-model="editForm.series" list="mc-series-list" autocomplete="off" />
          </div>
          <div class="mc-field">
            <label>Rarity *</label>
            <select v-model="editForm.rarity">
              <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
          </div>
          <div class="mc-field">
            <label>Price (Points)</label>
            <input type="number" min="0" v-model.number="editForm.price" />
          </div>
          <div class="mc-field">
            <label>Quantity (blank = unlimited)</label>
            <input
              type="number"
              min="0"
              :value="editForm.quantity ?? ''"
              @input="editForm.quantity = $event.target.value === '' ? null : Number($event.target.value)"
            />
          </div>
          <div class="mc-field">
            <label>Initial Quantity</label>
            <input
              type="number"
              min="0"
              :value="editForm.initialQuantity ?? ''"
              @input="editForm.initialQuantity = $event.target.value === '' ? null : Number($event.target.value)"
            />
          </div>
          <div class="mc-field">
            <label>Per User Limit</label>
            <input
              type="number"
              min="1"
              :value="editForm.perUserLimit ?? ''"
              @input="editForm.perUserLimit = $event.target.value === '' ? null : Number($event.target.value)"
            />
          </div>
          <div class="mc-field">
            <label>Release Date &amp; Time *</label>
            <input type="datetime-local" v-model="editForm.releaseDateLocal" />
          </div>
          <div class="mc-field">
            <label>Characters (comma-separated) *</label>
            <input type="text" v-model="editForm.charactersStr" />
          </div>
          <div class="mc-field">
            <label>Description</label>
            <textarea v-model="editForm.description" rows="3"></textarea>
          </div>
        </div>

        <div class="mc-drawer-footer">
          <p v-if="saveError" class="mc-error">{{ saveError }}</p>
          <button class="mc-btn mc-btn-save" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </template>
    </div>

    <!-- Autocomplete datalists (populated from loaded cToons) -->
    <datalist id="mc-sets-list">
      <option v-for="s in knownSets" :key="s" :value="s" />
    </datalist>
    <datalist id="mc-series-list">
      <option v-for="s in knownSeries" :key="s" :value="s" />
    </datalist>

    <!-- Hidden file picker for upload -->
    <input
      ref="fileInputEl"
      type="file"
      multiple
      accept=".png,.gif"
      style="display:none"
      @change="onFilesSelected"
    />

    <!-- ── Upload Modal ─────────────────────────────────────────── -->
    <div class="mc-overlay" :class="{ open: uploadModalOpen }" @click.self="closeUpload">
      <div class="mc-modal">
        <div class="mc-modal-header">
          <span>Upload cToons</span>
          <button class="mc-drawer-close" @click="closeUpload">✕</button>
        </div>

        <div class="mc-modal-body">
          <div v-for="(card, idx) in uploadCards" :key="idx" class="mc-upload-card">
            <img :src="card.previewUrl" :alt="card.name" class="mc-upload-preview" />
            <div class="mc-upload-fields">

              <div class="mc-field">
                <label>Name *</label>
                <input type="text" v-model="uploadCards[idx].name" />
              </div>

              <div class="mc-upload-grid">
                <div class="mc-field">
                  <label>Set *</label>
                  <input type="text" v-model="uploadCards[idx].set" list="mc-sets-list" autocomplete="off" />
                </div>
                <div class="mc-field">
                  <label>Series *</label>
                  <input type="text" v-model="uploadCards[idx].series" list="mc-series-list" autocomplete="off" />
                </div>
                <div class="mc-field">
                  <label>Rarity *</label>
                  <select v-model="uploadCards[idx].rarity">
                    <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
                  </select>
                </div>
                <div class="mc-field">
                  <label>Quantity (blank = ∞)</label>
                  <input type="text" v-model="uploadCards[idx].quantityStr" />
                </div>
                <div class="mc-field">
                  <label>Price (Points)</label>
                  <input type="number" min="0" v-model.number="uploadCards[idx].price" />
                </div>
                <div class="mc-field">
                  <label>Per User Limit</label>
                  <input type="text" v-model="uploadCards[idx].perUserLimitStr" />
                </div>
                <div class="mc-field" style="grid-column: span 2">
                  <label>Release Date &amp; Time *</label>
                  <input type="datetime-local" v-model="uploadCards[idx].releaseDate" />
                </div>
              </div>

              <div class="mc-field">
                <label>Characters (comma-separated) *</label>
                <input type="text" v-model="uploadCards[idx].charactersStr" />
              </div>
              <div class="mc-field">
                <label>Description</label>
                <textarea v-model="uploadCards[idx].description" rows="2"></textarea>
              </div>
              <div class="mc-field-row">
                <input type="checkbox" :id="`u-incmart-${idx}`" v-model="uploadCards[idx].inCmart" />
                <label :for="`u-incmart-${idx}`" class="mc-inline-label">In cMart</label>
                <input type="checkbox" :id="`u-codeonly-${idx}`" v-model="uploadCards[idx].codeOnly" style="margin-left:12px" />
                <label :for="`u-codeonly-${idx}`" class="mc-inline-label">Code Only</label>
              </div>

              <p v-if="uploadCards[idx].error" class="mc-error">{{ uploadCards[idx].error }}</p>
              <p v-if="uploadCards[idx].uploaded" class="mc-success">✓ Uploaded!</p>
            </div>
          </div>
        </div>

        <div class="mc-modal-footer">
          <button class="mc-btn mc-btn-save" style="flex:1" :disabled="uploading" @click="submitUpload">
            {{ uploading ? 'Uploading…' : 'Upload All' }}
          </button>
          <button class="mc-btn mc-btn-danger" @click="closeUpload">Cancel</button>
        </div>
      </div>
    </div>

    <!-- ── Delete Confirmation Modal ───────────────────────────── -->
    <div class="mc-overlay" :class="{ open: deleteModalOpen }" @click.self="deleteModalOpen = false">
      <div class="mc-modal">
        <div class="mc-modal-header">Confirm Deletion</div>
        <div class="mc-modal-body">
          <p v-if="!markedForDeletion.length" class="mc-center" style="color:#a8d4f0">
            No cToons are currently marked for deletion.
          </p>
          <template v-else>
            <p class="mc-warning">
              The following cToons will be permanently deleted.
              cToons with minted copies cannot be deleted and will be skipped.
            </p>
            <div class="mc-purge-grid">
              <div v-for="c in markedCtoons" :key="c.id" class="mc-purge-item">
                <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="mc-purge-img" />
                <div v-else class="mc-purge-img-ph">?</div>
                <span class="mc-purge-name">{{ c.name }}</span>
                <span v-if="c.totalMinted > 0" class="mc-error" style="font-size:0.6rem">
                  {{ c.totalMinted }} minted – skip
                </span>
              </div>
            </div>
          </template>
        </div>
        <div class="mc-modal-footer">
          <button
            class="mc-btn mc-btn-purge"
            :disabled="!markedForDeletion.length || deleting"
            @click="confirmDelete"
          >{{ deleting ? 'Deleting…' : 'Delete' }}</button>
          <button class="mc-btn mc-btn-success" style="flex:1" @click="deleteModalOpen = false">
            Cancel
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
// ─────────────────────────────────────────────────────────────────────────────
// ManageCtoons.vue
//
// Admin widget for managing cToons. Equivalent to the cToons tab in the
// reference Flask/Jinja2 admin panel, rewritten as a self-contained Vue 3
// component using Nuxt $fetch for API calls.
//
// FEATURES
//   • Scrollable, sortable table of all cToons (name, set, series, release
//     date, rarity, minted count, max quantity, in-cMart badge)
//   • Click any row to open a slide-in edit drawer (fetches full cToon data)
//   • Upload modal: pick multiple PNG/GIF files, fill in per-file metadata,
//     submit each as a separate multipart POST to /api/admin/ctoon
//   • Two-phase deletion: "Mark for Deletion" toggles client-side state,
//     "Delete cToons" shows a confirmation modal then calls DELETE per cToon
//     (server rejects cToons that have minted copies)
//   • Search filter above the table for quick lookup
//   • Autocomplete datalists for Set and Series, built from loaded cToons
//
// API ENDPOINTS USED
//   GET  /api/admin/all-ctoons?take=500      load table data
//   GET  /api/admin/ctoon/:id                load full data for edit drawer
//   PUT  /api/admin/ctoon/:id                save edit drawer (JSON or multipart)
//   POST /api/admin/ctoon                    create cToon (multipart)
//   DELETE /api/admin/ctoon/:id              delete a cToon (totalMinted must be 0)
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITIES = [
  { value: 'common',       label: 'Common' },
  { value: 'uncommon',     label: 'Uncommon' },
  { value: 'rare',         label: 'Rare' },
  { value: 'very rare',    label: 'Very Rare' },
  { value: 'crazy rare',   label: 'Crazy Rare' },
  { value: 'code only',    label: 'Code Only' },
  { value: 'prize only',   label: 'Prize Only' },
  { value: 'auction only', label: 'Auction Only' },
]

// Used for sorting the rarity column by logical order rather than alphabetically
const RARITY_ORDER = {
  'common': 0, 'uncommon': 1, 'rare': 2, 'very rare': 3,
  'crazy rare': 4, 'code only': 5, 'prize only': 6, 'auction only': 7,
}

const COLS = [
  { key: 'name',        label: 'Name' },
  { key: 'set',         label: 'Set' },
  { key: 'series',      label: 'Series' },
  { key: 'releaseDate', label: 'Release Date' },
  { key: 'rarity',      label: 'Rarity' },
  { key: 'totalMinted', label: 'Minted' },
  { key: 'quantity',    label: 'Max' },
  { key: 'inCmart',     label: 'In cMart' },
]

// ── State ─────────────────────────────────────────────────────────────────────

const ctoons    = ref([])         // raw list from all-ctoons API
const loading   = ref(false)
const search    = ref('')

// Row selection (array of ids — re-assigned triggers Vue reactivity)
const selectedIds        = ref([])
const markedForDeletion  = ref([])  // client-side "pending delete" list

// Table sort
const sortKey = ref('name')
const sortAsc = ref(true)

// Edit drawer
const drawerOpen       = ref(false)
const editForm         = ref(null)   // fields for the currently-open cToon
const editImageFile    = ref(null)   // File object if the user picks a replacement image
const editImagePreview = ref(null)   // data-URL for the preview
const saving           = ref(false)
const saveError        = ref('')

// Upload modal
const uploadModalOpen = ref(false)
const uploadCards     = ref([])      // one entry per selected file
const uploading       = ref(false)
const fileInputEl     = ref(null)

// Delete confirmation modal
const deleteModalOpen = ref(false)
const deleting        = ref(false)

// Autocomplete data built from loaded cToons
const knownSets   = ref([])
const knownSeries = ref([])

const tableWrapEl = ref(null)

// ── Computed ──────────────────────────────────────────────────────────────────

// Filter the list by the search string (name, set, or series)
const filteredCtoons = computed(() => {
  const q = search.value.trim().toLowerCase()
  const base = q
    ? ctoons.value.filter(c =>
        (c.name   || '').toLowerCase().includes(q) ||
        (c.set    || '').toLowerCase().includes(q) ||
        (c.series || '').toLowerCase().includes(q) ||
        (c.rarity || '').toLowerCase().includes(q)
      )
    : ctoons.value

  // Apply column sort
  const arr = [...base]
  const key = sortKey.value
  const asc = sortAsc.value

  arr.sort((a, b) => {
    let va = a[key]
    let vb = b[key]

    if (key === 'rarity') {
      // Sort by logical rarity order
      va = RARITY_ORDER[va] ?? 99
      vb = RARITY_ORDER[vb] ?? 99
      return asc ? va - vb : vb - va
    }
    if (key === 'releaseDate') {
      va = va ? new Date(va).getTime() : 0
      vb = vb ? new Date(vb).getTime() : 0
      return asc ? va - vb : vb - va
    }
    if (typeof va === 'number' || typeof vb === 'number') {
      va = va ?? 0
      vb = vb ?? 0
      return asc ? va - vb : vb - va
    }
    if (typeof va === 'boolean') {
      return asc
        ? (va === vb ? 0 : va ? 1 : -1)
        : (va === vb ? 0 : va ? -1 : 1)
    }
    va = (va || '').toString().toLowerCase()
    vb = (vb || '').toString().toLowerCase()
    return asc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  return arr
})

// Header checkbox state
const allChecked  = computed(() => filteredCtoons.value.length > 0 && selectedIds.value.length === filteredCtoons.value.length)
const someChecked = computed(() => selectedIds.value.length > 0 && selectedIds.value.length < filteredCtoons.value.length)

// True when every selected row is already marked for deletion
const allSelectedMarked = computed(() =>
  selectedIds.value.length > 0 &&
  selectedIds.value.every(id => markedForDeletion.value.includes(id))
)

// cToon objects for the rows that are marked for deletion (used in purge modal)
const markedCtoons = computed(() =>
  ctoons.value.filter(c => markedForDeletion.value.includes(c.id))
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

// Convert a rarity string to a CSS-safe slug (e.g. "very rare" → "very-rare")
function raritySlug(r) {
  return (r || '').replace(/\s+/g, '-')
}

// Convert an ISO date string to the value format expected by datetime-local inputs
// (local time, no seconds: "YYYY-MM-DDTHH:MM")
function toDatetimeLocal(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

// Build a default release datetime 5 minutes from now (for new upload cards)
function defaultReleaseDate() {
  const d = new Date(Date.now() + 5 * 60000)
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

// Parse a raw filename into a human-readable title (e.g. "fm1_my_ctoon.png" → "My Ctoon")
function parsedFilename(filename) {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/_?fm[12]_?/gi, ' ')
    .replace(/_?pic_?/gi,    ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ── Data Loading ──────────────────────────────────────────────────────────────

async function loadCtoons() {
  loading.value = true
  try {
    // Fetch up to 500 cToons; increase take= if your library grows beyond that
    const data = await $fetch('/api/admin/all-ctoons?take=500')
    ctoons.value = data

    // Rebuild autocomplete lists from freshly loaded data
    knownSets.value   = [...new Set(data.map(c => c.set).filter(Boolean))].sort()
    knownSeries.value = [...new Set(data.map(c => c.series).filter(Boolean))].sort()
  } catch (err) {
    console.error('ManageCtoons: failed to load cToons', err)
  } finally {
    loading.value = false
  }
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function applySort(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

// ── Selection ─────────────────────────────────────────────────────────────────

function toggleAll(e) {
  selectedIds.value = e.target.checked
    ? filteredCtoons.value.map(c => c.id)
    : []
}

function toggleSelect(id) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter(x => x !== id)
  } else {
    selectedIds.value = [...selectedIds.value, id]
  }
}

// ── Mark / Unmark for Deletion ────────────────────────────────────────────────

function toggleMarkSelected() {
  if (allSelectedMarked.value) {
    // Unmark: remove all selected ids from the marked list
    markedForDeletion.value = markedForDeletion.value.filter(
      id => !selectedIds.value.includes(id)
    )
  } else {
    // Mark: add all selected ids (deduped)
    markedForDeletion.value = [
      ...new Set([...markedForDeletion.value, ...selectedIds.value])
    ]
  }
}

// ── Edit Drawer ───────────────────────────────────────────────────────────────

// Open the drawer for a given table row. Fetches full cToon details from the
// server because the list endpoint (all-ctoons) only returns a subset of fields.
async function openDrawer(row) {
  saveError.value    = ''
  editImageFile.value    = null
  editImagePreview.value = null

  try {
    const { ctoon } = await $fetch(`/api/admin/ctoon/${row.id}`)
    editForm.value = {
      id:               ctoon.id,
      assetPath:        ctoon.assetPath,
      inCmart:          ctoon.inCmart,
      name:             ctoon.name,
      set:              ctoon.set   || '',
      series:           ctoon.series || '',
      rarity:           ctoon.rarity,
      price:            ctoon.price  ?? 0,
      quantity:         ctoon.quantity,         // null = unlimited
      initialQuantity:  ctoon.initialQuantity,
      perUserLimit:     ctoon.perUserLimit,
      releaseDateLocal: toDatetimeLocal(ctoon.releaseDate),
      charactersStr:    (ctoon.characters || []).join(', '),
      description:      ctoon.description || '',
    }
    drawerOpen.value = true
  } catch (err) {
    console.error('ManageCtoons: failed to load cToon detail', err)
  }
}

function closeDrawer() {
  drawerOpen.value       = false
  editForm.value         = null
  editImageFile.value    = null
  editImagePreview.value = null
}

// Called when the user picks a replacement image in the edit drawer
function onEditImage(e) {
  const file = e.target.files[0]
  if (!file) return
  editImageFile.value = file
  const reader = new FileReader()
  reader.onload = ev => { editImagePreview.value = ev.target.result }
  reader.readAsDataURL(file)
}

// Save the edit drawer. Sends JSON when no image replacement; multipart when
// the user picked a new image (PUT /api/admin/ctoon/:id accepts both).
async function saveEdit() {
  if (!editForm.value) return
  saving.value    = true
  saveError.value = ''

  try {
    const f = editForm.value
    const characters = f.charactersStr.split(',').map(s => s.trim()).filter(Boolean)
    const releaseIso = f.releaseDateLocal ? new Date(f.releaseDateLocal).toISOString() : null

    if (editImageFile.value) {
      // Build multipart form data when replacing the image
      const fd = new FormData()
      fd.append('image', editImageFile.value, editImageFile.value.name)
      fd.append('name',            f.name)
      fd.append('series',          f.series)
      fd.append('set',             f.set)
      fd.append('rarity',          f.rarity)
      fd.append('price',           String(f.price ?? 0))
      fd.append('releaseDate',     releaseIso || '')
      fd.append('inCmart',         String(f.inCmart))
      fd.append('description',     f.description || '')
      fd.append('characters',      JSON.stringify(characters))
      if (f.quantity        != null) fd.append('quantity',        String(f.quantity))
      if (f.initialQuantity != null) fd.append('initialQuantity', String(f.initialQuantity))
      if (f.perUserLimit    != null) fd.append('perUserLimit',    String(f.perUserLimit))
      await $fetch(`/api/admin/ctoon/${f.id}`, { method: 'PUT', body: fd })
    } else {
      // Plain JSON update — no image change
      await $fetch(`/api/admin/ctoon/${f.id}`, {
        method: 'PUT',
        body: {
          name:            f.name,
          series:          f.series,
          set:             f.set,
          rarity:          f.rarity,
          price:           f.price ?? 0,
          releaseDate:     releaseIso,
          inCmart:         f.inCmart,
          description:     f.description || null,
          characters,
          quantity:        f.quantity,
          initialQuantity: f.initialQuantity,
          perUserLimit:    f.perUserLimit,
        },
      })
    }

    closeDrawer()
    await loadCtoons()
  } catch (err) {
    saveError.value = err?.data?.statusMessage || err?.message || 'Save failed.'
  } finally {
    saving.value = false
  }
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function openUploadPicker() {
  if (fileInputEl.value) {
    fileInputEl.value.value = ''
    fileInputEl.value.click()
  }
}

// Build one upload card per selected file. Uses FileReader to generate a local
// preview URL. Opens the modal only after all previews have been read.
function onFilesSelected(e) {
  const files = Array.from(e.target.files)
  if (!files.length) return

  uploadCards.value = []
  let pending = files.length

  files.forEach((file, idx) => {
    uploadCards.value.push({
      file,
      previewUrl:     '',
      name:           parsedFilename(file.name),
      set:            '',
      series:         '',
      rarity:         'common',
      quantityStr:    '',          // blank → unlimited
      price:          0,
      perUserLimitStr:'',          // blank → no limit
      releaseDate:    defaultReleaseDate(),
      // Auto-populate characters from the parsed filename as a reasonable default
      charactersStr:  parsedFilename(file.name),
      description:    '',
      inCmart:        false,
      codeOnly:       false,
      error:          '',
      uploaded:       false,
    })

    const reader = new FileReader()
    reader.onload = ev => {
      uploadCards.value[idx].previewUrl = ev.target.result
      pending--
      if (pending === 0) uploadModalOpen.value = true
    }
    reader.readAsDataURL(file)
  })
}

function closeUpload() {
  uploadModalOpen.value = false
  uploadCards.value = []
}

// Submit each upload card as a separate multipart POST to /api/admin/ctoon.
// Cards that already succeeded (card.uploaded = true) are skipped on retry.
async function submitUpload() {
  uploading.value = true
  let anySuccess  = false

  for (let i = 0; i < uploadCards.value.length; i++) {
    const card = uploadCards.value[i]
    if (card.uploaded) continue
    uploadCards.value[i].error = ''

    try {
      const characters = card.charactersStr.split(',').map(s => s.trim()).filter(Boolean)
      if (!characters.length) {
        uploadCards.value[i].error = 'Characters field is required.'
        continue
      }
      if (!card.name?.trim()) {
        uploadCards.value[i].error = 'Name is required.'
        continue
      }
      if (!card.series?.trim()) {
        uploadCards.value[i].error = 'Series is required.'
        continue
      }
      if (!card.set?.trim()) {
        uploadCards.value[i].error = 'Set is required.'
        continue
      }
      if (!card.releaseDate) {
        uploadCards.value[i].error = 'Release date is required.'
        continue
      }

      // Convert quantity: blank or empty string → null (unlimited), otherwise a number
      const qty = card.quantityStr === '' || card.quantityStr == null
        ? null
        : Number(card.quantityStr)
      const perUserLimit = card.perUserLimitStr === '' || card.perUserLimitStr == null
        ? null
        : Number(card.perUserLimitStr)

      const fd = new FormData()
      // The file type (MIME) is stored as the cToon's `type` field on creation
      fd.append('image',         card.file, card.file.name)
      fd.append('name',          card.name.trim())
      fd.append('series',        card.series.trim())
      fd.append('set',           card.set.trim())
      fd.append('type',          card.file.type)   // MIME type → schema `type` field
      fd.append('rarity',        card.rarity)
      fd.append('totalQuantity', qty != null ? String(qty) : '')
      fd.append('price',         String(card.price ?? 0))
      fd.append('releaseDate',   new Date(card.releaseDate).toISOString())
      fd.append('inCmart',       String(card.inCmart))
      fd.append('codeOnly',      String(card.codeOnly))
      fd.append('description',   card.description || '')
      fd.append('characters',    JSON.stringify(characters))
      if (perUserLimit != null) fd.append('perUserLimit', String(perUserLimit))

      await $fetch('/api/admin/ctoon', { method: 'POST', body: fd })
      uploadCards.value[i].uploaded = true
      anySuccess = true
    } catch (err) {
      uploadCards.value[i].error =
        err?.data?.statusMessage || err?.message || 'Upload failed.'
    }
  }

  uploading.value = false

  if (anySuccess) {
    await loadCtoons()
    // Auto-close only if every card succeeded
    if (uploadCards.value.every(c => c.uploaded)) closeUpload()
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Iterate over every marked cToon and call the DELETE endpoint. The server
// will reject any cToon whose totalMinted > 0; those remain in the marked list.
async function confirmDelete() {
  deleting.value = true
  const toDelete  = [...markedForDeletion.value]
  const succeeded = []

  for (const id of toDelete) {
    try {
      await $fetch(`/api/admin/ctoon/${id}`, { method: 'DELETE' })
      succeeded.push(id)
    } catch (err) {
      const name = ctoons.value.find(c => c.id === id)?.name || id
      console.warn(`ManageCtoons: could not delete "${name}":`, err?.data?.statusMessage || err)
    }
  }

  // Remove successfully-deleted ids from all tracking lists
  markedForDeletion.value = markedForDeletion.value.filter(id => !succeeded.includes(id))
  selectedIds.value       = selectedIds.value.filter(id => !succeeded.includes(id))

  deleting.value        = false
  deleteModalOpen.value = false
  await loadCtoons()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(loadCtoons)
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */
.mc {
  position: relative;    /* anchor for absolutely-positioned drawer + overlays */
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: #d0eaff;
  font-size: 0.78rem;
}

/* ── Toolbar ─────────────────────────────────────────────────── */
.mc-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.mc-search {
  flex: 1;
  min-width: 140px;
  background: #0f2a40;
  border: 1px solid #1a5f8a;
  border-radius: 4px;
  color: #d0eaff;
  font-size: 0.78rem;
  padding: 4px 8px;
  outline: none;
}
.mc-search::placeholder { color: #5a7a9a; }
.mc-search:focus { border-color: #3399cc; }

.mc-count { font-size: 0.75rem; color: #a8d4f0; white-space: nowrap; }
.mc-count-marked { color: #ffaaaa; }

/* ── Buttons ─────────────────────────────────────────────────── */
.mc-btn {
  padding: 4px 12px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 0.78rem;
  cursor: pointer;
  user-select: none;
  border: 2px solid transparent;
  font-family: inherit;
  white-space: nowrap;
}
.mc-btn:disabled { opacity: 0.4; cursor: default; }

.mc-btn-success {
  border-color: #1a6a30;
  background: linear-gradient(to bottom, #4cbb6e 0%, #2a9a4a 50%, #1a7a30 100%);
  color: #fff;
}
.mc-btn-success:hover:not(:disabled) {
  background: linear-gradient(to bottom, #60d080 0%, #35aa55 50%, #228840 100%);
}

.mc-btn-danger {
  border-color: #8a1a1a;
  background: linear-gradient(to bottom, #e85b5b 0%, #c02e2e 50%, #a01a1a 100%);
  color: #fff;
}
.mc-btn-danger:hover:not(:disabled) {
  background: linear-gradient(to bottom, #f57272 0%, #d03a3a 50%, #b02020 100%);
}

.mc-btn-purge {
  border-color: #5a1a1a;
  background: linear-gradient(to bottom, #aa2020 0%, #801010 100%);
  color: #ffcccc;
}
.mc-btn-purge:hover:not(:disabled) {
  background: linear-gradient(to bottom, #cc2828 0%, #991818 100%);
}

.mc-btn-save {
  border-color: #1a5f8a;
  background: linear-gradient(to bottom, #5bb8e8 0%, #2e8fc0 50%, #1a6fa0 100%);
  color: #fff;
}
.mc-btn-save:hover:not(:disabled) {
  background: linear-gradient(to bottom, #72caf5 0%, #3aa0d0 50%, #2280b0 100%);
}

/* ── Table ───────────────────────────────────────────────────── */
.mc-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: #1e4a70;
  border: 1px solid #1a5f8a;
  border-radius: 8px;
  scrollbar-width: thin;
  scrollbar-color: #1a5f8a transparent;
}

.mc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  color: #d0eaff;
}

.mc-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #1a4060;
  color: #a8d4f0;
  text-align: left;
  padding: 6px 10px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mc-th-check { width: 28px; text-align: center; }

.mc-sortable { cursor: pointer; user-select: none; }
.mc-sortable:hover { color: #d0eaff; background: #224f75; }
.sort-asc::after  { content: ' ▲'; font-size: 0.6rem; }
.sort-desc::after { content: ' ▼'; font-size: 0.6rem; }

.mc-table td {
  padding: 5px 10px;
  border-bottom: 1px solid #1a4060;
  white-space: nowrap;
}
.mc-td-check { text-align: center; }
.mc-td-img   { width: 50px; padding: 3px 6px !important; }

.mc-table tr:last-child td { border-bottom: none; }
.mc-table tbody tr:hover td { background: #234f75; cursor: pointer; }
.mc-row-marked td { color: #cc8888 !important; }

.mc-thumb {
  width: 40px;
  height: 40px;
  object-fit: contain;
  background: #0f2a40;
  border-radius: 4px;
  display: block;
}
.mc-thumb-empty {
  width: 40px;
  height: 40px;
  background: #0f2a40;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3a6a8a;
  font-size: 0.6rem;
}

.mc-center { text-align: center; color: #a8d4f0; padding: 16px !important; }

/* ── Rarity badges ───────────────────────────────────────────── */
.mc-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: bold;
  white-space: nowrap;
}

.mc-badge-yes { background: #1a6a30; color: #aaffbb; }
.mc-badge-no  { background: #334455; color: #99aabb; }

.mc-rarity-common      { background: #6b7280; color: #fff; }
.mc-rarity-uncommon    { background: #e5e7eb; color: #111; border: 1px solid #9ca3af; }
.mc-rarity-rare        { background: #16a34a; color: #fff; }
.mc-rarity-very-rare   { background: #2563eb; color: #fff; }
.mc-rarity-crazy-rare  { background: #7c3aed; color: #fff; }
.mc-rarity-code-only   { background: #ea580c; color: #fff; }
.mc-rarity-prize-only  { background: #111;    color: #e5e7eb; }
.mc-rarity-auction-only{ background: #eab308; color: #111; }

/* ── Edit Drawer ─────────────────────────────────────────────── */
.mc-drawer {
  position: absolute;
  top: 0;
  right: 0;
  width: 300px;
  height: 100%;
  background: #1a3a58;
  border-left: 2px solid #1a5f8a;
  border-radius: 0 8px 8px 0;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.2s ease;
  z-index: 10;
}
.mc-drawer.open { transform: translateX(0); }

.mc-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #1a4060;
  flex-shrink: 0;
  font-weight: bold;
  font-size: 0.85rem;
  color: #d0eaff;
}
.mc-drawer-close {
  background: none;
  border: none;
  color: #a8d4f0;
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
  font-family: inherit;
}
.mc-drawer-close:hover { color: #fff; }

.mc-drawer-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #1a5f8a transparent;
}

.mc-drawer-preview {
  width: 100%;
  height: 100px;
  object-fit: contain;
  background: #0f2a40;
  border-radius: 6px;
  flex-shrink: 0;
}
.mc-drawer-preview-ph {
  width: 100%;
  height: 100px;
  background: #0f2a40;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a7a9a;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.mc-drawer-footer {
  padding: 10px 12px;
  background: #1a4060;
  flex-shrink: 0;
}

/* ── Form fields (shared by drawer + upload modal) ───────────── */
.mc-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mc-field label {
  font-size: 0.65rem;
  color: #a8d4f0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mc-field input,
.mc-field select,
.mc-field textarea {
  background: #0f2a40;
  border: 1px solid #1a5f8a;
  border-radius: 4px;
  color: #d0eaff;
  font-size: 0.78rem;
  padding: 4px 7px;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}
.mc-field input:focus,
.mc-field select:focus,
.mc-field textarea:focus { border-color: #3399cc; outline: none; }
.mc-field textarea { resize: vertical; min-height: 48px; }

.mc-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mc-inline-label {
  font-size: 0.78rem;
  color: #d0eaff;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}

/* ── Overlays + Modals ───────────────────────────────────────── */
.mc-overlay {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 20;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 20px 10px;
}
.mc-overlay.open { display: flex; }

.mc-modal {
  background: #1a3a58;
  border: 2px solid #1a5f8a;
  border-radius: 10px;
  width: 100%;
  max-width: 540px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.mc-modal-header {
  background: #1a4060;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px 8px 0 0;
  font-weight: bold;
  font-size: 0.9rem;
  color: #d0eaff;
  flex-shrink: 0;
}

.mc-modal-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mc-modal-footer {
  background: #1a4060;
  padding: 12px 16px;
  display: flex;
  gap: 10px;
  border-radius: 0 0 8px 8px;
  flex-shrink: 0;
}

/* ── Upload cards ────────────────────────────────────────────── */
.mc-upload-card {
  background: #0f2a40;
  border: 1px solid #1a5f8a;
  border-radius: 8px;
  padding: 12px;
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px;
}

.mc-upload-preview {
  width: 100px;
  height: 100px;
  object-fit: contain;
  border-radius: 6px;
  background: #061822;
  border: 1px solid #1a5f8a;
  display: block;
}

.mc-upload-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mc-upload-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

/* ── Delete (purge) modal content ────────────────────────────── */
.mc-warning {
  color: #ffaaaa;
  font-size: 0.8rem;
  margin: 0;
}

.mc-purge-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mc-purge-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 72px;
}

.mc-purge-img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  background: #0f2a40;
  border-radius: 6px;
  border: 1px solid #1a5f8a;
}
.mc-purge-img-ph {
  width: 72px;
  height: 72px;
  background: #0f2a40;
  border-radius: 6px;
  border: 1px solid #1a5f8a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a7a9a;
  font-size: 0.65rem;
}
.mc-purge-name {
  font-size: 0.62rem;
  color: #a8d4f0;
  text-align: center;
  word-break: break-word;
}

/* ── Status messages ─────────────────────────────────────────── */
.mc-error   { color: #ff8888; font-size: 0.72rem; margin: 0; }
.mc-success { color: #88ff88; font-size: 0.72rem; margin: 0; }
</style>
