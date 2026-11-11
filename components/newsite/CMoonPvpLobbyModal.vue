<template>
  <Teleport to="body">
    <div v-if="open" class="rl-overlay" @click.self="close">
      <div
        ref="modalRef" class="rl-modal" role="dialog" aria-modal="true" aria-labelledby="rl-title"
        tabindex="-1" @keydown.tab="trapFocus"
      >
        <div class="rl-header">
          <h2 id="rl-title" class="rl-title">cMoon PvP lobby</h2>
          <button type="button" class="rl-close" aria-label="Close PvP lobby" @click="close">✕</button>
        </div>
        <p class="rl-sub">
          Pick a team and square off live — up to {{ 8 }}-a-side. Each match's join window stays open
          for a bit (the leader can extend or speed it up), then the fight starts with whoever joined.
        </p>

        <p v-if="joinError" class="rl-error" role="alert">{{ joinError }}</p>
        <p v-else-if="inAnyMatch" class="rl-note">You're already in a PvP match. Finish it before joining another.</p>

        <div v-if="!inAnyMatch" class="rl-start-row">
          <button type="button" class="rl-btn rl-btn-start" :disabled="!!starting" @click="start('A')">{{ starting === 'A' ? 'Starting…' : 'Start a new match (Team A)' }}</button>
          <button type="button" class="rl-btn rl-btn-start" :disabled="!!starting" @click="start('B')">{{ starting === 'B' ? 'Starting…' : 'Start a new match (Team B)' }}</button>
        </div>

        <p class="sr-only" aria-live="polite">{{ liveSummary }}</p>
        <div class="rl-list">
          <p v-if="!pvpSocket.lobbyLoaded.value" class="rl-empty">Looking for open matches…</p>
          <p v-else-if="!pvpSocket.lobbyMatches.value.length" class="rl-empty">
            No matches are open right now. Start one from the cMoons page and it will show up here for others to join.
          </p>

          <article
            v-for="m in pvpSocket.lobbyMatches.value" :key="m.id"
            class="rl-raid" :class="{ 'rl-raid-closed': !isJoinable(m), 'rl-raid-mine': isMine(m) }"
          >
            <div class="rl-raid-top">
              <span class="rl-boss-art" aria-hidden="true">⚔️</span>
              <span class="rl-raid-heading">
                <h3 class="rl-raid-name">{{ m.name }}</h3>
                <span class="rl-boss-name">Team A vs Team B</span>
              </span>
              <span class="rl-raid-status">
                <template v-if="m.status === 'IN_PROGRESS'">Fighting, round {{ m.roundNumber }}</template>
                <template v-else><span class="rl-countdown" aria-hidden="true">{{ secondsLeft(m) }}s</span><span aria-hidden="true"> to join</span><span class="sr-only">Open to join</span></template>
              </span>
            </div>

            <div class="rl-teams">
              <span class="rl-team-size">Team A: {{ m.teamASize }}/{{ m.maxTeamSize }}</span>
              <span class="rl-team-size">Team B: {{ m.teamBSize }}/{{ m.maxTeamSize }}</span>
            </div>

            <div class="rl-raid-actions">
              <button v-if="isMine(m)" type="button" class="rl-btn rl-btn-go" @click="goToMatch(m.id)">Back to your match</button>
              <template v-else>
                <button
                  type="button" class="rl-btn rl-btn-join"
                  :disabled="!!joiningId || inAnyMatch || m.status !== 'FORMING' || m.teamASize >= m.maxTeamSize"
                  @click="join(m, 'A')"
                >{{ joiningId === m.id ? 'Joining…' : 'Join Team A' }}</button>
                <button
                  type="button" class="rl-btn rl-btn-join"
                  :disabled="!!joiningId || inAnyMatch || m.status !== 'FORMING' || m.teamBSize >= m.maxTeamSize"
                  @click="join(m, 'B')"
                >{{ joiningId === m.id ? 'Joining…' : 'Join Team B' }}</button>
              </template>
            </div>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// The cMoon PvP lobby: every open match, live, named after whoever started it — the discoverability
