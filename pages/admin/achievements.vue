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
              <div v-if="editId" class="flex items-center gap-2">
                <input type="checkbox" v-model="form.notifyDiscord" id="notifyDiscord" />
                <label for="notifyDiscord">Announce in Discord</label>
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium">Discord Role Name (optional)</label>
                <input v-model="form.discordRoleName" class="w-full border rounded px-2 py-1" placeholder="Role name to grant on achievement" />
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
                <label class="block text-sm">Accepted cToon Suggestions ≥</label>
                <input v-model.number="form.criteria.ctoonSuggestionsAcceptedGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label class="block text-sm">Cumulative Active Days ≥</label>
                <input v-model.number="form.criteria.cumulativeActiveDaysGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
                <p class="text-xs text-gray-500 mt-1">Counts days with any site activity, not just logins.</p>
              </div>
              <div>
                <label class="block text-sm">TKO Wins ≥</label>
                <input v-model.number="form.criteria.tkoWinsGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
                <p class="text-xs text-gray-500 mt-1">Counted round wins in the TKO game.</p>
              </div>
              <div>
                <label class="block text-sm">Wordle Crown Wins ≥</label>
                <input v-model.number="form.criteria.wordleWinsGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
                <p class="text-xs text-gray-500 mt-1">Total times the user earned the 👑 (best score of the day).</p>
              </div>
              <div>
                <label class="block text-sm">Wordle Crown Streak ≥</label>
                <input v-model.number="form.criteria.wordleCurrentStreakGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
                <p class="text-xs text-gray-500 mt-1">Current consecutive-day streak of earning the 👑.</p>
              </div>
              <div>
                <label class="block text-sm">Flappy Powerpuff Best Score ≥</label>
                <input v-model.number="form.criteria.flappyBestScoreGte" type="number" min="0" class="w-full border rounded px-2 py-1" />
                <p class="text-xs text-gray-500 mt-1">
                  Highest number of buildings passed in a ranked run. Achievement rewards bypass the
                  daily points cap, so keep thresholds at levels a real player reaches and avoid
                  attaching high-value cToons here.
                </p>
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm">User created before</label>
                <input v-model="form.criteria.userCreatedBefore" type="date" class="w-full border rounded px-2 py-1 max-w-xs" />
                <p class="text-xs text-gray-500 mt-1">Users with an account created strictly earlier than this date qualify.</p>
              </div>
              <div>
                <label class="block text-sm">cMoon Points Contributed ≥</label>
                <input v-model.number="form.criteria.cMoonPointsGte" type="number" min="0" class="w-full border rounded px-2 py-1" :disabled="form.isClaimable" />
                <p class="text-xs text-gray-500 mt-1">Requires picking the cMoon rank to grant, below — only members of that cMoon are eligible.</p>
              </div>
            </div>

            <h3 class="text-lg font-semibold mt-6">cMoon Rank Reward (optional)</h3>
            <p class="text-xs text-gray-500">
              Auto-grants a rank in one cMoon's ladder when the points threshold above is met (only for
              members of that cMoon). Mutually exclusive with the claimable reward below.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1 max-w-xl">
              <div>
                <label class="block text-sm">cMoon</label>
                <select v-model="cMoonPickerId" @change="form.cMoonRankId = ''" class="w-full border rounded px-2 py-1" :disabled="form.isClaimable">
                  <option value="">— none —</option>
                  <option v-for="c in cmoons" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm">Rank</label>
                <select v-model="form.cMoonRankId" class="w-full border rounded px-2 py-1" :disabled="form.isClaimable || !cMoonPickerId">
                  <option value="">— none —</option>
                  <option v-for="r in ranksForPickedCMoon" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
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

          <div class="mt-3">
            <label class="block text-sm">cToons Required (must own all):</label>
            <div class="relative">
              <input
                v-model="ctoonsRequiredInput"
                class="w-full border rounded px-2 py-1"
                placeholder="Type 3+ characters to search"
                autocomplete="off"
                @focus="showCtoonsRequiredDropdown = true"
                @blur="hideCtoonsRequiredDropdown"
              />
              <div
                v-if="showCtoonsRequiredDropdown && filteredCtoonsRequired.length"
                class="absolute z-10 bg-white border rounded shadow-lg w-full max-h-52 overflow-y-auto"
              >
                <button
                  v-for="c in filteredCtoonsRequired"
                  :key="c.id"
                  type="button"
                  class="flex items-center gap-2 w-full px-2 py-1 hover:bg-gray-100 text-left"
                  @mousedown.prevent="addRequiredCtoon(c)"
                >
                  <img :src="c.assetPath" class="w-8 h-8 object-contain flex-shrink-0" alt="" />
                  <span class="text-sm truncate">{{ c.name }}</span>
                </button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(r, i) in form.criteria.ctoonsRequired"
                :key="r.ctoonId"
                class="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded"
              >
                <img v-if="r.assetPath" :src="r.assetPath" class="w-6 h-6 object-contain flex-shrink-0" alt="" />
                <span class="text-sm">{{ r.name }}</span>
                <button type="button" class="ml-1 text-red-600" @click="form.criteria.ctoonsRequired.splice(i, 1)">×</button>
              </div>
            </div>
          </div>

            <template v-if="!form.isClaimable">
              <h3 class="text-lg font-semibold mt-6">Rewards</h3>
              <AchievementRewardBundleEditor :model-value="form.rewards" :ctoons="ctoons" :backgrounds="backgrounds" />
            </template>

            <h3 class="text-lg font-semibold mt-6">Claimable Reward (optional)</h3>
            <div class="flex items-center gap-2">
              <input type="checkbox" v-model="form.isClaimable" id="isClaimable" :disabled="!!form.cMoonRankId" />
              <label for="isClaimable">User picks 1 of up to 4 reward bundles instead of auto-granting the Rewards above</label>
            </div>
            <div v-if="form.isClaimable" class="mt-2 space-y-3">
              <div v-for="(opt, i) in form.claimOptions" :key="i" class="border rounded p-2">
                <div class="flex items-center gap-2 mb-2">
                  <label class="text-xs flex-1">Label
                    <input v-model="opt.label" class="w-full border rounded px-2 py-1 mt-1" placeholder="Option name" />
                  </label>
                  <button type="button" class="text-red-600 px-2 py-1 text-sm" @click="removeClaimOption(i)">Remove</button>
                </div>
                <AchievementRewardBundleEditor :model-value="opt" :ctoons="ctoons" :backgrounds="backgrounds" />
              </div>
              <button v-if="form.claimOptions.length < 4" type="button" class="px-3 py-1 border rounded" @click="addClaimOption">
                Add option ({{ form.claimOptions.length }}/4)
              </button>
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
definePageMeta({ title: 'Admin - Achievements', middleware: ['auth','admin'], layout: 'admin' })

