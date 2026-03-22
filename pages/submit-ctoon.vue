<template>
  <div class="min-h-screen bg-gray-50 p-4 md:p-6">
    <Nav />

    <!-- Toast notifications -->
    <Toast v-for="t in toasts" :key="t.id" :message="t.message" :type="t.type" />

    <div class="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow mt-20 md:mt-24">
      <h1 class="text-2xl font-semibold mb-2">Submit a cToon</h1>
      <p class="text-gray-600 mb-6 text-sm">
        Submit your cToon artwork for the team to review. Once approved it will be added to the collection.
        You'll receive a Discord notification when your submission is reviewed.
      </p>

      <!-- STEP 1: Image Upload -->
      <div v-if="step === 1" class="space-y-4">
        <!-- Transparency notice -->
        <div class="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <span class="text-blue-500 text-xl mt-0.5">ℹ</span>
          <div class="text-sm text-blue-800">
            <p class="font-medium mb-1">Make sure your image has a transparent background.</p>
            <p class="text-blue-700">cToon images should have a transparent (not white or colored) background so they display correctly in the collection. PNGs and GIFs both support transparency.</p>
          </div>
        </div>
        <div>
          <label class="block font-medium mb-1">Select Images (PNG or GIF)</label>
          <p class="text-sm text-gray-500 mb-2">
            Upload one or more cToon images. Only PNG and GIF formats are accepted.
            You can submit multiple at once — each will get its own details form.
          </p>
          <input
            type="file"
            accept="image/png,image/gif"
            multiple
            @change="handleFiles"
            class="w-full"
          />
        </div>
        <div class="flex flex-wrap gap-3 mt-2">
          <div
            v-for="(file, i) in imageFiles"
            :key="i"
            class="w-24 h-24 border rounded overflow-hidden bg-gray-50"
          >
            <img :src="file.preview" :alt="file.nameField" class="object-contain w-full h-full" />
          </div>
        </div>
        <div class="text-right mt-4">
          <button
            @click="step = 2"
            :disabled="!imageFiles.length"
            class="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Next: Details →
          </button>
        </div>
      </div>

      <!-- STEP 2: Per-image details -->
      <div v-else class="space-y-6">
        <!-- Global fields -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block font-medium mb-1">Set <span class="text-red-500">*</span></label>
            <p class="text-xs text-gray-500 mb-1">The broader collection or release group this cToon belongs to (e.g. "Summer 2025 Collection").</p>
            <input
              v-model="bulkSet"
              :list="bulkSet.length >= 3 ? 'global-sets-list' : undefined"
              @input="onBulkSetInput"
              placeholder="e.g. Summer 2025"
              class="w-full border rounded p-2"
            />
            <datalist id="global-sets-list">
              <option v-for="opt in setsCache" :key="opt" :value="opt" />
            </datalist>
          </div>
          <div>
            <label class="block font-medium mb-1">Series <span class="text-red-500">*</span></label>
            <p class="text-xs text-gray-500 mb-1">The specific series or show this cToon is from (e.g. "Cartoon Network Originals").</p>
            <input
              v-model="bulkSeries"
              :list="bulkSeries.length >= 3 ? 'global-series-list' : undefined"
              @input="onBulkSeriesInput"
              placeholder="e.g. Cartoon Network Originals"
              class="w-full border rounded p-2"
            />
            <datalist id="global-series-list">
              <option v-for="opt in seriesCache" :key="opt" :value="opt" />
            </datalist>
          </div>
          <div>
            <label class="block font-medium mb-1">Release Date <span class="text-red-500">*</span></label>
            <p class="text-xs text-gray-500 mb-1">When you'd like this cToon to be available. Must be in the future. Admins may adjust this.</p>
            <input v-model="bulkReleaseDate" type="datetime-local" class="w-full border rounded p-2" />
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-max w-full table-auto border-collapse text-sm">
            <thead>
              <tr class="bg-gray-100 text-left">
                <th class="px-3 py-2">Preview</th>
                <th class="px-3 py-2">Duplicate?</th>
                <th class="px-3 py-2 min-w-[140px]">Name <span class="text-red-500">*</span></th>
                <th class="px-3 py-2 min-w-[140px]">Rarity <span class="text-red-500">*</span></th>
                <th class="px-3 py-2 min-w-[160px]">Characters <span class="text-red-500">*</span></th>
                <th class="px-3 py-2 min-w-[100px]">Total Qty</th>
                <th class="px-3 py-2 min-w-[110px]">Initial Qty</th>
                <th class="px-3 py-2 min-w-[110px]">Per-User Limit</th>
                <th class="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in imageFiles" :key="f.id" class="border-b align-top">
                <td class="px-3 py-2">
                  <img :src="f.preview" class="h-12 w-auto object-contain rounded" />
                </td>
                <td class="px-3 py-2">
                  <div v-if="f.duplicateStatus === 'checking'" class="text-xs text-gray-500">Checking…</div>
                  <div v-else-if="f.duplicateStatus === 'error'" class="text-xs text-red-600">Check failed</div>
                  <div v-else-if="f.duplicateMatch" class="text-xs">
                    <div class="text-amber-700 font-medium">Possible duplicate</div>
                    <div class="flex items-center gap-1 mt-1">
                      <img v-if="f.duplicateMatch.ctoon?.assetPath" :src="f.duplicateMatch.ctoon.assetPath" class="w-8 h-8 object-contain border rounded" />
                      <div class="text-[11px] leading-tight">
                        <div class="font-medium truncate max-w-[120px]">{{ f.duplicateMatch.ctoon?.name }}</div>
                        <div class="text-gray-500">p:{{ f.duplicateMatch.phashDist }} d:{{ f.duplicateMatch.dhashDist }}</div>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="f.duplicateStatus === 'done'" class="text-xs text-green-600">✓ No dupes</div>
                </td>
                <td class="px-3 py-2">
                  <input v-model="f.nameField" class="w-full border rounded p-1 text-sm" placeholder="cToon name" />
                </td>
                <td class="px-3 py-2">
                  <select v-model="f.rarity" @change="updateDefaults(f)" class="w-full border rounded p-1 text-sm bg-white">
                    <option disabled value="">Select…</option>
                    <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </td>
                <td class="px-3 py-2">
                  <input v-model="f.characters" class="w-full border rounded p-1 text-sm" placeholder="Amy, Bob" />
                </td>
                <td class="px-3 py-2">
                  <input v-model.number="f.totalQuantity" type="number" min="1" class="w-full border rounded p-1 text-sm" placeholder="e.g. 100" />
                </td>
                <td class="px-3 py-2">
                  <input v-model.number="f.initialQuantity" type="number" min="0" class="w-full border rounded p-1 text-sm" />
                </td>
                <td class="px-3 py-2">
                  <input v-model.number="f.perUserLimit" type="number" min="0" class="w-full border rounded p-1 text-sm" />
                </td>
                <td class="px-3 py-2">
                  <button
                    @click="openModal(i)"
                    class="text-blue-600 hover:underline text-sm whitespace-nowrap"
                  >More Details</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="space-y-4 sm:hidden">
          <div v-for="(f, i) in imageFiles" :key="f.id" class="bg-gray-50 rounded-lg p-4 border">
            <img :src="f.preview" class="w-full h-40 object-contain rounded mb-3 bg-white" />

            <!-- Duplicate indicator -->
            <div class="mb-3">
              <div v-if="f.duplicateStatus === 'checking'" class="text-xs text-gray-500">Checking for duplicates…</div>
              <div v-else-if="f.duplicateStatus === 'error'" class="text-xs text-red-600">Duplicate check failed.</div>
              <div v-else-if="f.duplicateMatch" class="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                <div class="text-amber-700 font-medium">⚠ Possible duplicate found</div>
                <div class="flex items-center gap-2 mt-1">
                  <img v-if="f.duplicateMatch.ctoon?.assetPath" :src="f.duplicateMatch.ctoon.assetPath" class="w-10 h-10 object-contain border rounded bg-white" />
                  <div class="text-[11px] leading-tight">
                    <div class="font-medium">{{ f.duplicateMatch.ctoon?.name || 'Unknown cToon' }}</div>
                    <div class="text-gray-500">p: {{ f.duplicateMatch.phashDist }}, d: {{ f.duplicateMatch.dhashDist }}</div>
                  </div>
                </div>
              </div>
              <div v-else-if="f.duplicateStatus === 'done'" class="text-xs text-green-600">✓ No duplicates found.</div>
            </div>

            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Name <span class="text-red-500">*</span></label>
                <p class="text-xs text-gray-500 mb-1">The display name for this cToon in the collection.</p>
                <input v-model="f.nameField" class="w-full border rounded p-2" placeholder="Enter cToon name" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Rarity <span class="text-red-500">*</span></label>
                <p class="text-xs text-gray-500 mb-1">How rare this cToon is. This affects quantities and pricing suggestions.</p>
                <select v-model="f.rarity" @change="updateDefaults(f)" class="w-full border rounded p-2 bg-white">
                  <option disabled value="">Select rarity…</option>
                  <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Characters <span class="text-red-500">*</span></label>
                <p class="text-xs text-gray-500 mb-1">Comma-separated list of characters shown in this cToon (e.g. "Amy, Bob").</p>
                <input v-model="f.characters" class="w-full border rounded p-2" placeholder="e.g. Amy, Bob" />
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-xs font-medium mb-1">Total Qty</label>
                  <p class="text-xs text-gray-500 mb-1">Max minted.</p>
                  <input v-model.number="f.totalQuantity" type="number" min="1" class="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1">Initial Qty</label>
                  <p class="text-xs text-gray-500 mb-1">First edition #.</p>
                  <input v-model.number="f.initialQuantity" type="number" min="0" class="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1">Per-User Limit</label>
                  <p class="text-xs text-gray-500 mb-1">Max per user.</p>
                  <input v-model.number="f.perUserLimit" type="number" min="0" class="w-full border rounded p-2 text-sm" />
                </div>
              </div>
              <button @click="openModal(i)" class="w-full text-center text-blue-600 border border-blue-300 rounded p-2 text-sm hover:bg-blue-50">
                + More Details (description, etc.)
              </button>
            </div>
          </div>
        </div>

        <!-- Submit button -->
        <div class="flex justify-between items-center pt-4 border-t">
          <button @click="step = 1" class="text-gray-600 hover:text-gray-800 text-sm">← Back</button>
          <button
            @click="submitAll"
            :disabled="submitting || !canSubmit"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {{ submitting ? 'Submitting…' : 'Submit for Review' }}
          </button>
        </div>
      </div>
    </div>

    <!-- More Details Modal -->
    <div v-if="modalIndex !== null" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Additional Details</h2>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div v-if="modalFile" class="space-y-4">
          <div class="flex items-center gap-3 bg-gray-50 rounded p-3">
            <img :src="modalFile.preview" class="h-16 w-16 object-contain rounded border" />
            <span class="font-medium">{{ modalFile.nameField || '(unnamed)' }}</span>
          </div>

          <div>
            <label class="block font-medium mb-1">Description</label>
            <p class="text-xs text-gray-500 mb-1">
              Provide context about the cToon — what show or cartoon it's from, who the characters are, notable moments, etc.
              This helps admins understand and categorize it correctly.
            </p>
            <textarea
              v-model="modalFile.description"
              rows="4"
              class="w-full border rounded p-2 text-sm"
              placeholder="Describe this cToon — the show, characters, scene, etc."
            />
          </div>

          <div class="pt-2">
            <button @click="closeModal" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              Save Details
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Nav from '~/components/Nav.vue'
import Toast from '~/components/Toast.vue'
import { useRouter } from 'vue-router'

