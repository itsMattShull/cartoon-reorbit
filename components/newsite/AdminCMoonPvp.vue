<template>
  <div class="admin-cmoon-pvp bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">cMoon PvP</h1>
      </div>
      <p class="text-gray-500">
        Live team-vs-team battles — up to {{ settings.cMoonPvpMaxTeamSize }}-a-side, built on the same
        engine as cMoon Enemy Raids. Players start/join matches from the cMoons nav page; nothing here
        starts a match, this just controls the rules every match is created under.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Settings ───────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Settings</h2>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="settings.cMoonPvpEnabled" />
          <span class="text-xs font-medium">Enable cMoon PvP</span>
        </label>
        <p class="text-[11px] text-gray-500">
          Master switch — off by default. Before enabling, review each special attack's
          <strong>PvP eligible</strong> flag in the Special Attacks section: values tuned for a boss fight
          (especially Paralyze/Damage Opponent) can be wildly over- or under-powered at PvP's symmetric
          player-vs-player scale.
        </p>

        <div class="flex items-end gap-3 flex-wrap">
          <div class="w-28">
            <label class="block text-[11px] font-medium mb-1">Max team size (1-8)</label>
            <input v-model.number="settings.cMoonPvpMaxTeamSize" type="number" min="1" max="8" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-32">
            <label class="block text-[11px] font-medium mb-1">Join window (sec)</label>
            <input v-model.number="settings.cMoonPvpJoinWindowSeconds" type="number" min="15" max="120" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-32">
            <label class="block text-[11px] font-medium mb-1">Round limit</label>
            <input v-model.number="settings.cMoonPvpRoundLimit" type="number" min="50" max="10000" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-32">
            <label class="block text-[11px] font-medium mb-1">cMoon points per win</label>
            <input v-model.number="settings.cMoonPvpPointsPerWin" type="number" min="0" max="10000" class="w-full border rounded px-2 py-1" />
          </div>
        </div>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="settings.cMoonPvpTeammatesOnlyEnabled" />
          <span class="text-xs font-medium">Restrict matches to cMoon teammates only</span>
        </label>
        <p class="text-[11px] text-gray-500">
          When on, each side of a match must be one cMoon's own members — the first joiner on a side
          locks it to their cMoon, and the two sides must be different cMoons. When off, anyone can join
          either side regardless of cMoon (or with no cMoon at all).
        </p>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="settings.cMoonPvpPrivateLobbiesEnabled" />
          <span class="text-xs font-medium">Allow private (invite-only) match lobbies</span>
        </label>

        <div class="pt-2 border-t space-y-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="settings.cMoonPvpEqualizeHpEnabled" />
            <span class="text-xs font-medium">Equalize HP for PvP matches</span>
          </label>
          <p class="text-[11px] text-gray-500">
            Gives every PvP participant the same flat HP regardless of cMoon rank, so a base-HP player
            isn't crushed by a higher-ranked opponent. Only affects PvP — solo battles and raids keep
            their normal rank-based HP either way.
          </p>
          <div v-if="settings.cMoonPvpEqualizeHpEnabled" class="w-28">
            <label class="block text-[11px] font-medium mb-1">Equalized HP (1-50)</label>
            <input v-model.number="settings.cMoonPvpEqualizeHpAmount" type="number" min="1" max="50" class="w-full border rounded px-2 py-1" />
          </div>
        </div>

        <p v-if="settingsError" class="text-red-600">{{ settingsError }}</p>
        <button
          type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="savingSettings" @click="saveSettings"
        >{{ savingSettings ? 'Saving…' : 'Save settings' }}</button>
      </div>

      <!-- ── Reward pools ───────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Reward pools</h2>
        <p class="text-gray-500">
          Four independent pools — each row is rolled independently, same as cMoon Enemy rewards.
          Match pools apply to an ordinary open-lobby match; Tournament pools apply once tournament
          wiring (Phase 5) links a match to a bracket round.
        </p>

        <div class="flex gap-2 flex-wrap">
          <button
            v-for="ctx in REWARD_CONTEXTS" :key="ctx.value" type="button"
            class="px-2 py-1 rounded text-[11px] font-semibold border"
            :class="rewardContext === ctx.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'"
            @click="rewardContext = ctx.value"
          >{{ ctx.label }}</button>
        </div>

        <div v-if="rewardsForContext.length" class="space-y-1">
          <div v-for="r in rewardsForContext" :key="r.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
            <span class="flex-1 min-w-0 break-words">
              {{ rewardLabel(r) }} — {{ r.dropChancePercent }}% chance<span v-if="r.rewardType === 'CTOON' || r.rewardType === 'PACK'"> · x{{ r.quantity }}</span>
            </span>
            <button type="button" class="text-red-600 hover:underline flex-shrink-0" :disabled="deletingRewardId === r.id" @click="removeReward(r)">
              {{ deletingRewardId === r.id ? 'Removing…' : 'Remove' }}
            </button>
          </div>
        </div>
        <p v-else class="text-gray-500">No prizes configured yet for this pool.</p>

        <p v-if="rewardFormError" class="text-red-600">{{ rewardFormError }}</p>
        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-32 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Prize type</label>
            <select v-model="rewardForm.rewardType" class="w-full border rounded px-2 py-1">
              <option value="CTOON">cToon</option>
              <option value="AVATAR">Avatar</option>
              <option value="BACKGROUND">Background</option>
              <option value="POINTS">Points</option>
              <option value="PACK">Pack</option>
            </select>
          </div>
          <div class="w-24 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Drop % (0-100)</label>
            <input v-model.number="rewardForm.dropChancePercent" type="number" min="0" max="100" step="0.1" class="w-full border rounded px-2 py-1" />
          </div>
          <div v-if="rewardForm.rewardType === 'CTOON' || rewardForm.rewardType === 'PACK'" class="w-20 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Qty (1-20)</label>
            <input v-model.number="rewardForm.quantity" type="number" min="1" max="20" class="w-full border rounded px-2 py-1" />
          </div>
          <div v-if="rewardForm.rewardType === 'POINTS'" class="w-28 flex-shrink-0">
            <label class="block text-[11px] font-medium mb-1">Points (1-5000)</label>
            <input v-model.number="rewardForm.pointsAmount" type="number" min="1" max="5000" class="w-full border rounded px-2 py-1" />
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
        <div v-else-if="rewardForm.rewardType === 'AVATAR'">
          <label class="block text-[11px] font-medium mb-1">Avatar</label>
          <select v-model="rewardForm.avatarId" class="w-full border rounded px-2 py-1">
            <option value="">Select an avatar…</option>
            <option v-for="av in avatarsCatalog" :key="av.id" :value="av.id">{{ av.label || av.filename }}</option>
          </select>
        </div>
        <div v-else-if="rewardForm.rewardType === 'BACKGROUND'">
          <label class="block text-[11px] font-medium mb-1">Background</label>
          <select v-model="rewardForm.backgroundId" class="w-full border rounded px-2 py-1">
            <option value="">Select a background…</option>
            <option v-for="bg in backgroundsCatalog" :key="bg.id" :value="bg.id">{{ bg.label || bg.filename }}</option>
          </select>
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
        >{{ rewardSaving ? 'Adding…' : 'Add prize' }}</button>
      </div>

      <!-- ── Tournaments ────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Tournaments</h2>
        <p class="text-gray-500">
          Single-elimination bracket, admin-opened round by round once entries close — a cron can't make
          two live teams show up at the same instant. Opening rounds and resolving bracket matches ships
          separately once the live match linkage exists; this manages tournament setup and team entries.
        </p>

        <div v-if="tournaments.length" class="space-y-1">
          <button
            v-for="t in tournaments" :key="t.id" type="button"
            class="w-full text-left flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1 hover:bg-gray-100"
            :class="selectedTournamentId === t.id ? 'ring-2 ring-blue-500' : ''"
            @click="selectTournament(t.id)"
          >
            <span class="flex-1 min-w-0 break-words font-semibold">{{ t.name }}</span>
            <span class="px-1.5 py-0.5 rounded bg-white border text-[10px]">{{ t.status }}</span>
            <span class="text-gray-500">{{ t._count?.entries || 0 }} team{{ t._count?.entries === 1 ? '' : 's' }}</span>
          </button>
        </div>
        <p v-else class="text-gray-500">No tournaments yet.</p>

        <!-- Selected tournament detail -->
        <div v-if="selectedTournament" class="pt-2 border-t space-y-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h3 class="font-semibold text-xs">{{ selectedTournament.name }} — {{ selectedTournament.status }}</h3>
            <div class="flex gap-2 flex-wrap">
              <button
                v-if="selectedTournament.status === 'DRAFT'" type="button"
                class="px-2 py-1 text-[11px] font-semibold rounded border hover:bg-gray-50"
                :disabled="tournamentActionBusy" @click="setTournamentStatus('ENTRY_OPEN')"
              >Open entries</button>
              <button
                v-if="selectedTournament.status === 'ENTRY_OPEN'" type="button"
                class="px-2 py-1 text-[11px] font-semibold rounded border hover:bg-gray-50"
                :disabled="tournamentActionBusy" @click="setTournamentStatus('ENTRY_CLOSED')"
              >Close entries</button>
              <button
                v-if="selectedTournament.status === 'DRAFT' || selectedTournament.status === 'ENTRY_OPEN'" type="button"
                class="px-2 py-1 text-[11px] font-semibold rounded border border-red-300 text-red-600 hover:bg-red-50"
                :disabled="tournamentActionBusy" @click="cancelTournament"
              >Cancel</button>
            </div>
          </div>
          <p v-if="tournamentActionError" class="text-red-600">{{ tournamentActionError }}</p>

          <div v-if="selectedTournament.entries?.length" class="space-y-1">
            <div v-for="e in selectedTournament.entries" :key="e.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
              <span class="flex-1 min-w-0 break-words">
                <strong>{{ e.teamName }}</strong>
                <span v-if="e.cMoon"> — {{ e.cMoon.name }}</span>
                <span class="text-gray-500"> · {{ e.members?.length || 0 }} player{{ e.members?.length === 1 ? '' : 's' }}</span>
              </span>
              <button
                v-if="selectedTournament.status === 'DRAFT' || selectedTournament.status === 'ENTRY_OPEN'"
                type="button" class="text-red-600 hover:underline flex-shrink-0"
                :disabled="deletingEntryId === e.id" @click="removeEntry(e)"
              >{{ deletingEntryId === e.id ? 'Removing…' : 'Remove' }}</button>
            </div>
          </div>
          <p v-else class="text-gray-500">No teams entered yet.</p>

          <div v-if="selectedTournament.status === 'DRAFT' || selectedTournament.status === 'ENTRY_OPEN'" class="space-y-2">
            <p v-if="entryFormError" class="text-red-600">{{ entryFormError }}</p>
            <div class="flex gap-2 flex-wrap items-end">
              <div class="w-40">
                <label class="block text-[11px] font-medium mb-1">Team name</label>
                <input v-model="entryForm.teamName" maxlength="60" class="w-full border rounded px-2 py-1" />
              </div>
              <div class="w-48">
                <label class="block text-[11px] font-medium mb-1">cMoon (optional — whole roster enters)</label>
                <select v-model="entryForm.cMoonId" class="w-full border rounded px-2 py-1">
                  <option value="">Mixed squad (pick players below)</option>
                  <option v-for="c in cmoonsCatalog" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>
            <div v-if="!entryForm.cMoonId">
              <label class="block text-[11px] font-medium mb-1">Player usernames, comma-separated</label>
              <input v-model="entryForm.memberUsernamesRaw" class="w-full border rounded px-2 py-1" placeholder="player1, player2, player3" />
            </div>
            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="entrySaving" @click="addEntry"
            >{{ entrySaving ? 'Adding…' : 'Add team' }}</button>
          </div>

          <AdminCMoonPvpTournamentBracket
            v-if="selectedTournament.status !== 'DRAFT' && selectedTournament.status !== 'ENTRY_OPEN'"
            :tournament="selectedTournament" class="pt-2 border-t"
            @refresh="refreshSelectedTournament"
          />
        </div>

        <!-- Create tournament -->
        <div class="pt-2 border-t space-y-2">
          <h3 class="font-semibold text-xs">New tournament</h3>
          <p v-if="createTournamentError" class="text-red-600">{{ createTournamentError }}</p>
          <div class="flex gap-2 flex-wrap items-end">
            <div class="w-48">
              <label class="block text-[11px] font-medium mb-1">Name</label>
              <input v-model="newTournament.name" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="Summer PvP Cup" />
            </div>
            <div class="w-28">
              <label class="block text-[11px] font-medium mb-1">Max team size</label>
              <input v-model.number="newTournament.maxTeamSize" type="number" min="1" max="8" class="w-full border rounded px-2 py-1" />
            </div>
          </div>
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="creatingTournament" @click="createTournament"
          >{{ creatingTournament ? 'Creating…' : 'Create tournament' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'

const loading = ref(false)
const loadError = ref('')

// ── Settings ──────────────────────────────────────────────────────────
const emptySettings = () => ({
  cMoonPvpEnabled: false, cMoonPvpMaxTeamSize: 4, cMoonPvpTeammatesOnlyEnabled: false,
  cMoonPvpEqualizeHpEnabled: false, cMoonPvpEqualizeHpAmount: 7, cMoonPvpPointsPerWin: 0,
  cMoonPvpJoinWindowSeconds: 60, cMoonPvpRoundLimit: 300, cMoonPvpPrivateLobbiesEnabled: true,
})
const settings = reactive(emptySettings())
const savingSettings = ref(false)
const settingsError = ref('')

async function saveSettings() {
  settingsError.value = ''
  savingSettings.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-pvp-settings', { method: 'POST', body: { ...settings } })
    Object.assign(settings, res)
  } catch (e) {
    settingsError.value = e?.data?.statusMessage || 'Failed to save settings'
  } finally {
    savingSettings.value = false
  }
}

// ── Reward pools ──────────────────────────────────────────────────────
const REWARD_CONTEXTS = [
  { value: 'MATCH_WIN', label: 'Match win' },
  { value: 'MATCH_PARTICIPATION', label: 'Match participation (losing side)' },
  { value: 'TOURNAMENT_WINNER', label: 'Tournament winner' },
  { value: 'TOURNAMENT_PARTICIPATION', label: 'Tournament participation' },
]
const rewardContext = ref('MATCH_WIN')
const rewards = ref([])
const rewardsForContext = computed(() => rewards.value.filter(r => r.context === rewardContext.value))

const avatarsCatalog = ref([])
const backgroundsCatalog = ref([])
const ctoonsCatalog = ref([])
const packsCatalog = ref([])
const cmoonsCatalog = ref([])

const rewardSaving = ref(false)
const rewardFormError = ref('')
const deletingRewardId = ref('')
const rewardCtoonSearch = ref('')
const emptyRewardForm = () => ({ rewardType: 'CTOON', ctoonId: '', avatarId: '', backgroundId: '', packId: '', dropChancePercent: 10, quantity: 1, pointsAmount: 100 })
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
  if (r.rewardType === 'CTOON') return r.ctoon?.name || 'Unknown cToon'
  if (r.rewardType === 'AVATAR') return r.avatar?.label || 'Unknown avatar'
  if (r.rewardType === 'POINTS') return `${r.quantity} points`
  if (r.rewardType === 'PACK') return r.pack?.name || 'Unknown pack'
  return r.background?.label || 'Unknown background'
}

