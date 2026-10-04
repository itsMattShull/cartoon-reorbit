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
    socket.on('cmoonraid:error', (payload) => { lastError.value = payload?.message || 'Something went wrong' })
  }

  function startRaid(enemyMemberId) {
    lastError.value = ''
    socket.emit('cmoonraid:start', { enemyMemberId })
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

  return {
    socket, raidState, lastRound, lastError, isConnected, currentRaidId,
    startRaid, joinRaid, leaveRaid, getState, submitAction,
  }
}