const { data: achievements, pending, refresh } = await useFetch('/api/admin/achievements')
const { data: ctoonsData } = await useFetch('/api/admin/list-ctoons')
const { data: backgroundsData } = await useFetch('/api/admin/backgrounds')
const { data: setsData } = await useFetch('/api/admin/sets')

const ctoons = computed(() => ctoonsData.value || [])
const backgrounds = computed(() => backgroundsData.value || [])
const setsOptions = computed(() => setsData.value || [])

// cMoon + rank picker for the "cMoon Rank Reward" section.
const { data: cmoonsData } = await useFetch('/api/admin/cmoons')
const cmoons = computed(() => cmoonsData.value?.cmoons || [])
const cMoonPickerId = ref('')
const ranksForPickedCMoon = computed(() => cmoons.value.find(c => c.id === cMoonPickerId.value)?.ranks || [])

const editId = ref('')
const showForm = ref(false)
const showSettings = ref(false)
const imageInput = ref(null)
const setInput = ref('')
const ctoonsRequiredInput = ref('')
const showCtoonsRequiredDropdown = ref(false)

const emptyRewardBundle = () => ({ points: 0, ctoons: [], backgrounds: [] })

const emptyForm = () => ({
  title: '', slug: '', description: '', isActive: true, notifyDiscord: false, discordRoleName: '',
  cMoonRankId: '',
  criteria: {
    pointsGte: null,
    totalCtoonsGte: null,
    uniqueCtoonsGte: null,
    auctionsWonGte: null,
    auctionsCreatedGte: null,
    tradesAcceptedGte: null,
    ctoonSuggestionsAcceptedGte: null,
    cumulativeActiveDaysGte: null,
    tkoWinsGte: null,
    wordleWinsGte: null,
    wordleCurrentStreakGte: null,
    flappyBestScoreGte: null,
    cMoonPointsGte: null,
    setsRequired: [],
    ctoonsRequired: [],
    userCreatedBefore: null
  },
  rewards: emptyRewardBundle(),
  isClaimable: false,
  claimOptions: []
})
const form = reactive(emptyForm())
const queuing = ref(false)
const settingsForm = reactive({ achievementDiscordChannelId: '' })
const settingsLoading = ref(false)
const settingsSaving = ref(false)

