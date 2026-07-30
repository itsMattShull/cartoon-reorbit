import { defineEventHandler, readBody, createError } from 'h3'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/server/prisma'
import { processAchievementsForUser } from '@/server/utils/achievements'
import { awardCappedGamePoints, COMBAT_POOL_GAME_NAMES } from '@/server/utils/gamePoints'

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''))
  const bufB = Buffer.from(String(b ?? ''))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const passcode = process.env.TKO_PASSCODE
  if (!passcode || !timingSafeStringEqual(body?.auth?.passcode, passcode)) {
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

    const [tkoConfig, globalConfig] = await Promise.all([
      tx.gameConfig.upsert({
        where: { gameName: 'TKO' },
        create: { gameName: 'TKO', pointsPerWin: 300 },
        update: {},
        select: { pointsPerWin: true }
      }),
      tx.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { tkoDailyPointLimit: true }
      })
    ])

    return awardCappedGamePoints(tx, {
      userId: winnerUser.id,
      gameName: 'TKO',
      poolGameNames: COMBAT_POOL_GAME_NAMES,
      pointsPerWin: Number(tkoConfig?.pointsPerWin ?? 300),
      cap: Number(globalConfig?.tkoDailyPointLimit ?? 250),
      method: 'Game - TKO'
    })
  })

  // Trigger achievement processing for the winner if they have a reorbit account
  if (winnerUser?.id) {
    processAchievementsForUser(winnerUser.id).catch(() => {})
  }

  return { ok: true, pointsAwarded }
})
