// ReOrbit Chess — the AI's Web Worker.
//
// Instantiated by pages/newsite/reorbitchess.vue with
//   new Worker(new URL('../../lib/reorbitChessWorker.js', import.meta.url), { type: 'module' })
// which is the form Vite statically analyses, so the engine and its tables are emitted as
// their own chunk and never land in the bundle for any other route.
//
// The search has to run off the main thread. Mandark searches for up to 1.4 seconds; on the
// main thread that is 1.4 seconds during which the board does not repaint, the clock does not
// tick and taps are queued — which on a phone reads as the page having crashed.

import { pickMove } from './reorbitChessAi.js'

self.onmessage = (e) => {
  const { id, fen, persona, history } = e.data || {}
  if (!fen) return
  try {
    const move = pickMove(fen, persona, { history: history || [] })
    self.postMessage({ id, move })
  } catch (err) {
    // The page falls back to a random legal move on a null result, so a crash here degrades
    // the AI rather than wedging the game.
    self.postMessage({ id, move: null, error: String(err && err.message || err) })
  }
}
