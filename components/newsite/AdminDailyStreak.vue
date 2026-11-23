<template>
  <div class="admin-daily-streak bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Manage Daily Streak</h1>
      </div>
      <p class="text-gray-500">
        A player's streak grows by 1 every day they complete every one of their daily tasks (the
        checklist on the newsite home page), and resets to 0 the first day they miss one. Configure
        a reward for any streak-day milestone below — a day can carry more than one reward row
        (e.g. a pack AND points), and every row for that day grants together the moment a player's
        streak reaches it.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Settings ───────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Settings</h2>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="settings.dailyStreakRepeatEnabled" />
          <span class="text-xs font-medium">Repeat the schedule indefinitely</span>
        </label>
        <p class="text-[11px] text-gray-500">
          Off (default): once a streak passes the highest configured day below, it keeps counting
          but stops granting further rewards. On: the whole schedule repeats, using the highest
          configured day as the cycle length — e.g. with rewards at days 3, 5, 10 and 25, day 28
          grants the day-3 reward again, day 30 grants day 5 again, and so on.
        </p>

        <p v-if="settingsError" class="text-red-600">{{ settingsError }}</p>
        <button
          type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="savingSettings" @click="saveSettings"
        >{{ savingSettings ? 'Saving…' : 'Save settings' }}</button>
      </div>

      <!-- ── Milestone rewards ──────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Milestone rewards</h2>

        <div v-if="rewardsByDay.length" class="space-y-2">
          <div v-for="group in rewardsByDay" :key="group.day" class="border rounded p-2 space-y-1">
            <p class="font-semibold text-[11px]">Day {{ group.day }}</p>
            <div v-for="r in group.rewards" :key="r.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
              <span class="flex-1 min-w-0 break-words">{{ rewardLabel(r) }}</span>
              <button type="button" class="text-red-600 hover:underline flex-shrink-0" :disabled="deletingRewardId === r.id" @click="removeReward(r)">
                {{ deletingRewardId === r.id ? 'Removing…' : 'Remove' }}
              </button>
            </div>
          </div>
        </div>
        <p v-else class="text-gray-500">No milestones configured yet.</p>

        <p v-if="rewardFormError" class="text-red-600">{{ rewardFormError }}</p>
        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-24 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Day</label>
            <input v-model.number="rewardForm.day" type="number" min="1" max="3650" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-36 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Reward type</label>
            <select v-model="rewardForm.rewardType" class="w-full border rounded px-2 py-1">
              <option value="CTOON">cToon</option>
              <option value="PACK">Pack</option>
              <option value="POINTS">Points</option>
              <option value="CMOON_POINTS">cMoon points</option>
            </select>
          </div>
          <div v-if="rewardForm.rewardType === 'CTOON' || rewardForm.rewardType === 'PACK'" class="w-20 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Qty (1-20)</label>
            <input v-model.number="rewardForm.amount" type="number" min="1" max="20" class="w-full border rounded px-2 py-1" />
          </div>
          <div v-else class="w-28 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Amount</label>
            <input v-model.number="rewardForm.amount" type="number" min="1" max="100000" class="w-full border rounded px-2 py-1" />
          </div>
        </div>

        <div v-if="rewardForm.rewardType === 'CTOON'">
          <label class="block text-[11px] font-medium mb-1">cToon</label>
          <input
            v-model="rewardCtoonSearch" class="w-full border rounded px-2 py-1"
            :placeholder="rewardForm.ctoonId ? rewardCtoonSelectedName : 'Type 3+ characters of a cToon'"
            autocapitalize="none" autocorrect="off" spellcheck="false"
          />
          <div v-if="rewardCtoonSuggestions.length" class="mt-1 border rounded divide-y bg-white max-h-32 overflow-y-auto">
            <button
              v-for="c in rewardCtoonSuggestions" :key="c.id" type="button"
              class="w-full text-left px-2 py-1 text-[11px] hover:bg-gray-100" @click="selectRewardCtoon(c)"
            >{{ c.name }}</button>
          </div>
        </div>
        <div v-else-if="rewardForm.rewardType === 'PACK'">
          <label class="block text-[11px] font-medium mb-1">Pack</label>
          <select v-model="rewardForm.packId" class="w-full border rounded px-2 py-1">
            <option value="">Select a pack…</option>
            <option v-for="p in packsCatalog" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <button
          type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="rewardSaving" @click="addReward"
        >{{ rewardSaving ? 'Adding…' : 'Add reward' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'

const loading = ref(false)
const loadError = ref('')

// ── Settings ──────────────────────────────────────────────────────────
const settings = reactive({ dailyStreakRepeatEnabled: false })
const savingSettings = ref(false)
const settingsError = ref('')

async function saveSettings() {
  settingsError.value = ''
  savingSettings.value = true
  try {
    const res = await $fetch('/api/admin/daily-streak-settings', { method: 'POST', body: { ...settings } })
    Object.assign(settings, res)
  } catch (e) {
    settingsError.value = e?.data?.statusMessage || 'Failed to save settings'
  } finally {
    savingSettings.value = false
  }
}

// ── Milestone rewards ───────────────────────────────────────────────────
const rewards = ref([])
const rewardsByDay = computed(() => {
  const byDay = new Map()
  for (const r of rewards.value) {
    if (!byDay.has(r.day)) byDay.set(r.day, [])
    byDay.get(r.day).push(r)
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, dayRewards]) => ({ day, rewards: dayRewards }))
})

