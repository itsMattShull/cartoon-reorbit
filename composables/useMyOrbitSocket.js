// /composables/useMyOrbitSocket.js
// Thin Socket.IO wrapper for MyOrbit live avatar chat rooms (see server/utils/myOrbitSocket.js)
// — same module-scoped-singleton shape as useCMoonRaidSocket.js so every component sharing one
// browser tab talks to the same connection.
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const roomState = ref(null) // latest myorbit:state/participantJoined/participantLeft/participantMoved payload
const lastError = ref('')
const isConnected = ref(false)
const currentRoomId = ref(null)
let socket

export function useMyOrbitSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000, withCredentials: true }
    )

    socket.on('connect', () => {
      isConnected.value = true
      // A reconnect drops server-side room membership - rejoin the same room if one was open.
      if (currentRoomId.value) socket.emit('myorbit:getState', { roomId: currentRoomId.value })
    })
    socket.on('disconnect', () => { isConnected.value = false })

    // myorbit:state carries the FULL room definition (layout + participants) - sent once on
    // join/getState. The participant-only events below carry just `{ participants }`, so they
    // must be merged onto the existing roomState rather than replacing it wholesale (that would
    // wipe out the already-loaded tiles/furniture layout on every single move tick).
    socket.on('myorbit:state', (state) => {
      roomState.value = state
      if (state?.id) currentRoomId.value = state.id
    })
    const mergeParticipants = (payload) => {
      if (!roomState.value) return
      roomState.value = { ...roomState.value, participants: payload?.participants || [] }
    }
    socket.on('myorbit:participantJoined', mergeParticipants)
    socket.on('myorbit:participantLeft', mergeParticipants)
    socket.on('myorbit:participantMoved', mergeParticipants)
    socket.on('myorbit:error', (payload) => { lastError.value = payload?.message || 'Something went wrong' })
    socket.on('myorbit:moveRejected', () => { lastError.value = "You can't walk there." })
    // Sent instead of a plain error when a resync (getState) finds this client is no longer a
    // participant — most commonly a dropped connection that outlasted the server's reconnect
    // grace window. Unlike a generic error, the local state is now stale and must be cleared so
    // the UI shows "rejoin" rather than a frozen, no-longer-updating room.
    socket.on('myorbit:removed', (payload) => {
      if (!payload?.roomId || payload.roomId === currentRoomId.value) {
        lastError.value = 'You were disconnected too long and left the room — rejoin to continue.'
        roomState.value = null
        currentRoomId.value = null
      }
    })
  }

  function joinRoom(roomId, userCtoonId) {
    lastError.value = ''
    currentRoomId.value = roomId
    socket.emit('myorbit:join', { roomId, userCtoonId })
  }
  function leaveRoom() {
    socket.emit('myorbit:leave')
    roomState.value = null
    currentRoomId.value = null
  }
  function getState(roomId) {
    currentRoomId.value = roomId
    socket.emit('myorbit:getState', { roomId })
  }
  function moveTo(x, y) {
    lastError.value = ''
    socket.emit('myorbit:move', { x, y })
  }

  return { socket, roomState, lastError, isConnected, currentRoomId, joinRoom, leaveRoom, getState, moveTo }
}
