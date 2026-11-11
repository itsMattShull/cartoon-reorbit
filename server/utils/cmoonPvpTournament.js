// server/utils/cmoonPvpTournament.js
// Pure, DB-free bracket pairing/advancement for cMoon PvP tournaments — single-elimination only
// in V1 (see CMoonPvpTournamentFormat's own schema comment; Swiss is a documented future extension
// that would hook in here via tournamentCore.js's own pairSwissRound/computeRecords, unused today).
// Imports nothing but tournamentCore.js's own pure, ID-agnostic bracket math (bracketSizeFor/
// buildBracketSeedPairs/bracketRoundLabel) — those functions don't care whether a "player" is a
// userId or a team entry id, so this file substitutes CMoonPvpTournamentEntry ids in directly
// rather than forking the math. The Prisma-bound caller (round-opening/resolution) lives in
// server/utils/cmoonPvpSocket.js and the admin tournament endpoints.

import { bracketSizeFor, buildBracketSeedPairs, bracketRoundLabel } from './tournamentCore.js'

export { bracketRoundLabel }

// Round 1 pairings from a seeded list of entry ids (seed 1 = entryIds[0], seed 2 = entryIds[1],
// ...). A pairing with one null entry id is a BYE — see CMoonPvpTournamentMatch.entryAId/entryBId's
// own schema comment — and the non-null side auto-advances without ever playing a live match; the
// caller must apply that itself (checkByeAdvances below exists for exactly that).
export function buildFirstRoundPairings(entryIds) {
  const bracketSize = bracketSizeFor(entryIds.length)
  const pairs = buildBracketSeedPairs(bracketSize)
  const seedToEntry = (seed) => entryIds[seed - 1] || null
  return pairs.map(([seedA, seedB]) => ({ entryAId: seedToEntry(seedA), entryBId: seedToEntry(seedB) }))
}

// A first-round pairing with exactly one real entry — the bye slot (bracketSize always rounds up
// to the next power of two, see bracketSizeFor) never had an opponent, so there's no match to
// actually play. Returns the entry id that advances automatically, or null if this isn't a bye
// (both slots filled, or — defensively — both empty, which bracketSizeFor's own invariant should
// never produce from a non-empty entryIds list).
export function checkByeAdvance({ entryAId, entryBId }) {
  if (entryAId && !entryBId) return entryAId
  if (entryBId && !entryAId) return entryBId
  return null
}

// Pairs the WINNERS of one resolved round into the next round's matchups — standard single-elim
// advancement: adjacent winners (in the same order their own matches were created) face each other.
// `previousRoundWinnerEntryIds` must already be in bracket order (round 1's own pairing order, or
// whatever order buildFirstRoundPairings/this function itself produced for the round before it) —
// the caller is responsible for reading CMoonPvpTournamentMatch rows back in creation order, same
// "position encodes the bracket slot" discipline buildBracketSeedPairs' own seed numbering relies
// on. A null in the list (shouldn't happen — every match by the time this runs has either a real
// winner or was already resolved as a bye) is passed through rather than crashing, so a caller bug
// surfaces as a visibly wrong pairing rather than an unhandled exception mid-tournament.
export function pairNextRound(previousRoundWinnerEntryIds) {
  const pairs = []
  for (let i = 0; i < previousRoundWinnerEntryIds.length; i += 2) {
    pairs.push({ entryAId: previousRoundWinnerEntryIds[i] ?? null, entryBId: previousRoundWinnerEntryIds[i + 1] ?? null })
  }
  return pairs
}

// Whether a round is done: every match in it has a winner recorded (set either by a live match
// resolving, or immediately at creation for a bye — see cmoonPvpSocket.js's own round-opening
// logic). Takes the round's own CMoonPvpTournamentMatch rows.
export function isRoundComplete(roundMatches) {
  return roundMatches.length > 0 && roundMatches.every(m => !!m.winnerEntryId)
}

// Whether the bracket itself is done — the round that was just completed had exactly one match
// (the Final, see bracketRoundLabel(1) === 'Final').
export function isTournamentComplete(roundMatches) {
  return isRoundComplete(roundMatches) && roundMatches.length === 1
}
