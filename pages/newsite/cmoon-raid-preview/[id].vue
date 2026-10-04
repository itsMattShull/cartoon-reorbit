<template>
  <NuxtLayout name="newsite-template">
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <div v-if="!isAdmin" class="bg-white rounded border p-4 text-sm text-gray-600">
        Admins only — raid boss previews are a testing tool, not a player-facing feature.
      </div>

      <template v-else>
        <div class="bg-amber-50 border border-amber-300 rounded px-3 py-2 text-xs text-amber-800 font-medium">
          🧪 Raid boss preview — no rewards, cMoon points, or battle records are real. This never touches
          the boss's one-time/cooldown state.
        </div>

        <div v-if="!raid" class="bg-white rounded border p-4 text-sm text-gray-500">
          {{ raidSocket.lastError.value || 'Loading preview…' }}
        </div>

        <template v-else>
          <div class="bg-white rounded border p-4 space-y-3">
            <div class="flex items-center gap-3">
              <div class="w-16 h-16 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
                <img v-if="raid.enemyImagePath" :src="raid.enemyImagePath" alt="" class="max-w-full max-h-full object-contain" />
                <span v-else class="text-gray-400 text-[10px]">No art</span>
              </div>
              <div class="min-w-0">
                <h1 class="font-bold text-lg break-words">{{ raid.enemyName }}</h1>
                <p class="text-xs text-gray-500">Raid boss preview · {{ raid.participants.length }}/4 joined</p>
              </div>
            </div>

            <div class="space-y-1">
              <div class="flex items-center gap-2 text-xs">
                <span class="w-14 flex-shrink-0 text-gray-500">Boss HP</span>
                <div class="flex-1 h-2.5 bg-gray-200 rounded overflow-hidden">
                  <div class="h-full bg-red-500 transition-all" :style="{ width: enemyHpPercent + '%' }"></div>
                </div>
                <span class="w-16 flex-shrink-0 text-right tabular-nums">{{ raid.enemyHpRemaining }}/{{ raid.enemyMaxHp }}</span>
              </div>
            </div>

            <p v-if="raidSocket.lastError.value" class="text-sm text-red-600">{{ raidSocket.lastError.value }}</p>

            <!-- ── FORMING: roster + join countdown ────────────────────────── -->
            <div v-if="raid.status === 'FORMING'" class="space-y-3">
              <p class="text-sm text-gray-600">
                Joining closes in <span class="font-semibold tabular-nums">{{ joinCountdown }}s</span> — up to 4 admins
                can join this preview.
              </p>
              <ul class="space-y-1">
                <li v-for="p in raid.participants" :key="p.userId" class="text-sm flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                  {{ p.username }} <span v-if="p.isInitiator" class="text-[10px] text-gray-400">(started this preview)</span>
                </li>
              </ul>
              <button
                v-if="!hasJoined" type="button"
                class="px-4 py-2 text-sm font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                :disabled="raid.participants.length >= 4" @click="raidSocket.joinRaid(raidId)"
              >Join preview</button>
              <p v-else class="text-sm text-green-700 font-medium">You're in — waiting for the fight to start…</p>
            </div>

            <!-- ── IN_PROGRESS: live combat ─────────────────────────────────── -->
            <div v-else-if="raid.status === 'IN_PROGRESS'" class="space-y-3">
              <p class="text-xs text-gray-500">Round {{ raid.roundNumber }}</p>
              <ul class="space-y-1.5">
                <li v-for="p in raid.participants" :key="p.userId" class="flex items-center gap-2 text-xs">
                  <span class="w-24 flex-shrink-0 truncate" :class="p.knockedOut ? 'text-gray-400 line-through' : ''">{{ p.username }}</span>
                  <div class="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                    <div class="h-full bg-green-500 transition-all" :style="{ width: (p.hpRemaining / (p.maxHp || 1) * 100) + '%' }"></div>
                  </div>
                  <span class="w-10 flex-shrink-0 text-right tabular-nums">{{ p.hpRemaining }}/{{ p.maxHp }}</span>
                  <span v-if="p.knockedOut" class="text-[10px] text-red-500 flex-shrink-0">KO</span>
                  <span v-else-if="p.hasActed" class="text-[10px] text-green-600 flex-shrink-0">Ready</span>
                  <span v-else class="text-[10px] text-gray-400 flex-shrink-0">Deciding…</span>
                </li>
              </ul>

              <div v-if="lastRoundSummary" class="border rounded p-2 bg-gray-50 text-xs space-y-1">
                <p class="font-medium">Round {{ lastRoundSummary.roundNumber }} — the boss used {{ ACTION_LABELS[lastRoundSummary.enemyAction] }}</p>
                <p v-for="r in lastRoundSummary.participants" :key="r.userId">
                  {{ usernameFor(r.userId) }} {{ ACTION_LABELS[r.action] }} —
                  <template v-if="r.playerHit">took a hit{{ r.playerCrit ? ' (CRIT!)' : '' }}</template>
                  <template v-else-if="r.playerBlocked">blocked and healed 1 HP</template>
                  <template v-else>no hit landed</template>
                </p>
              </div>

              <template v-if="myself && !myself.knockedOut">
                <p v-if="myself.hasActed" class="text-sm text-gray-500">Locked in — waiting on the rest of the party…</p>
                <div v-else class="grid grid-cols-2 gap-2">
                  <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="act('ATTACK_HIGH')">Attack High</button>
                  <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="act('ATTACK_LOW')">Attack Low</button>
                  <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="act('BLOCK_HIGH')">Block High</button>
                  <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="act('BLOCK_LOW')">Block Low</button>
                </div>
              </template>
              <p v-else-if="myself" class="text-sm text-gray-500">You've been knocked out — watching the rest of the party finish the fight.</p>
            </div>

            <!-- ── RESOLVED: outcome + would-grant summary ──────────────────── -->
            <div v-else class="border rounded p-3 space-y-2" :class="raid.outcome === 'WIN' ? 'bg-green-50 border-green-200' : 'bg-gray-50'">
              <p class="font-semibold">{{ outcomeLabel }}</p>
              <ul class="text-xs space-y-0.5">
                <li v-for="p in raid.participants" :key="p.userId">{{ p.username }}{{ p.knockedOut ? ' (knocked out)' : '' }}</li>
              </ul>
              <div v-if="raid.outcome === 'WIN' && raid.wouldGrant" class="text-xs text-gray-700 bg-white border rounded p-2 space-y-1">
                <p class="font-medium">A real win would have granted each participant:</p>
                <p>{{ fmt(raid.wouldGrant.cMoonPointsPerParticipant) }} cMoon points ({{ fmt(raid.wouldGrant.cMoonPointsTotal) }} split across the party)</p>
                <p v-if="!raid.wouldGrant.items.length" class="text-gray-500">No item rewards are configured for this member.</p>
                <ul v-else class="list-disc list-inside">
                  <li v-for="(it, i) in raid.wouldGrant.items" :key="i">
                    {{ it.type === 'POINTS' ? `${fmt(it.quantity)} points` : `${it.label}${it.quantity > 1 ? ` ×${it.quantity}` : ''}` }}
                  </li>
                </ul>
              </div>
              <p class="text-xs text-gray-500">Nothing here was actually granted — this was a preview.</p>
              <NuxtLink to="/newsite/admin" class="inline-block px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">Back to admin</NuxtLink>
            </div>
          </div>
        </template>
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup>
const ACTION_LABELS = { ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low' }

const route = useRoute()
const raidId = computed(() => route.params.id)
const { user, isAdmin } = useAuth()
const raidSocket = useCMoonRaidPreviewSocket()
const raid = computed(() => raidSocket.raidState.value?.id === raidId.value ? raidSocket.raidState.value : null)

const hasJoined = computed(() => !!raid.value?.participants.some(p => p.userId === user.value?.id))
const myself = computed(() => raid.value?.participants.find(p => p.userId === user.value?.id) || null)
const lastRoundSummary = computed(() => raidSocket.lastRound.value ? { ...raidSocket.lastRound.value } : null)

const fmt = (n) => Number(n || 0).toLocaleString('en-US')

const enemyHpPercent = computed(() => {
  if (!raid.value) return 0
  return Math.max(0, Math.min(100, Math.round((raid.value.enemyHpRemaining / (raid.value.enemyMaxHp || 1)) * 100)))
})

const outcomeLabel = computed(() => {
  if (raid.value?.outcome === 'WIN') return 'Victory! The party brought the boss down.'
  if (raid.value?.outcome === 'LOSS') return 'Defeat — the whole party was knocked out.'
  return 'The preview ended without a clear finish.'
})

function usernameFor(userId) {
  return raid.value?.participants.find(p => p.userId === userId)?.username || 'Someone'
}

function act(action) {
  if (!raid.value) return
  raidSocket.submitAction(raidId.value, action, raid.value.roundNumber)
}

// Same client-side-only ticker as the real raid page (cmoon-raid/[id].vue) — the server's own
// sweep (cmoonRaidPreviewSocket.js) is what actually closes the join window.
const joinCountdown = ref(0)
let countdownTimer = null
function tickCountdown() {
  if (!raid.value?.joinDeadlineAt) { joinCountdown.value = 0; return }
  joinCountdown.value = Math.max(0, Math.ceil((raid.value.joinDeadlineAt - Date.now()) / 1000))
}

onMounted(() => {
  if (!isAdmin.value) return
  raidSocket.getState(raidId.value)
  countdownTimer = setInterval(tickCountdown, 250)
})
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>
