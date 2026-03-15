<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Homepage & Showcase</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
      <!-- Tabs -->
      <div class="border-b mb-6">
        <nav class="flex gap-4">
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Homepage' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Homepage'">Homepage</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Showcase' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Showcase'">Showcase</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Release Settings' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Release Settings'">Release Settings</button>
          
        </nav>
      </div>

      <!-- Homepage tab -->
      <section v-if="activeTab==='Homepage'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Upload SVG/PNG/JPEG/GIF/MP4. Files are stored on the server and paths saved in the database.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <!-- Top Left -->
          <div class="space-y-3">
            <h2 class="font-semibold">Top Left</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.topLeft && files.topLeft.type && files.topLeft.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.topLeft || '')"
                :src="previewUrls.topLeft || paths.topLeft" :poster="(previewUrls.topLeft && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.topLeft)) ? previewUrls.topLeft : (/\.(png|jpe?g|gif|svg)$/i.test(paths.topLeft||'') ? paths.topLeft : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.topLeft || paths.topLeft" :src="previewUrls.topLeft || paths.topLeft" alt="Top Left" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('topLeft', $event)" class="block w-full text-sm" />
            <div v-if="files.topLeft" class="text-xs text-gray-600 truncate">Selected: {{ files.topLeft.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.topLeft" @click="clearPath('topLeft')">Clear</button>
          </div>

          <!-- Top Right -->
          <div class="space-y-3">
            <h2 class="font-semibold">Top Right</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.topRight && files.topRight.type && files.topRight.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.topRight || '')"
                :src="previewUrls.topRight || paths.topRight" :poster="(previewUrls.topRight && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.topRight)) ? previewUrls.topRight : (/\.(png|jpe?g|gif|svg)$/i.test(paths.topRight||'') ? paths.topRight : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.topRight || paths.topRight" :src="previewUrls.topRight || paths.topRight" alt="Top Right" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('topRight', $event)" class="block w-full text-sm" />
            <div v-if="files.topRight" class="text-xs text-gray-600 truncate">Selected: {{ files.topRight.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.topRight" @click="clearPath('topRight')">Clear</button>
          </div>

          <!-- Bottom Left -->
          <div class="space-y-3">
            <h2 class="font-semibold">Bottom Left</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.bottomLeft && files.bottomLeft.type && files.bottomLeft.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.bottomLeft || '')"
                :src="previewUrls.bottomLeft || paths.bottomLeft" :poster="(previewUrls.bottomLeft && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.bottomLeft)) ? previewUrls.bottomLeft : (/\.(png|jpe?g|gif|svg)$/i.test(paths.bottomLeft||'') ? paths.bottomLeft : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.bottomLeft || paths.bottomLeft" :src="previewUrls.bottomLeft || paths.bottomLeft" alt="Bottom Left" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('bottomLeft', $event)" class="block w-full text-sm" />
            <div v-if="files.bottomLeft" class="text-xs text-gray-600 truncate">Selected: {{ files.bottomLeft.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.bottomLeft" @click="clearPath('bottomLeft')">Clear</button>
          </div>

          <!-- Bottom Right -->
          <div class="space-y-3">
            <h2 class="font-semibold">Bottom Right</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.bottomRight && files.bottomRight.type && files.bottomRight.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.bottomRight || '')"
                :src="previewUrls.bottomRight || paths.bottomRight" :poster="(previewUrls.bottomRight && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.bottomRight)) ? previewUrls.bottomRight : (/\.(png|jpe?g|gif|svg)$/i.test(paths.bottomRight||'') ? paths.bottomRight : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.bottomRight || paths.bottomRight" :src="previewUrls.bottomRight || paths.bottomRight" alt="Bottom Right" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('bottomRight', $event)" class="block w-full text-sm" />
            <div v-if="files.bottomRight" class="text-xs text-gray-600 truncate">Selected: {{ files.bottomRight.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.bottomRight" @click="clearPath('bottomRight')">Clear</button>
          </div>
        </div>

        <div class="mt-2">
          <button class="btn-primary" :disabled="saving" @click="saveAll">
            <span v-if="!saving">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Showcase tab -->
      <section v-if="activeTab==='Showcase'" class="space-y-4">
        <p class="text-sm text-gray-600">
          Upload a single Showcase image or video. SVG/PNG/JPEG/GIF/MP4.
        </p>
        <div class="space-y-3">
          <h2 class="font-semibold">Showcase Image</h2>
          <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
                     <video v-if="(showcaseFile && showcaseFile.type && showcaseFile.type.startsWith('video/')) || /\.mp4($|\?)/i.test(showcasePath || '')"
                       :src="previewUrls.showcase || showcasePath"
                       :poster="(previewUrls.showcase && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.showcase)) ? previewUrls.showcase : (showcasePosterPath || (/\.(png|jpe?g|gif|svg)$/i.test(showcasePath||'') ? showcasePath : ''))"
                       controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
            <img v-else-if="previewUrls.showcase || showcasePath" :src="previewUrls.showcase || showcasePath" alt="Showcase" class="max-h-full max-w-full" />
            <span v-else class="text-gray-400 text-sm">No image</span>
          </div>
             <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
               @change="onShowcaseFile($event)" class="block w-full text-sm" />
          <div v-if="showcaseFile" class="text-xs text-gray-600 truncate">Selected: {{ showcaseFile.name }}</div>
          <div class="flex gap-3">
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="showcasePath" @click="clearShowcase()">Clear</button>
            <button class="btn-primary" :disabled="saving" @click="saveShowcase">
              <span v-if="!saving">Save</span><span v-else>Saving…</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Release Settings tab -->
      <section v-if="activeTab==='Release Settings'" class="space-y-6 max-w-md">
        <p class="text-sm text-gray-600">Configure staged release defaults for all cToons.</p>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Initial Release %</label>
          <input type="number" v-model.number="releasePercent" min="0" max="100" class="w-full border rounded p-2" />
          <p class="text-xs text-gray-500">Percent of total released at the initial time (min 1 unit enforced at runtime).</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Delay (hours) to Final Release</label>
          <input type="number" v-model.number="delayHours" min="1" max="72" class="w-full border rounded p-2" />
          <p class="text-xs text-gray-500">Hours after initial release when the remaining quantity is released.</p>
        </div>
        <div>
          <button class="btn-primary" :disabled="saving" @click="saveReleaseSettings">
            <span v-if="!saving">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      

      <div v-if="toast" :class="['fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded',
                                 toast.type==='error'?'bg-red-100 text-red-700':'bg-green-100 text-green-700']">
        {{ toast.msg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - Manage Homepage', middleware: ['auth','admin'], layout: 'default' })

const activeTab = ref('Homepage')

const paths = ref({ topLeft:'', bottomLeft:'', topRight:'', bottomRight:'' })
const files = ref({ topLeft:null, bottomLeft:null, topRight:null, bottomRight:null })
const previewUrls = ref({ topLeft:null, bottomLeft:null, topRight:null, bottomRight:null, showcase:null })

const showcasePath = ref('')
const showcaseFile = ref(null)
const showcasePosterPath = ref('')

const saving = ref(false)
const toast  = ref(null)

// Release settings state
const releasePercent = ref(75)
const delayHours = ref(12)


function onFile(key, e) {
  const f = e.target.files?.[0] || null
  // revoke previous preview if present
  try { if (previewUrls.value[key]) { URL.revokeObjectURL(previewUrls.value[key]); previewUrls.value[key] = null } } catch (e) {}
  files.value[key] = f
  if (f) previewUrls.value[key] = URL.createObjectURL(f)
}

function clearPath(key) {
  paths.value[key] = ''
  if (previewUrls.value[key]) { try { URL.revokeObjectURL(previewUrls.value[key]) } catch (e) {} ; previewUrls.value[key] = null }
  files.value[key] = null
}

function onShowcaseFile(e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value.showcase) { URL.revokeObjectURL(previewUrls.value.showcase); previewUrls.value.showcase = null } } catch (e) {}
  showcaseFile.value = f
  if (f) previewUrls.value.showcase = URL.createObjectURL(f)
}

function clearShowcase() {
  showcasePath.value = ''
  if (previewUrls.value.showcase) { try { URL.revokeObjectURL(previewUrls.value.showcase) } catch (e) {} ; previewUrls.value.showcase = null }
  showcaseFile.value = null
}

onBeforeUnmount(() => {
  for (const k of Object.keys(previewUrls.value)) {
    const u = previewUrls.value[k]
    if (u) { try { URL.revokeObjectURL(u) } catch (e) {} }
  }
})

async function loadConfig() {
  const cfg = await $fetch('/api/admin/homepage')
  paths.value.topLeft     = cfg.topLeftImagePath     || ''
  paths.value.bottomLeft  = cfg.bottomLeftImagePath  || ''
  paths.value.topRight    = cfg.topRightImagePath    || ''
  paths.value.bottomRight = cfg.bottomRightImagePath || ''
  showcasePath.value      = cfg.showcaseImagePath    || ''
  showcasePosterPath.value = cfg.showcasePosterPath || ''
}


async function saveAll() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('topLeftPath',     paths.value.topLeft     || '')
    fd.append('bottomLeftPath',  paths.value.bottomLeft  || '')
    fd.append('topRightPath',    paths.value.topRight    || '')
    fd.append('bottomRightPath', paths.value.bottomRight || '')
    if (files.value.topLeft)     fd.append('topLeft',     files.value.topLeft)
    if (files.value.bottomLeft)  fd.append('bottomLeft',  files.value.bottomLeft)
    if (files.value.topRight)    fd.append('topRight',    files.value.topRight)
    if (files.value.bottomRight) fd.append('bottomRight', files.value.bottomRight)

    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    paths.value.topLeft     = res.topLeftImagePath     || ''
    paths.value.bottomLeft  = res.bottomLeftImagePath  || ''
    paths.value.topRight    = res.topRightImagePath    || ''
    paths.value.bottomRight = res.bottomRightImagePath || ''
    files.value = { topLeft:null, bottomLeft:null, topRight:null, bottomRight:null }
    toast.value = { type: 'ok', msg: 'Homepage images saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

async function saveShowcase() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('showcasePath', showcasePath.value || '')
    if (showcaseFile.value) fd.append('showcase', showcaseFile.value)

    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    showcasePath.value = res.showcaseImagePath || ''
    showcaseFile.value = null
    toast.value = { type: 'ok', msg: 'Showcase image saved.' }
    // refresh to pick up any generated poster
    await loadConfig()
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadConfig)

onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/release-settings')
    releasePercent.value = Number(res.initialReleasePercent ?? 75)
    delayHours.value = Number(res.finalReleaseDelayHours ?? 12)
  } catch {}
})

async function saveReleaseSettings() {
  saving.value = true; toast.value = null
  try {
    const res = await $fetch('/api/admin/release-settings', {
      method: 'POST',
      body: {
        initialReleasePercent: Number(releasePercent.value),
        finalReleaseDelayHours: Number(delayHours.value)
      }
    })
    releasePercent.value = Number(res.initialReleasePercent)
    delayHours.value = Number(res.finalReleaseDelayHours)
    toast.value = { type: 'ok', msg: 'Release settings saved.' }
  } catch (e) {
    console.error(e)
    toast.value = { type: 'error', msg: e?.statusMessage || 'Failed to save release settings' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}
 
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
</style>

 
