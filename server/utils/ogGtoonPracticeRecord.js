// server/utils/ogGtoonPracticeRecord.js
//
// Saves the result of a FINISHED practice match (the player vs. the bot) so the Practice Matches
// leaderboard can count it. This is the only database write practice mode makes, and it lives here
// so server/utils/ogGtoonsPractice.js itself stays free of Prisma — socket-server.js injects
// `recordPracticeResult` into it as `deps.recordResult`.
//
// Deliberately stores no deck, no round log and no points: practice stays out of the Meta tab and
// never touches the points balance. The practice match uuid is the primary key, so a retry (or a
// duplicate call) cannot double-count.
import { prisma as db } from '../prisma.js'

const OUTCOMES = new Set(['PLAYER_WIN', 'BOT_WIN', 'TIE'])
const DIFFICULTIES = new Set(['easy', 'normal', 'hard'])
const WIN_REASONS = new Set(['COLOR', 'POINTS'])
const RETRY_DELAY_MS = 400
// A missing table (deploy ordering) or an outage would otherwise log on every finished match.
const LOG_EVERY_MS = 60_000

let lastLoggedAt = 0
function logThrottled(err) {
  const now = Date.now()
  if (now - lastLoggedAt < LOG_EVERY_MS) return
  lastLoggedAt = now
  console.error('[ogGtoonPracticeRecord] could not save practice result:', err?.message || err)
}

/**
 * @param {{ id: string, userId: string, difficulty: string, outcome: 'PLAYER_WIN'|'BOT_WIN'|'TIE', winReason?: 'COLOR'|'POINTS'|null, startedAt: number|Date }} result
 * @returns {Promise<boolean>} true when saved (or already saved); never throws.
 */
export async function recordPracticeResult(result, deps = {}) {
  const create = deps.create || ((data) => db.ogGtoonPracticeMatch.createMany({ data: [data], skipDuplicates: true }))
  try {
    if (!result?.id || !result.userId || !OUTCOMES.has(result.outcome) || !DIFFICULTIES.has(result.difficulty)) return false
    const data = {
      id: result.id,
      userId: result.userId,
      difficulty: result.difficulty,
      outcome: result.outcome,
      winReason: WIN_REASONS.has(result.winReason) ? result.winReason : null,
      startedAt: new Date(result.startedAt),
      endedAt: new Date()
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await create(data)
        return true
      } catch (err) {
        if (attempt === 1) throw err
        await new Promise(r => setTimeout(r, deps.retryDelayMs ?? RETRY_DELAY_MS))
      }
    }
    return false
  } catch (err) {
    logThrottled(err)
    return false
  }
}
