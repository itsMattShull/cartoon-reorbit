<template>
  <div class="admin-cmoon-fx bg-gray-50 text-xs" style="color-scheme: light;">
    <div class="px-2 py-2 space-y-4">
      <h1 class="text-base font-semibold">Manage cMoon Join Effects</h1>
      <p class="text-gray-600">
        Build custom full-screen effects (background color, an uploaded image that scales up,
        an optional caption) as an alternative to the built-in effects. Assign one to a cMoon
        from the <NuxtLink to="/newsite/admin/cMoon" class="text-indigo-600 hover:underline">cMoons</NuxtLink> page.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="e in effects" :key="e.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
          <div class="w-14 h-14 rounded border flex-shrink-0 flex items-center justify-center overflow-hidden" :style="{ background: e.backgroundColor }">
            <img v-if="e.imagePath" :src="e.imagePath" alt="" class="max-w-full max-h-full object-contain" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold break-words">{{ e.name }}</div>
            <div class="text-[11px] text-gray-600 break-words">{{ e.backgroundColor }}<span v-if="e.text"> · "{{ e.text }}"</span></div>
            <div class="text-[11px] text-gray-600">Used by {{ e.usageCount }} cMoon{{ e.usageCount === 1 ? '' : 's' }}</div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(e)">Edit</button>
            <button
              type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="e.usageCount > 0 || deletingId === e.id"
              :title="e.usageCount > 0 ? 'Reassign every cMoon using this effect first' : ''"
              @click="remove(e)"
            >{{ deletingId === e.id ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
        <p v-if="!loading && !effects.length" class="text-gray-500">No custom join effects yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ editId ? 'Edit join effect' : 'New join effect' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Name</label>
          <input v-model="form.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Frostbite Reveal" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Background color</label>
          <div class="flex items-center gap-2">
            <input v-model="form.backgroundColor" class="w-full min-w-0 border rounded px-2 py-1" placeholder="#3366ff" autocapitalize="none" autocorrect="off" spellcheck="false" />
            <input v-model="backgroundColorPicker" type="color" class="w-11 h-11 flex-shrink-0 border rounded p-0.5" aria-label="Pick background color" />
          </div>
          <p v-if="form.backgroundColor && !isSafeCMoonColor(form.backgroundColor)" class="text-[11px] text-red-600 mt-1">Must be a hex color like #3366ff</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Caption text (optional, {{ form.text.length }}/80)</label>
          <input v-model="form.text" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="Welcome to the crew!" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Caption color</label>
          <div class="flex items-center gap-2">
            <input v-model="form.textColor" class="w-full min-w-0 border rounded px-2 py-1" placeholder="#ffffff" autocapitalize="none" autocorrect="off" spellcheck="false" />
            <input v-model="textColorPicker" type="color" class="w-11 h-11 flex-shrink-0 border rounded p-0.5" aria-label="Pick caption color" />
          </div>
          <p v-if="form.textColor && !isSafeCMoonColor(form.textColor)" class="text-[11px] text-red-600 mt-1">Must be a hex color like #ffffff</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Caption position</label>
          <select v-model="form.textPosition" class="w-full border rounded px-2 py-1">
            <option value="BELOW_IMAGE">Below image</option>
            <option value="ABOVE_IMAGE">Above image</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Image (static or animated GIF)</label>
          <div class="flex items-center gap-4 flex-wrap">
            <div class="w-28 h-28 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0" :style="{ background: isSafeCMoonColor(form.backgroundColor) ? form.backgroundColor : '#f3f4f6' }">
              <img v-if="previewImageSrc" :src="previewImageSrc" alt="" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400">No image</span>
            </div>
            <div class="space-y-2 flex-1 min-w-[200px]">
              <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp,image/gif,.gif" class="block w-full" @change="onFile" />
              <p class="text-[10px] text-gray-500">PNG, JPEG, WEBP, or animated GIF. Max 5MB. Letterboxed, never cropped.</p>
              <p v-if="imageError" class="text-red-600">{{ imageError }}</p>
              <button
                v-if="editId" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                :disabled="!pendingFile || uploadingImage" @click="uploadImage"
              >{{ uploadingImage ? 'Uploading…' : 'Upload image' }}</button>
              <p v-else class="text-[11px] text-gray-500">Save the effect first, then upload its image.</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (editId ? 'Save changes' : 'Create effect') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50 disabled:opacity-50"
            :disabled="fxActive || !isSafeCMoonColor(form.backgroundColor)" @click="preview"
          >{{ fxActive ? 'Playing…' : 'Preview' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { isSafeCMoonColor } from '~/utils/cmoonColor'

const { play: playPreviewEffect, active: fxActive } = useFullscreenEffect()

const effects = ref([])
const loading = ref(false)
const loadError = ref('')

const editId = ref('')
const saving = ref(false)
const formError = ref('')
const deletingId = ref('')

const pendingFile = ref(null)
const pendingFilePreviewUrl = ref(null)
const uploadingImage = ref(false)
const imageError = ref('')
const savedImagePath = ref('')

const emptyForm = () => ({ name: '', backgroundColor: '#3366ff', text: '', textColor: '#ffffff', textPosition: 'BELOW_IMAGE' })
const form = reactive(emptyForm())

const backgroundColorPicker = computed({
  get: () => (isSafeCMoonColor(form.backgroundColor) ? form.backgroundColor : '#3366ff'),
  set: (v) => { form.backgroundColor = v },
})
const textColorPicker = computed({
  get: () => (isSafeCMoonColor(form.textColor) ? form.textColor : '#ffffff'),
  set: (v) => { form.textColor = v },
})

// A newly-picked (not yet uploaded) file previews via its own local blob URL so admins can
// preview/tweak before ever hitting the server; once saved, the real uploaded path takes over.
const previewImageSrc = computed(() => pendingFilePreviewUrl.value || savedImagePath.value || '')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-join-effects')
    effects.value = res?.effects || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load join effects'
  } finally {
    loading.value = false
  }
}

function clearPendingFile() {
  if (pendingFilePreviewUrl.value) { try { URL.revokeObjectURL(pendingFilePreviewUrl.value) } catch {} }
  pendingFile.value = null
  pendingFilePreviewUrl.value = null
}

function resetForm() {
  editId.value = ''
  formError.value = ''
  imageError.value = ''
  clearPendingFile()
  savedImagePath.value = ''
  Object.assign(form, emptyForm())
}

function startEdit(e) {
  editId.value = e.id
  formError.value = ''
  imageError.value = ''
  clearPendingFile()
  savedImagePath.value = e.imagePath || ''
  Object.assign(form, {
    name: e.name,
    backgroundColor: e.backgroundColor,
    text: e.text || '',
    textColor: e.textColor,
    textPosition: e.textPosition,
  })
}

function onFile(ev) {
  imageError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(f.type)) {
    imageError.value = 'PNG, JPEG, WEBP, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    imageError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearPendingFile()
  pendingFile.value = f
  pendingFilePreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadImage() {
  if (!pendingFile.value || !editId.value) return
  uploadingImage.value = true
  imageError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', pendingFile.value)
    const res = await $fetch(`/api/admin/cmoon-join-effects/${editId.value}/image`, { method: 'POST', body: fd })
    savedImagePath.value = res.imagePath || savedImagePath.value
    clearPendingFile()
    await load()
  } catch (e) {
    imageError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    uploadingImage.value = false
  }
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Name is required.'; return }
  if (!isSafeCMoonColor(form.backgroundColor)) { formError.value = 'Background color must be a hex value like #3366ff'; return }
  if (!isSafeCMoonColor(form.textColor)) { formError.value = 'Caption color must be a hex value like #ffffff'; return }

  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      backgroundColor: form.backgroundColor,
      text: form.text.trim() || null,
      textColor: form.textColor,
      textPosition: form.textPosition,
    }
    if (editId.value) {
      await $fetch(`/api/admin/cmoon-join-effects/${editId.value}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/cmoon-join-effects', { method: 'POST', body })
      editId.value = res.id
    }
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save join effect'
  } finally {
    saving.value = false
  }
}

async function remove(e) {
  if (e.usageCount > 0) return
  if (!confirm(`Delete "${e.name}"? This can't be undone.`)) return
  deletingId.value = e.id
  try {
    await $fetch(`/api/admin/cmoon-join-effects/${e.id}`, { method: 'DELETE' })
    if (editId.value === e.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete join effect'
  } finally {
    deletingId.value = ''
  }
}

function preview() {
  if (!isSafeCMoonColor(form.backgroundColor)) return
  playPreviewEffect({
    type: 'CUSTOM',
    config: {
      backgroundColor: form.backgroundColor,
      imagePath: previewImageSrc.value || null,
      text: form.text.trim() || null,
      textColor: isSafeCMoonColor(form.textColor) ? form.textColor : '#ffffff',
      textPosition: form.textPosition,
    },
  })
}

onMounted(load)
onBeforeUnmount(clearPendingFile)
</script>
