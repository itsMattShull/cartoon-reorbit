<template>
  <div class="admin-manage-sales bg-gray-50 text-xs">
    <div class="px-2 py-2">

      <div class="flex items-center justify-between mb-3">
        <h1 class="text-base font-semibold">Manage Sales</h1>
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          @click="openCreateModal"
        >+ Create Sale</button>
      </div>

      <div v-if="loading" class="text-gray-500 py-6 text-center">Loading…</div>
      <div v-else-if="!sales.length" class="text-gray-500 py-6 text-center">No sales yet. Create one to get started.</div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <article v-for="sale in sales" :key="sale.id" class="bg-white border rounded-lg shadow p-2 flex flex-col gap-2">
          <div class="flex items-start gap-2">
            <img
              v-if="sale.imagePath"
              :src="sale.imagePath"
              :alt="sale.name"
              class="w-14 h-14 object-cover rounded border flex-shrink-0"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-semibold text-xs truncate">{{ sale.name }}</span>
                <span :class="statusBadgeClass(sale.status)">{{ statusLabel(sale.status) }}</span>
              </div>
              <div class="text-[10px] text-gray-500 mt-0.5">{{ sale.itemCount }} cToon{{ sale.itemCount === 1 ? '' : 's' }}</div>
            </div>
          </div>

          <div class="text-[10px] text-gray-600 space-y-0.5">
            <div><span class="text-gray-500">Start:</span> {{ formatCst(sale.startAt) }}</div>
            <div><span class="text-gray-500">End:</span> {{ formatCst(sale.endAt) }}</div>
          </div>

          <div class="mt-auto flex items-center gap-1.5 pt-1">
            <button class="flex-1 px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50" @click="openEditModal(sale)">Edit</button>
            <button class="flex-1 px-2 py-1 text-[11px] border rounded-md text-red-700 border-red-200 hover:bg-red-50" @click="openDeleteConfirm(sale)">Delete</button>
          </div>
        </article>
      </div>
    </div>

    <!-- ── Create / Edit modal ─────────────────────────────────────── -->
    <div v-if="modalMode" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="!saving && closeModal()"></div>
      <div class="relative bg-white w-full max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 class="text-sm font-semibold">{{ modalMode === 'create' ? 'Create Sale' : 'Edit Sale' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeModal" :disabled="saving">✕</button>
        </div>

        <div ref="modalBodyEl" class="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          <div class="grid sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2 flex flex-col gap-1">
              <label class="text-xs font-medium">Sale name <span class="text-red-500">*</span></label>
              <input v-model="form.name" type="text" placeholder="e.g. Summer Blowout" class="border rounded-md px-2 py-1.5 text-sm" />
            </div>

            <div class="sm:col-span-2 flex flex-col gap-1">
              <label class="text-xs font-medium">Promo image (optional)</label>
              <input ref="fileInputEl" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="text-xs" @change="onFile" />
              <p class="text-[10px] text-gray-500">Wide image recommended (e.g. 1200×300) — it will be cropped to fit a banner.</p>
              <img v-if="imagePreview" :src="imagePreview" class="mt-1 w-full max-h-32 object-cover rounded border" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Start (CST) <span class="text-red-500">*</span></label>
              <input v-model="form.startAtLocal" type="datetime-local" class="border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">End (CST) <span class="text-red-500">*</span></label>
              <input v-model="form.endAtLocal" type="datetime-local" class="border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <p v-if="dateError" class="sm:col-span-2 text-[11px] text-red-600">{{ dateError }}</p>
          </div>

          <hr />

          <div class="space-y-2">
            <h4 class="text-xs font-semibold">cToons in this sale</h4>

            <div class="relative cto-autocomplete">
              <input
                ref="searchInputEl"
                v-model="search"
                type="text"
                placeholder="Search cToons…"
                class="w-full border rounded-md px-2 py-1.5 text-sm"
                @focus="onSearchFocus"
                @keydown.down.prevent="highlightNext"
                @keydown.up.prevent="highlightPrev"
                @keydown.enter.prevent="chooseHighlighted"
              />
              <ul
                v-if="suggestionsOpen && suggestions.length"
                class="absolute z-20 mt-1 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y"
                style="max-height: min(60vw, 40vh);"
              >
                <li
                  v-for="(s, idx) in suggestions"
                  :key="s.id"
                  @mousedown.prevent="toggleSelect(s)"
                  :class="['flex items-center gap-2 px-2 py-1.5 cursor-pointer', idx === highlighted ? 'bg-blue-50' : 'hover:bg-gray-50']"
                >
                  <img v-if="s.assetPath" :src="s.assetPath" class="w-7 h-7 object-cover rounded border flex-shrink-0" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium flex items-center gap-1">
                      <span class="truncate">{{ s.name }}</span>
                      <span v-if="s.isSecondEdition" class="edition-badge edition-badge-2nd">2nd Ed</span>
                    </p>
                    <p class="text-[10px] text-gray-500">{{ s.rarity }} · normal {{ (s.price ?? 0).toLocaleString() }} pts</p>
                  </div>
                </li>
              </ul>
            </div>

            <p v-if="!items.length" class="text-[11px] text-gray-500">No cToons selected yet.</p>

            <div v-for="item in items" :key="item.ctoonId" class="border rounded-md p-2">
              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <img v-if="item.assetPath" :src="item.assetPath" class="w-8 h-8 object-cover rounded border flex-shrink-0" />
                <div class="min-w-0 flex items-center gap-1">
                  <span class="truncate font-medium text-xs">{{ item.name }}</span>
                  <span v-if="item.isSecondEdition" class="edition-badge edition-badge-2nd">2nd Ed</span>
                </div>
                <button type="button" class="text-red-700 text-[11px] hover:underline" @click="removeItem(item.ctoonId)">Remove</button>
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <label class="flex items-center gap-1">
                  Sale price
                  <input v-model.number="item.price" type="number" min="0" class="w-16 border rounded px-1 py-0.5 text-xs" />
                </label>
                <label class="flex items-center gap-1">
                  Per-day limit
                  <input v-model.number="item.perDayLimit" type="number" min="1" class="w-14 border rounded px-1 py-0.5 text-xs" />
                </label>
                <span class="text-gray-500">Normal: {{ (item.normalPrice ?? 0).toLocaleString() }} pts</span>
              </div>
            </div>
          </div>

          <p v-if="submitError" class="text-[11px] text-red-600">{{ submitError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button class="px-3 py-1 text-sm border rounded-md" @click="closeModal" :disabled="saving">Cancel</button>
          <button
            class="px-3 py-1 text-sm rounded-md text-white"
            :class="canSave ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'"
            :disabled="!canSave || saving"
            @click="submit"
          >{{ saving ? 'Saving…' : 'Save Sale' }}</button>
        </div>
      </div>
    </div>

    <!-- ── Delete confirmation modal ───────────────────────────────── -->
    <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="!deleting && closeDeleteConfirm()"></div>
      <div class="relative bg-white w-full max-w-md rounded-lg shadow-lg p-5">
        <h3 class="text-sm font-semibold">Delete "{{ deleteTarget.name }}"?</h3>
        <p class="mt-2 text-xs text-gray-600">This permanently removes the sale and its cToon price/limit overrides. This cannot be undone.</p>
        <p v-if="deleteError" class="mt-2 text-xs text-red-600">{{ deleteError }}</p>
        <div class="mt-4 flex items-center justify-end gap-2">
          <button class="px-3 py-1 text-sm border rounded-md" @click="closeDeleteConfirm" :disabled="deleting">Cancel</button>
          <button
            class="px-3 py-1 text-sm rounded-md text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300"
            :disabled="deleting"
            @click="confirmDelete"
          >{{ deleting ? 'Deleting…' : 'Delete' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const sales = ref([])
const loading = ref(true)
const ctoonPool = ref([])

async function loadSales() {
  loading.value = true
  try {
    sales.value = await $fetch('/api/admin/sales')
  } catch (e) {
    console.error('Failed to load sales', e)
  } finally {
    loading.value = false
  }
}

async function loadCtoonPool() {
  try {
    ctoonPool.value = await $fetch('/api/admin/ctoon-pool')
  } catch (e) {
    console.error('Failed to load cToon pool', e)
  }
}

onMounted(async () => {
  await Promise.all([loadSales(), loadCtoonPool()])
})

function formatCst(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) + ' CST'
}

function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'ended') return 'Ended'
  return 'Upcoming'
}
function statusBadgeClass(status) {
  const base = 'px-1.5 py-0 rounded text-[10px] font-medium border'
  if (status === 'active') return `${base} bg-green-100 text-green-800 border-green-200`
  if (status === 'ended') return `${base} bg-gray-100 text-gray-600 border-gray-300`
  return `${base} bg-amber-100 text-amber-800 border-amber-200`
}

function utcToChicagoLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

// ── Modal state ──────────────────────────────────────────────
const modalMode = ref(null) // 'create' | 'edit'
const editingSaleId = ref(null)
const form = ref({ name: '', startAtLocal: '', endAtLocal: '' })
const items = ref([])
const imageFile = ref(null)
const imagePreview = ref('')
const fileInputEl = ref(null)
const modalBodyEl = ref(null)
const saving = ref(false)
const submitError = ref('')

function resetForm() {
  form.value = { name: '', startAtLocal: '', endAtLocal: '' }
  items.value = []
  imageFile.value = null
  imagePreview.value = ''
  submitError.value = ''
}

function openCreateModal() {
  resetForm()
  modalMode.value = 'create'
  editingSaleId.value = null
}

async function openEditModal(sale) {
  resetForm()
  modalMode.value = 'edit'
  editingSaleId.value = sale.id
  try {
    const full = await $fetch(`/api/admin/sales/${sale.id}`)
    form.value.name = full.name
    form.value.startAtLocal = utcToChicagoLocalInput(full.startAt)
    form.value.endAtLocal = utcToChicagoLocalInput(full.endAt)
    imagePreview.value = full.imagePath || ''
    items.value = full.items.map(i => ({
      ctoonId: i.ctoon.id,
      name: i.ctoon.name,
      assetPath: i.ctoon.assetPath,
      rarity: i.ctoon.rarity,
      isSecondEdition: i.ctoon.isSecondEdition,
      normalPrice: i.ctoon.price,
      price: i.price,
      perDayLimit: i.perDayLimit
    }))
  } catch (e) {
    submitError.value = e?.data?.statusMessage || e?.message || 'Failed to load sale details.'
  }
}

function closeModal() {
  modalMode.value = null
  editingSaleId.value = null
  resetForm()
}

function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (!allowed.includes(file.type)) {
    alert('Only PNG, JPEG, GIF, or WEBP images are allowed.')
    if (fileInputEl.value) fileInputEl.value.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Image must be 5MB or smaller.')
    if (fileInputEl.value) fileInputEl.value.value = ''
    return
  }
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
}

