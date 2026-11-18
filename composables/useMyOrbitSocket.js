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
// Live-only (see MyOrbitModerationLog's own schema comment on why chat is never persisted) -
// a bounded rolling window of recent messages, not a full history. Cleared on room change.
const MAX_CHAT_MESSAGES = 200
const chatMessages = ref([])
// The single most recent emote broadcast to the room - a one-shot event, not a log (unlike
// chat). A component renders it as a transient pop over the sender's avatar and discards it;
// this ref only exists so a watcher can react to each new arrival even if two emotes land with
// the exact same emoteKey back to back (a plain `watch` on a changed VALUE would miss that).
const lastEmoteEvent = ref(null)
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
      const isNewRoom = state?.id && state.id !== currentRoomId.value
      roomState.value = state
      if (state?.id) currentRoomId.value = state.id
      if (isNewRoom) chatMessages.value = [] // switching rooms starts a fresh chat window
    })
    socket.on('myorbit:chatMessage', (message) => {
      chatMessages.value = [...chatMessages.value.slice(-(MAX_CHAT_MESSAGES - 1)), message]
    })
    socket.on('myorbit:messageDeleted', ({ messageId }) => {
      chatMessages.value = chatMessages.value.filter(m => m.id !== messageId)
    })
    socket.on('myorbit:emote', (payload) => { lastEmoteEvent.value = payload })
    // Targeted at this user specifically (an admin ban's live kick) - distinct from myorbit:error:
    // the room membership is already gone server-side, so local state must be cleared too.
    socket.on('myorbit:kicked', (payload) => {
      lastError.value = payload?.reason || 'You were removed from MyOrbit by an admin.'
      roomState.value = null
      currentRoomId.value = null
      chatMessages.value = []
    })
    const mergeParticipants = (payload) => {
      if (!roomState.value) return
      roomState.value = { ...roomState.value, participants: payload?.participants || [] }
    }
    socket.on('myorbit:participantJoined', mergeParticipants)
    socket.on('myorbit:participantLeft', mergeParticipants)
    socket.on('myorbit:participantMoved', mergeParticipants)
    // A rejected join (room full, banned, MyOrbit disabled, ...) is the one error that can arrive
    // while roomState is still null — joinRoom() below sets currentRoomId optimistically before
    // the server confirms, and nothing else ever clears it on a rejection. Left stuck, it makes
    // the minimized tab permanently claim "(in a room)" for a room never actually joined, and a
    // later reconnect's getState would ask the server about membership that was never granted.
    socket.on('myorbit:error', (payload) => {
      lastError.value = payload?.message || 'Something went wrong'
      if (!roomState.value) currentRoomId.value = null
    })
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
    chatMessages.value = []
  }
  function getState(roomId) {
    currentRoomId.value = roomId
    socket.emit('myorbit:getState', { roomId })
  }
  function moveTo(x, y) {
    lastError.value = ''
    socket.emit('myorbit:move', { x, y })
  }
  function sendChat(message) {
    lastError.value = ''
    socket.emit('myorbit:chat', { message })
  }
  function sendEmote(emoteKey) {
    socket.emit('myorbit:emote', { emoteKey })
  }
  function inviteToRaid(targetUserId) {
    socket.emit('myorbit:inviteToRaid', { targetUserId })
  }

  return {
    socket, roomState, lastError, isConnected, currentRoomId, chatMessages, lastEmoteEvent,
    joinRoom, leaveRoom, getState, moveTo, sendChat, sendEmote, inviteToRaid
  }
}
