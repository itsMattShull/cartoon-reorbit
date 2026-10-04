<template>
  <NuxtLayout name="newsite-template">
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <div v-if="!raid" class="bg-white rounded border p-4 text-sm text-gray-500">
        {{ raidSocket.lastError.value || 'Loading raid…' }}
      </div>

      <template v-else>
        <div class="cr-card bg-white rounded border p-4 space-y-3" :class="{ 'cr-shake': shaking, 'cr-shake-crit': shaking && shakeCrit }">
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

            <!-- ── Round reveal: what just happened, per party member ─────── -->
            <Transition name="cr-reveal">
              <div v-if="lastRoundSummary" :key="lastRoundSummary.roundNumber" class="cr-reveal-panel" :class="{ 'cr-reveal-crit': lastRoundSummaryHadCrit }">
                <p class="cr-reveal-headline">
                  Round {{ lastRoundSummary.roundNumber }} — the boss used <strong>{{ ACTION_LABELS[lastRoundSummary.enemyAction] }}</strong>
                  <span v-if="lastRoundSummaryHadCrit" class="cr-crit-badge">CRITICAL!</span>
                </p>
                <ul class="cr-reveal-list">
                  <li v-for="r in lastRoundSummary.participants" :key="r.userId" class="cr-reveal-row" :class="revealRowClass(r)">
                    <span class="cr-reveal-name">{{ usernameFor(r.userId) }}</span>
                    <span class="cr-reveal-action">{{ ACTION_LABELS[r.action] }}</span>
                    <span class="cr-reveal-outcome">
                      <template v-if="r.playerHit && r.enemyHit">traded hits!<span v-if="r.playerCrit || r.enemyCrit" class="cr-crit-badge">CRIT!</span></template>
                      <template v-else-if="r.enemyHit">landed a hit!<span v-if="r.enemyCrit" class="cr-crit-badge">CRIT!</span></template>
                      <template v-else-if="r.playerHit">took a hit<span v-if="r.playerCrit" class="cr-crit-badge">CRIT!</span></template>
                      <template v-else-if="r.playerBlocked">blocked it — healed 1 HP</template>
                      <template v-else-if="r.enemyBlocked">boss blocked it</template>
                      <template v-else>no hit landed</template>
                    </span>
                  </li>
                </ul>
                <p v-if="lastRoundSummary.enemyDamageDealt > 0" class="cr-reveal-dealt">The party dealt {{ lastRoundSummary.enemyDamageDealt }} damage this round.</p>
              </div>
            </Transition>

            <p v-if="raidSocket.lastError.value" class="text-sm text-red-600">{{ raidSocket.lastError.value }}</p>

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
const lastRoundSummaryHadCrit = computed(() =>
  !!lastRoundSummary.value?.participants?.some(r => r.playerCrit || r.enemyCrit))

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