// ── cToon search/select ──────────────────────────────────────
const search = ref('')
const searchInputEl = ref(null)
const suggestionsOpen = ref(false)
const highlighted = ref(-1)

const selectedIds = computed(() => new Set(items.value.map(i => i.ctoonId)))

const suggestions = computed(() => {
  const term = search.value.toLowerCase().trim()
  let list = ctoonPool.value.filter(c => !selectedIds.value.has(c.id))
  if (term) list = list.filter(c => c.name.toLowerCase().includes(term))
  return list.slice(0, 50)
})

function onSearchFocus() {
  suggestionsOpen.value = true
  if (process.client) {
    nextTick(() => {
      searchInputEl.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }
}
watch(search, () => { suggestionsOpen.value = true })

function highlightNext() {
  if (!suggestions.value.length) return
  highlighted.value = (highlighted.value + 1) % suggestions.value.length
}
function highlightPrev() {
  if (!suggestions.value.length) return
  highlighted.value = (highlighted.value - 1 + suggestions.value.length) % suggestions.value.length
}
function chooseHighlighted() {
  if (highlighted.value >= 0) toggleSelect(suggestions.value[highlighted.value])
}
function toggleSelect(c) {
  items.value.push({
    ctoonId: c.id,
    name: c.name,
    assetPath: c.assetPath,
    rarity: c.rarity,
    isSecondEdition: c.isSecondEdition,
    normalPrice: c.price,
    price: c.price ?? 0,
    perDayLimit: 1
  })
  search.value = ''
  suggestionsOpen.value = false
  highlighted.value = -1
  searchInputEl.value?.blur()
}
function removeItem(ctoonId) {
  items.value = items.value.filter(i => i.ctoonId !== ctoonId)
}

function handleOutsideClick(e) {
  if (!e.target.closest('.cto-autocomplete')) suggestionsOpen.value = false
}
onMounted(() => { if (process.client) window.addEventListener('click', handleOutsideClick) })
onBeforeUnmount(() => { if (process.client) window.removeEventListener('click', handleOutsideClick) })

// ── Validation ───────────────────────────────────────────────
const dateError = computed(() => {
  if (!form.value.startAtLocal || !form.value.endAtLocal) return ''
  if (form.value.endAtLocal <= form.value.startAtLocal) return 'End time must be after start time.'
  return ''
})

const itemsValid = computed(() => items.value.every(i =>
  Number.isInteger(Number(i.price)) && Number(i.price) >= 0 &&
  Number.isInteger(Number(i.perDayLimit)) && Number(i.perDayLimit) >= 1
))

const canSave = computed(() =>
  form.value.name.trim().length > 0 &&
  !!form.value.startAtLocal && !!form.value.endAtLocal &&
  !dateError.value &&
  items.value.length > 0 &&
  itemsValid.value
)

// ── Submit ───────────────────────────────────────────────────
async function submit() {
  if (!canSave.value || saving.value) return
  saving.value = true
  submitError.value = ''

  const meta = {
    name: form.value.name.trim(),
    startAtLocal: form.value.startAtLocal,
    endAtLocal: form.value.endAtLocal,
    items: items.value.map(i => ({ ctoonId: i.ctoonId, price: Number(i.price), perDayLimit: Number(i.perDayLimit) }))
  }

  const body = new FormData()
  body.append('meta', JSON.stringify(meta))
  if (imageFile.value) body.append('image', imageFile.value)

  try {
    if (modalMode.value === 'create') {
      await $fetch('/api/admin/sales', { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/sales/${editingSaleId.value}`, { method: 'PATCH', body })
    }
    closeModal()
    await loadSales()
  } catch (e) {
    submitError.value = e?.data?.statusMessage || e?.message || 'Failed to save sale.'
  } finally {
    saving.value = false
  }
}

// ── Delete ───────────────────────────────────────────────────
const deleteTarget = ref(null)
const deleting = ref(false)
const deleteError = ref('')

function openDeleteConfirm(sale) {
  deleteTarget.value = sale
  deleteError.value = ''
}
function closeDeleteConfirm() {
  deleteTarget.value = null
  deleteError.value = ''
  deleting.value = false
}
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/admin/sales/${deleteTarget.value.id}`, { method: 'DELETE' })
    closeDeleteConfirm()
    await loadSales()
  } catch (e) {
    deleteError.value = e?.data?.statusMessage || e?.message || 'Failed to delete sale.'
    deleting.value = false
  }
}
</script>

<style scoped>
.admin-manage-sales {
  width: 100%;
  min-height: 100%;
  color: #111;
}

.edition-badge {
  display: inline-block;
  flex-shrink: 0;
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 1px 5px;
  border-radius: 10px;
  background: #7c3aed;
  color: #fff;
}

.edition-badge-2nd {
  background: #7c3aed;
  color: #fff;
}
</style>