async function loadRewards() {
  const res = await $fetch('/api/admin/cmoon-pvp-rewards')
  rewards.value = res?.rewards || []
}

async function addReward() {
  rewardFormError.value = ''
  const dropChancePercent = Number(rewardForm.dropChancePercent)
  if (!Number.isFinite(dropChancePercent) || dropChancePercent < 0 || dropChancePercent > 100) {
    rewardFormError.value = 'Drop chance must be between 0 and 100.'
    return
  }
  const body = { context: rewardContext.value, rewardType: rewardForm.rewardType, dropChancePercent }
  if (rewardForm.rewardType === 'CTOON') {
    if (!rewardForm.ctoonId) { rewardFormError.value = 'Pick a cToon.'; return }
    body.ctoonId = rewardForm.ctoonId
    const quantity = Math.trunc(Number(rewardForm.quantity)) || 1
    if (quantity < 1 || quantity > 20) { rewardFormError.value = 'Quantity must be between 1 and 20.'; return }
    body.quantity = quantity
  } else if (rewardForm.rewardType === 'AVATAR') {
    if (!rewardForm.avatarId) { rewardFormError.value = 'Pick an avatar.'; return }
    body.avatarId = rewardForm.avatarId
  } else if (rewardForm.rewardType === 'BACKGROUND') {
    if (!rewardForm.backgroundId) { rewardFormError.value = 'Pick a background.'; return }
    body.backgroundId = rewardForm.backgroundId
  } else if (rewardForm.rewardType === 'PACK') {
    if (!rewardForm.packId) { rewardFormError.value = 'Pick a pack.'; return }
    body.packId = rewardForm.packId
    const quantity = Math.trunc(Number(rewardForm.quantity)) || 1
    if (quantity < 1 || quantity > 20) { rewardFormError.value = 'Quantity must be between 1 and 20.'; return }
    body.quantity = quantity
  } else {
    const pointsAmount = Math.trunc(Number(rewardForm.pointsAmount))
    if (!Number.isInteger(pointsAmount) || pointsAmount < 1 || pointsAmount > 5000) {
      rewardFormError.value = 'Points amount must be between 1 and 5000.'
      return
    }
    body.quantity = pointsAmount
  }

  rewardSaving.value = true
  try {
    await $fetch('/api/admin/cmoon-pvp-rewards', { method: 'POST', body })
    resetRewardForm()
    await loadRewards()
  } catch (e) {
    rewardFormError.value = e?.data?.statusMessage || 'Failed to add prize'
  } finally {
    rewardSaving.value = false
  }
}