definePageMeta({
  title: 'Submit a cToon',
  middleware: ['auth'],
  requiresAuth: true,
  layout: 'default'
})

const router = useRouter()

const step = ref(1)
const imageFiles = ref([])
const bulkSet = ref('')
const bulkSeries = ref('')
const bulkReleaseDate = ref('')
const submitting = ref(false)
const toasts = ref([])
const modalIndex = ref(null)

// Autocomplete caches with 5-min TTL
const setsCache = ref([])
const seriesCache = ref([])
const setsCacheTime = ref(0)
const seriesCacheTime = ref(0)
const CACHE_TTL_MS = 5 * 60 * 1000

const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']
const DUPLICATE_CONCURRENCY = 3

let rowIdCounter = 0
function makeRowId() {
  return `row_${Date.now()}_${rowIdCounter++}`
}

function showToast(message, type = 'error') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 5000)
}

// Rarity defaults
const rarityDefaults = ref(null)

async function loadRarityDefaults() {
  try {
    const res = await fetch('/api/rarity-defaults')
    const j = await res.json()
    rarityDefaults.value = j?.defaults || null
  } catch {}
}

function updateDefaults(f) {
  const d = rarityDefaults.value?.[f.rarity]
  if (d) {
    f.totalQuantity = d.totalQuantity ?? null
    f.initialQuantity = d.initialQuantity ?? null
    f.perUserLimit = d.perUserLimit ?? null
    return
  }
  switch (f.rarity) {
    case 'Common':     f.totalQuantity = 160; f.initialQuantity = 160; f.perUserLimit = 7; break
    case 'Uncommon':   f.totalQuantity = 120; f.initialQuantity = 120; f.perUserLimit = 5; break
    case 'Rare':       f.totalQuantity = 80;  f.initialQuantity = 80;  f.perUserLimit = 3; break
    case 'Very Rare':  f.totalQuantity = 60;  f.initialQuantity = 60;  f.perUserLimit = 2; break
    case 'Crazy Rare': f.totalQuantity = 40;  f.initialQuantity = 40;  f.perUserLimit = 1; break
    default: break
  }
}

