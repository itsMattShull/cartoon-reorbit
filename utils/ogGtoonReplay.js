// utils/ogGtoonReplay.js
//
// The queue behind "show me what I missed". When a player opens an async tournament game, the server sends the reveals they
// have not watched yet (each with a snapshot of the board right after it) and the CURRENT view. They are played one at a time,
// in order, each as soon as the board says the previous one has finished animating; then the current view takes over. Pure
// (no Vue, no sockets) so the ordering rules can be tested without a browser.
//
// Rules:
//   * reveals play strictly in `seq` order and never twice (duplicates, and anything at or before the last seq, are ignored);
//   * a live reveal that arrives while replaying joins the end of the queue instead of interrupting it;
//   * the board acknowledges a reveal by its seq; an ack for anything but the one currently playing is ignored, so a stale
//     animation callback can never skip ahead;
//   * the most recent view always wins at the end, whatever order things arrived in.

export function createReplay({ queue = [], finalView = null } = {}) {
  const items = []
  let i = 0
  let finalV = finalView
  let lastQueued = 0

  const add = (rev) => {
    if (!rev || !Number.isInteger(rev.seq) || rev.seq <= lastQueued) return false
    items.push(rev)
    lastQueued = rev.seq
    return true
  }
  for (const r of [...queue].sort((a, b) => a.seq - b.seq)) add(r)

  return {
    /** The reveal that should be animating right now, or null when the queue is finished. */
    current: () => items[i] || null,
    /** A live reveal arrived mid-replay. Returns false when it was a duplicate / out of date. */
    append: add,
    /** A newer view arrived; it is shown when the replay finishes. */
    setFinalView(view) { if (view) finalV = view },
    finalView: () => finalV,
    /** The board finished animating reveal `seq`. Returns the next reveal to play, or null when none is left. */
    ack(seq) {
      if (items[i] && items[i].seq === seq) i += 1
      return items[i] || null
    },
    /** Skip everything that is left. */
    skip() { i = items.length },
    isDone: () => i >= items.length,
    progress: () => ({ index: Math.min(i, Math.max(0, items.length - 1)), total: items.length }),
    /** The highest seq that has been shown (or skipped past): what the server should record as watched. */
    watchedSeq: () => (i > 0 ? items[i - 1].seq : 0),
    lastSeq: () => lastQueued
  }
}

/** Seconds-accurate offset between the server's clock and this one, from a `serverNow` the server sent with a view. */
export function clockOffsetMs(serverNow, localNow = Date.now()) {
  const t = serverNow ? new Date(serverNow).getTime() : NaN
  return Number.isFinite(t) ? t - localNow : 0
}

/**
 * The line shown under the action strip: whose move it is, and what not moving costs. `deadline` is the view's
 * { dueAt, baseDueAt, extensions }; `now` is the corrected current time in ms.
 */
export function deadlineNote({ waitingOn, deadline, now, opponentName = 'Your opponent', over = false }) {
  if (over || !deadline?.dueAt) return null
  const due = new Date(deadline.dueAt).getTime()
  const left = due - now
  const when = left <= 0 ? 'now' : left < 3600 * 1000
    ? `in ${Math.max(1, Math.ceil(left / 60000))} min`
    : new Date(due).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const last = left > 0 && left <= 60 * 1000
  if (waitingOn === 'you') {
    return { tone: left < 3600 * 1000 ? 'urgent' : 'info', text: `Your move. If you haven't played by ${when} you lose the match.${last ? ' Playing now gives your opponent one more minute to answer.' : ''}` }
  }
  if (waitingOn === 'opponent') {
    return { tone: 'info', text: `You've moved. ${opponentName} has until ${when} to play, or you win the match.${deadline.extensions ? ` (Extended ${deadline.extensions} time${deadline.extensions === 1 ? '' : 's'}.)` : ''}` }
  }
  return { tone: 'info', text: `This match is decided at ${when}.` }
}
