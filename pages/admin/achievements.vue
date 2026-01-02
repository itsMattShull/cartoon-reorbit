<template>
  <Nav />
  <div class="max-w-5xl mx-auto p-4 mt-12">
    <div class="mt-12 mb-6 flex flex-col gap-3 items-start lg:flex-row lg:items-center lg:justify-between">
      <h1 class="text-3xl font-bold">Admin: Achievements</h1>
      <div class="flex flex-col items-start gap-3 lg:flex-row lg:items-center">
        <button class="px-3 py-2 bg-blue-600 text-white rounded" @click="openCreate">Create Achievement</button>
        <button class="px-3 py-2 border rounded" @click="queueAll" :disabled="queuing">
          {{ queuing ? 'Queuing…' : 'Queue Achievements Now' }}
        </button>
        <button class="px-3 py-2 border rounded" @click="openSettings">Settings</button>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeForm"></div>
      <div class="relative bg-white rounded shadow max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div class="px-4 pt-4 pb-2">
          <h2 class="text-xl font-semibold">{{ editId ? 'Edit Achievement' : 'Create Achievement' }}</h2>
        </div>
        <form @submit.prevent="save" class="flex flex-col flex-1 min-h-0">
          <div class="px-4 pb-4 overflow-y-auto">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium">Title</label>
                <input v-model="form.title" class="w-full border rounded px-2 py-1" required />
              </div>
              <div>
                <label class="block text-sm font-medium">Slug (optional)</label>
                <input v-model="form.slug" class="w-full border rounded px-2 py-1" placeholder="auto from title" :disabled="!!editId" />
              </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium">Description</label>
              <textarea v-model="form.description" class="w-full border rounded px-2 py-1" rows="2" />
            </div>
              <div>
                <label class="block text-sm font-medium">Image (png/jpg/gif)</label>
                <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/gif" />
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="form.isActive" id="isActive" />
                <label for="isActive">Active</label>
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="form.notifyDiscord" id="notifyDiscord" />
                <label for="notifyDiscord">Announce in Discord</label>
              </div>
            </div>

            <h3 class="text-lg font-semibold mt-6">Criteria</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm">Total Points ≥</label>
                <input v-model.number="form.criteria.pointsGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Total cToons ≥</label>
                <input v-model.number="form.criteria.totalCtoonsGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Unique cToons ≥</label>
                <input v-model.number="form.criteria.uniqueCtoonsGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Auctions Won ≥</label>
                <input v-model.number="form.criteria.auctionsWonGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Auctions Created (Completed) ≥</label>
                <input v-model.number="form.criteria.auctionsCreatedGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Accepted Trades ≥</label>
                <input v-model.number="form.criteria.tradesAcceptedGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Consecutive Active Days ≥</label>
                <input v-model.number="form.criteria.consecutiveActiveDaysGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
                <p class="text-xs text-gray-500 mt-1">Counts days with any site activity, not just logins.</p>
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm">User created before</label>
                <input v-model="form.criteria.userCreatedBefore" type="date" class="w-full border rounded px-2 py-1 max-w-xs" />
                <p class="text-xs text-gray-500 mt-1">Users with an account created strictly earlier than this date qualify.</p>
              </div>
            </div>
          <div class="mt-3">
            <label class="block text-sm">Set completion (AND):</label>
            <div class="flex gap-2 items-center mb-2">
              <datalist id="ach-sets-list">
                <option v-for="opt in filteredSetOptions(setInput)" :key="opt" :value="opt" />
              </datalist>
              <input v-model="setInput" list="ach-sets-list" class="border rounded px-2 py-1 flex-1" placeholder="Type 3+ characters to search" />
              <button type="button" class="px-3 py-1 border rounded" @click="addSet">Add</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-for="s in form.criteria.setsRequired" :key="s" class="px-2 py-1 bg-gray-100 rounded">
                {{ s }}
                <button type="button" class="ml-1 text-red-600" @click="removeSet(s)">×</button>
              </span>
            </div>
          </div>

            <h3 class="text-lg font-semibold mt-6">Rewards</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm">Points</label>
                <input v-model.number="form.rewards.points" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
            <div class="md:col-span-2">
              <label class="block text-sm">Add cToon reward</label>
              <div class="flex gap-2 items-center">
                <datalist id="ach-ctoon-list">
                  <option v-for="c in filteredCtoons(ctoonSelection.name)" :key="c.id" :value="c.name" />
                </datalist>
                <input
                  v-model="ctoonSelection.name"
                  list="ach-ctoon-list"
                  class="border rounded px-2 py-1 w-full"
                  placeholder="Type 3+ characters to search"
                />
                <input v-model.number="ctoonSelection.qty" type="number" min="1" class="w-24 border rounded px-2 py-1" />
                <button type="button" class="px-3 py-1 border rounded" @click="addCtoon">Add</button>
              </div>
              <div class="text-sm mt-1" v-if="form.rewards.ctoons.length">
                <div v-for="(r, i) in form.rewards.ctoons" :key="r.ctoonId" class="flex items-center gap-2">
                  <span>{{ nameForCtoon(r.ctoonId) }} × {{ r.quantity }}</span>
                  <button type="button" class="text-red-600" @click="form.rewards.ctoons.splice(i,1)">Remove</button>
                </div>
              </div>
            </div>
            </div>

          <div class="mt-3">
            <label class="block text-sm">Backgrounds</label>
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-auto border p-2 rounded">
              <button
                v-for="b in backgrounds"
                :key="b.id"
                type="button"
                class="relative focus:outline-none"
                @click="toggleBg(b.id)"
                :title="b.label || 'Background'"
              >
                <img
                  :src="b.imagePath"
                  :alt="b.label || 'Background'"
                  class="w-20 h-14 object-cover rounded border"
                  :class="bgSelection.includes(b.id) ? 'ring-2 ring-blue-600' : ''"
                />
                <div v-if="bgSelection.includes(b.id)" class="absolute inset-0 bg-blue-500/20 rounded pointer-events-none"></div>
              </button>
            </div>
          </div>
          </div>
          <div class="px-4 py-3 border-t flex gap-3 justify-end">
            <button type="button" class="px-4 py-2 border rounded" @click="closeForm">Cancel</button>
            <button class="px-4 py-2 bg-blue-600 text-white rounded" type="submit">{{ editId ? 'Save Changes' : 'Create Achievement' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeSettings"></div>
      <div class="relative bg-white rounded shadow max-w-lg w-full mx-4 flex flex-col overflow-hidden">
        <div class="px-4 pt-4 pb-2">
          <h2 class="text-xl font-semibold">Achievement Settings</h2>
        </div>
        <div class="px-4 pb-4">
          <label class="block text-sm font-medium">Discord Channel ID (Announcements)</label>
          <input
            v-model="settingsForm.achievementDiscordChannelId"
            class="w-full border rounded px-2 py-1"
            placeholder="123456789012345678"
            :disabled="settingsLoading || settingsSaving"
          />
          <p class="text-xs text-gray-500 mt-1">
            Leave blank to use the DISCORD_ANNOUNCEMENTS_CHANNEL environment variable.
          </p>
        </div>
        <div class="px-4 py-3 border-t flex gap-3 justify-end">
          <button type="button" class="px-4 py-2 border rounded" @click="closeSettings">Cancel</button>
          <button class="px-4 py-2 bg-blue-600 text-white rounded" type="button" @click="saveSettings" :disabled="settingsSaving">
            {{ settingsSaving ? 'Saving…' : 'Save Settings' }}
          </button>
        </div>
      </div>
    </div>

    <div>
      <h2 class="text-xl font-semibold mb-3">Existing Achievements</h2>
      <div v-if="pending">Loading…</div>
      <div v-else class="divide-y border rounded">
        <div v-for="a in achievements" :key="a.id" class="p-3 flex items-center gap-4">
          <img v-if="a.imagePath" :src="a.imagePath" class="w-12 h-12 object-cover rounded" alt="" />
          <div class="flex-1">
            <div class="font-medium">{{ a.title }}</div>
            <div class="text-xs text-gray-500">Slug: {{ a.slug }} • Active: {{ a.isActive ? 'yes' : 'no' }}</div>
          </div>
          <button class="px-3 py-1 border rounded" @click="startEdit(a)">Edit</button>
          <button class="px-3 py-1 border rounded text-red-600" @click="remove(a)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const { data: achievements, pending, refresh } = await useFetch('/api/admin/achievements')
const { data: ctoonsData } = await useFetch('/api/admin/list-ctoons')
const { data: backgroundsData } = await useFetch('/api/admin/backgrounds')
const { data: setsData } = await useFetch('/api/admin/sets')

const ctoons = computed(() => ctoonsData.value || [])
const backgrounds = computed(() => backgroundsData.value || [])
const setsOptions = computed(() => setsData.value || [])

const editId = ref('')
const showForm = ref(false)
const showSettings = ref(false)
const imageInput = ref(null)
const setInput = ref('')
const bgSelection = ref([])
const ctoonSelection = ref({ name: '', qty: 1 })

const emptyForm = () => ({
  title: '', slug: '', description: '', isActive: true, notifyDiscord: false,
  criteria: {
    pointsGte: null,
    totalCtoonsGte: null,
    uniqueCtoonsGte: null,
    auctionsWonGte: null,
    auctionsCreatedGte: null,
    tradesAcceptedGte: null,
    consecutiveActiveDaysGte: null,
    setsRequired: [],
    userCreatedBefore: null
  },
  rewards: { points: 0, ctoons: [], backgrounds: [] }
})
const form = reactive(emptyForm())
const queuing = ref(false)
const settingsForm = reactive({ achievementDiscordChannelId: '' })
const settingsLoading = ref(false)
const settingsSaving = ref(false)

function resetForm() {
  Object.assign(form, emptyForm())
  editId.value = ''
  bgSelection.value = []
  ctoonSelection.value = { name: '', qty: 1 }
  if (imageInput.value) imageInput.value.value = ''
}

function openCreate() {
  resetForm()
  showForm.value = true
}

function closeForm() {
  resetForm()
  showForm.value = false
}

function closeSettings() {
  showSettings.value = false
}

async function openSettings() {
  showSettings.value = true
  settingsLoading.value = true
  try {
    const res = await $fetch('/api/admin/achievements/settings')
    settingsForm.achievementDiscordChannelId = res?.achievementDiscordChannelId || ''
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Failed to load settings')
    showSettings.value = false
  } finally {
    settingsLoading.value = false
  }
}

async function saveSettings() {
  try {
    settingsSaving.value = true
    await $fetch('/api/admin/achievements/settings', {
      method: 'POST',
      body: { achievementDiscordChannelId: settingsForm.achievementDiscordChannelId }
    })
    showSettings.value = false
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Failed to save settings')
  } finally {
    settingsSaving.value = false
  }
}

function addSet() {
  const s = (setInput.value || '').trim()
  if (!s) return
  if (!form.criteria.setsRequired.includes(s)) form.criteria.setsRequired.push(s)
  setInput.value = ''
}
function removeSet(s) {
  form.criteria.setsRequired = form.criteria.setsRequired.filter(x => x !== s)
}

function filteredSetOptions(input) {
  const v = String(input || '').trim().toLowerCase()
  if (v.length < 3) return []
  return (setsOptions.value || []).filter(opt => String(opt || '').toLowerCase().includes(v))
}

function nameForCtoon(id) {
  const c = ctoons.value.find(c => c.id === id)
  return c ? c.name : id
}

function filteredCtoons(input) {
  const v = String(input || '').trim().toLowerCase()
  if (v.length < 3) return []
  return (ctoons.value || []).filter(ct => ct.name.toLowerCase().includes(v))
}

function findCtoonByName(name) {
  const v = String(name || '').trim()
  if (!v) return null
  return (ctoons.value || []).find(ct => ct.name === v) || null
}

function addCtoon() {
  const match = findCtoonByName(ctoonSelection.value.name)
  if (!match) {
    alert('Please select a valid cToon from suggestions (type at least 3 characters).')
    return
  }
  const qty = Math.max(1, Number(ctoonSelection.value.qty || 1))
  form.rewards.ctoons.push({ ctoonId: match.id, quantity: qty })
  ctoonSelection.value = { name: '', qty: 1 }
}

function toggleBg(id) {
  const i = bgSelection.value.indexOf(id)
  if (i >= 0) bgSelection.value.splice(i, 1)
  else bgSelection.value.push(id)
}

function startEdit(a) {
  editId.value = a.id
  Object.assign(form, {
    title: a.title,
    slug: a.slug,
    description: a.description || '',
    isActive: !!a.isActive,
    notifyDiscord: !!a.notifyDiscord,
    criteria: {
      pointsGte: a.pointsGte ?? null,
      totalCtoonsGte: a.totalCtoonsGte ?? null,
      uniqueCtoonsGte: a.uniqueCtoonsGte ?? null,
      auctionsWonGte: a.auctionsWonGte ?? null,
      auctionsCreatedGte: a.auctionsCreatedGte ?? null,
      tradesAcceptedGte: a.tradesAcceptedGte ?? null,
      consecutiveActiveDaysGte: a.consecutiveActiveDaysGte ?? null,
      setsRequired: [...(a.setsRequired || [])],
      userCreatedBefore: a.userCreatedBefore ? String(a.userCreatedBefore).slice(0,10) : null
    },
    rewards: {
      points: a.rewards?.points || 0,
      ctoons: (a.rewards?.ctoons || []).map(r => ({ ctoonId: r.ctoonId, quantity: r.quantity })),
      backgrounds: (a.rewards?.backgrounds || []).map(r => ({ backgroundId: r.backgroundId }))
    }
  })
  bgSelection.value = form.rewards.backgrounds.map(b => b.backgroundId)
  if (imageInput.value) imageInput.value.value = ''
  showForm.value = true
}

async function save() {
  const fd = new FormData()
  // sync selected backgrounds into form.rewards.backgrounds
  form.rewards.backgrounds = bgSelection.value.map(id => ({ backgroundId: id }))
  fd.append('payload', JSON.stringify(form))
  if (imageInput.value?.files?.[0]) fd.append('file', imageInput.value.files[0])
  try {
    if (!editId.value) {
      await $fetch('/api/admin/achievements', { method: 'POST', body: fd })
    } else {
      await $fetch(`/api/admin/achievements/${editId.value}`, { method: 'PUT', body: fd })
    }
    closeForm()
    await refresh()
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Save failed')
  }
}

async function remove(a) {
  if (!confirm(`Delete achievement “${a.title}”?`)) return
  try {
    await $fetch(`/api/admin/achievements/${a.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Delete failed')
  }
}

async function queueAll() {
  try {
    queuing.value = true
    const res = await $fetch('/api/admin/achievements/enqueue', { method: 'POST', body: { all: true } })
    alert(`Enqueued ${res?.enqueued || 0} users for achievement processing.`)
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Failed to enqueue')
  } finally {
    queuing.value = false
  }
}
</script>
