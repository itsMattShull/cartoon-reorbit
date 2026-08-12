<template>
  <div class="admin-legacy-scavenger bg-gray-50 text-xs">
    <div class="px-2 py-2">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <h1 class="text-base font-semibold">Admin: Scavenger Hunt</h1>
    </div>

    <div class="bg-white rounded border shadow max-w-5xl mx-auto p-3 space-y-6">
      <!-- Global Settings -->
      <section>
        <h2 class="text-xs font-semibold mb-2">Global Settings</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Chance Percent (0–100)</label>
            <input type="number" v-model.number="chance" class="border rounded-md px-2 py-1.5 text-sm" min="0" max="100" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Cooldown (hours)</label>
            <input type="number" v-model.number="cooldown" class="border rounded-md px-2 py-1.5 text-sm" min="0" />
          </div>
        </div>
        <div class="mt-3">
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="saveConfig" :disabled="savingCfg">{{ savingCfg ? 'Saving…' : 'Save Settings' }}</button>
        </div>
      </section>

      <!-- Exclusive cToon Pool -->
      <section>
        <h2 class="text-xs font-semibold mb-2">Exclusive cToon Pool</h2>
        <div class="mb-3 relative max-w-xl">
          <label class="block text-xs font-medium mb-1">Add cToon</label>
          <input
            type="text"
            v-model="search"
            @focus="showDropdown = true"
            @input="onSearchInput"
            placeholder="Type to search…"
            class="border rounded-md px-2 py-1.5 text-sm w-full"
          />
          <ul v-if="showDropdown && matches.length" class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
            <li
              v-for="c in matches"
              :key="c.id"
              @mousedown.prevent="addPool(c)"
              class="flex items-center px-2 py-1.5 cursor-pointer hover:bg-indigo-50"
            >
              <img :src="c.assetPath" alt="" class="w-6 h-6 rounded mr-2 object-cover border flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-xs truncate">{{ c.name }}</p>
                <p class="text-[10px] text-gray-500">{{ c.rarity }}</p>
              </div>
            </li>
          </ul>
        </div>

        <div class="flex flex-wrap gap-2">
          <span
            v-for="row in pool"
            :key="row.id"
            class="inline-flex items-center bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs"
          >
            <img :src="row.ctoon.assetPath" alt="" class="w-5 h-5 rounded mr-2 object-cover border" />
            {{ row.ctoon.name }}
            <button class="ml-1" @click="removePool(row)">✕</button>
          </span>
        </div>
      </section>

      <!-- Stories (basic create + list) -->
      <section>
        <h2 class="text-xs font-semibold mb-2">Stories</h2>

        <details class="mb-3">
          <summary class="cursor-pointer text-xs font-semibold">Add Story</summary>
          <div class="mt-3 space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Title</label>
                <input v-model="form.title" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex items-end">
                <label class="inline-flex items-center gap-2 text-xs ml-1">
                  <input type="checkbox" v-model="form.isActive" /> Active
                </label>
              </div>
            </div>

            <!-- Fixed branching: '', A, B, AA, AB, BA, BB -->
            <div class="p-2 border rounded-md">
              <h3 class="text-xs font-semibold mb-2">Steps</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-for="p in requiredPaths" :key="p" class="border rounded-md p-2">
                  <div class="text-xs font-semibold mb-1">Path: <span class="font-mono">{{ p || '(root)' }}</span></div>
                  <div v-if="trailFor(p).length" class="mb-2 text-[10px] text-gray-600 flex flex-wrap gap-1">
                    <span v-for="(t,i) in trailFor(p)" :key="i" class="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                      <span class="font-mono">{{ t.choice }}</span>
                      <span>— {{ t.label || '(label?)' }}</span>
                    </span>
                  </div>
                  <label class="block text-xs font-medium">Description</label>
                  <textarea v-model="formSteps[p].description" class="border rounded-md px-2 py-1.5 text-sm w-full" rows="2"></textarea>
                  <!-- Step image above options -->
                  <div class="mt-2">
                    <label class="block text-xs font-medium">Step Image</label>
                    <div class="mt-1 flex items-center gap-2">
                      <input type="file" accept="image/*" @change="e => onFormFileChange(p, e)" class="text-xs" />
                      <button class="px-2 py-1 text-xs border rounded-md hover:bg-gray-50" @click="uploadFormStepImage(p)" :disabled="!formFiles[p] || uploading[p]">{{ uploading[p] ? 'Uploading…' : 'Upload' }}</button>
                    </div>
                    <div v-if="formSteps[p].imagePath" class="mt-2 flex items-center gap-3">
                      <img :src="formSteps[p].imagePath" alt="" class="w-24 h-24 object-cover rounded border" />
                      <button class="px-2 py-1 text-xs border rounded-md hover:bg-gray-50" @click="removeFormStepImage(p)">Remove</button>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    <div class="flex flex-col gap-1">
                      <label class="text-xs font-medium">Option A</label>
                      <input v-model="formSteps[p].optionA" class="border rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-xs font-medium">Option B</label>
                      <input v-model="formSteps[p].optionB" class="border rounded-md px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-2 border rounded-md">
              <h3 class="text-xs font-semibold mb-2">Outcomes</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div v-for="p in terminalPaths" :key="p" class="border rounded-md p-2 space-y-2">
                  <!-- breadcrumb of choices leading to this outcome -->
                  <div class="text-[10px] text-gray-600 flex flex-wrap gap-1">
                    <span v-for="(t,i) in outcomeTrailFor(p)" :key="i" class="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                      <span class="font-mono">{{ t.choice }}</span>
                      <span>— {{ t.label || '(label?)' }}</span>
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-14 font-mono text-xs">{{ p }}</span>
                    <select v-model="formOutcome[p].type" class="border rounded-md px-2 py-1 text-xs">
                      <option value="NOTHING">Nothing</option>
                      <option value="POINTS">Points</option>
                      <option value="EXCLUSIVE_CTOON">Exclusive cToon</option>
                    </select>
                    <input v-if="formOutcome[p].type==='POINTS'" type="number" class="border rounded-md px-2 py-1 text-xs w-24" v-model.number="formOutcome[p].points" placeholder="pts" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-[10px] text-gray-600">Outcome text (optional)</label>
                    <input class="border rounded-md px-2 py-1.5 text-sm" v-model="formOutcome[p].text" placeholder="Shown with the final result" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="createStory" :disabled="savingStory">{{ savingStory ? 'Saving…' : 'Create Story' }}</button>
            </div>
          </div>
        </details>

        <div>
          <h3 class="text-xs font-semibold mb-2">Existing Stories</h3>
          <div v-if="!stories.length" class="text-xs text-gray-500">No stories yet.</div>
          <ul v-else class="divide-y border rounded-md">
            <li v-for="s in stories" :key="s.id" class="p-2 flex items-center justify-between">
              <div>
                <div class="font-medium text-xs">{{ s.title }}</div>
                <div class="text-[10px] text-gray-500">{{ s.isActive ? 'Active' : 'Inactive' }}</div>
              </div>
              <div class="flex items-center gap-2">
                <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="openEdit(s)">Edit</button>
                <button class="px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50" @click="removeStory(s)">Delete</button>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </div>
    </div>

    <!-- Toast -->
    <div
      v-if="toastMessage"
      :class="[toastClass, 'fixed bottom-4 left-1/2 transform -translate-x-1/2']"
    >
      {{ toastMessage }}
    </div>

    <!-- Edit Story Modal -->
    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="closeEdit"></div>
      <div class="relative bg-white w-full max-w-5xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 class="text-sm font-semibold">Edit Story</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeEdit">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Title</label>
            <input v-model="editForm.title" class="border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div class="flex items-end">
            <label class="inline-flex items-center gap-2 text-xs ml-1">
              <input type="checkbox" v-model="editForm.isActive" /> Active
            </label>
          </div>
        </div>

        <div class="p-2 border rounded-md">
          <h4 class="text-xs font-semibold mb-2">Steps</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="p in requiredPaths" :key="p" class="border rounded-md p-2">
              <div class="text-xs font-semibold mb-1">Path: <span class="font-mono">{{ p || '(root)' }}</span></div>
              <div v-if="editTrailFor(p).length" class="mb-2 text-[10px] text-gray-600 flex flex-wrap gap-1">
                <span v-for="(t,i) in editTrailFor(p)" :key="i" class="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                  <span class="font-mono">{{ t.choice }}</span>
                  <span>— {{ t.label || '(label?)' }}</span>
                </span>
              </div>
              <label class="block text-xs font-medium">Description</label>
              <textarea v-model="editSteps[p].description" class="border rounded-md px-2 py-1.5 text-sm w-full" rows="2"></textarea>
              <!-- Step image above options (edit) -->
              <div class="mt-2">
                <label class="block text-xs font-medium">Step Image</label>
                <div class="mt-1 flex items-center gap-2">
                  <input type="file" accept="image/*" @change="e => onEditFileChange(p, e)" class="text-xs" />
                  <button class="px-2 py-1 text-xs border rounded-md hover:bg-gray-50" @click="uploadEditStepImage(p)" :disabled="!editFiles[p] || uploading[p]">{{ uploading[p] ? 'Uploading…' : 'Upload' }}</button>
                </div>
                <div v-if="editSteps[p].imagePath" class="mt-2 flex items-center gap-3">
                  <img :src="editSteps[p].imagePath" alt="" class="w-24 h-24 object-cover rounded border" />
                  <button class="px-2 py-1 text-xs border rounded-md hover:bg-gray-50" @click="removeEditStepImage(p)" :disabled="uploading[p]">Remove</button>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Option A</label>
                  <input v-model="editSteps[p].optionA" class="border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Option B</label>
                  <input v-model="editSteps[p].optionB" class="border rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-2 border rounded-md">
          <h4 class="text-xs font-semibold mb-2">Outcomes</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div v-for="p in terminalPaths" :key="p" class="border rounded-md p-2 space-y-2">
              <div class="text-[10px] text-gray-600 flex flex-wrap gap-1">
                <span v-for="(t,i) in editOutcomeTrailFor(p)" :key="i" class="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                  <span class="font-mono">{{ t.choice }}</span>
                  <span>— {{ t.label || '(label?)' }}</span>
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-14 font-mono text-xs">{{ p }}</span>
                <select v-model="editOutcome[p].type" class="border rounded-md px-2 py-1 text-xs">
                  <option value="NOTHING">Nothing</option>
                  <option value="POINTS">Points</option>
                  <option value="EXCLUSIVE_CTOON">Exclusive cToon</option>
                </select>
                <input v-if="editOutcome[p].type==='POINTS'" type="number" class="border rounded-md px-2 py-1 text-xs w-24" v-model.number="editOutcome[p].points" placeholder="pts" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] text-gray-600">Outcome text (optional)</label>
                <input class="border rounded-md px-2 py-1.5 text-sm" v-model="editOutcome[p].text" placeholder="Shown with the final result" />
              </div>
            </div>
          </div>
        </div>
        </div>

        <div class="flex justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closeEdit">Cancel</button>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" :disabled="savingEdit" @click="saveEdit">{{ savingEdit ? 'Saving…' : 'Save Changes' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

