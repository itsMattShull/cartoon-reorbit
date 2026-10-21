// server/utils/ogGtoonsMatchSerialize.js
//
// The shape of a live OG gToons match as mirrored to Redis (see ogGtoonsRedisState.js). Kept in its
// own import-free file so it can be unit tested without opening a Redis connection.
//
// This is a hand-written WHITELIST: a field added to a live match is silently dropped on restart
// unless it is listed here (tests/ogGtoonTournamentSocket.test.js guards `tournament`).

// Sockets and timer handles cannot be serialized and are always reconstructed on restore.
export function serializeMatch(match) {
  return {
    id: match.id,
    players: match.players,
    usernames: match.usernames,
    deckOrder: match.deckOrder,
    hand: match.hand,
    undealt: match.undealt,
    discarded: match.discarded,
    placements: match.placements,
    phase: match.phase,
    discardReady: match.discardReady,
    pendingDiscard: match.pendingDiscard || null,
    goalColor: match.goalColor,
    goalCardIdx: match.goalCardIdx,
    swapUsed: match.swapUsed,
    gameLog: match.gameLog || [],
    swapReady: match.swapReady,
    pendingSwap: match.pendingSwap,
    colorReady: match.colorReady,
    pendingColor: match.pendingColor,
    silverColor: match.silverColor,
    colorDone: match.colorDone,
    deadline: match.deadline,
    ready: match.ready,
    held: match.held,
    revealed: match.revealed, // roundLog itself is built once, at match completion, not carried live
    stake: match.stake,
    currentRound: match.currentRound,
    isChallenge: match.isChallenge,
    // Without this a restart would turn a tournament game into a casual one that never counts.
    tournament: match.tournament || null,
    startedAt: match.startedAt,
    lastActivity: match.lastActivity
  }
}
