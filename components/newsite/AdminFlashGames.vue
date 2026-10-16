<template>
  <div class="admin-flash-games text-xs" style="color-scheme: light;">
    <div class="space-y-4">
      <h2 class="text-2xl font-semibold">Flash Arcade</h2>
      <p class="text-gray-600 text-sm">
        Upload <code>.swf</code> games, played in-browser via
        <a href="https://ruffle.rs" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">Ruffle</a>.
        Active games appear on the "Flash Arcade" tile on the Games page (image configured under the
        Global Settings tab's Game Tile Images) — the newest-first list below is the whole catalog.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="g in games" :key="g.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
          <div class="w-20 h-14 rounded flex-shrink-0 bg-gray-100 border overflow-hidden flex items-center justify-center">
            <img v-if="g.thumbnailPath" :src="g.thumbnailPath" :alt="g.title" class="w-full h-full object-cover" />
            <span v-else class="text-gray-400 text-[10px]">No thumbnail</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold break-words">
              {{ g.title }}
              <span v-if="!g.active" class="ml-1 text-[10px] font-normal text-gray-500">(inactive)</span>
            </div>
            <div v-if="g.description" class="text-[11px] text-gray-600 break-words">{{ g.description }}</div>
            <div class="text-[11px] text-gray-400">sort {{ g.sortOrder }}</div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(g)">Edit</button>
            <button
              type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="deletingId === g.id" @click="remove(g)"
            >{{ deletingId === g.id ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
        <p v-if="!loading && !games.length" class="text-gray-500">No Flash games uploaded yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h3 class="font-semibold text-sm">{{ editId ? 'Edit Flash game' : 'New Flash game' }}</h3>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Title</label>
          <input v-model="form.title" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="e.g. Food Bash" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Description (optional)</label>
          <textarea v-model="form.description" rows="2" maxlength="300" class="w-full border rounded px-2 py-1"></textarea>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Thumbnail (optional)</label>
          <div v-if="editId && currentThumbnailPath && !clearThumbnail" class="flex items-center gap-3 mb-2">
            <img :src="currentThumbnailPath" alt="" class="w-16 h-11 object-cover rounded border" />
            <button type="button" @click="clearThumbnail = true" class="text-red-600 hover:underline">Remove</button>
          </div>
          <p v-else-if="clearThumbnail" class="text-amber-600 mb-2">Thumbnail will be removed on save. <button type="button" @click="clearThumbnail = false" class="underline">Undo</button></p>
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" @change="onThumbnailFile" class="w-full" />
          <p class="text-gray-500">PNG, JPEG, GIF, or WEBP. Shown on the public listing; a blank one just shows a text tile.</p>
          <p v-if="thumbnailFile" class="text-green-600 mt-1">Selected: {{ thumbnailFile.name }}</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">{{ editId ? 'Replace .swf (optional)' : '.swf file' }}</label>
          <input type="file" accept=".swf" @change="onSwfFile" class="w-full" />
          <p class="text-gray-500">{{ editId ? 'Leave blank to keep the existing file.' : 'Required.' }}</p>
          <p v-if="swfFile" class="text-green-600 mt-1">Selected: {{ swfFile.name }}</p>
        </div>

        <div class="flex items-center gap-4 flex-wrap">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.active" />
            Active (shown on the public listing)
          </label>
          <div class="flex items-center gap-2">
            <label class="font-medium">Sort order</label>
            <input v-model.number="form.sortOrder" type="number" class="w-20 border rounded px-2 py-1" />
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (editId ? 'Save changes' : 'Upload game') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const games = ref([])
const loading = ref(false)
const loadError = ref('')

const editId = ref('')
const saving = ref(false)
const formError = ref('')
const deletingId = ref('')

const thumbnailFile = ref(null)
const swfFile = ref(null)
const currentThumbnailPath = ref('')
const clearThumbnail = ref(false)

const emptyForm = () => ({ title: '', description: '', active: true, sortOrder: 0 })
const form = reactive(emptyForm())

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/flash-games')
    games.value = res?.games || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load Flash games'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editId.value = ''
  formError.value = ''
  thumbnailFile.value = null
  swfFile.value = null
  currentThumbnailPath.value = ''
  clearThumbnail.value = false
  Object.assign(form, emptyForm())
}

function startEdit(g) {
  editId.value = g.id
  formError.value = ''
  thumbnailFile.value = null
  swfFile.value = null
  currentThumbnailPath.value = g.thumbnailPath || ''
  clearThumbnail.value = false
  Object.assign(form, {
    title: g.title,
    description: g.description || '',
    active: g.active,
    sortOrder: g.sortOrder,
  })
}

function onThumbnailFile(e) {
  const file = e.target.files?.[0]
  thumbnailFile.value = file || null
  if (file) clearThumbnail.value = false
}

// Browsers don't reliably set a useful file.type for .swf — see the matching comment in
// pages/admin/addCtoon.vue's own handleSwfFile. The server's magic-byte sniff is the real check.
function onSwfFile(e) {
  const file = e.target.files?.[0]
  if (file && !/\.swf$/i.test(file.name)) {
    formError.value = 'Only .swf files allowed.'
    swfFile.value = null
    e.target.value = ''
    return
  }
  swfFile.value = file || null
}

async function save() {
  formError.value = ''
  const title = form.title.trim()
  if (!title) { formError.value = 'Title is required.'; return }
  if (!editId.value && !swfFile.value) { formError.value = 'A .swf file is required.'; return }

  saving.value = true
  try {
    const fd = new FormData()
    fd.append('title', title)
    fd.append('description', form.description.trim())
    fd.append('active', String(form.active))
    fd.append('sortOrder', String(form.sortOrder || 0))
    if (thumbnailFile.value) fd.append('thumbnail', thumbnailFile.value)
    else if (clearThumbnail.value) fd.append('clearThumbnail', 'true')
    if (swfFile.value) fd.append('swf', swfFile.value)

    if (editId.value) {
      await $fetch(`/api/admin/flash-games/${editId.value}`, { method: 'PUT', body: fd })
    } else {
      await $fetch('/api/admin/flash-games', { method: 'POST', body: fd })
    }
    resetForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    saving.value = false
  }
}

async function remove(g) {
  if (!confirm(`Delete "${g.title}"? This cannot be undone.`)) return
  deletingId.value = g.id
  try {
    await $fetch(`/api/admin/flash-games/${g.id}`, { method: 'DELETE' })
    if (editId.value === g.id) resetForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Delete failed'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>