// Config
const chance = ref(5)
const cooldown = ref(24)
const savingCfg = ref(false)

// Toast
const toastMessage = ref('')
const toastType = ref('')
const toastClass = computed(() => [
  'mt-4 px-4 py-2 rounded',
  toastType.value === 'error'
    ? 'bg-red-100 text-red-700'
    : 'bg-green-100 text-green-700'
])
function showToast(msg, type = 'success') {
  toastMessage.value = msg; toastType.value = type
  setTimeout(() => { toastMessage.value = '' }, 3000)
}

async function loadConfig() {
  const res = await $fetch('/api/admin/scavenger/config')
  chance.value = res.scavengerChancePercent
  cooldown.value = res.scavengerCooldownHours
}
async function saveConfig() {
  savingCfg.value = true
  try {
    await $fetch('/api/admin/scavenger/config', { method: 'POST', body: { scavengerChancePercent: chance.value, scavengerCooldownHours: cooldown.value } })
    showToast('Settings saved', 'success')
  } finally { savingCfg.value = false }
}

// Pool
const pool = ref([])
const search = ref('')
const showDropdown = ref(false)
const matches = ref([])

async function loadPool() { pool.value = await $fetch('/api/admin/scavenger/pool') }

let searchTimer
function onSearchInput() {
  clearTimeout(searchTimer)
  const q = search.value.trim()
  if (!q) { showDropdown.value = false; matches.value = []; return }
  showDropdown.value = true
  searchTimer = setTimeout(async () => {
    try { matches.value = await $fetch('/api/admin/ctoon-pool', { query: { q } }) } catch { matches.value = [] }
  }, 200)
}