const ctoonsCatalog = ref([])
const packsCatalog = ref([])

const rewardSaving = ref(false)
const rewardFormError = ref('')
const deletingRewardId = ref('')
const rewardCtoonSearch = ref('')
const emptyRewardForm = () => ({ day: 1, rewardType: 'CTOON', ctoonId: '', packId: '', amount: 1 })
const rewardForm = reactive(emptyRewardForm())

function resetRewardForm() {
  rewardFormError.value = ''
  rewardCtoonSearch.value = ''
  Object.assign(rewardForm, emptyRewardForm())
}

const rewardCtoonSelectedName = computed(() => ctoonsCatalog.value.find(c => c.id === rewardForm.ctoonId)?.name || '')
const rewardCtoonSuggestions = computed(() => {
  const v = rewardCtoonSearch.value.trim().toLowerCase()
  if (v.length < 3) return []
  return ctoonsCatalog.value.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
})
function selectRewardCtoon(c) {
  rewardForm.ctoonId = c.id
  rewardCtoonSearch.value = c.name
}

function rewardLabel(r) {
  if (r.rewardType === 'CTOON') return `${r.ctoon?.name || 'Unknown cToon'} x${r.amount}`
  if (r.rewardType === 'PACK') return `${r.pack?.name || 'Unknown pack'} x${r.amount}`
  if (r.rewardType === 'CMOON_POINTS') return `${r.amount} cMoon points`
  return `${r.amount} points`
}

async function loadRewards() {
  const res = await $fetch('/api/admin/daily-streak-rewards')
  rewards.value = res?.rewards || []
}

async function addReward() {
  rewardFormError.value = ''
  const day = Math.trunc(Number(rewardForm.day))
  if (!Number.isInteger(day) || day < 1 || day > 3650) {
    rewardFormError.value = 'Day must be between 1 and 3650.'
    return
  }
  const amount = Math.trunc(Number(rewardForm.amount))
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    rewardFormError.value = 'Amount must be between 1 and 100000.'
    return
  }
  const body = { day, rewardType: rewardForm.rewardType, amount }
  if (rewardForm.rewardType === 'CTOON') {
    if (!rewardForm.ctoonId) { rewardFormError.value = 'Pick a cToon.'; return }
    body.ctoonId = rewardForm.ctoonId
  } else if (rewardForm.rewardType === 'PACK') {
    if (!rewardForm.packId) { rewardFormError.value = 'Pick a pack.'; return }
    body.packId = rewardForm.packId
  }

  rewardSaving.value = true
  try {
    await $fetch('/api/admin/daily-streak-rewards', { method: 'POST', body })
    resetRewardForm()
    await loadRewards()
  } catch (e) {
    rewardFormError.value = e?.data?.statusMessage || 'Failed to add reward'
  } finally {
    rewardSaving.value = false
  }
}

async function removeReward(r) {
  if (!confirm('Remove this reward row?')) return
  deletingRewardId.value = r.id
  try {
    await $fetch(`/api/admin/daily-streak-rewards/${r.id}`, { method: 'DELETE' })
    await loadRewards()
  } catch (e) {
    rewardFormError.value = e?.data?.statusMessage || 'Failed to remove reward'
  } finally {
    deletingRewardId.value = ''
  }
}

// ── Load ───────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [settingsData, ctoonsData, packsData] = await Promise.all([
      $fetch('/api/admin/daily-streak-settings'),
      $fetch('/api/admin/list-ctoons'),
      $fetch('/api/admin/packs', { query: { limit: 200 } }),
    ])
    Object.assign(settings, settingsData)
    ctoonsCatalog.value = ctoonsData || []
    packsCatalog.value = packsData?.items || []
    await loadRewards()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load Daily Streak settings'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
