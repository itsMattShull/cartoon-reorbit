// Endpoints that are called many times within a single user action and must not pay for
// the per-request user bookkeeping that the global middleware does.
//
// "Guess that cToon!" is the first game that talks to the server on every interaction
// rather than once per game: a 25-question run is 25 POSTs, each of which would otherwise
// cost ~8 Postgres queries and an interactive transaction across daily-points, guild-check
// and login-log — none of which this handler reads. The image route is in the same
// position: it serves one file per question and reads nothing but the Redis session.
//
// Skipping them is safe for the same reason those middlewares already skip non-/api
// requests: every page load hits /api/auth/me, so the daily award, guild sync and login log
// still fire reliably on the surrounding navigation.
// ReOrbit Blackjack is in the same position: a hand is a bet plus 1–10 actions, and a session
// is many hands, so these two routes are the highest-frequency authenticated endpoints in the
// app. They read only the session row and Redis. Handlers that move points call
// assertPlayable() themselves, since skipping guild-check means event.context.user is unset.
const HOT_PATHS = [
  '/api/game/guessctoon/answer',
  '/api/game/guessctoon/image/',
  '/api/game/blackjack/bet',
  '/api/game/blackjack/action'
]

export function isHotPath (path) {
  if (!path) return false
  return HOT_PATHS.some(p => path.startsWith(p))
}

export { HOT_PATHS }
