// server/utils/ogGtoonTournamentFreeze.js
//
// "Your deck is frozen once you lock it in." The 12 copies a player registers for an OG gToons tournament
// cannot leave their collection (trade, auction, wishlist hand-over, holiday burn) for as long as that player
// is still in the tournament. Nothing here is stored: a copy is frozen when it sits in the LOCKED DECK of an
// entrant who is still in a tournament that has not ended, so there is no marker to forget to clear, nothing
// to backfill, and re-locking a different deck releases the old copies on its own (the old snapshot is gone).
//
// A player stops being "in" when they are disqualified, opted out (isActive false), knocked out of the bracket,
// did not make the Top 8 cut, or the tournament is complete / cancelled.
//
// This is deliberately NOT the user-facing "lock cToons" feature (lockRules.js): that lock only shields a copy
// from OTHER people and never stops its owner trading it away, so it cannot freeze anything.
//
// Backstop for the paths that are not guarded here (admin tools, account dissolution): loadLockedDeckForGame
// flags a copy that has changed hands, that player cannot play, and loses the match at the deadline.
//
// No imports on purpose: the cron worker, the socket server and the Nuxt API all use this, each with its own
// Prisma client (or transaction client), so callers pass `db` in.

/** Tournament statuses during which a locked deck is frozen. */
export const FREEZE_STATUSES = ['OPT_IN_OPEN', 'OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE']

export const FROZEN_OWN_MESSAGE =
  'One or more of these cToons are locked into your deck for an OG gToons tournament and cannot be traded, auctioned or opened until you are out of it.'

/** The copy ids named in a locked-deck snapshot ([{ position, ctoonId, userCtoonId }]). */
export function snapshotCopyIds(snapshot) {
  return Array.isArray(snapshot) ? snapshot.map(s => s?.userCtoonId).filter(Boolean) : []
}

/**
 * True when `userId` is no longer in a tournament's bracket. Swiss is never "out" (everyone plays every
 * round); in the bracket a lost match ends it, and in Swiss-then-Top-8 a player with no bracket match at all
 * missed the cut.
 */
export async function isOutOfBracket(db, tournament, userId) {
  if (tournament.status !== 'BRACKET_ACTIVE') return false
  const matches = await db.ogGtoonTournamentMatch.findMany({
    where: { tournamentId: tournament.id, stage: 'BRACKET', OR: [{ playerAUserId: userId }, { playerBUserId: userId }] },
    select: { status: true, winnerUserId: true }
  })
  if (!matches.length) return tournament.format === 'SWISS_THEN_TOP8'
  return matches.some(m => m.status === 'COMPLETE' && m.winnerUserId && m.winnerUserId !== userId)
}

/**
 * Every copy of `userId` that is frozen right now, as Map<userCtoonId, { tournamentId, tournamentName }>.
 * One indexed query (userId) that returns nothing for the overwhelming majority of players, so it is cheap
 * enough to run on every card-leaving action.
 */
export async function frozenCopyMap(db, userId) {
  const out = new Map()
  if (!userId) return out
  const entries = await db.ogGtoonTournamentOptIn.findMany({
    where: { userId, isActive: true, disqualified: false, tournament: { status: { in: FREEZE_STATUSES } } },
    select: { deckSnapshotJson: true, tournament: { select: { id: true, name: true, status: true, format: true } } }
  })
  for (const e of entries) {
    const ids = snapshotCopyIds(e.deckSnapshotJson)
    if (!ids.length) continue
    if (await isOutOfBracket(db, e.tournament, userId)) continue
    for (const id of ids) {
      if (!out.has(id)) out.set(id, { tournamentId: e.tournament.id, tournamentName: e.tournament.name })
    }
  }
  return out
}

/** The subset of `copyIds` that is frozen for `userId` (empty when none). */
export async function frozenAmong(db, userId, copyIds) {
  if (!copyIds?.length) return []
  const map = await frozenCopyMap(db, userId)
  if (!map.size) return []
  return copyIds.filter(id => map.has(id))
}
