<template>
  <div class="admin-myorbit-tiles bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">MyOrbit Tiles</h1>
      </div>
      <p class="text-gray-500">
        Reusable floor/wall art for MyOrbit's room builder — each tile is painted into any number
        of rooms. "Walkable" is the base passability for any cell using this tile; a furniture
        piece placed on top of it can still block movement even over a walkable tile.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── List ───────────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Tiles</h2>
        <div v-if="tiles.length" class="space-y-1">
          <button
            v-for="t in tiles" :key="t.id" type="button"
            class="w-full text-left flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1 hover:bg-gray-100"
            :class="selectedId === t.id ? 'ring-2 ring-blue-500' : ''"
            @click="selectTile(t)"
          >
            <img :src="t.assetPath" alt="" class="w-8 h-8 object-contain flex-shrink-0 bg-gray-100 rounded" />
            <span class="flex-1 min-w-0 break-words font-semibold">{{ t.name }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0" :class="t.walkable ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'">
              {{ t.walkable ? 'Walkable' : 'Blocked' }}
            </span>
            <span class="text-gray-500 flex-shrink-0">{{ t.placementCount }} placement(s)</span>
          </button>
        </div>
        <p v-else class="text-gray-500">No tiles yet.</p>
      </div>

      <!-- ── Selected tile editor ───────────────────────────────────── -->
      <div v-if="form" class="bg-white border rounded p-3 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">{{ selectedId ? 'Edit tile' : 'New tile' }}</h2>
          <button
            v-if="selectedId" type="button"
            class="text-red-600 hover:underline text-[11px]" :disabled="deleting" @click="deleteTile"
          >{{ deleting ? 'Deleting…' : 'Delete tile' }}</button>
        </div>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-48">
            <label class="block text-[11px] font-medium mb-1">Name</label>
            <input v-model="form.name" maxlength="80" class="w-full border rounded px-2 py-1" />
          </div>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.walkable" />
            <span class="text-[11px] font-medium">Walkable</span>
          </label>
        </div>

        <div class="flex gap-3 items-start">
          <div>
            <label class="block text-[11px] font-medium mb-1">Art</label>
            <img v-if="previewUrl || form.assetPath" :src="previewUrl || form.assetPath" alt="" class="w-20 h-20 object-contain bg-gray-100 rounded border" />
          </div>
          <div>
            <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp,image/gif,.gif" class="block" @change="onFile" />
            <p class="text-[11px] text-gray-500 mt-1">PNG, JPEG, WebP, or GIF — 5MB max. {{ selectedId ? 'Leave empty to keep the current art.' : 'Required.' }}</p>
          </div>
        </div>

        <div class="flex gap-2">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="saveTile"
          >{{ saving ? 'Saving…' : (selectedId ? 'Save changes' : 'Create tile') }}</button>
          <button
            v-if="selectedId" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50"
            @click="cancelEdit"
          >Cancel</button>
        </div>
      </div>

      <button
        v-else type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
        @click="newTile"
      >+ New tile</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount, onMounted } from 'vue'

const tiles = ref([])
const loadError = ref('')
const selectedId = ref(null)
const form = ref(null)
const saving = ref(false)
const deleting = ref(false)
const formError = ref('')

const pendingFile = ref(null)
const previewUrl = ref(null)

function emptyForm() {
  return { name: '', walkable: true, assetPath: '' }
}

function clearPendingFile() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  pendingFile.value = null
  previewUrl.value = null
}

async function loadTiles() {
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/myorbit-tiles')
    tiles.value = res?.tiles || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load tiles'
  }
}

function selectTile(t) {
  selectedId.value = t.id
  formError.value = ''
  clearPendingFile()
  form.value = { ...emptyForm(), ...t }
}

function newTile() {
  selectedId.value = null
  formError.value = ''
  clearPendingFile()
  form.value = emptyForm()
}

function cancelEdit() {
  selectedId.value = null
  form.value = null
  clearPendingFile()
}

function onFile(ev) {
  formError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(f.type)) {
    formError.value = 'PNG, JPEG, WEBP, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    formError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearPendingFile()
  pendingFile.value = f
  previewUrl.value = f ? URL.createObjectURL(f) : null
}

async function saveTile() {
  formError.value = ''
  if (!selectedId.value && !pendingFile.value) {
    formError.value = 'An image is required for a new tile.'
    return
  }
  saving.value = true
  try {
    const fd = new FormData()
    fd.append('name', form.value.name)
    fd.append('walkable', String(form.value.walkable))
    if (pendingFile.value) fd.append('image', pendingFile.value)

    if (selectedId.value) {
      await $fetch(`/api/admin/myorbit-tiles/${selectedId.value}`, { method: 'PUT', body: fd })
    } else {
      await $fetch('/api/admin/myorbit-tiles', { method: 'POST', body: fd })
    }
    await loadTiles()
    cancelEdit()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save tile'
  } finally {
    saving.value = false
  }
}

async function deleteTile() {
  if (!selectedId.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/myorbit-tiles/${selectedId.value}`, { method: 'DELETE' })
    await loadTiles()
    cancelEdit()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to delete tile'
  } finally {
    deleting.value = false
  }
}

onMounted(loadTiles)
onBeforeUnmount(clearPendingFile)
</script>