async function removeReward(r) {
  if (!confirm('Remove this prize row?')) return
  deletingRewardId.value = r.id
  try {
    await $fetch(`/api/admin/cmoon-pvp-rewards/${r.id}`, { method: 'DELETE' })
    await loadRewards()
  } catch (e) {
    rewardFormError.value = e?.data?.statusMessage || 'Failed to remove prize'
  } finally {
    deletingRewardId.value = ''
  }
}

// ── Tournaments ───────────────────────────────────────────────────────
const tournaments = ref([])
const selectedTournamentId = ref('')
const selectedTournament = ref(null)
const tournamentActionBusy = ref(false)
const tournamentActionError = ref('')

async function loadTournaments() {
  const res = await $fetch('/api/admin/cmoon-pvp-tournaments')
  tournaments.value = res?.tournaments || []
}

async function selectTournament(id) {
  selectedTournamentId.value = id
  tournamentActionError.value = ''
  try {
    const res = await $fetch(`/api/admin/cmoon-pvp-tournaments/${id}`)
    selectedTournament.value = res?.tournament || null
  } catch (e) {
    tournamentActionError.value = e?.data?.statusMessage || 'Failed to load tournament'
  }
}
// After the bracket component opens a round — reloads this tournament's own detail (new
// CMoonPvpTournamentMatch rows) and the list (status may have just flipped to IN_PROGRESS).
async function refreshSelectedTournament() {
  if (!selectedTournament.value) return
  await Promise.all([loadTournaments(), selectTournament(selectedTournament.value.id)])
}

