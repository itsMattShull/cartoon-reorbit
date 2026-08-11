<template>
  <div class="p-6 space-y-8 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight">Backgrounds</h1>
    </div>

    <!-- Upload card -->
    <section class="bg-white rounded-xl border border-gray-200 shadow p-6 space-y-4">
      <h2 class="text-lg font-semibold">Add a Background</h2>
      <form @submit.prevent="submit" class="grid md:grid-cols-2 gap-6 items-start">
        <div class="space-y-3">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Label (optional)</label>
            <input v-model="label" type="text" placeholder="e.g. Night City"
              class="rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600" />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Visibility</label>
            <select v-model="visibility"
              class="rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
              <option value="public">Public</option>
              <option value="code-only">Code only</option>
            </select>
            <p class="text-xs text-gray-500">"Code only" hides it from normal UI; still available to your code.</p>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Image (PNG, GIF, or JPEG)</label>
            <input ref="fileInput" type="file" accept="image/png,image/gif,image/jpeg" @change="onFile"
              class="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            <p class="text-xs text-gray-500">Exactly <strong>510×344</strong> or <strong>512×346</strong> or <strong>800×600</strong> px.</p>
          </div>

          <button type="submit" :disabled="!imageFile || uploading" :title="!imageFile ? 'Choose an image' : ''"
            class="inline-flex items-center gap-2 rounded-md px-5 py-2.5 font-semibold text-white disabled:bg-gray-400 disabled:cursor-not-allowed bg-blue-700 hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700">
            {{ uploading ? 'Uploading…' : 'Upload' }}
          </button>
        </div>

        <!-- Preview -->
        <div class="flex items-center justify-center">
          <img v-if="imagePreview" :src="imagePreview" alt="Preview" class="max-w-full rounded-md border border-gray-300" />
          <div v-else class="text-sm text-gray-500">No image selected.</div>
        </div>
      </form>
    </section>

    <!-- List -->
    <section>
      <div v-if="pending" class="py-10 text-gray-500 text-center">Loading…</div>
      <div v-else-if="error" class="py-10 text-red-600 text-center">{{ error.message || 'Failed to fetch backgrounds' }}</div>
      <template v-else>
        <div v-if="updateError" class="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {{ updateError }}
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="bg in backgrounds" :key="bg.id" class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
            <img :src="bg.imagePath" :alt="bg.label || 'Background'" class="w-full h-44 object-cover" />
            <div class="p-4 space-y-2 text-sm">
              <div class="font-medium truncate">{{ bg.label || '—' }}</div>
              <div class="text-gray-600">{{ bg.width }}×{{ bg.height }} • {{ shortMime(bg.mimeType) }}</div>
              <div class="flex items-center gap-2">
                <span class="text-gray-600 shrink-0">Visibility:</span>
                <button
                  @click="toggleVisibility(bg)"
                  :disabled="!!saving[bg.id]"
                  :title="bg.visibility === 'PUBLIC' ? 'Click to make Code Only' : 'Click to make Public'"
                  :class="[
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors min-h-[28px]',
                    bg.visibility === 'PUBLIC'
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    saving[bg.id] ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  ]"
                >
                  <span v-if="saving[bg.id]" class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {{ fromEnum(bg.visibility) }}
                </button>
              </div>
              <div class="text-gray-500">Added: {{ formatDate(bg.createdAt) }}</div>
            </div>
            <div class="px-4 pb-4 flex gap-2">
              <button @click="openEdit(bg)"
                class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                Edit
              </button>
              <button @click="openDelete(bg)"
                class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>

  <!-- ── Edit Modal ──────────────────────────────────────────────────── -->
  <div v-if="editModal.show" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeEdit" />
    <div class="relative bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
      <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
        <h2 class="text-lg font-semibold">Edit Background</h2>
        <button class="text-gray-500 hover:text-gray-700 text-xl leading-none" @click="closeEdit">&times;</button>
      </div>

      <div class="p-4 overflow-y-auto flex-1 space-y-4">
        <!-- Label -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Label</label>
          <input v-model="editModal.label" type="text" placeholder="e.g. Night City"
            class="rounded-md border border-gray-400 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600" />
        </div>

        <!-- Visibility -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Visibility</label>
          <select v-model="editModal.visibility"
            class="rounded-md border border-gray-400 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600">
            <option value="PUBLIC">Public</option>
            <option value="CODE_ONLY">Code only</option>
          </select>
        </div>

        <!-- Replace image -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Replace Image (optional)</label>
          <div class="text-xs text-gray-500 mb-1">
            Current: {{ editModal.bg?.width }}×{{ editModal.bg?.height }} px
          </div>
          <input ref="editFileInput" type="file" accept="image/png,image/gif,image/jpeg"
            @change="onEditFile"
            class="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
          <p class="text-xs text-gray-500">Exactly <strong>510×344</strong>, <strong>512×346</strong>, or <strong>800×600</strong> px. All cZones using this background will be updated to the new image.</p>
        </div>

        <!-- Dimension mismatch warning -->
        <div v-if="editModal.dimensionWarning" class="rounded-md bg-yellow-50 border border-yellow-300 px-3 py-2 text-sm text-yellow-800">
          {{ editModal.dimensionWarning }}
        </div>

        <!-- New image preview -->
        <div v-if="editModal.imagePreview" class="flex flex-col gap-1">
          <div class="text-xs text-gray-500 font-medium">New image preview:</div>
          <img :src="editModal.imagePreview" alt="New image preview" class="max-w-full rounded-md border border-gray-300 max-h-48 object-contain" />
        </div>

        <div v-if="editModal.error" class="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ editModal.error }}
        </div>
      </div>

      <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
        <button class="px-4 py-2 rounded border border-gray-300 text-sm font-medium" @click="closeEdit">Cancel</button>
        <button
          class="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="editModal.saving"
          @click="saveEdit">
          <span v-if="!editModal.saving">Save</span>
          <span v-else>Saving…</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ── Delete Confirmation Modal ───────────────────────────────────── -->
  <div v-if="deleteModal.show" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeDelete" />
    <div class="relative bg-white rounded-lg shadow-lg w-full max-w-md flex flex-col">
      <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
        <h2 class="text-lg font-semibold text-red-700">Delete Background</h2>
        <button class="text-gray-500 hover:text-gray-700 text-xl leading-none" @click="closeDelete">&times;</button>
      </div>

      <div class="p-4 space-y-4">
        <p class="text-sm text-gray-700">
          You are about to permanently delete
          <strong>{{ deleteModal.bg?.label || 'this background' }}</strong>.
          This cannot be undone.
        </p>

        <!-- Loading usage -->
        <div v-if="deleteModal.loading" class="text-sm text-gray-500 flex items-center gap-2">
          <span class="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          Checking usage…
        </div>

        <!-- Usage summary -->
        <div v-else-if="deleteModal.usage" class="rounded-md border border-gray-200 divide-y text-sm">
          <div class="px-3 py-2 flex justify-between">
            <span class="text-gray-600">Player owners (will lose it)</span>
            <span :class="deleteModal.usage.userCount > 0 ? 'font-semibold text-red-700' : 'text-gray-500'">
              {{ deleteModal.usage.userCount }}
            </span>
          </div>
          <div class="px-3 py-2 flex justify-between">
            <span class="text-gray-600">cZones using this background</span>
            <span :class="deleteModal.usage.czoneCount > 0 ? 'font-semibold text-amber-700' : 'text-gray-500'">
              {{ deleteModal.usage.czoneCount }}
            </span>
          </div>
          <div class="px-3 py-2 flex justify-between">
            <span class="text-gray-600">Claim code reward slots (will be removed)</span>
            <span :class="deleteModal.usage.rewardBackgroundCount > 0 ? 'font-semibold text-amber-700' : 'text-gray-500'">
              {{ deleteModal.usage.rewardBackgroundCount }}
            </span>
          </div>
          <div class="px-3 py-2 flex justify-between">
            <span class="text-gray-600">Achievement reward slots (will be removed)</span>
            <span :class="deleteModal.usage.achievementRewardCount > 0 ? 'font-semibold text-amber-700' : 'text-gray-500'">
              {{ deleteModal.usage.achievementRewardCount }}
            </span>
          </div>
          <div class="px-3 py-2 flex justify-between">
            <span class="text-gray-600">cZone search conditions (will be cleared)</span>
            <span :class="deleteModal.usage.searchPrizeCount > 0 ? 'font-semibold text-red-700' : 'text-gray-500'">
              {{ deleteModal.usage.searchPrizeCount }}
            </span>
          </div>
        </div>

        <!-- Active search condition warning -->
        <div v-if="deleteModal.usage?.searchPrizeCount > 0"
          class="rounded-md bg-red-50 border border-red-300 px-3 py-2 text-sm text-red-800">
          This background is a condition on {{ deleteModal.usage.searchPrizeCount }} active search prize{{ deleteModal.usage.searchPrizeCount === 1 ? '' : 's' }}. Deleting it will permanently disable those conditions — players won't be able to satisfy them.
        </div>

        <div v-if="deleteModal.error" class="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ deleteModal.error }}
        </div>
      </div>

      <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
        <button class="px-4 py-2 rounded border border-gray-300 text-sm font-medium" @click="closeDelete">Cancel</button>
        <button
          class="px-4 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="deleteModal.loading || deleteModal.deleting"
          @click="confirmDelete">
          <span v-if="deleteModal.deleting">Deleting…</span>
          <span v-else>Delete permanently</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

