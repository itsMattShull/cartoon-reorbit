<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto bg-white rounded-lg shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-semibold">Ad Images</h1>
        <button
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          @click="openUpload"
        >
          Upload
        </button>
      </div>

      <div v-if="error" class="text-red-600 mb-4">{{ error.message }}</div>
      <div v-if="pending" class="text-gray-500">Loading…</div>

      <div v-if="images?.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="img in images"
          :key="img.id"
          class="border rounded-lg overflow-hidden flex flex-col"
        >
          <div class="aspect-video bg-gray-100 flex items-center justify-center">
            <img :src="img.imagePath" alt="" class="max-h-full max-w-full object-contain" />
          </div>
          <div class="p-3 text-sm flex-1">
            <p class="break-words"><strong>Path:</strong> {{ img.imagePath }}</p>
            <p class="text-gray-500 mt-1">
              {{ new Date(img.createdAt).toLocaleString() }}
            </p>
            <p v-if="img.label" class="mt-1"><strong>Label:</strong> {{ img.label }}</p>
          </div>
          <div class="p-3 pt-0 flex justify-end gap-2">
            <button
              class="text-red-700 hover:text-red-900"
              @click="del(img.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      <div v-else class="text-gray-500">No images.</div>
    </div>

    <!-- Upload Modal -->
    <div v-if="showUpload" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeUpload"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between">
          <h2 class="text-lg font-semibold">Upload Ad Image</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="closeUpload">Close</button>
        </div>

        <div class="p-4 overflow-y-auto">
          <div class="space-y-4">
            <div>
              <label class="block mb-1 font-medium">Select Image</label>
              <input ref="fileInput" type="file" accept="image/*" class="w-full" />
              <p class="text-xs text-gray-500 mt-1">PNG, JPG, GIF, WEBP, or SVG</p>
            </div>
            <div>
              <label class="block mb-1 font-medium">Label (optional)</label>
              <input v-model="label" type="text" class="w-full border rounded px-3 py-2" />
            </div>
            <div v-if="uploadError" class="text-red-600 text-sm">{{ uploadError }}</div>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-2">
          <button class="px-4 py-2 rounded border" @click="closeUpload">Close</button>
          <button
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth','admin'],
  layout: 'default'
})

const showUpload = ref(false)
const fileInput = ref(null)
const label = ref('')
const uploadError = ref('')
const uploading = ref(false)

const { data: images, pending, error, refresh } = await useFetch('/api/admin/ad-images')

function openUpload() {
  uploadError.value = ''
  label.value = ''
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
    await $fetch('/api/admin/ad-images', { method: 'POST', body: fd })
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
    await $fetch(`/api/admin/ad-images/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    alert(e?.data?.message || e?.message || 'Delete failed')
  }
}
</script>