// Autocomplete fetch with caching
async function fetchSets(q) {
  const now = Date.now()
  if (setsCache.value.length && now - setsCacheTime.value < CACHE_TTL_MS) {
    return setsCache.value.filter(s => s.toLowerCase().includes(q.toLowerCase()))
  }
  try {
    const res = await fetch(`/api/ctoon/sets?q=${encodeURIComponent(q)}`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setsCache.value = data
      setsCacheTime.value = Date.now()
    }
  } catch {}
  return setsCache.value.filter(s => s.toLowerCase().includes(q.toLowerCase()))
}

async function fetchSeries(q) {
  const now = Date.now()
  if (seriesCache.value.length && now - seriesCacheTime.value < CACHE_TTL_MS) {
    return seriesCache.value.filter(s => s.toLowerCase().includes(q.toLowerCase()))
  }
  try {
    const res = await fetch(`/api/ctoon/series?q=${encodeURIComponent(q)}`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      seriesCache.value = data
      seriesCacheTime.value = Date.now()
    }
  } catch {}
  return seriesCache.value.filter(s => s.toLowerCase().includes(q.toLowerCase()))
}

async function onBulkSetInput() {
  if (bulkSet.value.length >= 3) await fetchSets(bulkSet.value)
}

async function onBulkSeriesInput() {
  if (bulkSeries.value.length >= 3) await fetchSeries(bulkSeries.value)
}