// ── Upload form state ──────────────────────────────────────────────────
const label = ref('')
const visibility = ref('public')
const imageFile = ref(null)
const imagePreview = ref('')
const uploading = ref(false)
const fileInput = ref(null)
const saving = reactive({})
const updateError = ref('')

// ── Edit modal state ───────────────────────────────────────────────────
const editModal = reactive({
  show: false,
  bg: null,
  label: '',
  visibility: 'PUBLIC',
  imageFile: null,
  imagePreview: '',
  dimensionWarning: '',
  saving: false,
  error: ''
})
const editFileInput = ref(null)

// ── Delete modal state ─────────────────────────────────────────────────
const deleteModal = reactive({
  show: false,
  bg: null,
  loading: false,
  usage: null,
  deleting: false,
  error: ''
})

// ── Helpers ────────────────────────────────────────────────────────────
function shortMime(m) { return (m||'').replace('image/','').toUpperCase() }
function fromEnum(v) { return v === 'CODE_ONLY' ? 'Code only' : 'Public' }
function formatDate(d) { return new Date(d).toLocaleString() }

const ALLOWED_SIZES = [[510,344],[512,346],[800,600]]

function validateImageFile(file, onValid, onError) {
  if (!file) return
  if (!['image/png','image/gif','image/jpeg'].includes(file.type)) {
    onError('Only PNG, GIF, or JPEG allowed.')
    return
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const ok = ALLOWED_SIZES.some(([w,h]) => img.width === w && img.height === h)
    if (!ok) {
      URL.revokeObjectURL(url)
      onError('Image must be exactly 510×344, 512×346, or 800×600 px.')
      return
    }
    onValid(file, url, img.width, img.height)
  }
  img.src = url
}

