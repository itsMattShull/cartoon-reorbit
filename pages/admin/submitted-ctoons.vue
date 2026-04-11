<template>
  <div class="min-h-screen bg-gray-50 p-4 md:p-6">
    <Nav />

    <!-- Toast notifications -->
    <Toast v-for="t in toasts" :key="t.id" :message="t.message" :type="t.type" />

    <div class="max-w-7xl mx-auto mt-20 md:mt-24">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 class="text-2xl font-semibold">Review Submitted cToons</h1>
        <div class="flex gap-2">
          <button
            v-if="selectedIds.size > 0"
            @click="approveSelected"
            :disabled="processing"
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            ✓ Approve ({{ selectedIds.size }})
          </button>
          <button
            v-if="selectedIds.size > 0"
            @click="declineSelected"
            :disabled="processing"
            class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 text-sm"
          >
            ✕ Decline ({{ selectedIds.size }})
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12 text-gray-500">Loading submissions…</div>

      <!-- Empty -->
      <div v-else-if="!submissions.length" class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-3">🎉</div>
        <p class="font-medium">No pending submissions!</p>
      </div>

      <!-- Cards Grid -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="sub in submissions"
          :key="sub.id"
          class="bg-white rounded-lg shadow border"
          :class="selectedIds.has(sub.id) ? 'ring-2 ring-blue-500' : ''"
        >
          <!-- Card header with checkbox and meta -->
          <div class="flex items-start gap-3 p-4 border-b">
            <input
              type="checkbox"
              :checked="selectedIds.has(sub.id)"
              @change="toggleSelect(sub.id)"
              class="mt-1 h-4 w-4 shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold truncate">{{ sub.name }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="rarityClass(sub.rarity)"
                >{{ sub.rarity }}</span>
              </div>
              <div class="text-xs text-gray-500 mt-0.5">
                Submitted by
                <span class="font-medium text-gray-700">{{ sub.user?.username || sub.user?.discordTag || 'Unknown' }}</span>
                · {{ formatDate(sub.submittedAt) }}
              </div>
            </div>
          </div>

          <!-- Image + duplicate check -->
          <div class="p-4 flex gap-4">
            <div class="shrink-0">
              <img
                :src="sub.assetPath"
                class="max-w-full h-auto border rounded bg-gray-50"
                :alt="sub.name"
              />
              <div class="mt-2 text-center">
                <button
                  @click="checkDuplicateForSub(sub)"
                  class="text-xs text-blue-600 hover:underline"
                >Check dupe</button>
                <div v-if="sub._dupStatus === 'checking'" class="text-xs text-gray-500">Checking…</div>
                <div v-else-if="sub._dupMatch" class="text-xs mt-1">
                  <div class="text-amber-700 font-medium">Possible dup!</div>
                  <img v-if="sub._dupMatch.ctoon?.assetPath" :src="sub._dupMatch.ctoon.assetPath" class="w-10 h-10 object-contain border rounded mx-auto my-1" />
                  <div class="text-[10px] text-gray-600">{{ sub._dupMatch.ctoon?.name }}</div>
                  <div class="text-[10px] text-gray-500">p:{{ sub._dupMatch.phashDist }} d:{{ sub._dupMatch.dhashDist }}</div>
                </div>
                <div v-else-if="sub._dupStatus === 'done'" class="text-xs text-green-600 mt-1">✓ No dupe</div>
              </div>
            </div>
            <!-- Editable fields -->
            <div class="flex-1 space-y-2 min-w-0">
              <!-- Name -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Name</label>
                <input v-model="sub.name" @blur="saveField(sub, 'name', sub.name)" class="w-full border rounded p-1 text-sm" />
              </div>
              <!-- Rarity -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Rarity</label>
                <select v-model="sub.rarity" @change="saveField(sub, 'rarity', sub.rarity)" class="w-full border rounded p-1 text-sm bg-white">
                  <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <!-- Characters -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Characters</label>
                <input
                  :value="sub.characters.join(', ')"
                  @blur="e => saveChars(sub, e.target.value)"
                  class="w-full border rounded p-1 text-sm"
                />
              </div>
            </div>
          </div>

          <!-- More fields -->
          <div class="px-4 pb-4 space-y-2">
            <!-- Series -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Series</label>
                <input
                  v-model="sub.series"
                  :list="`series-list-${sub.id}`"
                  @input="onSeriesInput(sub)"
                  @blur="saveField(sub, 'series', sub.series)"
                  class="w-full border rounded p-1 text-sm"
                />
                <datalist v-if="sub.series.length >= 3" :id="`series-list-${sub.id}`">
                  <option v-for="opt in seriesCacheAdmin" :key="opt" :value="opt" />
                </datalist>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Set</label>
                <input
                  v-model="sub.set"
                  :list="`set-list-${sub.id}`"
                  @input="onSetInput(sub)"
                  @blur="saveField(sub, 'set', sub.set)"
                  class="w-full border rounded p-1 text-sm"
                />
                <datalist v-if="sub.set.length >= 3" :id="`set-list-${sub.id}`">
                  <option v-for="opt in setsCacheAdmin" :key="opt" :value="opt" />
                </datalist>
              </div>
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-0.5">Description</label>
              <textarea
                v-model="sub.description"
                @blur="saveField(sub, 'description', sub.description)"
                rows="2"
                class="w-full border rounded p-1 text-sm resize-none"
                placeholder="No description provided."
              />
            </div>

            <!-- Release Date + Quantities row -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Release Date</label>
                <input
                  type="datetime-local"
                  :value="toLocalDatetime(sub.releaseDate)"
                  @blur="e => saveField(sub, 'releaseDate', new Date(e.target.value).toISOString())"
                  class="w-full border rounded p-1 text-xs"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Per-User Limit</label>
                <input
                  type="number"
                  v-model.number="sub.perUserLimit"
                  @blur="saveField(sub, 'perUserLimit', sub.perUserLimit)"
                  min="0"
                  class="w-full border rounded p-1 text-sm"
                />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Total Qty</label>
                <input
                  type="number"
                  v-model.number="sub.totalQuantity"
                  @blur="saveField(sub, 'totalQuantity', sub.totalQuantity)"
                  min="1"
                  class="w-full border rounded p-1 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Initial Qty</label>
                <input
                  type="number"
                  v-model.number="sub.initialQuantity"
                  @blur="saveField(sub, 'initialQuantity', sub.initialQuantity)"
                  min="0"
                  class="w-full border rounded p-1 text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Price</label>
                <input
                  type="number"
                  v-model.number="sub.price"
                  @blur="saveField(sub, 'price', sub.price)"
                  min="0"
                  class="w-full border rounded p-1 text-sm"
                />
              </div>
            </div>

            <!-- In cMart -->
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                :id="`cmart-${sub.id}`"
                v-model="sub.inCmart"
                @change="saveField(sub, 'inCmart', sub.inCmart)"
                class="h-4 w-4"
              />
              <label :for="`cmart-${sub.id}`" class="text-sm">In cMart</label>
            </div>

            <!-- Per-card actions -->
            <div class="flex gap-2 pt-1">
              <button
                @click="approveSingle(sub)"
                :disabled="processing"
                class="flex-1 bg-green-600 text-white py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50"
              >✓ Approve</button>
              <button
                @click="declineSingle(sub)"
                :disabled="processing"
                class="flex-1 bg-red-600 text-white py-1.5 rounded text-sm hover:bg-red-700 disabled:opacity-50"
              >✕ Decline</button>
            </div>

            <!-- Save indicator -->
            <div v-if="sub._saving" class="text-xs text-blue-500 text-right">Saving…</div>
            <div v-if="sub._saveError" class="text-xs text-red-500 text-right">{{ sub._saveError }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'
import Toast from '~/components/Toast.vue'

definePageMeta({ title: 'Admin - Submitted cToons', middleware: ['auth', 'admin'], layout: 'default' })

const loading = ref(true)
const processing = ref(false)
const submissions = ref([])
const selectedIds = reactive(new Set())
const toasts = ref([])

// Autocomplete caches with 5-min TTL
const seriesCacheAdmin = ref([])
const setsCacheAdmin = ref([])
const seriesCacheTimeAdmin = ref(0)
const setsCacheTimeAdmin = ref(0)
const CACHE_TTL_MS = 5 * 60 * 1000

const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

function showToast(message, type = 'success') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 5000)
}