async function addPool(c) {
  try {
    const res = await $fetch('/api/admin/scavenger/pool', { method: 'POST', body: { ctoonId: c.id } })
    search.value = ''
    showDropdown.value = false
    matches.value = []
    if (res?.existed) showToast('Already in pool', 'success')
    else showToast('Added to pool', 'success')
    await loadPool()
  } catch {
    showToast('Failed to add to pool', 'error')
  }
}
async function removePool(row) {
  try {
    await $fetch(`/api/admin/scavenger/pool/${row.id}`, { method: 'DELETE' })
    await loadPool()
    showToast('Removed from pool', 'success')
  } catch {
    showToast('Failed to remove', 'error')
  }
}

// Stories
const stories = ref([])
async function loadStories() { stories.value = await $fetch('/api/admin/scavenger/stories') }
async function removeStory(s) { try { await $fetch(`/api/admin/scavenger/stories/${s.id}`, { method: 'DELETE' }); await loadStories() } catch {} }

const terminalPaths = ['AAA','AAB','ABA','ABB','BAA','BAB','BBA','BBB']
const requiredPaths = ['', 'A','B','AA','AB','BA','BB']
const form = reactive({ title: '', isActive: true })
const formSteps = reactive(Object.fromEntries(requiredPaths.map(p => [p, { description: '', imagePath: '', optionA: '', optionB: '' }])))
const formOutcome = reactive(Object.fromEntries(terminalPaths.map(p => [p, { type: 'NOTHING', points: 0, text: '' }])))
const formFiles = reactive(Object.fromEntries(requiredPaths.map(p => [p, null])))
const editFiles = reactive(Object.fromEntries(requiredPaths.map(p => [p, null])))
const uploading = reactive({})
const savingStory = ref(false)