// ── Upload form ────────────────────────────────────────────────────────
function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  validateImageFile(
    file,
    (f, url) => { imageFile.value = f; imagePreview.value = url },
    (msg) => {
      alert(msg)
      fileInput.value.value = ''
      imageFile.value = null
      imagePreview.value = ''
    }
  )
}

const { data: backgrounds, pending, error } = await useFetch('/api/admin/backgrounds', {
  key: 'backgrounds', credentials: 'include'
})

async function toggleVisibility(bg) {
  if (saving[bg.id]) return
  const prev = bg.visibility
  const next = prev === 'PUBLIC' ? 'CODE_ONLY' : 'PUBLIC'
  bg.visibility = next
  saving[bg.id] = true
  try {
    await $fetch(`/api/admin/backgrounds/${bg.id}`, {
      method: 'PATCH',
      body: { visibility: next }
    })
  } catch (err) {
    bg.visibility = prev
    updateError.value = err?.data?.statusMessage || 'Failed to update visibility'
    setTimeout(() => { updateError.value = '' }, 5000)
  } finally {
    delete saving[bg.id]
  }
}

async function submit() {
  if (!imageFile.value) return
  uploading.value = true
  const form = new FormData()
  form.append('label', label.value)
  form.append('visibility', visibility.value)
  form.append('image', imageFile.value)
  try {
    await $fetch('/api/admin/backgrounds', { method: 'POST', body: form })
    label.value = ''
    visibility.value = 'public'
    fileInput.value.value = ''
    imageFile.value = null
    imagePreview.value = ''
    await refreshNuxtData('backgrounds')
  } catch (err) {
    console.error(err)
    alert(err?.data?.statusMessage || 'Failed to upload background')
  } finally {
    uploading.value = false
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────
function openEdit(bg) {
  editModal.bg = bg
  editModal.label = bg.label || ''
  editModal.visibility = bg.visibility
  editModal.imageFile = null
  editModal.imagePreview = ''
  editModal.dimensionWarning = ''
  editModal.error = ''
  editModal.saving = false
  editModal.show = true
}

function closeEdit() {
  if (editModal.saving) return
  editModal.show = false
  if (editModal.imagePreview) URL.revokeObjectURL(editModal.imagePreview)
  editModal.imageFile = null
  editModal.imagePreview = ''
  if (editFileInput.value) editFileInput.value.value = ''
}

function onEditFile(e) {
  const file = e.target.files[0]
  if (!file) {
    editModal.imageFile = null
    editModal.imagePreview = ''
    editModal.dimensionWarning = ''
    return
  }
  validateImageFile(
    file,
    (f, url, w, h) => {
      if (editModal.imagePreview) URL.revokeObjectURL(editModal.imagePreview)
      editModal.imageFile = f
      editModal.imagePreview = url
      const orig = editModal.bg
      editModal.dimensionWarning = (w !== orig.width || h !== orig.height)
        ? `Warning: new image is ${w}×${h} but original is ${orig.width}×${orig.height}. cZones designed around the original size may look different.`
        : ''
    },
    (msg) => {
      alert(msg)
      if (editFileInput.value) editFileInput.value.value = ''
      editModal.imageFile = null
      editModal.imagePreview = ''
      editModal.dimensionWarning = ''
    }
  )
}

async function saveEdit() {
  const bg = editModal.bg
  const labelChanged = editModal.label !== (bg.label || '')
  const visibilityChanged = editModal.visibility !== bg.visibility
  const hasNewImage = !!editModal.imageFile

  if (!labelChanged && !visibilityChanged && !hasNewImage) {
    closeEdit()
    return
  }

  editModal.saving = true
  editModal.error = ''

  try {
    if (labelChanged || visibilityChanged) {
      const updated = await $fetch(`/api/admin/backgrounds/${bg.id}`, {
        method: 'PATCH',
        body: { label: editModal.label.trim() || null, visibility: editModal.visibility }
      })
      bg.label = updated.label
      bg.visibility = updated.visibility
    }

    if (hasNewImage) {
      const form = new FormData()
      form.append('image', editModal.imageFile)
      const updated = await $fetch(`/api/admin/backgrounds/${bg.id}/replace-image`, {
        method: 'POST',
        body: form
      })
      bg.imagePath = updated.imagePath
      bg.filename = updated.filename
      bg.width = updated.width
      bg.height = updated.height
      bg.mimeType = updated.mimeType
    }

    closeEdit()
    await refreshNuxtData('backgrounds')
  } catch (err) {
    editModal.error = err?.data?.statusMessage || 'Failed to save changes'
  } finally {
    editModal.saving = false
  }
}

// ── Delete modal ───────────────────────────────────────────────────────
async function openDelete(bg) {
  deleteModal.bg = bg
  deleteModal.usage = null
  deleteModal.loading = true
  deleteModal.error = ''
  deleteModal.deleting = false
  deleteModal.show = true

  try {
    deleteModal.usage = await $fetch(`/api/admin/backgrounds/${bg.id}/usage`)
  } catch (err) {
    deleteModal.error = 'Failed to load usage data'
  } finally {
    deleteModal.loading = false
  }
}

function closeDelete() {
  if (deleteModal.deleting) return
  deleteModal.show = false
}

async function confirmDelete() {
  deleteModal.deleting = true
  deleteModal.error = ''
  try {
    await $fetch(`/api/admin/backgrounds/${deleteModal.bg.id}`, { method: 'DELETE' })
    deleteModal.deleting = false
    closeDelete()
    await refreshNuxtData('backgrounds')
  } catch (err) {
    deleteModal.error = err?.data?.statusMessage || 'Failed to delete background'
    deleteModal.deleting = false
  }
}
</script>
