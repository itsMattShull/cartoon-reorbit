// /composables/useCMoonRaidPreviewSocket.js
// Thin Socket.IO wrapper for the admin-only, consequence-free raid boss preview (see
// server/utils/cmoonRaidPreviewSocket.js) — deliberately its own module-scoped singleton, wired
// to the entirely separate `cmoonraidpreview:*` event namespace, rather than parameterizing
// useCMoonRaidSocket.js: that composable's `socket`/state are module-level singletons shared by
// every component on the page, so making it serve two different backing event namespaces off one
// shared connection would need per-instance state this file avoids by just being its own copy.
// Same shape otherwise, so the raid preview page can be a close mirror of the real raid page.
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const raidState = ref(null)
const lastRound = ref(null)
const lastError = ref('')
const isConnected = ref(false)
const currentRaidId = ref(null)
let socket

export function useCMoonRaidPreviewSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000, withCredentials: true }
    )

    socket.on('connect', () => {
      isConnected.value = true
      if (currentRaidId.value) socket.emit('cmoonraidpreview:getState', { raidId: currentRaidId.value })
    })
    socket.on('disconnect', () => { isConnected.value = false })

    const applyState = (state) => { raidState.value = state; if (state?.id) currentRaidId.value = state.id }
    socket.on('cmoonraidpreview:created', applyState)
    socket.on('cmoonraidpreview:state', applyState)
    socket.on('cmoonraidpreview:participantJoined', applyState)
    socket.on('cmoonraidpreview:participantLeft', applyState)
    socket.on('cmoonraidpreview:roundOpened', (state) => { lastRound.value = null; applyState(state) })
    socket.on('cmoonraidpreview:participantActed', applyState)
    socket.on('cmoonraidpreview:roundResolved', (state) => { lastRound.value = state.round || null; applyState(state) })
    socket.on('cmoonraidpreview:ended', applyState)
    socket.on('cmoonraidpreview:error', (payload) => { lastError.value = payload?.message || 'Something went wrong' })
  }

  function startRaid(enemyMemberId) {
    lastError.value = ''
    socket.emit('cmoonraidpreview:start', { enemyMemberId })
  }
  function joinRaid(raidId) {
    lastError.value = ''
    currentRaidId.value = raidId
    socket.emit('cmoonraidpreview:join', { raidId })
  }
  function leaveRaid(raidId) {
    socket.emit('cmoonraidpreview:leave', { raidId })
  }
  function getState(raidId) {
    currentRaidId.value = raidId
    socket.emit('cmoonraidpreview:getState', { raidId })
  }
  function submitAction(raidId, action, roundNumber) {
    lastError.value = ''
    socket.emit('cmoonraidpreview:action', { raidId, action, roundNumber })
  }

  return {
    socket, raidState, lastRound, lastError, isConnected, currentRaidId,
    startRaid, joinRaid, leaveRaid, getState, submitAction,
  }
}