async function createStory() {
  savingStory.value = true
  try {
    const steps = requiredPaths.map(p => ({
      path: p,
      layer: (p.length || 0) + 1,
      description: formSteps[p].description,
      imagePath: formSteps[p].imagePath,
      optionA: formSteps[p].optionA,
      optionB: formSteps[p].optionB
    }))
    const outcomes = terminalPaths.map(p => ({ path: p, resultType: formOutcome[p].type, points: formOutcome[p].type==='POINTS' ? (Number(formOutcome[p].points)||0) : undefined, text: formOutcome[p].text || undefined }))
    await $fetch('/api/admin/scavenger/stories', { method: 'POST', body: { title: form.title, isActive: form.isActive, steps, outcomes } })
    // reset
    form.title = ''; form.isActive = true
    for (const p of requiredPaths) { formSteps[p].description=''; formSteps[p].imagePath=''; formSteps[p].optionA=''; formSteps[p].optionB='' }
    for (const p of terminalPaths) { formOutcome[p].type='NOTHING'; formOutcome[p].points=0; formOutcome[p].text='' }
    await loadStories()
    showToast('Story created', 'success')
  } finally { savingStory.value = false }
}

onMounted(async () => { await loadConfig(); await loadPool(); await loadStories() })

// Compute breadcrumb trail of choices/labels leading to a path
function trailFor(path) {
  const out = []
  if (!path) return out
  // first choice from root
  if (path[0]) {
    out.push({ choice: path[0], label: path[0] === 'A' ? formSteps[''].optionA : formSteps[''].optionB })
  }
  // second choice from step at layer 2 ('A' or 'B')
  if (path.length >= 2) {
    const prev = path[0]
    const step = formSteps[prev] || { optionA: '', optionB: '' }
    const ch = path[1]
    out.push({ choice: ch, label: ch === 'A' ? step.optionA : step.optionB })
  }
  return out
}

