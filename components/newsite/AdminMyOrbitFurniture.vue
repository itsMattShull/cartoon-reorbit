<template>
  <div class="admin-myorbit-furniture bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">MyOrbit Furniture</h1>
      </div>
      <p class="text-gray-500">
        Reusable furniture/decoration art for MyOrbit's room builder. Footprint is in whole tiles
        (unrotated — a 2x1 bench turned sideways in the room builder blocks what it visually
        occupies, width/height swapped). "Blocks walk" can only ADD a block on top of the
        underlying tile's own walkable flag — it can never make an unwalkable tile walkable.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── List ───────────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Furniture</h2>
        <div v-if="furniture.length" class="space-y-1">
          <button
            v-for="f in furniture" :key="f.id" type="button"
            class="w-full text-left flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1 hover:bg-gray-100"
            :class="selectedId === f.id ? 'ring-2 ring-blue-500' : ''"
            @click="selectFurniture(f)"
          >
            <img :src="f.assetPath" alt="" class="w-8 h-8 object-contain flex-shrink-0 bg-gray-100 rounded" />
            <span class="flex-1 min-w-0 break-words font-semibold">{{ f.name }}</span>
            <span class="text-gray-500 flex-shrink-0">{{ f.footprintW }}x{{ f.footprintH }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0" :class="f.blocksWalk ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'">
              {{ f.blocksWalk ? 'Blocks walk' : 'Walk-through' }}
            </span>
            <span class="text-gray-500 flex-shrink-0">{{ f.placementCount }} placement(s)</span>
          </button>
        </div>
        <p v-else class="text-gray-500">No furniture yet.</p>
      </div>

      <!-- ── Selected furniture editor ──────────────────────────────── -->
      <div v-if="form" class="bg-white border rounded p-3 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">{{ selectedId ? 'Edit furniture' : 'New furniture' }}</h2>
          <button
            v-if="selectedId" type="button"
            class="text-red-600 hover:underline text-[11px]" :disabled="deleting" @click="deleteFurniture"
          >{{ deleting ? 'Deleting…' : 'Delete furniture' }}</button>
        </div>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-48">
            <label class="block text-[11px] font-medium mb-1">Name</label>
            <input v-model="form.name" maxlength="80" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-24">
            <label class="block text-[11px] font-medium mb-1">Footprint W (1-10)</label>
            <input v-model.number="form.footprintW" type="number" min="1" max="10" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-24">
            <label class="block text-[11px] font-medium mb-1">Footprint H (1-10)</label>
            <input v-model.number="form.footprintH" type="number" min="1" max="10" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-28">
            <label class="block text-[11px] font-medium mb-1">Z-offset</label>
            <input v-model.number="form.zOffset" type="number" min="-999" max="999" class="w-full border rounded px-2 py-1" />
          </div>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.blocksWalk" />
            <span class="text-[11px] font-medium">Blocks walk</span>
          </label>
        </div>
        <p class="text-[11px] text-gray-500">
          Z-offset nudges this item's rendered stacking order within its own tile's depth band
          (floor &lt; furniture &lt; avatars) — for tall items that should render in front of or
          behind an avatar standing one row off. Purely cosmetic, never affects pathfinding.
        </p>

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
            :disabled="saving" @click="saveFurniture"
          >{{ saving ? 'Saving…' : (selectedId ? 'Save changes' : 'Create furniture') }}</button>
          <button
            v-if="selectedId" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50"
            @click="cancelEdit"
          >Cancel</button>
        </div>
      </div>

      <button
        v-else type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
        @click="newFurniture"
      >+ New furniture</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount, onMounted } from 'vue'

const furniture = ref([])
const loadError = ref('')
const selectedId = ref(null)
const form = ref(null)
const saving = ref(false)
const deleting = ref(false)
const formError = ref('')

const pendingFile = ref(null)
const previewUrl = ref(null)

function emptyForm() {
  return { name: '', footprintW: 1, footprintH: 1, blocksWalk: true, zOffset: 0, assetPath: '' }
}

function clearPendingFile() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  pendingFile.value = null
  previewUrl.value = null
}

async function loadFurniture() {
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/myorbit-furniture')
    furniture.value = res?.furniture || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load furniture'
  }
}

function selectFurniture(f) {
  selectedId.value = f.id
  formError.value = ''
  clearPendingFile()
  form.value = { ...emptyForm(), ...f }
}

function newFurniture() {
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

async function saveFurniture() {
  formError.value = ''
  if (!selectedId.value && !pendingFile.value) {
    formError.value = 'An image is required for new furniture.'
    return
  }
  saving.value = true
  try {
    const fd = new FormData()
    fd.append('name', form.value.name)
    fd.append('footprintW', String(form.value.footprintW))
    fd.append('footprintH', String(form.value.footprintH))
    fd.append('blocksWalk', String(form.value.blocksWalk))
    fd.append('zOffset', String(form.value.zOffset))
    if (pendingFile.value) fd.append('image', pendingFile.value)

    if (selectedId.value) {
      await $fetch(`/api/admin/myorbit-furniture/${selectedId.value}`, { method: 'PUT', body: fd })
    } else {
      await $fetch('/api/admin/myorbit-furniture', { method: 'POST', body: fd })
    }
    await loadFurniture()
    cancelEdit()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save furniture'
  } finally {
    saving.value = false
  }
}

async function deleteFurniture() {
  if (!selectedId.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/myorbit-furniture/${selectedId.value}`, { method: 'DELETE' })
    await loadFurniture()
    cancelEdit()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to delete furniture'
  } finally {
    deleting.value = false
  }
}

onMounted(loadFurniture)
onBeforeUnmount(clearPendingFile)
</script>
