// POST /api/admin/czone-contest/[id]/distribute — distribute prizes to winner and participants
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { mintQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const { winnerId } = await readBody(event)
  if (!winnerId) throw createError({ statusCode: 400, statusMessage: 'winnerId (submission id) is required' })

  const contest = await prisma.cZoneContest.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      endVotingDate: true,
      distributedAt: true,
      winnerPrizes: true,
      participantPrizes: true,
      submissions: {
        select: { id: true, userId: true }
      }
    }
  })

  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  if (contest.distributedAt) throw createError({ statusCode: 400, statusMessage: 'Prizes already distributed for this contest' })
  if (contest.endVotingDate && new Date() < new Date(contest.endVotingDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot distribute prizes until the End Voting Date has passed' })
  }
  if (!contest.submissions.find(s => s.id === winnerId)) {
    throw createError({ statusCode: 400, statusMessage: 'Winner submission not found in this contest' })
  }

  const winnerSubmission = contest.submissions.find(s => s.id === winnerId)
  const winnerUserId = winnerSubmission.userId
  const participantUserIds = contest.submissions
    .filter(s => s.id !== winnerId)
    .map(s => s.userId)

  const winnerPrizes = contest.winnerPrizes
  const participantPrizes = contest.participantPrizes

  // Helper: award points + backgrounds to a list of users in a transaction
  async function awardInTransaction(tx, userIds, prizes, method) {
    const points = prizes.points ?? 0
    const backgroundIds = prizes.backgroundIds ?? []

    for (const userId of userIds) {
      if (points > 0) {
        const updated = await tx.userPoints.upsert({
          where: { userId },
          create: { userId, points },
          update: { points: { increment: points } }
        })
        await tx.pointsLog.create({
          data: { userId, points, total: updated.points, method, direction: 'increase' }
        })
      }
      if (backgroundIds.length) {
        await tx.userBackground.createMany({
          data: backgroundIds.map(backgroundId => ({ userId, backgroundId })),
          skipDuplicates: true
        })
      }
    }
  }

  // Award points and backgrounds in a transaction
  await prisma.$transaction(async (tx) => {
    // Winner prizes (winner also receives participant prizes)
    await awardInTransaction(tx, [winnerUserId], winnerPrizes, 'cZone Contest Winner')
    await awardInTransaction(tx, [winnerUserId], participantPrizes, 'cZone Contest Participant')

    // Participant prizes
    if (participantUserIds.length) {
      await awardInTransaction(tx, participantUserIds, participantPrizes, 'cZone Contest Participant')
    }

    // Mark contest as distributed with chosen winner
    await tx.cZoneContest.update({
      where: { id },
      data: { winnerId, distributedAt: new Date() }
    })
  })

  // Queue ctoon mints outside transaction (queue jobs can't be rolled back)
  const winnerCtoons = winnerPrizes.ctoons ?? []
  for (const { ctoonId, qty } of winnerCtoons) {
    const quantity = qty ?? 1
    for (let i = 0; i < quantity; i++) {
      await mintQueue.add('mintCtoon', { userId: winnerUserId, ctoonId, isSpecial: true })
    }
  }

  // Winner also receives participant ctoons
  const participantCtoons = participantPrizes.ctoons ?? []
  for (const { ctoonId, qty } of participantCtoons) {
    const quantity = qty ?? 1
    for (let i = 0; i < quantity; i++) {
      await mintQueue.add('mintCtoon', { userId: winnerUserId, ctoonId, isSpecial: true })
    }
  }

  for (const userId of participantUserIds) {
    for (const { ctoonId, qty } of participantCtoons) {
      const quantity = qty ?? 1
      for (let i = 0; i < quantity; i++) {
        await mintQueue.add('mintCtoon', { userId, ctoonId, isSpecial: true })
      }
    }
  }

  return {
    ok: true,
    winnerId,
    winnerUserId,
    participantsAwarded: participantUserIds.length
  }
})