function rarityClass(rarity) {
  switch (rarity) {
    case 'Common':     return 'bg-gray-100 text-gray-700'
    case 'Uncommon':   return 'bg-green-100 text-green-700'
    case 'Rare':       return 'bg-blue-100 text-blue-700'
    case 'Very Rare':  return 'bg-purple-100 text-purple-700'
    case 'Crazy Rare': return 'bg-yellow-100 text-yellow-700'
    default:           return 'bg-gray-100 text-gray-600'
  }
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toLocalDatetime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}

async function loadSubmissions() {
  loading.value = true
  try {
    const data = await $fetch('/api/admin/submitted-ctoons')
    submissions.value = data.map(s => ({
      ...s,
      description: s.description || '',
      _saving: false,
      _saveError: '',
      _dupStatus: 'idle',
      _dupMatch: null
    }))
  } catch (err) {
    showToast('Failed to load submissions: ' + err.message, 'error')
  } finally {
    loading.value = false
  }
}

// Autosave a single field via PUT
async function saveField(sub, fieldName, value) {
  sub._saving = true
  sub._saveError = ''
  try {
    const payload = {}
    if (fieldName === 'set') payload.set = value
    else payload[fieldName] = value

    const updated = await $fetch(`/api/admin/submitted-ctoon/${sub.id}`, {
      method: 'PUT',
      body: payload
    })
    // Update any server-side normalized values
    Object.assign(sub, {
      name: updated.name,
      series: updated.series,
      set: updated.set,
      description: updated.description || '',
      rarity: updated.rarity,
      releaseDate: updated.releaseDate,
      characters: updated.characters,
      totalQuantity: updated.totalQuantity,
      initialQuantity: updated.initialQuantity,
      perUserLimit: updated.perUserLimit,
      inCmart: updated.inCmart,
      price: updated.price
    })
  } catch (err) {
    sub._saveError = err.data?.statusMessage || 'Save failed'
  } finally {
    sub._saving = false
  }
}