async function setTournamentStatus(status) {
  if (!selectedTournament.value) return
  tournamentActionError.value = ''
  tournamentActionBusy.value = true
  try {
    await $fetch(`/api/admin/cmoon-pvp-tournaments/${selectedTournament.value.id}`, { method: 'PUT', body: { status } })
    await Promise.all([loadTournaments(), selectTournament(selectedTournament.value.id)])
  } catch (e) {
    tournamentActionError.value = e?.data?.statusMessage || 'Failed to update tournament'
  } finally {
    tournamentActionBusy.value = false
  }
}

async function cancelTournament() {
  if (!selectedTournament.value) return
  if (!confirm(`Cancel "${selectedTournament.value.name}"? This can't be undone.`)) return
  tournamentActionError.value = ''
  tournamentActionBusy.value = true
  try {
    await $fetch(`/api/admin/cmoon-pvp-tournaments/${selectedTournament.value.id}/cancel`, { method: 'POST' })
    await loadTournaments()
    await selectTournament(selectedTournament.value.id)
  } catch (e) {
    tournamentActionError.value = e?.data?.statusMessage || 'Failed to cancel tournament'
  } finally {
    tournamentActionBusy.value = false
  }
}

const entryForm = reactive({ teamName: '', cMoonId: '', memberUsernamesRaw: '' })
const entrySaving = ref(false)
const entryFormError = ref('')
const deletingEntryId = ref('')

