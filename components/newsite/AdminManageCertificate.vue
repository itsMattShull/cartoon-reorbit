<template>
  <div class="admin-manage-certificate bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">

      <h1 class="text-base font-semibold">Manage Certificate</h1>

      <p class="text-gray-500">
        Logo shown at the bottom of the player membership certificate (Settings &gt; Generate
        Certificate). A plain file committed to the repo under <code>public/</code> does not
        reach the live site — <code>/images/*</code> is served from a separate directory that
        only admin uploads (like this one) write to — so this is the only way to change it.
      </p>

      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Certificate Logo</h2>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="w-64 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
            <img v-if="previewUrl || logoPath" :src="previewUrl || logoPath" alt="Certificate logo preview" class="max-h-full max-w-full object-contain" />
            <span v-else class="text-gray-400">No image</span>
          </div>
          <div class="space-y-2 flex-1 min-w-[220px]">
            <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp"
              class="block w-full text-xs" @change="onFile" />
            <p class="text-[10px] text-gray-500">PNG, JPG, or WEBP. Max 5MB.</p>
            <div v-if="file" class="text-gray-600 truncate">Selected: {{ file.name }}</div>
            <p v-if="error" class="text-red-600">{{ error }}</p>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="!file || uploading" @click="upload">
              <span v-if="!uploading">Upload</span><span v-else>Uploading…</span>
            </button>
            <span v-if="toast" class="ml-2" :class="toast.type === 'error' ? 'text-red-600' : 'text-green-700'">{{ toast.msg }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const logoPath = ref('')
const file = ref(null)
const previewUrl = ref(null)
const error = ref('')
const uploading = ref(false)
const toast = ref(null)

function onFile(e) {
  error.value = ''
  const f = e.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type)) {
    error.value = 'PNG, JPG, or WEBP only.'
    e.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    error.value = 'Image must be 5MB or smaller.'
    e.target.value = ''
    return
  }
  try { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value) } catch {}
  file.value = f
  previewUrl.value = f ? URL.createObjectURL(f) : null
}

async function upload() {
  if (!file.value) return
  uploading.value = true
  error.value = ''
  toast.value = null
  try {
    const fd = new FormData()
    fd.append('image', file.value)
    const res = await $fetch('/api/admin/global-config/certificate-logo', { method: 'POST', body: fd })
    logoPath.value = res.certificateLogoPath || logoPath.value
    try { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value) } catch {}
    previewUrl.value = null
    file.value = null
    toast.value = { type: 'ok', msg: 'Certificate logo saved.' }
  } catch (err) {
    error.value = err?.data?.statusMessage || 'Upload failed.'
  } finally {
    uploading.value = false
    setTimeout(() => { toast.value = null }, 3000)
  }
}

async function loadConfig() {
  try {
    const cfg = await $fetch('/api/admin/global-config')
    logoPath.value = cfg?.certificateLogoPath || '/images/logo-reorbit.png'
  } catch {
    logoPath.value = '/images/logo-reorbit.png'
  }
}

onMounted(loadConfig)

onBeforeUnmount(() => {
  if (previewUrl.value) { try { URL.revokeObjectURL(previewUrl.value) } catch {} }
})
</script>