function revealRowClass(r) {
  if (r.enemyHit && !r.playerHit) return 'cr-row-good'
  if (r.playerHit && !r.enemyHit) return 'cr-row-bad'
  if (r.playerBlocked) return 'cr-row-good'
  return 'cr-row-neutral'
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

// ── Impact feedback + sound/music — same "juice" components/CMoonBattlePopupHost.vue gives a
// solo battle (see that component's own comments for the full rationale), adapted to a raid's
// shared screen: a shake/crit badge triggers off the WHOLE PARTY's round (anyone landing or
// taking a hit), since everyone here is watching the same fight together, while the per-round
// SOUND effects below play only off MY OWN participant row — four simultaneous players' sounds
// all firing at once would be noise, not epic.
const shaking = ref(false)
const shakeCrit = ref(false)
let shakeTimer = null
function triggerShake(isCrit) {
  if (shakeTimer) clearTimeout(shakeTimer)
  shaking.value = false
  shakeCrit.value = false
  requestAnimationFrame(() => {
    shakeCrit.value = !!isCrit
    shaking.value = true
    shakeTimer = setTimeout(() => { shaking.value = false }, 450)
  })
}

function playSound(path) {
  if (!path || typeof window === 'undefined') return
  try {
    const el = new Audio(path)
    el.volume = 0.7
    el.play().catch(() => {})
  } catch {}
}

// Mirrors useCMoonBattlePopup.js's playRoundSounds exactly, just against MY OWN perParticipant
// row rather than a single solo battle's one implicit "player".
function playMyRoundSounds(myRow, sounds) {
  if (!myRow || !sounds) return
  if (myRow.enemyHit) playSound(sounds.damageTakenSoundPath)
  else if (myRow.enemyBlocked) playSound(sounds.damageAvoidedSoundPath)
  if (myRow.playerHit) playSound(sounds.attackingSoundPath)
}

watch(() => raidSocket.lastRound.value, (round) => {
  if (!round?.participants?.length) return
  const anyHit = round.participants.some(r => r.playerHit || r.enemyHit)
  if (anyHit) {
    const anyCrit = round.participants.some(r => r.playerCrit || r.enemyCrit)
    triggerShake(anyCrit)
  }
  const myRow = round.participants.find(r => r.userId === user.value?.id)
  playMyRoundSounds(myRow, raid.value?.enemySounds)
})

// ── Battle music — loops for as long as combat is actually running, same FIGHT-phase-only
// scoping the solo popup uses (never during FORMING/RESOLVED).
let battleMusicEl = null
function stopBattleMusic() {
  if (!battleMusicEl) return
  try { battleMusicEl.pause() } catch {}
  battleMusicEl = null
}
function startBattleMusic(path) {
  stopBattleMusic()
  if (!path || typeof window === 'undefined') return
  try {
    battleMusicEl = new Audio(path)
    battleMusicEl.loop = true
    battleMusicEl.volume = 0.5
    battleMusicEl.play().catch(() => {})
  } catch {}
}
watch(() => raid.value?.status, (status) => {
  if (status === 'IN_PROGRESS') startBattleMusic(raid.value?.battleMusicPath)
  else stopBattleMusic()
})

// Appear sound — once, the first time this page actually has raid data to show (covers both
// "just started/joined a FORMING raid" and "opened a link to one already in progress"); never
// re-fires on every subsequent state push for the same raid.
let announcedRaidId = null
watch(raid, (r) => {
  if (!r || announcedRaidId === r.id) return
  announcedRaidId = r.id
  playSound(r.enemySounds?.appearSoundPath)
})

// Victory/defeat sound — once, the instant the raid actually resolves (never on ABANDONED, same
// as the solo battle only playing one of these two on a real WIN/LOSS).
watch(() => raid.value?.outcome, (outcome) => {
  if (outcome === 'WIN') playSound(raid.value?.enemySounds?.victorySoundPath)
  else if (outcome === 'LOSS') playSound(raid.value?.enemySounds?.defeatSoundPath)
})

onMounted(() => {
  raidSocket.getState(raidId.value)
  countdownTimer = setInterval(tickCountdown, 250)
})
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (shakeTimer) clearTimeout(shakeTimer)
  stopBattleMusic()
})
</script>

<style scoped>
/* Same impact-feedback shake components/CMoonBattlePopupHost.vue uses for a solo battle — see
   that component's own comment on the prefers-reduced-motion stance this mirrors. */
@keyframes cr-shake-kf {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
@keyframes cr-shake-crit-kf {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-8px); }
  40%, 60% { transform: translateX(8px); }
}
.cr-shake { animation: cr-shake-kf 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
.cr-shake-crit { animation: cr-shake-crit-kf 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
@media (prefers-reduced-motion: reduce) {
  .cr-shake, .cr-shake-crit { animation: none; }
}

.cr-reveal-panel {
  border-radius: 8px;
  padding: 10px 12px;
  background: #0d2a4d;
  color: #fff;
  font-size: 12px;
}
.cr-reveal-panel.cr-reveal-crit {
  box-shadow: 0 0 0 2px #f59e0b inset;
}
.cr-reveal-headline { font-weight: 600; margin-bottom: 6px; }
.cr-reveal-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cr-reveal-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cr-reveal-name { font-weight: 600; flex-shrink: 0; }
.cr-reveal-action { color: rgba(255, 255, 255, 0.55); flex-shrink: 0; }
.cr-reveal-outcome { color: rgba(255, 255, 255, 0.85); }
.cr-row-good .cr-reveal-outcome { color: #4ade80; font-weight: 600; }
.cr-row-bad .cr-reveal-outcome { color: #f87171; font-weight: 600; }
.cr-reveal-dealt { margin-top: 6px; color: rgba(255, 255, 255, 0.6); }

.cr-crit-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #f59e0b;
  color: #1a1200;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  animation: cr-crit-pop 0.35s ease-out;
}
@keyframes cr-crit-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.cr-reveal-enter-active, .cr-reveal-leave-active { transition: opacity 0.2s ease; }
.cr-reveal-enter-from, .cr-reveal-leave-to { opacity: 0; }
</style>
