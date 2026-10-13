// lib/gtoonLoopGovernor.js
// Keeps looping card effects from overloading a device. Every card in a slot is allowed to loop, but if the
// frame rate drops the governor pauses the OLDEST cards' loops (the newest reveal keeps its effects), and it
// brings them back one step at a time once the device has headroom again. Pure logic (no DOM) so it is testable;
// lib/gtoonCardEngine.js feeds it real frame-rate samples and does the actual pausing.

export function createLoopGovernor({
  initialBudget = 16,   // how many cards may loop at once before any measurement says otherwise
  minBudget = 2,        // never pause below this many looping cards
  lowFps = 24,          // below this a window counts as "struggling"
  highFps = 45,         // at/above this a window counts as "has headroom"
  goodWindows = 3,      // consecutive healthy windows required before resuming anything
  maxGoodWindows = 12,  // ...which doubles after every cut (backoff) up to this, so a borderline device doesn't flicker
  backoff = true,
  step = 2,             // cards resumed per recovery
  onPause = () => {},
  onResume = () => {}
} = {}) {
  const running = []    // cards with live loops, oldest first
  const paused = []     // cards paused by the budget, in the order they were paused
  let budget = initialBudget
  let good = 0
  let needed = goodWindows

  const without = (list, card) => { const i = list.indexOf(card); if (i >= 0) list.splice(i, 1) }

  function enforce() {
    while (running.length > budget) {
      const oldest = running.shift()
      paused.push(oldest)
      onPause(oldest)
    }
  }

  return {
    /** A card started looping. If that exceeds the budget the oldest card gives up its loops. */
    add(card) {
      if (!running.includes(card)) running.push(card)
      without(paused, card)
      enforce()
    },
    /** A card stopped looping for any other reason (destroyed, off-screen, effects removed). */
    remove(card) { without(running, card); without(paused, card) },
    /** Feed one frame-rate sample (a window of a second or two). */
    tick(fps) {
      if (fps < lowFps) {
        good = 0
        const target = Math.max(minBudget, Math.floor(running.length * 0.7))
        if (target < budget) budget = target
        if (backoff) needed = Math.min(maxGoodWindows, needed * 2)
        enforce()
      } else if (fps >= highFps && paused.length) {
        good += 1
        if (good >= needed) {
          good = 0
          budget = Math.min(initialBudget, Math.max(budget, running.length) + step)
          while (paused.length && running.length < budget) {
            const c = paused.pop()
            running.push(c)
            onResume(c)
          }
        }
      } else if (fps >= highFps) {
        // nothing paused and healthy: ease the backoff back down
        needed = Math.max(goodWindows, needed - 1)
      } else {
        good = 0
      }
    },
    get budget() { return budget },
    get recoveryWindows() { return needed },
    get runningCount() { return running.length },
    get pausedCount() { return paused.length }
  }
}
