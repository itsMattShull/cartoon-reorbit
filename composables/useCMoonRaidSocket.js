// /composables/useCMoonRaidSocket.js
// Thin Socket.IO wrapper for the cMoon Enemy Battles raid boss co-op mode (see
// server/utils/cmoonRaidSocket.js) — same module-scoped-singleton shape as useClashSocket.js so
// every component sharing one browser tab talks to the same connection.
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const raidState = ref(null)   // latest cmoonraid:created/state/roundOpened/roundResolved/ended payload
const lastRound = ref(null)   // the most recent cmoonraid:roundResolved's `round` detail, for the reveal UI
const lastError = ref('')
const isConnected = ref(false)
const currentRaidId = ref(null)
// Raid Boss Lobby (cross-cMoon raids) — the live open-raid list while the lobby modal is open.
const lobbyRaids = ref([])
const lobbyLoaded = ref(false)
const lobbyViewer = ref({ inCMoon: true, currentRaidId: null })
// serverNow - Date.now() at the last lobby push: join countdowns use the server's clock, so a
// phone whose clock is off by a minute still sees the right seconds left.
const lobbyClockOffsetMs = ref(0)
let lobbySubscribers = 0
let socket

export function useCMoonRaidSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000, withCredentials: true }
    )

    socket.on('connect', () => {
      isConnected.value = true
      if (currentRaidId.value) socket.emit('cmoonraid:getState', { raidId: currentRaidId.value })
      // A reconnect drops server-side room membership — rejoin the lobby if it's still open.
      if (lobbySubscribers > 0) socket.emit('cmoonraid:lobbySubscribe')
    })
    socket.on('disconnect', () => { isConnected.value = false })

    const applyState = (state) => { raidState.value = state; if (state?.id) currentRaidId.value = state.id }
    socket.on('cmoonraid:created', applyState)
    socket.on('cmoonraid:state', applyState)
    socket.on('cmoonraid:participantJoined', applyState)
    socket.on('cmoonraid:participantLeft', applyState)
    socket.on('cmoonraid:roundOpened', (state) => { lastRound.value = null; applyState(state) })
    socket.on('cmoonraid:participantActed', applyState)
    socket.on('cmoonraid:roundResolved', (state) => { lastRound.value = state.round || null; applyState(state) })
    socket.on('cmoonraid:ended', applyState)
    // Sent directly to THIS socket only (never broadcast — see cmoonraid:leave's own comment in
    // cmoonRaidSocket.js), since by the time it fires this socket already left the room and would
    // never receive the room-wide participantLeft broadcast meant for everyone else. Clears local
    // state so the raid page can tell "I left" apart from "still loading" and navigate away.
    socket.on('cmoonraid:leftRaid', (payload) => {
      if (!payload?.raidId || payload.raidId === currentRaidId.value) {
        raidState.value = null
        currentRaidId.value = null
      }
    })
    // Broadcast to the WHOLE room (unlike cmoonraid:leftRaid above, which is targeted — a cancel
    // kicks out every current participant, not just the caller) — see cmoonraid:cancelRaid's own
    // comment in cmoonRaidSocket.js. Clears local state the same way leftRaid does, and surfaces
    // the message through lastError so the page's existing "no raid loaded" branch shows it.
    socket.on('cmoonraid:cancelled', (payload) => {
      // Guarded the same way cmoonraid:leftRaid is just above (there by raidId, here by id —
      // this event's payload is a plain publicRaidView spread, which names it `id`) rather than
      // trusting that this socket can never still be a stale member of an old raid's room while
      // genuinely in a different, newer one — defensive, not relied on by any known live path.
      if (!payload?.id || payload.id === currentRaidId.value) {
        lastError.value = payload?.message || 'This raid was cancelled.'
        raidState.value = null
        currentRaidId.value = null
      }
    })
    socket.on('cmoonraid:error', (payload) => { lastError.value = payload?.message || 'Something went wrong' })
    socket.on('cmoonraid:lobby', (payload) => {
      lobbyRaids.value = Array.isArray(payload?.raids) ? payload.raids : []
      if (Number.isFinite(payload?.serverNow)) lobbyClockOffsetMs.value = payload.serverNow - Date.now()
      lobbyLoaded.value = true
    })
    socket.on('cmoonraid:lobbyViewer', (payload) => {
      lobbyViewer.value = { inCMoon: payload?.inCMoon !== false, currentRaidId: payload?.currentRaidId || null }
    })
  }

  function startRaid(enemyMemberId, { isPrivate = false } = {}) {
    lastError.value = ''
    socket.emit('cmoonraid:start', { enemyMemberId, isPrivate })
  }
  function joinRaid(raidId) {
    lastError.value = ''
    currentRaidId.value = raidId
    socket.emit('cmoonraid:join', { raidId })
  }
  function leaveRaid(raidId) {
    socket.emit('cmoonraid:leave', { raidId })
  }
  function getState(raidId) {
    currentRaidId.value = raidId
    socket.emit('cmoonraid:getState', { raidId })
  }
  function submitAction(raidId, action, roundNumber) {
    lastError.value = ''
    socket.emit('cmoonraid:action', { raidId, action, roundNumber })
  }
  // Lobby controls (see cmoonRaidSocket.js's own registerCMoonRaid comment for what each does
  // server-side) — initiator-only toggleKeepOpen/forceStart, any-participant voteSpeedUp.
  function toggleKeepOpen(raidId, keepOpen) {
    lastError.value = ''
    socket.emit('cmoonraid:toggleKeepOpen', { raidId, keepOpen })
  }
  function forceStartRaid(raidId) {
    lastError.value = ''
    socket.emit('cmoonraid:forceStart', { raidId })
  }
  function voteSpeedUp(raidId) {
    lastError.value = ''
    socket.emit('cmoonraid:voteSpeedUp', { raidId })
  }
  // Initiator-only: cancel the whole FORMING lobby, kicking out every other participant too —
  // see cmoonraid:cancelRaid's own comment in cmoonRaidSocket.js.
  function cancelRaid(raidId) {
    lastError.value = ''
    socket.emit('cmoonraid:cancelRaid', { raidId })
  }

  // Ref-counted so two open lobby views don't unsubscribe each other.
  function subscribeLobby() {
    lobbySubscribers += 1
    if (lobbySubscribers === 1) {
      lobbyLoaded.value = false
      socket.emit('cmoonraid:lobbySubscribe')
    }
  }
  function unsubscribeLobby() {
    lobbySubscribers = Math.max(0, lobbySubscribers - 1)
    if (lobbySubscribers === 0) socket.emit('cmoonraid:lobbyUnsubscribe')
  }

  return {
    socket, raidState, lastRound, lastError, isConnected, currentRaidId,
    lobbyRaids, lobbyLoaded, lobbyViewer, lobbyClockOffsetMs,
    startRaid, joinRaid, leaveRaid, getState, submitAction, subscribeLobby, unsubscribeLobby,
    toggleKeepOpen, forceStartRaid, voteSpeedUp, cancelRaid,
  }
}
