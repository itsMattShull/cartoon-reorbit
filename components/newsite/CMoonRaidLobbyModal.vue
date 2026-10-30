<template>
  <Teleport to="body">
    <div v-if="open" class="rl-overlay" @click.self="close">
      <div
        ref="modalRef" class="rl-modal" role="dialog" aria-modal="true" aria-labelledby="rl-title"
        tabindex="-1" @keydown.tab="trapFocus"
      >
        <div class="rl-header">
          <h2 id="rl-title" class="rl-title">Raid boss lobby</h2>
          <button type="button" class="rl-close" aria-label="Close raid boss lobby" @click="close">✕</button>
        </div>
        <p class="rl-sub">
          Team up with players from any cMoon. Each raid opens for 60 seconds, then the fight starts with whoever joined.
          Everyone earns points for their own cMoon.
        </p>

        <p v-if="!raidSocket.lobbyViewer.value.inCMoon" class="rl-note">
          You need to be in a cMoon to fight raid bosses. Join one from the cMoons page, then come back here.
        </p>
        <p v-if="joinError" class="rl-error" role="alert">{{ joinError }}</p>
        <p v-else-if="inAnyRaid" class="rl-note">You're already in a raid. Finish it before joining another.</p>

        <!-- Live region on the status line only: the per-raid countdowns tick every half second
             and would otherwise be read aloud continuously. -->
        <p class="sr-only" aria-live="polite">{{ liveSummary }}</p>
        <div class="rl-list">
          <p v-if="!raidSocket.lobbyLoaded.value" class="rl-empty">Looking for open raids…</p>
          <p v-else-if="!raidSocket.lobbyRaids.value.length" class="rl-empty">
            No raids are open right now. When anyone starts a raid boss fight you'll get a notification, and it will show up here.
          </p>

          <article
            v-for="r in raidSocket.lobbyRaids.value" :key="r.id"
            class="rl-raid" :class="{ 'rl-raid-closed': !isJoinable(r), 'rl-raid-mine': isMine(r) }"
          >
            <div class="rl-raid-top">
              <span class="rl-boss-art">
                <img v-if="r.enemyImagePath" :src="r.enemyImagePath" alt="" />
                <span v-else aria-hidden="true">👾</span>
              </span>
              <span class="rl-raid-heading">
                <h3 class="rl-raid-name">{{ r.name }}</h3>
                <span class="rl-boss-name">vs {{ r.enemyName }}</span>
              </span>
              <span class="rl-raid-status">
                <template v-if="r.status === 'IN_PROGRESS'">Fighting, round {{ r.roundNumber }}</template>
                <template v-else-if="r.partySize >= r.maxPartySize">Full</template>
                <template v-else><span class="rl-countdown" aria-hidden="true">{{ secondsLeft(r) }}s</span><span aria-hidden="true"> to join</span><span class="sr-only">Open to join</span></template>
              </span>
            </div>

            <div class="rl-party">
              <CMoonRaidFighter
                v-for="p in r.participants" :key="p.userId" :participant="p" variant="compact"
                :is-me="p.userId === myId"
              />
              <span v-for="n in Math.max(0, r.maxPartySize - r.partySize)" :key="`open-${n}`" class="rl-open-slot">Open slot</span>
            </div>

            <div class="rl-raid-actions">
              <span v-if="r.minPriorDefeats > 0" class="rl-req">Needs {{ r.minPriorDefeats }} enemy {{ r.minPriorDefeats === 1 ? 'win' : 'wins' }}</span>
              <button v-if="isMine(r)" type="button" class="rl-btn rl-btn-go" @click="goToRaid(r.id)">Back to your raid</button>
              <button
                v-else-if="isJoinable(r)" type="button" class="rl-btn rl-btn-join"
                :disabled="!!joiningId || !raidSocket.lobbyViewer.value.inCMoon || inAnyRaid"
                @click="join(r)"
              >{{ joiningId === r.id ? 'Joining…' : 'Join raid' }}</button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// The Raid Boss Lobby (cross-cMoon raids): every open raid from any cMoon, live, named after
