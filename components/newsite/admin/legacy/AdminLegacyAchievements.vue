<template>
  <div class="admin-legacy-achievements bg-gray-50 text-xs">
    <div class="px-2 py-2">
    <div class="flex flex-col gap-2 items-start mb-3 lg:flex-row lg:items-center lg:justify-between lg:gap-2">
      <h1 class="text-base font-semibold">Admin: Achievements</h1>
      <div class="flex flex-col items-start gap-2 lg:flex-row lg:items-center">
        <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="openCreate">Create Achievement</button>
        <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="queueAll" :disabled="queuing">
          {{ queuing ? 'Queuing…' : 'Queue Achievements Now' }}
        </button>
        <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="openSettings">Settings</button>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="closeForm"></div>
      <div class="relative bg-white w-full max-w-4xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="px-4 py-3 border-b flex-shrink-0">
          <h2 class="text-sm font-semibold">{{ editId ? 'Edit Achievement' : 'Create Achievement' }}</h2>
        </div>
        <form @submit.prevent="save" class="flex flex-col flex-1 min-h-0">
          <div class="px-4 py-3 overflow-y-auto flex-1 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Title</label>
                <input v-model="form.title" class="border rounded-md px-2 py-1.5 text-sm" required />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Slug (optional)</label>
                <input v-model="form.slug" class="border rounded-md px-2 py-1.5 text-sm" placeholder="auto from title" :disabled="!!editId" />
              </div>
            <div class="md:col-span-2 flex flex-col gap-1">
              <label class="text-xs font-medium">Description</label>
              <textarea v-model="form.description" class="border rounded-md px-2 py-1.5 text-sm" rows="2" />
            </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Image (png/jpg/gif)</label>
                <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/gif" class="text-xs" />
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="form.isActive" id="isActive" />
                <label for="isActive" class="text-xs">Active</label>
              </div>
              <div v-if="editId" class="flex items-center gap-2">
                <input type="checkbox" v-model="form.notifyDiscord" id="notifyDiscord" />
                <label for="notifyDiscord" class="text-xs">Announce in Discord</label>
              </div>
              <div class="md:col-span-2 flex flex-col gap-1">
                <label class="text-xs font-medium">Discord Role Name (optional)</label>
                <input v-model="form.discordRoleName" class="border rounded-md px-2 py-1.5 text-sm" placeholder="Role name to grant on achievement" />
              </div>
            </div>

            <h3 class="text-xs font-semibold">Criteria</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Total Points ≥</label>
                <input v-model.number="form.criteria.pointsGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Total cToons ≥</label>
                <input v-model.number="form.criteria.totalCtoonsGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Unique cToons ≥</label>
                <input v-model.number="form.criteria.uniqueCtoonsGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Auctions Won ≥</label>
                <input v-model.number="form.criteria.auctionsWonGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Auctions Created (Completed) ≥</label>
                <input v-model.number="form.criteria.auctionsCreatedGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Accepted Trades ≥</label>
                <input v-model.number="form.criteria.tradesAcceptedGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Accepted cToon Suggestions ≥</label>
                <input v-model.number="form.criteria.ctoonSuggestionsAcceptedGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Cumulative Active Days ≥</label>
                <input v-model.number="form.criteria.cumulativeActiveDaysGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[10px] text-gray-500 mt-1">Counts days with any site activity, not just logins.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">TKO Wins ≥</label>
                <input v-model.number="form.criteria.tkoWinsGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[10px] text-gray-500 mt-1">Counted round wins in the TKO game.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Wordle Crown Wins ≥</label>
                <input v-model.number="form.criteria.wordleWinsGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[10px] text-gray-500 mt-1">Total times the user earned the 👑 (best score of the day).</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Wordle Crown Streak ≥</label>
                <input v-model.number="form.criteria.wordleCurrentStreakGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[10px] text-gray-500 mt-1">Current consecutive-day streak of earning the 👑.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Flappy Powerpuff Best Score ≥</label>
                <input v-model.number="form.criteria.flappyBestScoreGte" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[10px] text-gray-500 mt-1">
                  Highest number of buildings passed in a ranked run. Achievement rewards bypass the
                  daily points cap, so keep thresholds at levels a real player reaches and avoid
                  attaching high-value cToons here.
                </p>
              </div>
              <div class="md:col-span-3 flex flex-col gap-1">
                <label class="text-xs font-medium">User created before</label>
                <input v-model="form.criteria.userCreatedBefore" type="date" class="border rounded-md px-2 py-1.5 text-sm max-w-xs" />
                <p class="text-[10px] text-gray-500 mt-1">Users with an account created strictly earlier than this date qualify.</p>
              </div>
            </div>
          <div class="mt-3">
            <label class="block text-xs font-medium">Set completion (AND):</label>
            <div class="flex gap-2 items-center mb-2 mt-1">
              <datalist id="ach-sets-list">
                <option v-for="opt in filteredSetOptions(setInput)" :key="opt" :value="opt" />
              </datalist>
              <input v-model="setInput" list="ach-sets-list" class="border rounded-md px-2 py-1.5 text-sm flex-1" placeholder="Type 3+ characters to search" />
              <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="addSet">Add</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-for="s in form.criteria.setsRequired" :key="s" class="px-2 py-1 text-xs bg-gray-100 rounded">
                {{ s }}
                <button type="button" class="ml-1 text-red-600" @click="removeSet(s)">×</button>
              </span>
            </div>
          </div>

          <div class="mt-3">
            <label class="block text-xs font-medium">cToons Required (must own all):</label>
            <div class="relative mt-1">
              <input
                v-model="ctoonsRequiredInput"
                class="border rounded-md px-2 py-1.5 text-sm w-full"
                placeholder="Type 3+ characters to search"
                autocomplete="off"
                @focus="showCtoonsRequiredDropdown = true"
                @blur="hideCtoonsRequiredDropdown"
              />
              <div
                v-if="showCtoonsRequiredDropdown && filteredCtoonsRequired.length"
                class="absolute z-10 bg-white border rounded-md shadow-lg w-full max-h-52 overflow-y-auto"
              >
                <button
                  v-for="c in filteredCtoonsRequired"
                  :key="c.id"
                  type="button"
                  class="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-gray-100 text-left"
                  @mousedown.prevent="addRequiredCtoon(c)"
                >
                  <img :src="c.assetPath" class="w-8 h-8 object-contain flex-shrink-0" alt="" />
                  <span class="text-xs truncate">{{ c.name }}</span>
                </button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              <div
                v-for="(r, i) in form.criteria.ctoonsRequired"
                :key="r.ctoonId"
                class="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 rounded"
              >
                <img v-if="r.assetPath" :src="r.assetPath" class="w-6 h-6 object-contain flex-shrink-0" alt="" />
                <span class="text-xs">{{ r.name }}</span>
                <button type="button" class="ml-1 text-red-600" @click="form.criteria.ctoonsRequired.splice(i, 1)">×</button>
              </div>
            </div>
          </div>

            <h3 class="text-xs font-semibold mt-4">Rewards</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Points</label>
                <input v-model.number="form.rewards.points" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
            <div class="md:col-span-2 flex flex-col gap-1">
              <label class="text-xs font-medium">Add cToon reward</label>
              <div class="flex gap-2 items-center">
                <datalist id="ach-ctoon-list">
                  <option v-for="c in filteredCtoons(ctoonSelection.name)" :key="c.id" :value="c.name" />
                </datalist>
                <input
                  v-model="ctoonSelection.name"
                  list="ach-ctoon-list"
                  class="border rounded-md px-2 py-1.5 text-sm w-full"
                  placeholder="Type 3+ characters to search"
                />
                <input v-model.number="ctoonSelection.qty" type="number" min="1" class="w-24 border rounded-md px-2 py-1.5 text-sm" />
                <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="addCtoon">Add</button>
              </div>
              <div class="text-xs mt-1" v-if="form.rewards.ctoons.length">
                <div v-for="(r, i) in form.rewards.ctoons" :key="r.ctoonId" class="flex items-center gap-2">
                  <span>{{ nameForCtoon(r.ctoonId) }} × {{ r.quantity }}</span>
                  <button type="button" class="text-red-600" @click="form.rewards.ctoons.splice(i,1)">Remove</button>
                </div>
              </div>
            </div>
            </div>

          <div class="mt-3">
            <label class="block text-xs font-medium">Backgrounds</label>
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-auto border p-2 rounded-md mt-1">
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

          <h3 class="text-xs font-semibold mt-4">Claimable Reward (optional)</h3>
          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="form.isClaimable" id="isClaimable" />
            <label for="isClaimable" class="text-xs">User picks 1 of up to 4 reward options instead of auto-granting the Rewards above</label>
          </div>
          <div v-if="form.isClaimable" class="mt-2 space-y-2">
            <div v-for="(opt, i) in form.claimOptions" :key="i" class="border rounded-md p-2 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-medium">Label</label>
                <input v-model="opt.label" class="border rounded-md px-2 py-1.5 text-sm" placeholder="Option name" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-medium">Points</label>
                <input v-model.number="opt.points" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-medium">cToon</label>
                <datalist :id="`claim-ctoon-list-${i}`">
                  <option v-for="c in filteredCtoons(opt.ctoonName)" :key="c.id" :value="c.name" />
                </datalist>
                <input
                  v-model="opt.ctoonName"
                  :list="`claim-ctoon-list-${i}`"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="Type 3+ chars"
                  @change="setClaimOptionCtoon(opt, opt.ctoonName)"
                />
              </div>
              <div class="flex items-end gap-2">
                <div class="flex-1 flex flex-col gap-1">
                  <label class="text-[10px] font-medium">Qty</label>
                  <input v-model.number="opt.quantity" type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <button type="button" class="text-red-600 px-2 py-1 text-xs" @click="removeClaimOption(i)">Remove</button>
              </div>
            </div>
            <button v-if="form.claimOptions.length < 4" type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="addClaimOption">
              Add option ({{ form.claimOptions.length }}/4)
            </button>
          </div>
          </div>
          <div class="px-4 py-3 border-t flex gap-2 justify-end flex-shrink-0">
            <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closeForm">Cancel</button>
            <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" type="submit">{{ editId ? 'Save Changes' : 'Create Achievement' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="closeSettings"></div>
      <div class="relative bg-white w-full max-w-lg rounded-lg shadow-lg flex flex-col">
        <div class="px-4 py-3 border-b flex-shrink-0">
          <h2 class="text-sm font-semibold">Achievement Settings</h2>
        </div>
        <div class="px-4 py-3">
          <label class="block text-xs font-medium">Discord Channel ID (Announcements)</label>
          <input
            v-model="settingsForm.achievementDiscordChannelId"
            class="border rounded-md px-2 py-1.5 text-sm w-full mt-1"
            placeholder="123456789012345678"
            :disabled="settingsLoading || settingsSaving"
          />
          <p class="text-[10px] text-gray-500 mt-1">
            Leave blank to use the DISCORD_ANNOUNCEMENTS_CHANNEL environment variable.
          </p>
        </div>
        <div class="px-4 py-3 border-t flex gap-2 justify-end flex-shrink-0">
          <button type="button" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="closeSettings">Cancel</button>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" type="button" @click="saveSettings" :disabled="settingsSaving">
            {{ settingsSaving ? 'Saving…' : 'Save Settings' }}
          </button>
        </div>
      </div>
    </div>

    <div>
      <h2 class="text-xs font-semibold mb-2">Existing Achievements</h2>
      <div v-if="pending" class="text-gray-500 py-6 text-center">Loading…</div>
      <div v-else class="divide-y border rounded-md">
        <div v-for="a in achievements" :key="a.id" class="p-2 flex items-center gap-3">
          <img v-if="a.imagePath" :src="a.imagePath" class="w-12 h-12 object-cover rounded" alt="" />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-xs">{{ a.title }}</div>
            <div class="text-[10px] text-gray-500">Slug: {{ a.slug }} • Active: {{ a.isActive ? 'yes' : 'no' }}</div>
          </div>
          <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="startEdit(a)">Edit</button>
          <button class="px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50" @click="remove(a)">Delete</button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>

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
const ctoonsRequiredInput = ref('')
const showCtoonsRequiredDropdown = ref(false)

const emptyForm = () => ({
  title: '', slug: '', description: '', isActive: true, notifyDiscord: false, discordRoleName: '',
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
    setsRequired: [],
    ctoonsRequired: [],
    userCreatedBefore: null
  },
  rewards: { points: 0, ctoons: [], backgrounds: [] },
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
  bgSelection.value = []
  ctoonSelection.value = { name: '', qty: 1 }
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

const claimOptionCtoonInput = ref('')
function addClaimOption() {
  if (form.claimOptions.length >= 4) return
  form.claimOptions.push({ label: '', points: 0, ctoonId: '', ctoonName: '', quantity: 1 })
}
function removeClaimOption(i) {
  form.claimOptions.splice(i, 1)
}
function setClaimOptionCtoon(opt, name) {
  const match = ctoons.value.find(c => c.name === name)
  if (!match) return
  opt.ctoonId = match.id
  opt.ctoonName = match.name
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
    discordRoleName: a.discordRoleName || '',
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
    claimOptions: (a.claimOptions || []).map(o => ({ label: o.label, points: o.points || 0, ctoonId: o.ctoonId || '', ctoonName: o.ctoonName || '', quantity: o.quantity || 1 }))
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
