// server/api/redeem.post.js

import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { mintQueue } from '../utils/queues'  // import the BullMQ queue

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse input
  const { code } = await readBody(event)
  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Code is required' })
  }

  // 3. Lookup code
  const claimCode = await prisma.claimCode.findUnique({
    where: { code },
    select: { id: true, maxClaims: true, expiresAt: true }
  })
  if (!claimCode) {
    throw createError({ statusCode: 404, statusMessage: 'Invalid code' })
  }
  if (claimCode.expiresAt && claimCode.expiresAt < new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Code expired' })
  }

  // 3b. Enforce prerequisites
  const prereqs = await prisma.claimCodePrerequisite.findMany({
    where: { codeId: claimCode.id },
    include: { ctoon: { select: { id: true, name: true } } }
  })
  if (prereqs.length > 0) {
    const owned = await prisma.userCtoon.findMany({
      where: {
        userId,
        ctoonId: { in: prereqs.map(p => p.ctoonId) }
      },
      select: { ctoonId: true }
    })
    const ownedIds = new Set(owned.map(o => o.ctoonId))
    const missing = prereqs
      .filter(p => !ownedIds.has(p.ctoonId))
      .map(p => p.ctoon.name)
    if (missing.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `You must own the following cToons to redeem this code: ${missing.join(', ')}`
      })
    }
  }

  // 4. Enforce maxClaims
  const totalClaims = await prisma.claim.count({ where: { codeId: claimCode.id } })
  if (totalClaims >= claimCode.maxClaims) {
    throw createError({ statusCode: 400, statusMessage: 'Code fully redeemed' })
  }

  // 5. Prevent double-redeem by this user
  const already = await prisma.claim.findUnique({
    where: { userId_codeId: { userId, codeId: claimCode.id } }
  })
  if (already) {
    throw createError({ statusCode: 400, statusMessage: 'Code already redeemed' })
  }

  // 6. Load reward definitions
  const rewardDefs = await prisma.claimCodeReward.findMany({
    where: { codeId: claimCode.id },
    include: {
      ctoons: {
        include: { ctoon: { select: { id: true, name: true, initialQuantity: true } } }
      },
      backgrounds: {
        include: {
          background: { select: { id: true, label: true, imagePath: true, visibility: true } }
        }
      }
    }
  })

  // 7. Compute totals and prepare cToon award list
  const pointsToAward = rewardDefs.reduce(
    (sum, r) => sum + (r.points ?? 0),
    0
  )
  const ctoonAwards = rewardDefs.flatMap(r =>
    r.ctoons.map(rc => ({
      ctoonId: rc.ctoon.id,
      name: rc.ctoon.name,
      quantity: rc.quantity,
      initialQuantity: rc.ctoon.initialQuantity ?? 0
    }))
  )

  // ⬇️ compute background unlocks (unique by id)
  const backgroundRewardsRaw = rewardDefs.flatMap(r =>
    r.backgrounds.map(rb => ({
      id: rb.backgroundId,
      label: rb.background?.label || null,
      imagePath: rb.background?.imagePath || null,
      visibility: rb.background?.visibility || 'CODE_ONLY'
    }))
  )
  const seenBg = new Set()
  const backgroundRewards = []
  for (const b of backgroundRewardsRaw) {
    if (!seenBg.has(b.id)) {
      seenBg.add(b.id)
      backgroundRewards.push(b)
    }
  }

  // 8. Preload existing counts for each ctoon
  const counts = {}
  for (const award of ctoonAwards) {
    const { ctoonId } = award
    if (counts[ctoonId] == null) {
      counts[ctoonId] = await prisma.userCtoon.count({ where: { ctoonId } })
    }
  }

  // 9. Record claim and award points in one transaction
  await prisma.$transaction(async (tx) => {
    await tx.claim.create({ data: { userId, codeId: claimCode.id } })
    if (pointsToAward > 0) {
      const updated = await tx.userPoints.upsert({
        where: { userId },
        create: { userId, points: pointsToAward },
        update: { points: { increment: pointsToAward } }
      })
      await tx.pointsLog.create({
        data: { userId, points: pointsToAward, total: updated.points, method: "Redeem Code", direction: 'increase' }
      });
    }
    if (backgroundRewards.length) {
      await tx.userBackground.createMany({
        data: backgroundRewards.map(b => ({
          userId,
          backgroundId: b.id,
          sourceCodeId: claimCode.id
        })),
        skipDuplicates: true
      })
    }
  })

  // 10. Enqueue mint jobs and prepare return data
  const mintedRecords = []
  for (const award of ctoonAwards) {
    for (let i = 0; i < award.quantity; i++) {
      const { ctoonId, name, initialQuantity } = award
      const mintNumber = counts[ctoonId] + 1
      counts[ctoonId]++
      const isFirstEdition = initialQuantity > 0 ? mintNumber <= initialQuantity : false

      // enqueue the mint job
      await mintQueue.add('mintCtoon', { userId, ctoonId, isSpecial: true })

      // collect local record
      mintedRecords.push({ ctoonId, name, mintNumber, isFirstEdition })
    }
  }

  // 11. Return summary
  return {
    points: pointsToAward,
    ctoons: mintedRecords,
    backgrounds: backgroundRewards
  }
})