watch(bulkSeries, (val) => {
  imageFiles.value.forEach(f => {
    if (!f.seriesLocked) f.series = val
  })
})

const canSubmit = computed(() => {
  if (!imageFiles.value.length) return false
  if (!bulkSet.value.trim()) return false
  if (!bulkSeries.value.trim()) return false
  if (!bulkReleaseDate.value) return false
  return imageFiles.value.every(f =>
    f.nameField?.trim() &&
    f.rarity &&
    f.characters?.trim()
  )
})

const modalFile = computed(() => modalIndex.value !== null ? imageFiles.value[modalIndex.value] : null)

function openModal(i) { modalIndex.value = i }
function closeModal() { modalIndex.value = null }

const RARITY_PATTERNS = [
  { key: 'Crazy Rare', re: /crazy[\s_]*rare/i },
  { key: 'Very Rare',  re: /very[\s_]*rare/i },
  { key: 'Uncommon',   re: /un[\s_]*common/i },
  { key: 'Common',     re: /common/i },
  { key: 'Rare',       re: /rare/i },
  { key: 'Prize Only', re: /prize[\s_]*only/i },
  { key: 'Code Only',  re: /code[\s_]*only/i },
  { key: 'Auction Only', re: /auction[\s_]*only/i }
]

function profileFromName(stem) {
  let working = stem
  let rarity = ''
  for (const { key, re } of RARITY_PATTERNS) {
    if (re.test(working)) {
      rarity = key
      working = working.replace(new RegExp(re.source, 'ig'), '')
      break
    }
  }
  working = working.replace(/_pic/ig, '').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return { name: working, rarity }
}

