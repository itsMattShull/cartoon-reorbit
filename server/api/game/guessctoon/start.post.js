import { defineEventHandler, createError } from 'h3'
import { randomUUID, randomBytes } from 'node:crypto'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getCatalogPool } from '@/server/utils/guessCtoonPool'
import {
  buildCatalogContext,
  buildRun,
  MIN_POOL_SIZE,
  DEADLINE_GRACE_MS
} from '@/server/utils/guessCtoonEngine'
import {
  sessionKey,
  lockKey,
  getGuessCtoonConfig,
  getDailyBoundary,
  getNextResetAt,
  assertPlayable
} from '@/server/utils/guessCtoonRuntime'

const LOCK_TTL_MS = 10_000

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const denial = await assertPlayable(userId)
  if (denial) throw createError({ statusCode: 403, statusMessage: denial })

  // Cheap first line of defence against concurrent /start requests. The authoritative
  // play-limit guard is the Postgres advisory lock below — this one just rejects the
  // obvious double-tap without paying for a transaction.
  const lockToken = randomUUID()
  let lockAcquired = false
  try {
    const r = await redis.set(lockKey(userId), lockToken, 'NX', 'PX', LOCK_TTL_MS)
    lockAcquired = r === 'OK'
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }
  if (!lockAcquired) throw createError({ statusCode: 429, statusMessage: 'Request already in progress' })

  const casRelease = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`

  try {
    const config = await getGuessCtoonConfig()
    const boundary = getDailyBoundary()

    // Plays are unlimited. What is rationed is how many of them COUNT: the first
    // `scoredPlaysPerPeriod` runs each day are worth points and eligible for the
    // leaderboard, and everything after that is a practice run.
    //
    // The decision is made here rather than at bank time so the player knows before they
    // answer anything whether the run counts. Count-then-insert is not atomic on its own,
    // and a Redis lock can evaporate on eviction or failover, so the advisory lock makes
    // Postgres the authority. Salted so it can't collide with the points award's lock on
    // the same userId.
    let counted = false
    let scoredPlaysUsed = 0
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:guessctoon`}))`
        scoredPlaysUsed = await tx.guessCtoonPlay.count({
          where: { userId, counted: true, createdAt: { gte: boundary } }
        })
        counted = scoredPlaysUsed < config.scoredPlaysPerPeriod
        await tx.guessCtoonPlay.create({ data: { userId, counted } })
        if (counted) scoredPlaysUsed += 1
      })
    } catch (err) {
      if (err?.statusCode) throw err
      throw createError({ statusCode: 503, statusMessage: 'Could not start a game right now' })
    }

    const pool = await getCatalogPool()
    const ctx = buildCatalogContext(pool)
    if (ctx.answerRows.length < MIN_POOL_SIZE) {
      throw createError({ statusCode: 503, statusMessage: 'Not enough cToons available to start a game' })
    }

    const seedHex = randomUUID().replace(/-/g, '')
    const questions = buildRun(ctx, seedHex, {
      count: config.maxQuestions,
      choiceCount: config.choices
    })
    if (!questions.length) {
      throw createError({ statusCode: 503, statusMessage: 'Could not build a game right now' })
    }

    // Each question gets an opaque image token. The client never sees an assetPath while a
    // question is live — the path spells out the answer (…/Dexters Lab/watcher_dexter.gif),
    // so shipping it would reduce the game to reading the DOM.
    const qs = questions.map(q => ({
      t: randomBytes(16).toString('hex'),
      a: q.assetPath,
      n: q.name,
      c: q.choices,
      k: q.correctIndex
    }))

    const nowMs = Date.now()
    // TTL bounds the whole run: every question at full duration, plus grace and slack.
    const ttlSeconds = Math.ceil(
      (qs.length * (config.secondsPerQuestion * 1000 + DEADLINE_GRACE_MS)) / 1000
    ) + 300

    await redis.set(sessionKey(userId), JSON.stringify({
      qs,
      i: 0,
      streak: 0,
      state: 'live',
      // Whether this run counts was settled at start; carrying it in the session means the
      // bank path cannot re-derive it differently (e.g. if the daily boundary rolls over
      // mid-run).
      counted,
      secs: config.secondsPerQuestion,
      startedAt: nowMs,
      // Stamped by Node here for the first question only; every subsequent issuedAt comes
      // from redis.call('TIME') inside ANSWER_SCRIPT. The grace window absorbs the skew on
      // this one question.
      issuedAt: nowMs,
      lastAnswerAt: 0,
      lat: []
    }), 'EX', ttlSeconds)

    return {
      totalQuestions: qs.length,
      secondsPerQuestion: config.secondsPerQuestion,
      counted,
      scoredPlaysLeft: Math.max(0, config.scoredPlaysPerPeriod - scoredPlaysUsed),
      scoredPlaysPerPeriod: config.scoredPlaysPerPeriod,
      playsResetAt: getNextResetAt(boundary).toISOString(),
      question: {
        questionIndex: 0,
        imageToken: qs[0].t,
        choices: qs[0].c,
        // Lets the client warm the next image while question 1 is on screen. Harmless:
        // without its choices, an image alone is not an answerable question.
        prefetchToken: qs[1] ? qs[1].t : null
      }
    }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
