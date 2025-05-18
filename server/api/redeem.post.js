// server/api/redeem.post.js

import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

const prisma = new PrismaClient()

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

  // 4. Enforce maxClaims
  const totalClaims = await prisma.claim.count({
    where: { codeId: claimCode.id }
  })
  if (totalClaims >= claimCode.maxClaims) {
    throw createError({ statusCode: 400, statusMessage: 'Code fully redeemed' })
  }

  // 5. Prevent double-redeem by this user
  const already = await prisma.claim.findUnique({
    where: {
      userId_codeId: { userId, codeId: claimCode.id }
    }
  })
  if (already) {
    throw createError({ statusCode: 400, statusMessage: 'Code already redeemed' })
  }

  // 6. Load reward definitions
  const rewardDefs = await prisma.claimCodeReward.findMany({
    where: { codeId: claimCode.id },
    include: {
      ctoons: {
        include: {
          ctoon: {
            select: { id: true, name: true, initialQuantity: true }
          }
        }
      }
    }
  })

  // 7. Compute totals and prepare cToon award list
  const pointsToAward = rewardDefs.reduce(
    (sum, r) => sum + (r.points ?? 0),
    0
  )

  // flatten into [{ ctoonId, name, quantity, initialQuantity }]
  const ctoonAwards = rewardDefs.flatMap(r =>
    r.ctoons.map(rc => ({
      ctoonId: rc.ctoon.id,
      name: rc.ctoon.name,
      quantity: rc.quantity,
      initialQuantity: rc.ctoon.initialQuantity ?? 0
    }))
  )

  // 8. Perform atomic transaction, minting UserCtoons with mintNumber & isFirstEdition
  const mintedRecords = await prisma.$transaction(async (tx) => {
    // a) record the claim
    await tx.claim.create({
      data: { userId, codeId: claimCode.id }
    })

    // b) award points
    if (pointsToAward > 0) {
      await tx.userPoints.upsert({
        where: { userId },
        create: { userId, points: pointsToAward },
        update: { points: { increment: pointsToAward } }
      })
    }

    // c) award cToons one by one
    const minted = []
    // preload existing counts for each ctoon
    const counts = {}
    for (const award of ctoonAwards) {
      const { ctoonId } = award
      if (counts[ctoonId] == null) {
        counts[ctoonId] = await tx.userCtoon.count({
          where: { ctoonId }
        })
      }
    }

    for (const award of ctoonAwards) {
      const { ctoonId, name, quantity, initialQuantity } = award
      for (let i = 0; i < quantity; i++) {
        const mintNumber = counts[ctoonId] + 1
        counts[ctoonId]++

        const isFirstEdition = initialQuantity > 0
          ? mintNumber <= initialQuantity
          : false

        const created = await tx.userCtoon.create({
          data: {
            userId,
            ctoonId,
            mintNumber,
            isFirstEdition
          }
        })

        minted.push({
          ctoonId,
          name,
          mintNumber,
          isFirstEdition
        })
      }
    }

    return minted
  })

  // 9. Return summary
  return {
    points: pointsToAward,
    ctoons: mintedRecords
  }
})
