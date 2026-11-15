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
    swapPick: match.swapPick,
    colorReady: match.colorReady,
    pendingColor: match.pendingColor,
    silverColor: match.silverColor,
    colorDone: match.colorDone,
    deadline: match.deadline,
    introEndsAt: match.introEndsAt ?? null,
    ready: match.ready,
    // Explicit plays made in the current step (the async deadline rule's "who is the game waiting on").
    acted: match.acted || [false, false],
    held: match.held,
    revealed: match.revealed, // roundLog itself is built once, at match completion, not carried live
    stake: match.stake,
    currentRound: match.currentRound,
    isChallenge: match.isChallenge,
    // Rounds each player committed themselves — the PvP pack reward's "was the loser really playing" signal. Without this a
    // restart mid-match would zero it and a real loser could look idle.
    manualCommits: match.manualCommits || [0, 0],
    // Without this a restart would turn a tournament game into a casual one that never counts.
    tournament: match.tournament || null,
    // Async tournament games have no clocks at all. Without these a restored copy would quietly get its phase
    // timers (and the auto-play they bring) back.
    noTimers: !!match.noTimers,
    // The latest resolved board and the final result: an async game is rebuilt from this copy hours or days later, so a
    // reconnecting player must still see the right totals, and an ended game its outcome.
    liveBoard: match.liveBoard || null,
    result: match.result || null,
    startedAt: match.startedAt,
    lastActivity: match.lastActivity
  }
}