// Breadcrumb trail for terminal outcomes (3 choices)
function outcomeTrailFor(path) {
  const out = []
  if (!path || path.length !== 3) return out
  // Choice 1 from root
  const c1 = path[0]
  out.push({ choice: c1, label: c1 === 'A' ? formSteps[''].optionA : formSteps[''].optionB })
  // Choice 2 from layer-2 step (A or B)
  const c2 = path[1]
  const step2 = formSteps[c1] || { optionA: '', optionB: '' }
  out.push({ choice: c2, label: c2 === 'A' ? step2.optionA : step2.optionB })
  // Choice 3 from layer-3 step (AA/AB/BA/BB)
  const c3 = path[2]
  const step3 = formSteps[c1 + c2] || { optionA: '', optionB: '' }
  out.push({ choice: c3, label: c3 === 'A' ? step3.optionA : step3.optionB })
  return out
}

// File upload helpers
function onFormFileChange(p, e) {
  const f = e?.target?.files?.[0]
  formFiles[p] = f || null
}
function onEditFileChange(p, e) {
  const f = e?.target?.files?.[0]
  editFiles[p] = f || null
}
async function uploadFormStepImage(p) {
  if (!formFiles[p]) return
  uploading[p] = true
  try {
    const fd = new FormData()
    fd.append('image', formFiles[p])
    fd.append('label', 'scav-step')
    fd.append('path', p)
    const res = await $fetch('/api/admin/scavenger/step-image', { method: 'POST', body: fd })
    if (res?.assetPath) {
      formSteps[p].imagePath = res.assetPath
      showToast('Image uploaded', 'success')
    }
  } catch { showToast('Upload failed', 'error') }
  finally { uploading[p] = false; formFiles[p] = null }
}
async function uploadEditStepImage(p) {
  if (!editFiles[p]) return
  uploading[p] = true
  try {
    const fd = new FormData()
    fd.append('image', editFiles[p])
    fd.append('label', 'scav-step')
    fd.append('path', p)
    if (editId.value) fd.append('storyId', editId.value)
    const res = await $fetch('/api/admin/scavenger/step-image', { method: 'POST', body: fd })
    if (res?.assetPath) {
      editSteps[p].imagePath = res.assetPath
      showToast('Image uploaded', 'success')
    }
  } catch { showToast('Upload failed', 'error') }
  finally { uploading[p] = false; editFiles[p] = null }
}

function removeFormStepImage(p) {
  formSteps[p].imagePath = ''
  formFiles[p] = null
  showToast('Image removed', 'success')
}

async function removeEditStepImage(p) {
  if (!editId.value) return
  uploading[p] = true
  try {
    await $fetch('/api/admin/scavenger/step-image', { method: 'DELETE', body: { storyId: editId.value, path: p } })
    editSteps[p].imagePath = ''
    showToast('Image removed', 'success')
  } catch { showToast('Failed to remove image', 'error') }
  finally { uploading[p] = false }
}

