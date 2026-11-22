// server/utils/ogGtoonWins.js
//
// What counts as one OG gToons win for an achievement (Achievement.ogGtoonsWinsGte). Kept in
// step with the OG gToons leaderboard (server/utils/ogGtoonBoardsSql.js), so the number a player
// sees on their stats is the number the achievement checks:
//   - only human-vs-human games in OgGtoonMatch (random queue, challenges and tournament games);
//     practice games against the bot live in OgGtoonPracticeMatch and never count
//   - the win is read from `outcome`, never from winnerUserId: an INCOMPLETE game (stale sweep or an
//     admin-voided tournament game) can keep its old winnerUserId but is not a win
//   - ties are not wins
// Forfeits do count, as they do on the leaderboard's "wins" column.
//
// No imports on purpose: the caller passes its Prisma client (or a transaction), which keeps this
// unit-testable without a database.

/** Prisma `where` for every OgGtoonMatch the given user won. */
export function ogGtoonsWinsWhere(userId) {
  return {
    OR: [
      { player1UserId: userId, outcome: 'PLAYER1' },
      { player2UserId: userId, outcome: 'PLAYER2' }
    ]
  }
}

/** Lifetime count of OG gToons games the user won. */
export async function getOgGtoonsWinCount(db, userId) {
  if (!userId) return 0
  return db.ogGtoonMatch.count({ where: ogGtoonsWinsWhere(userId) })
}
