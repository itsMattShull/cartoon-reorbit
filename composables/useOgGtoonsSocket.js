// /composables/useOgGtoonsSocket.js
// Live-match state for original gToons (2002). Mirrors composables/useClashSocket.js:
// module-scoped refs, a singleton socket.io-client connection with credentials so every
// oggtoons:* handler authenticates from the session cookie server-side.
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const matchState = ref(null)
const lastReveal = ref(null)
const matchEnded = ref(null)
const isConnected = ref(false)
const currentMatchId = ref(null)
const lastError = ref(null)
let socket

export function useOgGtoonsSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000, withCredentials: true }
    )

    socket.on('connect', () => {
      isConnected.value = true
      socket.emit('oggtoons:subscribe')
      // Reattach to a live practice match after a refresh/reconnect (no-op if there isn't one).
      socket.emit('oggtoons:practice:resume')
    })
    socket.on('disconnect', () => { isConnected.value = false })

    socket.on('oggtoons:matchStart', state => {
      matchState.value = state
      matchEnded.value = null
      currentMatchId.value = state.matchId
    })
    socket.on('oggtoons:reveal', state => {
      matchState.value = state
      lastReveal.value = state.reveal
    })
    // Ready flags only travel in full-state payloads (matchStart/reveal), which are sent when a
    // round resolves — so flip them locally on these events or the board shows a stale
    // "Thinking..." / re-enabled Reveal button until the next reveal.
    socket.on('oggtoons:committed', () => {
      const s = matchState.value
      if (s) matchState.value = { ...s, you: { ...s.you, ready: true } }
    })
    socket.on('oggtoons:opponentCommitted', () => {
      const s = matchState.value
      if (s) matchState.value = { ...s, opponent: { ...s.opponent, ready: true } }
    })
    socket.on('oggtoons:swapApplied', () => {})
    socket.on('oggtoons:opponentDropped', payload => {
      matchState.value = matchState.value ? { ...matchState.value, opponentDropped: payload } : matchState.value
    })
    socket.on('oggtoons:opponentReturned', () => {
      matchState.value = matchState.value ? { ...matchState.value, opponentDropped: null } : matchState.value
    })
    socket.on('oggtoons:matchEnd', state => {
      matchState.value = state
      matchEnded.value = state
    })
    socket.on('oggtoons:error', err => { lastError.value = err })
  }

  // Practice matches (server flags the view with `practice: true`) use their own event names so
  // they can never reach PvP's stake/swap-debit handlers.
  const isPractice = () => !!matchState.value?.practice

  function commit(round) {
    if (!currentMatchId.value) return
    if (isPractice()) socket.emit('oggtoons:practice:commit', { round })
    else socket.emit('oggtoons:commit', { matchId: currentMatchId.value, round })
  }
  function swap(swapWithIndex) {
    if (!currentMatchId.value) return
    if (isPractice()) socket.emit('oggtoons:practice:swap', { swapWithIndex })
    else socket.emit('oggtoons:swap', { matchId: currentMatchId.value, swapWithIndex })
  }
  function startPractice(deckId, difficulty) {
    lastError.value = null
    socket.emit('oggtoons:practice:start', { deckId, difficulty })
  }
  function leaveMatch() {
    if (isPractice()) socket.emit('oggtoons:practice:leave')
    else socket.emit('oggtoons:leave')
    matchState.value = null
    matchEnded.value = null
    currentMatchId.value = null
  }

  return {
    socket, matchState, lastReveal, matchEnded, isConnected, currentMatchId, lastError,
    commit, swap, leaveMatch, startPractice
  }
}