// whoever started it. Opened from the cMoons page's "Raid boss lobby" button, or via
// /newsite/cmoon-nav?raidLobby=1 (where raid notifications link — see notificationRoute in
// components/Onboarding.vue). The list is pushed by the socket server (cmoonraid:lobby) while
// this is open; joining goes through the same cmoonraid:join the raid page uses, which re-checks
// every eligibility rule server-side, then hands off to the raid page.
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const raidSocket = useCMoonRaidSocket()
const router = useRouter()
const { user } = useAuth()
const myId = computed(() => user.value?.id || null)

const modalRef = ref(null)
const joiningId = ref(null)
const joinError = ref('')
const now = ref(Date.now())
let tick = null
let stopJoinWatch = null
let subscribed = false

function secondsLeft(r) {
  return Math.max(0, Math.ceil(((r.joinDeadlineAt || 0) - (now.value + raidSocket.lobbyClockOffsetMs.value)) / 1000))
}
function isMine(r) {
  return !!myId.value && (r.participants || []).some(p => p.userId === myId.value)
}
// The lobby lists every active raid (forming or fighting), so "am I already in one" is derived
// live from it rather than from a snapshot that would go stale when that raid ends.
const inAnyRaid = computed(() => raidSocket.lobbyRaids.value.some(isMine))
// Changes only when the set of joinable raids changes — what a screen reader should hear.
const liveSummary = computed(() => {
  if (!raidSocket.lobbyLoaded.value) return ''
  const n = raidSocket.lobbyRaids.value.filter(r => r.status === 'FORMING' && r.partySize < r.maxPartySize).length
  return n ? `${n} raid${n === 1 ? '' : 's'} open to join` : 'No raids open right now'
})
// Not gated on the countdown: the server decides when the window closes (and pushes the raid to
// "fighting" the moment it does), so a lagging countdown never hides a joinable raid.
function isJoinable(r) {
  return r.status === 'FORMING' && r.partySize < r.maxPartySize
}

function clearJoinWatch() {
  if (stopJoinWatch) { stopJoinWatch(); stopJoinWatch = null }
}

function join(r) {
  if (joiningId.value) return
  joinError.value = ''
  joiningId.value = r.id
  raidSocket.lastError.value = ''
  clearJoinWatch()
  // Success = the raid's own state arrives with me in it (the server answers a join with
  // cmoonraid:participantJoined, or cmoonraid:created if I was already in); failure = a
  // cmoonraid:error. Whichever comes first wins.
  stopJoinWatch = watch([raidSocket.raidState, raidSocket.lastError], ([state, err]) => {
    if (state?.id === r.id && state.participants?.some(p => p.userId === myId.value)) {
      clearJoinWatch()
      joiningId.value = null
      goToRaid(r.id)
    } else if (err) {
      clearJoinWatch()
      joiningId.value = null
      joinError.value = err
    }
  })
  raidSocket.joinRaid(r.id)
}

// Keyboard: Escape closes from anywhere (focus can land on <body> after a button disables
// itself), Tab cycles inside the dialog, and focus returns to whatever opened it.
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
  raidSocket.subscribeLobby()
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
  raidSocket.unsubscribeLobby()
  if (tick) { clearInterval(tick); tick = null }
  clearJoinWatch()
  joiningId.value = null
  joinError.value = ''
}

function close() {
  emit('close')
}
// Leaving for a raid: tell the parent we're navigating, so it doesn't also router.replace() to
// clear ?raidLobby=1 — that second navigation would cancel this push (newest navigation wins).
function goToRaid(id) {
  emit('close', { navigating: true })
  router.push(`/newsite/cmoon-raid/${id}`)
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
.rl-boss-art img { max-width: 100%; max-height: 100%; object-fit: contain; }
.rl-raid-heading { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.rl-raid-name { margin: 0; font-size: 1rem; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-boss-name { font-size: 0.8rem; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-raid-status { flex-shrink: 0; font-size: 0.75rem; color: #475569; text-align: right; }
.rl-countdown { font-weight: 900; font-size: 1rem; color: #b91c1c; font-variant-numeric: tabular-nums; }

.rl-party { display: flex; flex-wrap: wrap; gap: 6px; }
.rl-open-slot {
  display: inline-flex; align-items: center; min-height: 30px; padding: 0 12px;
  border-radius: 999px; border: 1.5px dashed #94a3b8; color: #64748b; font-size: 0.75rem;
}

.rl-raid-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.rl-req { margin-right: auto; font-size: 0.75rem; color: #7c2d12; }
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
