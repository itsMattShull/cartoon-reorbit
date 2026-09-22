// /composables/useOgGtoonsRoomSocket.js
// Matchmaking/lobby/challenge state for original gToons (2002). Mirrors
// composables/useClashRoomSocket.js's module-scoped-singleton pattern, and shares the SAME
// underlying socket.io-client connection as useOgGtoonsSocket.js (both games live on the one
// shared socket-server.js process/port) by reusing its singleton via a lazy require-style
// import rather than opening a second connection.
import { ref, onBeforeUnmount } from 'vue'
import { useOgGtoonsSocket } from './useOgGtoonsSocket'

const lobbyState = ref(null)
let bound = false

export function useOgGtoonsRoomSocket() {
  const { socket, isConnected } = useOgGtoonsSocket()

  if (!bound) {
    bound = true
    socket.on('connect', () => socket.emit('oggtoons:subscribe'))
    socket.on('oggtoons:lobbyState', state => { lobbyState.value = state })
    socket.on('oggtoons:queueJoined', () => {
      lobbyState.value = { ...(lobbyState.value || {}), inQueue: true }
    })
    socket.on('oggtoons:queueLeft', () => {
      lobbyState.value = { ...(lobbyState.value || {}), inQueue: false }
    })
    socket.on('oggtoons:challengeSent', payload => {
      const sent = [...(lobbyState.value?.sentChallenges || []), payload]
      lobbyState.value = { ...(lobbyState.value || {}), sentChallenges: sent }
    })
    socket.on('oggtoons:challengeReceived', payload => {
      const incoming = [...(lobbyState.value?.incomingChallenges || []), payload]
      lobbyState.value = { ...(lobbyState.value || {}), incomingChallenges: incoming }
    })
    socket.on('oggtoons:challengeDeclined', ({ id }) => {
      const sent = (lobbyState.value?.sentChallenges || []).filter(c => c.id !== id)
      lobbyState.value = { ...(lobbyState.value || {}), sentChallenges: sent }
    })
    socket.on('oggtoons:challengeCancelled', ({ id }) => {
      const incoming = (lobbyState.value?.incomingChallenges || []).filter(c => c.id !== id)
      lobbyState.value = { ...(lobbyState.value || {}), incomingChallenges: incoming }
    })
  }

  if (isConnected.value) socket.emit('oggtoons:subscribe')

  function joinQueue(deckId, stake) {
    socket.emit('oggtoons:queueJoin', { deckId, stake })
  }
  function leaveQueue() {
    socket.emit('oggtoons:queueLeave')
  }
  function sendChallenge(targetUsername, deckId, stake) {
    socket.emit('oggtoons:challengeSend', { targetUsername, deckId, stake })
  }
  function acceptChallenge(challengeId, deckId) {
    socket.emit('oggtoons:challengeAccept', { challengeId, deckId })
  }
  function declineChallenge(challengeId) {
    socket.emit('oggtoons:challengeDecline', { challengeId })
    const incoming = (lobbyState.value?.incomingChallenges || []).filter(c => c.id !== challengeId)
    lobbyState.value = { ...(lobbyState.value || {}), incomingChallenges: incoming }
  }
  function cancelChallenge(challengeId) {
    socket.emit('oggtoons:challengeCancel', { challengeId })
    const sent = (lobbyState.value?.sentChallenges || []).filter(c => c.id !== challengeId)
    lobbyState.value = { ...(lobbyState.value || {}), sentChallenges: sent }
  }

  onBeforeUnmount(() => {
    // The socket itself is a shared singleton (see useOgGtoonsSocket) and must not be torn
    // down here — only this composable's own listeners would need cleanup, and since they are
    // bound once for the module's lifetime (the `bound` guard above) rather than per-component,
    // there is nothing additional to unregister on unmount.
  })

  return {
    socket, isConnected, lobbyState,
    joinQueue, leaveQueue, sendChallenge, acceptChallenge, declineChallenge, cancelChallenge
  }
}
