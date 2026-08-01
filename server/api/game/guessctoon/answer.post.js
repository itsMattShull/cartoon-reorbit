import { defineEventHandler, readBody, createError } from 'h3'
import { redis } from '@/server/utils/redis'
import {
  ANSWER_SCRIPT,
  MIN_ANSWER_INTERVAL_MS,
  DEADLINE_GRACE_MS
} from '@/server/utils/guessCtoonEngine'
import {
  sessionKey,
  getGuessCtoonConfig,
  bankRun,
  assertPlayable,
  BANKED_TTL_SECONDS
} from '@/server/utils/guessCtoonRuntime'

const MAX_BODY_BYTES = 1024 // tiny payload — a question index and a choice index

const ERROR_STATUS = {
  no_session: [409, 'Game session not found or expired. Start a new game.'],
  bad_request: [400, 'Invalid request body'],
  too_fast: [429, 'Answers submitted too fast']
}

// Registered once on the shared client so answers go out as EVALSHA instead of shipping the
// whole script body on every tap. ioredis falls back to EVAL automatically on NOSCRIPT.
let commandReady = false
function ensureCommand () {
  if (commandReady) return
  if (typeof redis.guessCtoonAnswer !== 'function') {
    redis.defineCommand('guessCtoonAnswer', { numberOfKeys: 1, lua: ANSWER_SCRIPT })
  }
  commandReady = true
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const contentLength = Number(event.node.req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)

  // Strict primitive checks. Number() would happily coerce ["2"], " 2 " and true, and the
  // body is never spread anywhere, so only these two scalars are ever read.
  const questionIndex = body?.questionIndex
  const choice = body?.choice
  if (typeof questionIndex !== 'number' || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  // -1 is the client reporting its own countdown expired; the server re-derives the timeout
  // from its own clock regardless, so this only makes game-over immediate instead of
  // waiting for the player to tap.
  if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < -1 || choice > 16) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const config = await getGuessCtoonConfig()

  ensureCommand()

  // No app-level lock: ANSWER_SCRIPT is one atomic Lua script, so Redis's single-threaded
  // execution IS the lock. A lock here would add latency to every tap without closing any
  // race the script does not already close.
  let raw
  try {
    raw = await redis.guessCtoonAnswer(
      sessionKey(userId),
      String(questionIndex),
      String(choice),
      String(MIN_ANSWER_INTERVAL_MS),
      String(DEADLINE_GRACE_MS),
      String(BANKED_TTL_SECONDS)
    )
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }

  let result
  try {
    result = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Unexpected game state' })
  }

  if (result.error) {
    const [statusCode, statusMessage] = ERROR_STATUS[result.error] || [400, 'Invalid answer']
    throw createError({ statusCode, statusMessage })
  }

  // Still playing: reveal only the question just answered, plus the next question's choices
  // and opaque image token. The answered question's real assetPath is deliberately NOT
  // forwarded — the client has no use for it, and every path handed to the browser is one
  // more row of a name↔image map an attacker would otherwise have to build themselves.
  if (!result.gameOver) {
    return {
      correct: result.correct,
      correctIndex: result.correctIndex,
      correctName: result.correctName,
      streak: result.streak,
      gameOver: false,
      question: result.nextQuestion,
      remainingMs: result.remainingMs
    }
  }

  // Terminal answer. The atomic flip to `banked` inside the script guarantees exactly one
  // request can ever reach this branch for a given run, so /end cannot double-record it.
  // Re-check eligibility here (and only here) because this is the branch that pays out —
  // a user banned mid-run must not keep earning.
  let pointsAwarded = 0
  let finalStreak = result.streak
  let counted = result.counted !== false
  const denial = await assertPlayable(userId)
  if (!denial) {
    try {
      const banked = await bankRun({
        userId,
        streak: result.streak,
        latencies: result.latencies,
        startedAt: result.startedAt,
        counted: result.counted !== false,
        config
      })
      pointsAwarded = banked.pointsAwarded
      finalStreak = banked.streak
      counted = banked.counted
    } catch {
      // Recording failed — still report the run honestly rather than 500ing the player out
      // of their own game-over screen.
    }
  }

  return {
    correct: result.correct,
    correctIndex: result.correctIndex,
    correctName: result.correctName,
    timedOut: Boolean(result.timedOut),
    streak: finalStreak,
    gameOver: true,
    perfect: Boolean(result.perfect),
    counted,
    pointsAwarded,
    minStreakForPoints: config.minStreakForPoints
  }
})
