<template>
  <NuxtLayout name="newsite-template">
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <div v-if="!raid" class="bg-white rounded border p-4 text-sm text-gray-500">
        {{ raidSocket.lastError.value || 'Loading raid…' }}
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
              <p class="text-xs text-gray-500">Raid boss · {{ raid.participants.length }}/4 joined</p>
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
              Joining closes in <span class="font-semibold tabular-nums">{{ joinCountdown }}s</span> — up to 4 members
              of your cMoon can fight this boss together.
            </p>
            <ul class="space-y-1">
              <li v-for="p in raid.participants" :key="p.userId" class="text-sm flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                {{ p.username }} <span v-if="p.isInitiator" class="text-[10px] text-gray-400">(started this raid)</span>
              </li>
            </ul>
            <button
              v-if="!hasJoined" type="button"
              class="px-4 py-2 text-sm font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              :disabled="raid.participants.length >= 4" @click="raidSocket.joinRaid(raidId)"
            >Join raid</button>
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

          <!-- ── RESOLVED: outcome + shared rewards ───────────────────────── -->
          <div v-else class="border rounded p-3 space-y-2" :class="raid.outcome === 'WIN' ? 'bg-green-50 border-green-200' : 'bg-gray-50'">
            <p class="font-semibold">{{ outcomeLabel }}</p>
            <ul class="text-xs space-y-0.5">
              <li v-for="p in raid.participants" :key="p.userId">{{ p.username }}{{ p.knockedOut ? ' (knocked out)' : '' }}</li>
            </ul>
            <p v-if="raid.outcome === 'WIN'" class="text-xs text-gray-600">Everyone who joined received the same prize.</p>
            <NuxtLink to="/newsite" class="inline-block px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">Back home</NuxtLink>
          </div>
        </div>
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup>
const ACTION_LABELS = { ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low' }

const route = useRoute()
const raidId = computed(() => route.params.id)
const { user } = useAuth()
const raidSocket = useCMoonRaidSocket()
const raid = computed(() => raidSocket.raidState.value?.id === raidId.value ? raidSocket.raidState.value : null)

const hasJoined = computed(() => !!raid.value?.participants.some(p => p.userId === user.value?.id))
const myself = computed(() => raid.value?.participants.find(p => p.userId === user.value?.id) || null)
const lastRoundSummary = computed(() => raidSocket.lastRound.value ? { ...raidSocket.lastRound.value } : null)

const enemyHpPercent = computed(() => {
  if (!raid.value) return 0
  return Math.max(0, Math.min(100, Math.round((raid.value.enemyHpRemaining / (raid.value.enemyMaxHp || 1)) * 100)))
})

const outcomeLabel = computed(() => {
  if (raid.value?.outcome === 'WIN') return 'Victory! The party brought the boss down.'
  if (raid.value?.outcome === 'LOSS') return 'Defeat — the whole party was knocked out.'
  return 'The raid ended without a clear finish.'
})

function usernameFor(userId) {
  return raid.value?.participants.find(p => p.userId === userId)?.username || 'Someone'
}

function act(action) {
  if (!raid.value) return
  raidSocket.submitAction(raidId.value, action, raid.value.roundNumber)
}

// FORMING's join-window countdown — a plain client-side ticker against joinDeadlineAt, not a
// second source of truth: the server's sweep (see cmoonRaidSocket.js) is what actually closes
// the window and transitions to IN_PROGRESS, this just gives the player something to watch.
const joinCountdown = ref(0)
let countdownTimer = null
function tickCountdown() {
  if (!raid.value?.joinDeadlineAt) { joinCountdown.value = 0; return }
  joinCountdown.value = Math.max(0, Math.ceil((raid.value.joinDeadlineAt - Date.now()) / 1000))
}

onMounted(() => {
  raidSocket.getState(raidId.value)
  countdownTimer = setInterval(tickCountdown, 250)
})
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>
