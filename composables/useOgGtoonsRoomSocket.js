// /composables/useOgGtoonsRoomSocket.js
// Matchmaking/lobby/challenge state for original gToons (2002). Mirrors
// composables/useClashRoomSocket.js's module-scoped-singleton pattern, and shares the SAME
// underlying socket.io-client connection as useOgGtoonsSocket.js (both games live on the one
// shared socket-server.js process/port) by reusing its singleton via a lazy require-style
// import rather than opening a second connection.
import { ref, onBeforeUnmount } from 'vue'
import { useOgGtoonsSocket } from './useOgGtoonsSocket'

const lobbyState = ref(null)
// Usernames on the Matchmaking tab who can be challenged right now (server-filtered; never includes you).
const lobbyUsers = ref([])
// The latest thing that happened to a request you sent: { id, kind: 'declined'|'busy'|'expired', username, n }.
// `n` changes on every event so a watcher fires even for two identical notices in a row.
const challengeNotice = ref(null)
let noticeCount = 0
let wantsLobby = false
let bound = false

export function useOgGtoonsRoomSocket() {
  const { socket, isConnected } = useOgGtoonsSocket()

  if (!bound) {
    bound = true
    socket.on('connect', () => {
      socket.emit('oggtoons:subscribe')
      if (wantsLobby) socket.emit('oggtoons:lobbyJoin') // a dropped connection forgets the lobby; rejoin it
    })
    socket.on('disconnect', () => { lobbyUsers.value = [] })
    socket.on('oggtoons:lobbyUsers', ({ users }) => { lobbyUsers.value = Array.isArray(users) ? users : [] })
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
    socket.on('oggtoons:challengeDeclined', ({ id, toUsername, reason }) => {
      const sent = (lobbyState.value?.sentChallenges || []).filter(c => c.id !== id)
      lobbyState.value = { ...(lobbyState.value || {}), sentChallenges: sent }
      challengeNotice.value = { id, kind: reason || 'declined', username: toUsername || 'Your opponent', n: ++noticeCount }
    })
    socket.on('oggtoons:challengeCancelled', ({ id }) => {
      const incoming = (lobbyState.value?.incomingChallenges || []).filter(c => c.id !== id)
      lobbyState.value = { ...(lobbyState.value || {}), incomingChallenges: incoming }
    })
  }

  if (isConnected.value) socket.emit('oggtoons:subscribe')

  /** Show up in other players' challenge dropdown (call while the Matchmaking tab is open). */
  function joinLobby() {
    wantsLobby = true
    if (isConnected.value) socket.emit('oggtoons:lobbyJoin')
  }
  function leaveLobby() {
    wantsLobby = false
    lobbyUsers.value = []
    socket.emit('oggtoons:lobbyLeave')
  }

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
    // The server consumes the request whether the match starts or not (a failure arrives as an error), so
    // the prompt closes now rather than lingering after a failed start.
    const incoming = (lobbyState.value?.incomingChallenges || []).filter(c => c.id !== challengeId)
    lobbyState.value = { ...(lobbyState.value || {}), incomingChallenges: incoming }
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
    socket, isConnected, lobbyState, lobbyUsers, challengeNotice,
    joinLobby, leaveLobby, joinQueue, leaveQueue, sendChallenge, acceptChallenge, declineChallenge, cancelChallenge
  }
}