function resetForm() {
  Object.assign(form, emptyForm())
  editId.value = ''
  cMoonPickerId.value = ''
  ctoonsRequiredInput.value = ''
  showCtoonsRequiredDropdown.value = false
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

const filteredCtoonsRequired = computed(() => {
  const v = String(ctoonsRequiredInput.value || '').trim().toLowerCase()
  if (v.length < 3) return []
  const existing = new Set(form.criteria.ctoonsRequired.map(r => r.ctoonId))
  return (ctoons.value || []).filter(ct => !existing.has(ct.id) && ct.name.toLowerCase().includes(v))
})

function addRequiredCtoon(c) {
  if (!form.criteria.ctoonsRequired.find(r => r.ctoonId === c.id)) {
    form.criteria.ctoonsRequired.push({ ctoonId: c.id, name: c.name, assetPath: c.assetPath || null })
  }
  ctoonsRequiredInput.value = ''
  showCtoonsRequiredDropdown.value = false
}

function hideCtoonsRequiredDropdown() {
  setTimeout(() => { showCtoonsRequiredDropdown.value = false }, 150)
}

function addClaimOption() {
  if (form.claimOptions.length >= 4) return
  form.claimOptions.push({ label: '', ...emptyRewardBundle() })
}
function removeClaimOption(i) {
  form.claimOptions.splice(i, 1)
}

function startEdit(a) {
  editId.value = a.id
  Object.assign(form, {
    title: a.title,
    slug: a.slug,
    description: a.description || '',
    isActive: !!a.isActive,
    notifyDiscord: !!a.notifyDiscord,
    discordRoleName: a.discordRoleName || '',
    cMoonRankId: a.cMoonRankId || '',
    criteria: {
      pointsGte: a.pointsGte ?? null,
      totalCtoonsGte: a.totalCtoonsGte ?? null,
      uniqueCtoonsGte: a.uniqueCtoonsGte ?? null,
      auctionsWonGte: a.auctionsWonGte ?? null,
      auctionsCreatedGte: a.auctionsCreatedGte ?? null,
      tradesAcceptedGte: a.tradesAcceptedGte ?? null,
      ctoonSuggestionsAcceptedGte: a.ctoonSuggestionsAcceptedGte ?? null,
      cumulativeActiveDaysGte: a.cumulativeActiveDaysGte ?? null,
      tkoWinsGte: a.tkoWinsGte ?? null,
      wordleWinsGte: a.wordleWinsGte ?? null,
      wordleCurrentStreakGte: a.wordleCurrentStreakGte ?? null,
      flappyBestScoreGte: a.flappyBestScoreGte ?? null,
      cMoonPointsGte: a.cMoonPointsGte ?? null,
      setsRequired: [...(a.setsRequired || [])],
      ctoonsRequired: (a.ctoonsRequired || []).map(r => ({ ctoonId: r.ctoonId, name: r.name, assetPath: r.assetPath || null })),
      userCreatedBefore: a.userCreatedBefore ? String(a.userCreatedBefore).slice(0,10) : null
    },
    rewards: {
      points: a.rewards?.points || 0,
      ctoons: (a.rewards?.ctoons || []).map(r => ({ ctoonId: r.ctoonId, quantity: r.quantity })),
      backgrounds: (a.rewards?.backgrounds || []).map(r => ({ backgroundId: r.backgroundId }))
    },
    isClaimable: !!a.isClaimable,
    claimOptions: (a.claimOptions || []).map(o => ({
      label: o.label,
      points: o.points || 0,
      ctoons: (o.ctoons || []).map(r => ({ ctoonId: r.ctoonId, quantity: r.quantity })),
      backgrounds: (o.backgrounds || []).map(r => ({ backgroundId: r.backgroundId })),
    }))
  })
  cMoonPickerId.value = a.cMoonId || ''
  if (imageInput.value) imageInput.value.value = ''
  showForm.value = true
}

async function save() {
  const fd = new FormData()
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