async function addEntry() {
  entryFormError.value = ''
  if (!selectedTournament.value) return
  const teamName = entryForm.teamName.trim()
  if (!teamName) { entryFormError.value = 'Team name is required.'; return }

  const body = { teamName, cMoonId: entryForm.cMoonId || undefined }
  if (!entryForm.cMoonId) {
    const usernames = entryForm.memberUsernamesRaw.split(',').map(s => s.trim()).filter(Boolean)
    if (!usernames.length) { entryFormError.value = 'Enter at least one player username for a mixed squad.'; return }
    try {
      // /api/admin/users/search is a substring "search as you type" lookup, not a batch exact-match
      // endpoint — one call per name, picking the exact (case-insensitive) match from its results.
      const memberUserIds = []
      for (const name of usernames) {
        if (name.length < 3) { entryFormError.value = `"${name}" is too short to search for.`; return }
        const res = await $fetch('/api/admin/users/search', { query: { q: name } })
        const found = (res?.users || []).find(u => u.username?.toLowerCase() === name.toLowerCase())
        if (!found) { entryFormError.value = `Could not find a user named "${name}".`; return }
        memberUserIds.push(found.id)
      }
      body.memberUserIds = memberUserIds
    } catch (e) {
      entryFormError.value = e?.data?.statusMessage || 'Failed to look up players'
      return
    }
  }

  entrySaving.value = true
  try {
    await $fetch(`/api/admin/cmoon-pvp-tournaments/${selectedTournament.value.id}/entries`, { method: 'POST', body })
    Object.assign(entryForm, { teamName: '', cMoonId: '', memberUsernamesRaw: '' })
    await Promise.all([loadTournaments(), selectTournament(selectedTournament.value.id)])
  } catch (e) {
    entryFormError.value = e?.data?.statusMessage || 'Failed to add team'
  } finally {
    entrySaving.value = false
  }
}

