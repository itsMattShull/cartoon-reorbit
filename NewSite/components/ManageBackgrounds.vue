<template>
  <div class="mb">

    <!-- Hidden file picker -->
    <input
      ref="fileInputEl"
      type="file"
      accept=".png,.jpg,.jpeg,.gif"
      multiple
      style="display:none"
      @change="onFilesSelected"
    />

    <div class="mb-layout">

      <!-- ── Left column: image list ─────────────────────────────── -->
      <div class="mb-col">
        <div class="mb-col-actions">
          <GreenButton @click="openUploadPicker">Upload Background</GreenButton>
          <RedButton :disabled="!selectedId" @click="deleteSelected">Delete</RedButton>
        </div>

        <div class="mb-scroll">
          <div v-if="loading" class="mb-empty">Loading…</div>
          <div v-else-if="!backgrounds.length" class="mb-empty">No backgrounds uploaded.</div>
          <img
            v-for="bg in backgrounds"
            v-else
            :key="bg.id"
            :src="`/api/czone-bg/${bg.filename}`"
            :alt="bg.filename"
            class="mb-thumb"
            :class="{ 'mb-thumb-selected': selectedId === bg.id }"
            @click="selectedId = bg.id === selectedId ? null : bg.id"
          />
        </div>
      </div>

      <!-- ── Right area: reserved for future content ──────────── -->
      <div class="mb-right"></div>

    </div>

    <!-- ── Upload progress toast ──────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="uploadStatus" class="mb-toast" :class="uploadStatus.type">
        {{ uploadStatus.message }}
      </div>
    </Teleport>

  </div>
</template>

<script setup>
const fileInputEl  = ref(null)
const backgrounds  = ref([])
const loading      = ref(false)
const selectedId   = ref(null)
const uploadStatus = ref(null)

onMounted(loadBackgrounds)

async function loadBackgrounds() {
  loading.value = true
  try {
    backgrounds.value = await $fetch('/api/admin/backgrounds')
  } catch (e) {
    console.error('ManageBackgrounds: load failed', e)
  } finally {
    loading.value = false
  }
}

function openUploadPicker() {
  if (fileInputEl.value) {
    fileInputEl.value.value = ''
    fileInputEl.value.click()
  }
}

async function onFilesSelected(e) {
  const files = Array.from(e.target.files)
  if (!files.length) return

  showToast('Uploading…', 'info')
  let succeeded = 0
  let failed = 0

  for (const file of files) {
    const fd = new FormData()
    fd.append('image', file, file.name)
    try {
      await $fetch('/api/admin/backgrounds', { method: 'POST', body: fd })
      succeeded++
    } catch {
      failed++
    }
  }

  if (failed > 0) {
    showToast(`${succeeded} uploaded, ${failed} failed`, 'error')
  } else {
    showToast(`${succeeded} background${succeeded !== 1 ? 's' : ''} uploaded`, 'success')
  }

  await loadBackgrounds()
}

async function deleteSelected() {
  if (!selectedId.value) return
  try {
    await $fetch(`/api/admin/backgrounds/${selectedId.value}`, { method: 'DELETE' })
    selectedId.value = null
    await loadBackgrounds()
    showToast('Background deleted', 'success')
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Delete failed', 'error')
  }
}

function showToast(message, type = 'info') {
  uploadStatus.value = { message, type }
  setTimeout(() => { uploadStatus.value = null }, 3000)
}
</script>

<style scoped>
.mb {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mb-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

/* ── Left column ── */
.mb-col {
  display: flex;
  flex-direction: column;
  width: 25%;
  min-width: 120px;
  flex-shrink: 0;
  gap: 6px;
  overflow: hidden;
}

.mb-col-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.mb-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mb-thumb {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
}

.mb-thumb:hover { border-color: rgba(255,165,0,0.5); }
.mb-thumb-selected { border-color: #f47b00 !important; }

.mb-empty {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.45);
  font-style: italic;
  padding: 6px 0;
}

/* ── Right area ── */
.mb-right {
  flex: 1;
  overflow: hidden;
}
</style>

<style>
.mb-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: bold;
  z-index: 9999;
  pointer-events: none;
}
.mb-toast.info    { background: #1a3a58; color: #fff; }
.mb-toast.success { background: #2e7d32; color: #fff; }
.mb-toast.error   { background: #b03a2e; color: #fff; }
</style>
