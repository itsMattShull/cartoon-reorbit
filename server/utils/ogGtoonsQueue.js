// server/utils/ogGtoonsQueue.js
//
// The random-match queue for original gToons (2002), kept free of Socket.IO / Prisma so it can be unit tested.
//
// Invariant (why this is its own module): there is AT MOST ONE entry per user, and `has()` answers from
// the very same array that pairing reads. The old runtime kept a `queue` array plus a separate
// `queueByUser` map and both were written only after several `await`s, so two joins from one user
// (double-click, two tabs, a reconnect re-emit) could both pass the "already queued?" check and push two
// entries. Removal then only dropped one of them, and the other became a ghost: invisible to
// has()/leave/disconnect/the stale sweep, yet still first in line to be paired with the next person who
// searched — putting a player who "isn't in the queue" into several games at once.
//
// Everything here is synchronous, so a check and the change it guards can never be separated by an await.

export function createMatchQueue() {
  /** @type {Array<{ userId: string, joinedAt: number }>} */
  const entries = []

  const indexOf = (userId) => entries.findIndex(e => e.userId === userId)

  return {
    get size() { return entries.length },
    has: (userId) => indexOf(userId) !== -1,
    get: (userId) => entries[indexOf(userId)] || null,

    /** Adds `entry` as the user's only entry (a repeat join replaces the older one rather than duplicating it). */
    add(entry) {
      this.remove(entry.userId)
      entries.push(entry)
      return entry
    },

    /** Removes every entry for `userId`. Returns true when something was removed. */
    remove(userId) {
      let removed = false
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].userId === userId) { entries.splice(i, 1); removed = true }
      }
      return removed
    },

    /** Drops entries that joined before `cutoffMs` (epoch ms). Returns the dropped entries. */
    removeOlderThan(cutoffMs) {
      const dropped = []
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].joinedAt < cutoffMs) dropped.push(...entries.splice(i, 1))
      }
      return dropped
    },

    /**
     * Takes the two longest-waiting entries that are still usable off the queue and returns them as
     * [a, b], or null when there is no pair yet. Entries `isUsable` rejects (a dead socket, a user who is
     * somehow already in a match) are discarded on the way and reported through `onDropped`, so a bad entry
     * can never sit at the front and be re-offered to every later searcher. Two entries for one user are
     * never paired with each other.
     */
    takePair(isUsable = () => true, onDropped = () => {}) {
      const usable = []
      for (const e of [...entries]) {
        if (!isUsable(e)) { this.remove(e.userId); onDropped(e); continue }
        if (usable.some(u => u.userId === e.userId)) continue
        usable.push(e)
        if (usable.length === 2) break
      }
      if (usable.length < 2) return null
      for (const e of usable) this.remove(e.userId)
      return usable
    }
  }
}
