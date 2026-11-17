<template>
  <div class="admin-handicap-redeems bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Handicap Redeems</h1>
      </div>
      <p class="text-gray-500">
        Flag a player by username to silently hold any code they redeem that awards a cToon —
        they just see "Redeeming…" until {{ requiredReleaseClaims }} other players have claimed
        that same code. Never shown to the player, and never affects a code with no cToon reward
        (points/background-only codes always redeem normally for everyone).
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Flag a player ─────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Flag a player</h2>
        <p v-if="flagError" class="text-red-600">{{ flagError }}</p>
        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-48">
            <label class="block text-[11px] font-medium mb-1">Username</label>
            <input v-model="newUsername" class="w-full border rounded px-2 py-1" @keyup.enter="flagPlayer" />
          </div>
          <div class="w-64">
            <label class="block text-[11px] font-medium mb-1">Reason (optional, admin-only)</label>
            <input v-model="newReason" maxlength="300" class="w-full border rounded px-2 py-1" @keyup.enter="flagPlayer" />
          </div>
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="flagging" @click="flagPlayer"
          >{{ flagging ? 'Flagging…' : 'Flag' }}</button>
        </div>
      </div>

      <!-- ── Currently flagged players ─────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Currently flagged</h2>
        <div v-if="flagged.length" class="space-y-1">
          <div v-for="f in flagged" :key="f.id" class="flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
            <div class="flex-1 min-w-0">
              <span class="font-semibold">{{ f.username }}</span>
              <span v-if="f.reason" class="text-gray-500"> — {{ f.reason }}</span>
              <span class="text-gray-400 block text-[10px]">flagged by {{ f.flaggedByUsername }} · {{ formatDate(f.createdAt) }}</span>
            </div>
            <button type="button" class="text-red-600 hover:underline flex-shrink-0" @click="unflagPlayer(f)">Unflag</button>
          </div>
        </div>
        <p v-else class="text-gray-500">No one is flagged.</p>
      </div>

      <!-- ── Pending holds ──────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Pending holds</h2>
        <p v-if="holdError" class="text-red-600">{{ holdError }}</p>
        <div v-if="holds.length" class="space-y-1">
          <div v-for="h in holds" :key="h.id" class="flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
            <div class="flex-1 min-w-0">
              <span class="font-semibold">{{ h.username }}</span> redeeming <span class="font-mono">{{ h.code }}</span>
              <span class="text-gray-400 block text-[10px]">
                requested {{ formatDate(h.requestedAt) }} · {{ h.othersSoFar }}/{{ requiredReleaseClaims }} other redemptions so far
                <template v-if="h.releasing"> — releasing right now</template>
                <template v-else-if="h.stillNeeded > 0"> — {{ h.stillNeeded }} more needed</template>
                <template v-else> — ready to release on the next redemption of this code</template>
              </span>
            </div>
            <button
              type="button" class="text-blue-600 hover:underline flex-shrink-0 disabled:opacity-50"
              :disabled="releasingId === h.id || h.releasing" @click="forceRelease(h)"
            >{{ releasingId === h.id ? 'Releasing…' : 'Force release' }}</button>
          </div>
        </div>
        <p v-else class="text-gray-500">Nothing is currently held.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const flagged = ref([])
const holds = ref([])
const requiredReleaseClaims = ref(3)
const loadError = ref('')

const newUsername = ref('')
const newReason = ref('')
const flagging = ref(false)
const flagError = ref('')

const holdError = ref('')
const releasingId = ref(null)

function formatDate(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

async function load() {
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/handicap-redeems')
    flagged.value = res?.flagged || []
    holds.value = res?.holds || []
    requiredReleaseClaims.value = res?.requiredReleaseClaims ?? 3
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load'
  }
}

async function flagPlayer() {
  if (!newUsername.value.trim() || flagging.value) return
  flagError.value = ''
  flagging.value = true
  try {
    await $fetch('/api/admin/handicap-redeems', { method: 'POST', body: { username: newUsername.value.trim(), reason: newReason.value } })
    newUsername.value = ''
    newReason.value = ''
    await load()
  } catch (e) {
    flagError.value = e?.data?.statusMessage || 'Failed to flag player'
  } finally {
    flagging.value = false
  }
}

async function unflagPlayer(f) {
  flagError.value = ''
  try {
    await $fetch(`/api/admin/handicap-redeems/${f.userId}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    flagError.value = e?.data?.statusMessage || 'Failed to unflag player'
  }
}

async function forceRelease(h) {
  holdError.value = ''
  releasingId.value = h.id
  try {
    await $fetch(`/api/admin/handicap-redeems/holds/${h.id}/release`, { method: 'POST' })
    await load()
  } catch (e) {
    holdError.value = e?.data?.statusMessage || 'Failed to release hold'
  } finally {
    releasingId.value = null
  }
}

load()
</script>
