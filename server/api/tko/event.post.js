import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { processAchievementsForUser } from '@/server/utils/achievements'

function getChicagoGameBoundary(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false
  }).formatToParts(now)
  let cYear, cMonth, cDay, cHour
  for (const p of parts) {
    if (p.type === 'year') cYear = Number(p.value)
    if (p.type === 'month') cMonth = Number(p.value)
    if (p.type === 'day') cDay = Number(p.value)
    if (p.type === 'hour') cHour = Number(p.value)
  }
  const utcHour = now.getUTCHours()
  let offsetHour = utcHour - cHour
  if (offsetHour > 12) offsetHour -= 24
  if (offsetHour < -12) offsetHour += 24

  let boundaryUtcMs = Date.UTC(cYear, cMonth - 1, cDay, 20 + offsetHour, 0, 0, 0)
  if (now.getTime() < boundaryUtcMs) boundaryUtcMs -= 24 * 60 * 60 * 1000
  return new Date(boundaryUtcMs)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const passcode = process.env.TKO_PASSCODE
  if (!passcode || body?.auth?.passcode !== passcode) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { eventId, eventType, match, round, winner, loser, outcome } = body || {}

  if (!eventId || !match?.matchId || !round || !winner || !loser || !outcome) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required event fields' })
  }

  // Idempotency: skip already-processed events
  const existing = await prisma.tkoRound.findUnique({ where: { eventId } })
  if (existing) return { ok: true, duplicate: true }

  // Resolve user IDs from reorbitId (our User.id)
  const [winnerUser, loserUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: winner.reorbitId }, select: { id: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: loser.reorbitId }, select: { id: true } }).catch(() => null),
  ])

  // Upsert the match record
  const tkoMatch = await prisma.tkoMatch.upsert({
    where: { externalMatchId: match.matchId },
    create: {
      externalMatchId: match.matchId,
      roomId: match.roomId,
      battleCode: match.battleCode,
      mode: match.mode,
      isTraining: !!match.isTraining,
      isChallenge: !!match.isChallenge,
      isPrivate: !!match.isPrivate,
      startedAt: match.startedAt ? new Date(match.startedAt) : null,
    },
    update: {},
  })

  const counted = !!outcome.counted
  const pointsAwarded = await prisma.$transaction(async (tx) => {
    await tx.tkoRound.create({
      data: {
        eventId,
        eventType: eventType || 'tko.round_win',
        matchId: tkoMatch.id,
        roundNumber: round.roundNumber,
        bestOf: round.bestOf,
        endedAt: new Date(round.endedAt),
        durationMs: round.durationMs,
        winnerUserId: winnerUser?.id ?? null,
        winnerUsername: winner.username,
        winnerReorbitId: winner.reorbitId,
        winnerCharacterId: parseInt(winner.characterId),
        winnerCharacterName: winner.characterName,
        winnerRemainingHealth: winner.remainingHealth,
        loserUserId: loserUser?.id ?? null,
        loserUsername: loser.username,
        loserReorbitId: loser.reorbitId,
        loserCharacterId: parseInt(loser.characterId),
        loserCharacterName: loser.characterName,
        loserRemainingHealth: loser.remainingHealth,
        result: outcome.result,
        winType: outcome.winType,
        counted,
        disconnect: !!outcome.disconnect,
        forfeit: !!outcome.forfeit,
        timeout: !!outcome.timeout,
      },
    })

    if (!counted || !winnerUser?.id) return 0

    const [tkoConfig, globalConfig, usedAgg] = await Promise.all([
      tx.gameConfig.upsert({
        where: { gameName: 'TKO' },
        create: { gameName: 'TKO', pointsPerWin: 300 },
        update: {},
        select: { pointsPerWin: true }
      }),
      tx.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { dailyPointLimit: true }
      }),
      tx.gamePointLog.aggregate({
        where: {
          userId: winnerUser.id,
          createdAt: { gte: getChicagoGameBoundary() }
        },
        _sum: { points: true }
      })
    ])

    const pointsPerWin = Number(tkoConfig?.pointsPerWin ?? 300)
    const cap = Number(globalConfig?.dailyPointLimit ?? 250)
    const used = Number(usedAgg._sum.points ?? 0)
    const remaining = Math.max(0, cap - used)
    const toGive = Math.max(0, Math.min(pointsPerWin, remaining))
    if (toGive <= 0) return 0

    await tx.gamePointLog.create({ data: { userId: winnerUser.id, points: toGive } })
    const updated = await tx.userPoints.upsert({
      where: { userId: winnerUser.id },
      create: { userId: winnerUser.id, points: toGive },
      update: { points: { increment: toGive } }
    })
    await tx.pointsLog.create({
      data: {
        userId: winnerUser.id,
        points: toGive,
        total: updated.points,
        method: 'Game - TKO',
        direction: 'increase'
      }
    })

    return toGive
  })

  // Trigger achievement processing for the winner if they have a reorbit account
  if (winnerUser?.id) {
    processAchievementsForUser(winnerUser.id).catch(() => {})
  }

  return { ok: true, pointsAwarded }
})
