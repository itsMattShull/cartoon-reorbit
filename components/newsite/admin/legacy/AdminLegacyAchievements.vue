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
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">cMoon Points Contributed ≥</label>
                <input
                  v-model.number="form.criteria.cMoonPointsGte" type="number" min="0"
                  class="border rounded-md px-2 py-1.5 text-sm" :disabled="form.isClaimable"
                />
                <p class="text-[10px] text-gray-500 mt-1">Requires picking the cMoon rank to grant, below — only members of that cMoon are eligible.</p>
              </div>
            </div>

            <h3 class="text-xs font-semibold mt-4">cMoon Rank Reward (optional)</h3>
            <p class="text-[10px] text-gray-500">
              Auto-grants a rank in one cMoon's ladder when the points threshold above is met (only for
              members of that cMoon). Mutually exclusive with the claimable reward below.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1 max-w-xl">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">cMoon</label>
                <select v-model="cMoonPickerId" @change="form.cMoonRankId = ''" class="border rounded-md px-2 min-h-[44px] text-sm" style="font-size:16px" :disabled="form.isClaimable">
                  <option value="">— none —</option>
                  <option v-for="c in cmoons" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Rank</label>
                <select v-model="form.cMoonRankId" class="border rounded-md px-2 min-h-[44px] text-sm" style="font-size:16px" :disabled="form.isClaimable || !cMoonPickerId">
                  <option value="">— none —</option>
                  <option v-for="r in ranksForPickedCMoon" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
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

            <template v-if="!form.isClaimable">
              <h3 class="text-xs font-semibold mt-4">Rewards</h3>
              <AchievementRewardBundleEditor :model-value="form.rewards" :ctoons="ctoons" :backgrounds="backgrounds" />
            </template>

            <h3 class="text-xs font-semibold mt-4">Claimable Reward (optional)</h3>
            <div class="flex items-center gap-2">
              <input type="checkbox" v-model="form.isClaimable" id="isClaimable" :disabled="!!form.cMoonRankId" />
              <label for="isClaimable" class="text-xs">User picks 1 of up to 4 reward bundles instead of auto-granting the Rewards above</label>
            </div>
            <div v-if="form.isClaimable" class="mt-2 space-y-2">
              <details v-for="(opt, i) in form.claimOptions" :key="i" class="border rounded-md" open>
                <summary class="claim-opt-summary cursor-pointer select-none px-2 py-2 flex items-center gap-2">
                  <span class="flex-1 text-xs font-medium truncate">{{ opt.label || `Option ${i + 1}` }}</span>
                  <button type="button" class="text-red-600 px-2 text-xs claim-opt-remove" @click.prevent="removeClaimOption(i)">Remove</button>
                </summary>
                <div class="px-2 pb-2">
                  <label class="text-[10px] font-medium">Label</label>
                  <input v-model="opt.label" class="border rounded-md px-2 py-1.5 text-sm w-full mb-2" style="font-size:16px; min-height:44px" placeholder="Option name" />
                  <AchievementRewardBundleEditor :model-value="opt" :ctoons="ctoons" :backgrounds="backgrounds" />
                </div>
              </details>
              <button v-if="form.claimOptions.length < 4" type="button" class="px-3 py-2 text-xs border rounded-md hover:bg-gray-50 claim-opt-add" @click="addClaimOption">
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

// cMoon + rank picker for the "cMoon Rank Reward" section — reuses the same admin endpoint
// AdminCMoon.vue reads, which already includes each cMoon's ranks.
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

<style scoped>
/* 44px minimum touch targets on the new claim-option disclosures, matching the convention
   used in AdminCMoon.vue (this older form otherwise relies on bare Tailwind text-xs sizing). */
.claim-opt-summary,
.claim-opt-remove,
.claim-opt-add {
  min-height: 44px;
}
</style>
