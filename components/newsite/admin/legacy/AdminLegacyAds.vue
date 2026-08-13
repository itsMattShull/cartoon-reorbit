<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

    <div class="bg-white rounded border p-3">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h1 class="text-base font-semibold">Ad Images</h1>
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          @click="openUpload"
        >
          Upload
        </button>
      </div>

      <div v-if="error" class="text-red-600 mb-3">{{ error.message }}</div>
      <div v-if="pending" class="text-gray-500 py-6 text-center">Loading…</div>

      <div v-if="images?.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <div
          v-for="img in images"
          :key="img.id"
          class="bg-white border rounded-lg shadow overflow-hidden flex flex-col"
        >
          <div class="aspect-video bg-gray-100 flex items-center justify-center">
            <img :src="img.imagePath" alt="" class="max-h-full max-w-full object-contain" />
          </div>
          <div class="p-2 text-[11px] flex-1">
            <p class="break-words"><span class="text-gray-500">Path:</span> {{ img.imagePath }}</p>
            <p class="text-gray-500 mt-0.5">
              {{ new Date(img.createdAt).toLocaleString() }}
            </p>
            <p v-if="img.label" class="mt-0.5"><span class="text-gray-500">Label:</span> {{ img.label }}</p>
            <p v-if="img.url" class="mt-0.5 break-words">
              <span class="text-gray-500">URL:</span>
              <a :href="img.url" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">
                {{ img.url }}
              </a>
            </p>
            <p v-else class="mt-0.5 text-gray-500"><span class="text-gray-500">URL:</span> /newsite/home (default)</p>
          </div>
          <div class="p-2 pt-0 flex justify-end gap-2">
            <button
              class="px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50"
              @click="del(img.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      <div v-else class="text-gray-500 py-6 text-center">No images.</div>
    </div>
    </div>

    <!-- Upload Modal -->
    <div v-if="showUpload" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="closeUpload"></div>
      <div class="relative bg-white w-full max-w-lg rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h2 class="text-sm font-semibold">Upload Ad Image</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeUpload">Close</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3">
          <div class="space-y-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Select Image</label>
              <input ref="fileInput" type="file" accept="image/*" class="text-xs" />
              <p class="text-[10px] text-gray-500">PNG, JPG, GIF, WEBP, or SVG</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Label (optional)</label>
              <input v-model="label" type="text" class="border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">URL (optional)</label>
              <input
                v-model="linkUrl"
                type="url"
                placeholder="https://example.com"
                class="border rounded-md px-2 py-1.5 text-sm"
              />
              <p class="text-[10px] text-gray-500">Leave blank to link to /newsite/home</p>
            </div>
            <div v-if="uploadError" class="text-red-600 text-[11px]">{{ uploadError }}</div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closeUpload">Close</button>
          <button
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="uploading"
            @click="upload"
          >
            <span v-if="!uploading">Upload</span>
            <span v-else>Uploading…</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useFetch } from '#app'

const showUpload = ref(false)
const fileInput = ref(null)
const label = ref('')
const linkUrl = ref('')
const uploadError = ref('')
const uploading = ref(false)

const { data: images, pending, error, refresh } = await useFetch('/api/admin/promo-images')

function openUpload() {
  uploadError.value = ''
  label.value = ''
  linkUrl.value = ''
  showUpload.value = true
}
function closeUpload() {
  showUpload.value = false
}

async function upload() {
  uploadError.value = ''
  const file = fileInput.value?.files?.[0]
  if (!file) {
    uploadError.value = 'Select a file'
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('image', file)
    if (label.value) fd.append('label', label.value)
    if (linkUrl.value?.trim()) fd.append('url', linkUrl.value.trim())
    await $fetch('/api/admin/promo-images', { method: 'POST', body: fd })
    await refresh()
    showUpload.value = false
  } catch (e) {
    uploadError.value = e?.data?.message || e?.message || 'Upload failed'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function del(id) {
  if (!confirm('Delete this image?')) return
  try {
    await $fetch(`/api/admin/promo-images/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    alert(e?.data?.message || e?.message || 'Delete failed')
  }
}
</script>