async function removeEntry(entry) {
  if (!selectedTournament.value) return
  if (!confirm(`Remove "${entry.teamName}" from this tournament?`)) return
  deletingEntryId.value = entry.id
  try {
    await $fetch(`/api/admin/cmoon-pvp-tournaments/${selectedTournament.value.id}/entries/${entry.id}`, { method: 'DELETE' })
    await Promise.all([loadTournaments(), selectTournament(selectedTournament.value.id)])
  } catch (e) {
    tournamentActionError.value = e?.data?.statusMessage || 'Failed to remove team'
  } finally {
    deletingEntryId.value = ''
  }
}

const newTournament = reactive({ name: '', maxTeamSize: 4 })
const creatingTournament = ref(false)
const createTournamentError = ref('')

async function createTournament() {
  createTournamentError.value = ''
  const name = newTournament.name.trim()
  if (!name) { createTournamentError.value = 'Name is required.'; return }
  creatingTournament.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-pvp-tournaments', { method: 'POST', body: { name, maxTeamSize: newTournament.maxTeamSize } })
    newTournament.name = ''
    await loadTournaments()
    if (res?.id) await selectTournament(res.id)
  } catch (e) {
    createTournamentError.value = e?.data?.statusMessage || 'Failed to create tournament'
  } finally {
    creatingTournament.value = false
  }
}

// ── Load ───────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [settingsData, backgroundsData, avatarsData, ctoonsData, packsData, cmoonsData] = await Promise.all([
      $fetch('/api/admin/cmoon-pvp-settings'),
      $fetch('/api/admin/backgrounds'),
      $fetch('/api/admin/avatars'),
      $fetch('/api/admin/list-ctoons'),
      $fetch('/api/admin/packs', { query: { limit: 200 } }),
      $fetch('/api/admin/cmoons'),
    ])
    Object.assign(settings, settingsData)
    backgroundsCatalog.value = backgroundsData || []
    avatarsCatalog.value = avatarsData || []
    ctoonsCatalog.value = ctoonsData || []
    packsCatalog.value = packsData?.items || []
    cmoonsCatalog.value = cmoonsData?.cmoons || []
    await Promise.all([loadRewards(), loadTournaments()])
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load cMoon PvP settings'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