// Edit story state & helpers
const showEditModal = ref(false)
const savingEdit = ref(false)
const editId = ref('')
const editForm = reactive({ title: '', isActive: true })
const editSteps = reactive(Object.fromEntries(requiredPaths.map(p => [p, { description: '', imagePath: '', optionA: '', optionB: '' }])))
const editOutcome = reactive(Object.fromEntries(terminalPaths.map(p => [p, { type: 'NOTHING', points: 0, text: '' }])))

function openEdit(story) {
  editId.value = story.id
  editForm.title = story.title || ''
  editForm.isActive = !!story.isActive
  const byPath = Object.fromEntries((story.steps || []).map(s => [s.path || '', s]))
  for (const p of requiredPaths) {
    const s = byPath[p] || {}
    editSteps[p].description = s.description || ''
    editSteps[p].imagePath = s.imagePath || ''
    editSteps[p].optionA = s.optionA || ''
    editSteps[p].optionB = s.optionB || ''
  }
  const byOut = Object.fromEntries((story.outcomes || []).map(o => [o.path || '', o]))
  for (const p of terminalPaths) {
    const o = byOut[p] || {}
    editOutcome[p].type = o.resultType || 'NOTHING'
    editOutcome[p].points = Number(o.points || 0)
    editOutcome[p].text = o.text || ''
  }
  showEditModal.value = true
}

function closeEdit() { showEditModal.value = false }

function editTrailFor(path) {
  const out = []
  if (!path) return out
  if (path[0]) out.push({ choice: path[0], label: path[0] === 'A' ? editSteps[''].optionA : editSteps[''].optionB })
  if (path.length >= 2) {
    const prev = path[0]
    const ch = path[1]
    out.push({ choice: ch, label: ch === 'A' ? editSteps[prev].optionA : editSteps[prev].optionB })
  }
  return out
}

function editOutcomeTrailFor(path) {
  const out = []
  if (!path || path.length !== 3) return out
  const c1 = path[0]
  out.push({ choice: c1, label: c1 === 'A' ? editSteps[''].optionA : editSteps[''].optionB })
  const c2 = path[1]
  out.push({ choice: c2, label: c2 === 'A' ? editSteps[c1].optionA : editSteps[c1].optionB })
  const c3 = path[2]
  out.push({ choice: c3, label: c3 === 'A' ? editSteps[c1 + c2].optionA : editSteps[c1 + c2].optionB })
  return out
}

async function saveEdit() {
  if (!editId.value) return
  savingEdit.value = true
  try {
    const steps = requiredPaths.map(p => ({
      path: p,
      layer: (p.length || 0) + 1,
      description: editSteps[p].description,
      imagePath: editSteps[p].imagePath,
      optionA: editSteps[p].optionA,
      optionB: editSteps[p].optionB
    }))
    const outcomes = terminalPaths.map(p => ({
      path: p,
      resultType: editOutcome[p].type,
      points: editOutcome[p].type === 'POINTS' ? (Number(editOutcome[p].points) || 0) : undefined,
      text: editOutcome[p].text || undefined
    }))
    await $fetch(`/api/admin/scavenger/stories/${editId.value}`, { method: 'PUT', body: { title: editForm.title, isActive: editForm.isActive, steps, outcomes } })
    await loadStories()
    showToast('Story updated', 'success')
    closeEdit()
  } catch {
    showToast('Failed to update story', 'error')
  } finally {
    savingEdit.value = false
  }
}
</script>

<style scoped>
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none; }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1; }
.btn-primary { margin-top: .25rem; background-color: #6366F1; color: white; padding: .5rem 1.25rem; border-radius: .375rem; }
.btn-primary:disabled { opacity: .5; }
</style>