// mechanism for this feature (see server/utils/cmoonPvpSocket.js's own header comment on why PvP
// has no Discord announcement the way raid does). Direct structural port of CMoonRaidLobbyModal.vue.
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const pvpSocket = useCMoonPvpSocket()
const router = useRouter()
const { user } = useAuth()
const myId = computed(() => user.value?.id || null)

const modalRef = ref(null)
const joiningId = ref(null)
const joinError = ref('')
const starting = ref(null)
let stopStartWatch = null
const now = ref(Date.now())
let tick = null
let stopJoinWatch = null
let subscribed = false

function secondsLeft(m) {
  return Math.max(0, Math.ceil(((m.joinDeadlineAt || 0) - (now.value + pvpSocket.lobbyClockOffsetMs.value)) / 1000))
}
// The lobby entry carries only team SIZES, not a roster (see buildPvpLobbyEntry in
// cmoonPvp.js) — "am I already in this one" is tracked via pvpSocket.lobbyViewer's own
// currentMatchId instead, same source the "already in a match" banner below reads.
function isMine(m) {
  return pvpSocket.lobbyViewer.value.currentMatchId === m.id
}
const inAnyMatch = computed(() => !!pvpSocket.lobbyViewer.value.currentMatchId)
const liveSummary = computed(() => {
  if (!pvpSocket.lobbyLoaded.value) return ''
  const n = pvpSocket.lobbyMatches.value.filter(isJoinable).length
  return n ? `${n} match${n === 1 ? '' : 'es'} open to join` : 'No matches open right now'
})
function isJoinable(m) {
  return m.status === 'FORMING' && (m.teamASize < m.maxTeamSize || m.teamBSize < m.maxTeamSize)
}

function clearJoinWatch() {
  if (stopJoinWatch) { stopJoinWatch(); stopJoinWatch = null }
}

function join(m, team) {
  if (joiningId.value) return
  joinError.value = ''
  joiningId.value = m.id
  pvpSocket.lastError.value = ''
  clearJoinWatch()
  stopJoinWatch = watch([pvpSocket.matchState, pvpSocket.lastError], ([state, err]) => {
    if (state?.id === m.id && state.participants?.some(p => p.userId === myId.value)) {
      clearJoinWatch()
      joiningId.value = null
      goToMatch(m.id)
    } else if (err) {
      clearJoinWatch()
      joiningId.value = null
      joinError.value = err
    }
  })
  pvpSocket.joinMatch(m.id, team)
}

function clearStartWatch() {
  if (stopStartWatch) { stopStartWatch(); stopStartWatch = null }
}
function start(team) {
  if (starting.value || joiningId.value) return
  joinError.value = ''
  starting.value = team
  pvpSocket.lastError.value = ''
  clearStartWatch()
  // Success = cmoonpvp:created arrives naming ME as a participant; failure = cmoonpvp:error.
  stopStartWatch = watch([pvpSocket.matchState, pvpSocket.lastError], ([state, err]) => {
    if (state?.participants?.some(p => p.userId === myId.value)) {
      clearStartWatch()
      starting.value = null
      goToMatch(state.id)
    } else if (err) {
      clearStartWatch()
      starting.value = null
      joinError.value = err
    }
  })
  pvpSocket.startMatch(team)
}

