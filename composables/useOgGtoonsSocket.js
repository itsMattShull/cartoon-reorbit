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
// Tournament pairings: tournamentMatchId -> { myReady, opponentReady, opponentOnline, live, ... } (pushed by the server).
const tournamentStates = ref({})
// The latest "your opponent is ready to play" ping: { tournamentMatchId, tournamentName, username, n }.
const tournamentOpponentReady = ref(null)
let tournamentPingCount = 0
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
      // ...and to a tutorial match (also a no-op if there isn't one).
      socket.emit('oggtoons:tutorial:resume')
    })
    socket.on('disconnect', () => { isConnected.value = false })

    // The game log is left out of high-frequency updates (placing/unplacing); keep the last one.
    const keepLog = (state) => (state && state.gameLog === undefined && matchState.value?.gameLog
      ? { ...state, gameLog: matchState.value.gameLog } : state)
    socket.on('oggtoons:matchStart', state => {
      matchState.value = state
      matchEnded.value = null
      lastReveal.value = null
      currentMatchId.value = state.matchId
    })
    // Full per-player view pushed after any private action (place/unplace/swap/discard) and when
    // the opponent commits or finishes discarding.
    socket.on('oggtoons:state', state => { matchState.value = keepLog(state) })
    socket.on('oggtoons:reveal', state => {
      matchState.value = keepLog(state)
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
      matchState.value = keepLog(state)
      matchEnded.value = matchState.value
    })
    socket.on('oggtoons:error', err => { lastError.value = err })
    socket.on('oggtoons:tournamentState', s => {
      if (s?.tournamentMatchId) tournamentStates.value = { ...tournamentStates.value, [s.tournamentMatchId]: s }
    })
    socket.on('oggtoons:tournamentOpponentReady', p => {
      tournamentOpponentReady.value = { ...p, n: ++tournamentPingCount }
    })
  }

  // Practice and tutorial matches (the server flags the view with `practice: true` / `tutorial: true`)
  // use their own event names so they can never reach PvP's stake/swap-debit handlers. A tutorial
  // view is also flagged practice, so it is checked first.
  const isTutorial = () => !!matchState.value?.tutorial
  const isPractice = () => !!matchState.value?.practice
  const prefix = () => (isTutorial() ? 'oggtoons:tutorial:' : isPractice() ? 'oggtoons:practice:' : 'oggtoons:')

  function commit(round) {
    if (!currentMatchId.value) return
    if (isPractice()) socket.emit(`${prefix()}commit`, { round })
    else socket.emit('oggtoons:commit', { matchId: currentMatchId.value, round })
  }
  // All three modes use the same payloads; practice and the tutorial just have their own event names.
  const send = (name, payload) => {
    if (!currentMatchId.value) return
    socket.emit(`${prefix()}${name}`, payload)
  }
  /** Put hand card `cardIdx` (deck index) into board slot `slot`; moves it if already placed. */
  function place(cardIdx, slot) { send('place', { cardIdx, slot }) }
  function unplace(slot) { send('unplace', { slot }) }
  /** Round 3: replace the card in slot 7 with a random undealt card (10 pts in PvP). */
  function swap() { send('swap', {}) }
  /** Round 3: keep slot 7 as it is. */
  function swapSkip() { send('swapSkip', {}) }
  /** End of the game: choose the real colour your Silver cards count as. */
  function chooseColor(color) { send('chooseColor', { color }) }
  /** Discard phase: drop these hand cards (possibly none) and finish discarding. */
  function discard(cardIdxs) { send('discard', { cardIdxs }) }
  function startPractice(deckId, difficulty) {
    lastError.value = null
    socket.emit('oggtoons:practice:start', { deckId, difficulty })
  }
  function startTutorial() {
    lastError.value = null
    socket.emit('oggtoons:tutorial:start')
  }
  /** Press Play on a tournament pairing. The server starts the game once both players are ready and online. */
  function tournamentReady(tournamentMatchId) {
    lastError.value = null
    socket.emit('oggtoons:tournamentReady', { tournamentMatchId })
  }
  function tournamentUnready(tournamentMatchId) {
    socket.emit('oggtoons:tournamentUnready', { tournamentMatchId })
  }
  /** Ask for the live picture of a pairing (opponent online? ready?). */
  function tournamentSync(tournamentMatchId) {
    socket.emit('oggtoons:tournamentSync', { tournamentMatchId })
  }
  function leaveMatch() {
    if (isPractice()) socket.emit(`${prefix()}leave`)
    else socket.emit('oggtoons:leave')
    matchState.value = null
    matchEnded.value = null
    currentMatchId.value = null
  }

  return {
    socket, matchState, lastReveal, matchEnded, isConnected, currentMatchId, lastError,
    commit, place, unplace, swap, swapSkip, chooseColor, discard, leaveMatch, startPractice, startTutorial,
    tournamentStates, tournamentOpponentReady, tournamentReady, tournamentUnready, tournamentSync
  }
}