function saveChars(sub, raw) {
  const arr = raw.split(',').map(s => s.trim()).filter(Boolean)
  sub.characters = arr
  saveField(sub, 'characters', arr)
}

// Autocomplete for admin
async function fetchAdminSeries(q) {
  const now = Date.now()
  if (seriesCacheAdmin.value.length && now - seriesCacheTimeAdmin.value < CACHE_TTL_MS) return
  try {
    const data = await $fetch(`/api/admin/series`)
    seriesCacheAdmin.value = data
    seriesCacheTimeAdmin.value = Date.now()
  } catch {}
}

async function fetchAdminSets(q) {
  const now = Date.now()
  if (setsCacheAdmin.value.length && now - setsCacheTimeAdmin.value < CACHE_TTL_MS) return
  try {
    const data = await $fetch(`/api/admin/sets`)
    setsCacheAdmin.value = data
    setsCacheTimeAdmin.value = Date.now()
  } catch {}
}

async function onSeriesInput(sub) {
  if (sub.series.length >= 3) await fetchAdminSeries(sub.series)
}

async function onSetInput(sub) {
  if (sub.set.length >= 3) await fetchAdminSets(sub.set)
}

// Duplicate check for a single submission
async function checkDuplicateForSub(sub) {
  sub._dupStatus = 'checking'
  sub._dupMatch = null
  try {
    // Fetch the image as blob then submit for duplicate check
    const imgRes = await fetch(sub.assetPath)
    if (!imgRes.ok) { sub._dupStatus = 'error'; return }
    const blob = await imgRes.blob()
    const filename = sub.assetPath.split('/').pop()
    const fd = new FormData()
    fd.append('image', blob, filename)
    const res = await fetch('/api/admin/ctoon-duplicate', { method: 'POST', credentials: 'include', body: fd })
    if (!res.ok) { sub._dupStatus = 'error'; return }
    const data = await res.json()
    sub._dupMatch = data?.duplicate ? data.match : null
    sub._dupStatus = 'done'
  } catch {
    sub._dupStatus = 'error'
  }
}

async function approveSelected() {
  if (!selectedIds.size) return
  processing.value = true
  try {
    const result = await $fetch('/api/admin/submitted-ctoons/approve', {
      method: 'POST',
      body: { ids: Array.from(selectedIds) }
    })
    showToast(`Approved ${result.approved} cToon(s)!`, 'success')
    if (result.errors?.length) {
      result.errors.forEach(e => showToast(`Error approving "${e.name}": ${e.error}`, 'error'))
    }
    selectedIds.clear()
    await loadSubmissions()
  } catch (err) {
    showToast('Approve failed: ' + (err.data?.statusMessage || err.message), 'error')
  } finally {
    processing.value = false
  }
}

async function declineSelected() {
  if (!selectedIds.size) return
  if (!confirm(`Decline ${selectedIds.size} submission(s)? This cannot be undone.`)) return
  processing.value = true
  try {
    const result = await $fetch('/api/admin/submitted-ctoons/decline', {
      method: 'POST',
      body: { ids: Array.from(selectedIds) }
    })
    showToast(`Declined ${result.declined} cToon(s).`, 'success')
    selectedIds.clear()
    await loadSubmissions()
  } catch (err) {
    showToast('Decline failed: ' + (err.data?.statusMessage || err.message), 'error')
  } finally {
    processing.value = false
  }
}

async function approveSingle(sub) {
  processing.value = true
  try {
    const result = await $fetch('/api/admin/submitted-ctoons/approve', {
      method: 'POST',
      body: { ids: [sub.id] }
    })
    showToast(`Approved "${sub.name}"!`, 'success')
    if (result.errors?.length) {
      result.errors.forEach(e => showToast(`Error: ${e.error}`, 'error'))
    }
    await loadSubmissions()
  } catch (err) {
    showToast('Approve failed: ' + (err.data?.statusMessage || err.message), 'error')
  } finally {
    processing.value = false
  }
}

async function declineSingle(sub) {
  if (!confirm(`Decline "${sub.name}"? This cannot be undone.`)) return
  processing.value = true
  try {
    await $fetch('/api/admin/submitted-ctoons/decline', {
      method: 'POST',
      body: { ids: [sub.id] }
    })
    showToast(`Declined "${sub.name}".`, 'success')
    await loadSubmissions()
  } catch (err) {
    showToast('Decline failed: ' + (err.data?.statusMessage || err.message), 'error')
  } finally {
    processing.value = false
  }
}

onMounted(async () => {
  await loadSubmissions()
  // Pre-load autocomplete data
  await Promise.all([fetchAdminSeries(''), fetchAdminSets('')])
})
</script>
