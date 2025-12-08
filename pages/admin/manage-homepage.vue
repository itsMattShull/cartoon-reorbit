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
            :class="activeTab==='Global Points' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Global Points'">Global Points</button>
        </nav>
      </div>

      <!-- Homepage tab -->
      <section v-if="activeTab==='Homepage'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Upload SVG/PNG/JPEG. Files are stored on the server and paths saved in the database.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <!-- Top Left -->
          <div class="space-y-3">
            <h2 class="font-semibold">Top Left</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <img v-if="paths.topLeft" :src="paths.topLeft" alt="Top Left" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
            <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
                   @change="onFile('topLeft', $event)" class="block w-full text-sm" />
            <div v-if="files.topLeft" class="text-xs text-gray-600 truncate">Selected: {{ files.topLeft.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.topLeft" @click="clearPath('topLeft')">Clear</button>
          </div>

          <!-- Top Right -->
          <div class="space-y-3">
            <h2 class="font-semibold">Top Right</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <img v-if="paths.topRight" :src="paths.topRight" alt="Top Right" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
            <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
                   @change="onFile('topRight', $event)" class="block w-full text-sm" />
            <div v-if="files.topRight" class="text-xs text-gray-600 truncate">Selected: {{ files.topRight.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.topRight" @click="clearPath('topRight')">Clear</button>
          </div>

          <!-- Bottom Left -->
          <div class="space-y-3">
            <h2 class="font-semibold">Bottom Left</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <img v-if="paths.bottomLeft" :src="paths.bottomLeft" alt="Bottom Left" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
            <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
                   @change="onFile('bottomLeft', $event)" class="block w-full text-sm" />
            <div v-if="files.bottomLeft" class="text-xs text-gray-600 truncate">Selected: {{ files.bottomLeft.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.bottomLeft" @click="clearPath('bottomLeft')">Clear</button>
          </div>

          <!-- Bottom Right -->
          <div class="space-y-3">
            <h2 class="font-semibold">Bottom Right</h2>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <img v-if="paths.bottomRight" :src="paths.bottomRight" alt="Bottom Right" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
            <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
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
          Upload a single Showcase image. SVG/PNG/JPEG.
        </p>
        <div class="space-y-3">
          <h2 class="font-semibold">Showcase Image</h2>
          <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
            <img v-if="showcasePath" :src="showcasePath" alt="Showcase" class="max-h-full max-w-full" />
            <span v-else class="text-gray-400 text-sm">No image</span>
          </div>
          <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
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

      <!-- Global Points tab -->
      <section v-if="activeTab==='Global Points'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Configure global point awards. These values are used by daily login bonuses and cZone visits.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Login Points</label>
            <input type="number" class="input" v-model.number="dailyLoginPoints" />
            <p class="text-xs text-gray-500 mt-1">Awarded once per 24h window (8pm CST reset).</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Login Points (New Users)</label>
            <input type="number" class="input" v-model.number="dailyNewUserPoints" />
            <p class="text-xs text-gray-500 mt-1">For accounts created within the last 7 days.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">cZone Visit Points</label>
            <input type="number" class="input" v-model.number="czoneVisitPoints" />
            <p class="text-xs text-gray-500 mt-1">Awarded per unique zone owner per 24h (max 10 owners).</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Game Point Cap</label>
            <input type="number" class="input" v-model.number="dailyPointLimit" />
            <p class="text-xs text-gray-500 mt-1">Max points from games per 24h window.</p>
          </div>
        </div>
        <div>
          <button class="btn-primary" :disabled="savingGlobal" @click="saveGlobal">
            <span v-if="!savingGlobal">Save</span><span v-else>Saving…</span>
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
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const activeTab = ref('Homepage')

const paths = ref({ topLeft:'', bottomLeft:'', topRight:'', bottomRight:'' })
const files = ref({ topLeft:null, bottomLeft:null, topRight:null, bottomRight:null })

const showcasePath = ref('')
const showcaseFile = ref(null)

const saving = ref(false)
const toast  = ref(null)

// Global Points state
const dailyLoginPoints   = ref(500)
const dailyNewUserPoints = ref(1000)
const czoneVisitPoints   = ref(20)
const dailyPointLimit    = ref(250)
const savingGlobal       = ref(false)

function onFile(key, e) { files.value[key] = e.target.files?.[0] || null }
function clearPath(key) { paths.value[key] = ''; files.value[key] = null }

function onShowcaseFile(e) { showcaseFile.value = e.target.files?.[0] || null }
function clearShowcase() { showcasePath.value = ''; showcaseFile.value = null }

async function loadConfig() {
  const cfg = await $fetch('/api/admin/homepage')
  paths.value.topLeft     = cfg.topLeftImagePath     || ''
  paths.value.bottomLeft  = cfg.bottomLeftImagePath  || ''
  paths.value.topRight    = cfg.topRightImagePath    || ''
  paths.value.bottomRight = cfg.bottomRightImagePath || ''
  showcasePath.value      = cfg.showcaseImagePath    || ''
}

async function loadGlobal() {
  try {
    const g = await $fetch('/api/admin/global-config')
    // fallbacks if fields missing (pre-migration)
    dailyLoginPoints.value   = Number(g?.dailyLoginPoints   ?? 500)
    dailyNewUserPoints.value = Number(g?.dailyNewUserPoints ?? 1000)
    czoneVisitPoints.value   = Number(g?.czoneVisitPoints   ?? 20)
    dailyPointLimit.value    = Number(g?.dailyPointLimit    ?? 250)
  } catch (e) {
    console.error('Failed to load global config', e)
  }
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
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadConfig)

onMounted(loadGlobal)

async function saveGlobal() {
  savingGlobal.value = true; toast.value = null
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyLoginPoints:   Number(dailyLoginPoints.value),
        dailyNewUserPoints: Number(dailyNewUserPoints.value),
        czoneVisitPoints:   Number(czoneVisitPoints.value),
        dailyPointLimit:    Number(dailyPointLimit.value)
      }
    })
    toast.value = { type: 'ok', msg: 'Global points saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingGlobal.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
</style>

<style scoped>
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
</style>