let returnFocusTo = null
function onDocKeydown(e) {
  if (e.key === 'Escape') close()
}
function trapFocus(e) {
  const root = modalRef.value
  if (!root) return
  const items = [...root.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
  if (!items.length) { e.preventDefault(); root.focus(); return }
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

function subscribe() {
  if (subscribed) return
  subscribed = true
  returnFocusTo = document.activeElement
  document.addEventListener('keydown', onDocKeydown)
  pvpSocket.subscribeLobby()
  now.value = Date.now()
  tick = setInterval(() => { now.value = Date.now() }, 500)
  nextTick(() => modalRef.value?.focus())
}
function unsubscribe() {
  if (!subscribed) return
  subscribed = false
  document.removeEventListener('keydown', onDocKeydown)
  if (returnFocusTo && typeof returnFocusTo.focus === 'function' && document.contains(returnFocusTo)) returnFocusTo.focus()
  returnFocusTo = null
  pvpSocket.unsubscribeLobby()
  if (tick) { clearInterval(tick); tick = null }
  clearJoinWatch()
  joiningId.value = null
  joinError.value = ''
  clearStartWatch()
  starting.value = null
}

function close() {
  emit('close')
}
function goToMatch(id) {
  emit('close', { navigating: true })
  router.push(`/newsite/cmoon-pvp/${id}`)
}

watch(() => props.open, (isOpen) => { isOpen ? subscribe() : unsubscribe() }, { immediate: true })
onBeforeUnmount(unsubscribe)
</script>

<style scoped>
.rl-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(4, 33, 31, 0.72);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 12px;
  overflow-y: auto;
}
.rl-modal {
  width: 100%;
  max-width: 560px;
  background: #f8fafc;
  color: #111827;
  border-radius: 16px;
  border: 3px solid #5b79c9;
  box-shadow: 0 0 0 6px #04211f, 0 18px 40px rgba(0, 0, 0, 0.45);
  padding: 16px;
  font-family: 'Nunito', sans-serif;
  outline: none;
}
.rl-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rl-title { font-size: 1.35rem; font-weight: 900; margin: 0; color: #1e3a8a; }
.rl-close {
  min-width: 44px; min-height: 44px; border: none; background: transparent;
  font-size: 1.1rem; color: #475569; cursor: pointer; border-radius: 8px;
}
.rl-close:hover { background: #e2e8f0; }
.rl-close:focus-visible, .rl-btn:focus-visible { outline: 3px solid #ffd75e; outline-offset: 2px; }
.rl-sub { margin: 4px 0 12px; font-size: 0.85rem; color: #475569; line-height: 1.45; }
.rl-note { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; background: #fef3c7; color: #78350f; font-size: 0.85rem; }
.rl-error { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; background: #fee2e2; color: #991b1b; font-size: 0.85rem; font-weight: 700; }

.rl-start-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.rl-btn-start { background: #1e3a8a; color: #fff; flex: 1; justify-content: center; }
.rl-btn-start:hover:not(:disabled) { background: #1e40af; }
.rl-btn-start:disabled { opacity: 0.6; cursor: not-allowed; }

.rl-list { display: flex; flex-direction: column; gap: 10px; }
.rl-empty { margin: 8px 0; font-size: 0.9rem; color: #64748b; text-align: center; line-height: 1.45; }

.rl-raid {
  background: #fff;
  border: 2px solid #c7d2fe;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rl-raid-mine { border-color: #22c55e; }
.rl-raid-closed { background: #f1f5f9; border-color: #e2e8f0; }

.rl-raid-top { display: flex; align-items: center; gap: 10px; }
.rl-boss-art {
  flex-shrink: 0; width: 48px; height: 48px; border-radius: 10px; overflow: hidden;
  background: #04211f; display: flex; align-items: center; justify-content: center; font-size: 22px;
}
.rl-raid-heading { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.rl-raid-name { margin: 0; font-size: 1rem; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-boss-name { font-size: 0.8rem; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-raid-status { flex-shrink: 0; font-size: 0.75rem; color: #475569; text-align: right; }
.rl-countdown { font-weight: 900; font-size: 1rem; color: #b91c1c; font-variant-numeric: tabular-nums; }

.rl-teams { display: flex; gap: 12px; flex-wrap: wrap; }
.rl-team-size { font-size: 0.8rem; font-weight: 800; color: #1e3a8a; }

.rl-raid-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.rl-btn {
  min-height: 40px; padding: 0 16px; border-radius: 10px; border: none;
  font-weight: 900; font-size: 0.9rem; cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center;
}
.rl-btn-join { background: #16a34a; color: #fff; box-shadow: 0 3px 0 #166534; }
.rl-btn-join:hover:not(:disabled) { background: #15803d; }
.rl-btn-join:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #166534; }
.rl-btn-join:disabled { opacity: 0.5; cursor: not-allowed; }
.rl-btn-go { background: #1e3a8a; color: #fff; }

@media (prefers-reduced-motion: reduce) {
  .rl-btn-join:active:not(:disabled) { transform: none; }
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
</style>