function handleFiles(e) {
  const files = Array.from(e.target.files || [])
  imageFiles.value = files.map(file => {
    const stem = file.name.replace(/\.[^/.]+$/, '')
    const { name, rarity } = profileFromName(stem)
    const row = {
      id: makeRowId(),
      file,
      preview: URL.createObjectURL(file),
      nameField: name,
      characters: name,
      rarity: rarity || '',
      series: bulkSeries.value.trim(),
      seriesLocked: false,
      description: '',
      totalQuantity: null,
      initialQuantity: null,
      perUserLimit: null,
      duplicateStatus: 'idle',
      duplicateMatch: null,
      duplicateError: ''
    }
    if (row.rarity) updateDefaults(row)
    return row
  })
  runDuplicateChecks(imageFiles.value)
}

async function runDuplicateChecks(rows) {
  const queue = rows.slice()
  const workers = Array.from({ length: DUPLICATE_CONCURRENCY }, () => (async () => {
    while (queue.length) {
      const row = queue.shift()
      if (!row) return
      await checkDuplicate(row)
    }
  })())
  await Promise.all(workers)
}

async function checkDuplicate(row) {
  if (!row?.file) return
  row.duplicateStatus = 'checking'
  row.duplicateMatch = null
  const fd = new FormData()
  fd.append('image', row.file)
  try {
    const res = await fetch('/api/submit-ctoon-duplicate', { method: 'POST', credentials: 'include', body: fd })
    if (!res.ok) { row.duplicateStatus = 'error'; return }
    const data = await res.json()
    row.duplicateMatch = data?.duplicate ? data.match : null
    row.duplicateStatus = 'done'
  } catch {
    row.duplicateStatus = 'error'
  }
}

async function submitAll() {
  submitting.value = true
  let allOk = true

  for (const f of imageFiles.value) {
    if (!f.nameField?.trim() || !f.rarity || !f.characters?.trim() || !bulkSet.value.trim() || !bulkSeries.value.trim() || !bulkReleaseDate.value) {
      showToast(`Missing required fields for "${f.nameField || 'unnamed'}"`)
      allOk = false
      continue
    }

    const fd = new FormData()
    fd.append('image', f.file)
    fd.append('name', f.nameField.trim())
    fd.append('series', f.series?.trim() || bulkSeries.value.trim())
    fd.append('set', bulkSet.value.trim())
    fd.append('description', f.description || '')
    fd.append('rarity', f.rarity)
    fd.append('releaseDate', new Date(bulkReleaseDate.value).toISOString())
    fd.append('characters', JSON.stringify(f.characters.split(',').map(c => c.trim()).filter(Boolean)))
    fd.append('totalQuantity', f.totalQuantity ?? '')
    fd.append('initialQuantity', f.initialQuantity ?? '')
    fd.append('perUserLimit', f.perUserLimit ?? '')

    try {
      const res = await fetch('/api/submit-ctoon', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) {
        const err = await res.text()
        showToast(`Failed: ${f.nameField} — ${err}`)
        allOk = false
      }
    } catch {
      showToast(`Error submitting "${f.nameField}"`)
      allOk = false
    }
  }

  submitting.value = false
  if (allOk) {
    showToast('All cToons submitted! You\'ll be notified on Discord when reviewed.', 'success')
    setTimeout(() => router.push('/dashboard'), 2000)
  }
}

// Load rarity defaults on mount
import { onMounted } from 'vue'
onMounted(() => {
  loadRarityDefaults()
})
</script>
