// /composables/useCMoonPvpSocket.js
// Thin Socket.IO wrapper for cMoon PvP (see server/utils/cmoonPvpSocket.js) — direct structural
// port of useCMoonRaidSocket.js, same module-scoped-singleton shape so every component sharing
// one browser tab talks to the same connection.
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const matchState = ref(null)  // latest cmoonpvp:created/state/roundOpened/roundResolved/ended payload
const lastRound = ref(null)   // the most recent cmoonpvp:roundResolved's `round` detail, for the reveal UI
const lastKicked = ref(null)  // most recent cmoonpvp:participantKicked payload (AFK), for the remaining players' overlay
const lastError = ref('')
const isConnected = ref(false)
const currentMatchId = ref(null)
// PvP lobby — the live open-match list while the lobby modal is open.
const lobbyMatches = ref([])
const lobbyLoaded = ref(false)
const lobbyViewer = ref({ currentMatchId: null })
// serverNow - Date.now() at the last lobby push: join countdowns use the server's clock, so a
// phone whose clock is off by a minute still sees the right seconds left.
const lobbyClockOffsetMs = ref(0)
let lobbySubscribers = 0
let socket

export function useCMoonPvpSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000, withCredentials: true }
    )

    socket.on('connect', () => {
      isConnected.value = true
      if (currentMatchId.value) socket.emit('cmoonpvp:getState', { matchId: currentMatchId.value })
      // A reconnect drops server-side room membership — rejoin the lobby if it's still open.
      if (lobbySubscribers > 0) socket.emit('cmoonpvp:lobbySubscribe')
    })
    socket.on('disconnect', () => { isConnected.value = false })

    const applyState = (state) => { matchState.value = state; if (state?.id) currentMatchId.value = state.id }
    socket.on('cmoonpvp:created', applyState)
    socket.on('cmoonpvp:state', applyState)
    socket.on('cmoonpvp:participantJoined', applyState)
    socket.on('cmoonpvp:participantLeft', applyState)
    socket.on('cmoonpvp:roundOpened', (state) => { lastRound.value = null; applyState(state) })
    socket.on('cmoonpvp:participantActed', applyState)
    socket.on('cmoonpvp:roundResolved', (state) => { lastRound.value = state.round || null; applyState(state) })
    socket.on('cmoonpvp:ended', applyState)
    // Sent directly to THIS socket only (never broadcast — see cmoonpvp:leave's own comment in
    // cmoonPvpSocket.js), since by the time it fires this socket already left the room and would
    // never receive the room-wide participantLeft broadcast meant for everyone else.
    socket.on('cmoonpvp:leftMatch', (payload) => {
      if (!payload?.matchId || payload.matchId === currentMatchId.value) {
        matchState.value = null
        currentMatchId.value = null
      }
    })
    // Targeted the same way as leftMatch above — applyAfkKicks can't call socket.leave() directly
    // (it doesn't run inside this player's own socket handler), but it removes this socket from
    // the match room server-side via socketsLeave before broadcasting, so by the time the
    // room-wide participantKicked broadcast below goes out, this socket is already gone.
    socket.on('cmoonpvp:kicked', (payload) => {
      if (!payload?.matchId || payload.matchId === currentMatchId.value) {
        lastError.value = 'You were kicked from the match for inactivity.'
        matchState.value = null
        currentMatchId.value = null
      }
    })
    // Room-wide — reaches everyone STILL in the match (the kicked player already got the targeted
    // event above). Applies the refreshed roster like every other state push, and separately
    // stamps `lastKicked` with a fresh object each time so the page's own watcher can fire a
    // banner even if the same userId is kicked twice in one match.
    socket.on('cmoonpvp:participantKicked', (payload) => {
      applyState(payload)
      lastKicked.value = { kicked: payload?.kicked || [], at: Date.now() }
    })
    // Broadcast to the WHOLE room (unlike cmoonpvp:leftMatch above, which is targeted — a cancel
    // kicks out every current participant, not just the caller).
    socket.on('cmoonpvp:cancelled', (payload) => {
      if (!payload?.id || payload.id === currentMatchId.value) {
        lastError.value = payload?.message || 'This match was cancelled.'
        matchState.value = null
        currentMatchId.value = null
      }
    })
    socket.on('cmoonpvp:error', (payload) => { lastError.value = payload?.message || 'Something went wrong' })
    socket.on('cmoonpvp:lobby', (payload) => {
      lobbyMatches.value = Array.isArray(payload?.matches) ? payload.matches : []
      if (Number.isFinite(payload?.serverNow)) lobbyClockOffsetMs.value = payload.serverNow - Date.now()
      lobbyLoaded.value = true
    })
    socket.on('cmoonpvp:lobbyViewer', (payload) => {
      lobbyViewer.value = { currentMatchId: payload?.currentMatchId || null }
    })
  }

  function startMatch(team, { isPrivate = false } = {}) {
    lastError.value = ''
    socket.emit('cmoonpvp:start', { team, isPrivate })
  }
  function joinMatch(matchId, team) {
    lastError.value = ''
    currentMatchId.value = matchId
    socket.emit('cmoonpvp:join', { matchId, team })
  }
  function leaveMatch(matchId) {
    socket.emit('cmoonpvp:leave', { matchId })
  }
  function getState(matchId) {
    currentMatchId.value = matchId
    socket.emit('cmoonpvp:getState', { matchId })
  }
  function submitAction(matchId, action, roundNumber) {
    lastError.value = ''
    socket.emit('cmoonpvp:action', { matchId, action, roundNumber })
  }
  // Lobby controls — initiator-only toggleKeepOpen/forceStart/cancelMatch, any-participant voteSpeedUp.
  function toggleKeepOpen(matchId, keepOpen) {
    lastError.value = ''
    socket.emit('cmoonpvp:toggleKeepOpen', { matchId, keepOpen })
  }
  function forceStartMatch(matchId) {
    lastError.value = ''
    socket.emit('cmoonpvp:forceStart', { matchId })
  }
  function voteSpeedUp(matchId) {
    lastError.value = ''
    socket.emit('cmoonpvp:voteSpeedUp', { matchId })
  }
  function cancelMatch(matchId) {
    lastError.value = ''
    socket.emit('cmoonpvp:cancelMatch', { matchId })
  }

  // Ref-counted so two open lobby views don't unsubscribe each other.
  function subscribeLobby() {
    lobbySubscribers += 1
    if (lobbySubscribers === 1) {
      lobbyLoaded.value = false
      socket.emit('cmoonpvp:lobbySubscribe')
    }
  }
  function unsubscribeLobby() {
    lobbySubscribers = Math.max(0, lobbySubscribers - 1)
    if (lobbySubscribers === 0) socket.emit('cmoonpvp:lobbyUnsubscribe')
  }

  return {
    socket, matchState, lastRound, lastKicked, lastError, isConnected, currentMatchId,
    lobbyMatches, lobbyLoaded, lobbyViewer, lobbyClockOffsetMs,
    startMatch, joinMatch, leaveMatch, getState, submitAction, subscribeLobby, unsubscribeLobby,
    toggleKeepOpen, forceStartMatch, voteSpeedUp, cancelMatch,
  }
}
