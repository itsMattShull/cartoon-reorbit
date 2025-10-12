<template>
  <Nav />
  <div class="p-6 space-y-8 mt-16 md:mt-20 max-w-6xl mx-auto">
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
            <p class="text-xs text-gray-500">Exactly <strong>510×344</strong> or <strong>512×346</strong> or <strong>800x600</strong> px.</p>
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

      <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div v-for="bg in backgrounds" :key="bg.id" class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
          <img :src="bg.imagePath" :alt="bg.label || 'Background'" class="w-full h-44 object-cover" />
          <div class="p-4 space-y-1 text-sm">
            <div class="font-medium truncate">{{ bg.label || '—' }}</div>
            <div class="text-gray-600">{{ bg.width }}×{{ bg.height }} • {{ shortMime(bg.mimeType) }}</div>
            <div class="text-gray-600">Visibility: <span class="font-medium">{{ fromEnum(bg.visibility) }}</span></div>
            <div class="text-gray-500">Added: {{ formatDate(bg.createdAt) }}</div>
          </div>
          <!-- <div class="px-4 pb-4">
            <button @click="remove(bg)" class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
              Delete
            </button>
          </div> -->
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })
import { ref } from 'vue'

const label = ref('')
const visibility = ref('public') // 'public' | 'code-only'
const imageFile = ref(null)
const imagePreview = ref('')
const uploading = ref(false)
const fileInput = ref(null)

function shortMime(m) { return (m||'').replace('image/','').toUpperCase() }
function fromEnum(v) { return v === 'CODE_ONLY' ? 'Code only' : 'Public' }
function formatDate(d) { return new Date(d).toLocaleString() }

function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  if (!['image/png','image/gif','image/jpeg'].includes(file.type)) {
    alert('Only PNG, GIF, or JPEG allowed.')
    fileInput.value.value = ''
    return
  }
  // Client‑side size check (extra safety; server also validates)
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const ok = (img.width === 510 && img.height === 344) || (img.width === 512 && img.height === 346) || (img.width === 800 && img.height === 600)
    if (!ok) {
      alert('Image must be exactly 510×344 or 512×346 or 800x600 px.')
      fileInput.value.value = ''
      URL.revokeObjectURL(url)
      imageFile.value = null
      imagePreview.value = ''
      return
    }
    imageFile.value = file
    imagePreview.value = url
  }
  img.src = url
}

const { data: backgrounds, pending, error } = await useFetch('/api/admin/backgrounds', {
  key: 'backgrounds', credentials: 'include'
})

async function submit() {
  if (!imageFile.value) return
  uploading.value = true
  const form = new FormData()
  form.append('label', label.value)
  form.append('visibility', visibility.value)
  form.append('image', imageFile.value)
  try {
    await $fetch('/api/admin/backgrounds', { method: 'POST', body: form })
    // reset
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

async function remove(bg) {
  if (!confirm('Delete this background? This cannot be undone.')) return
  try {
    await $fetch(`/api/admin/backgrounds/${bg.id}`, { method: 'DELETE' })
    await refreshNuxtData('backgrounds')
  } catch (err) {
    console.error(err)
    alert(err?.data?.statusMessage || 'Failed to delete background')
  }
}
</script>