// server/api/redeem.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { mintQueue } from '../utils/queues'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { code } = await readBody(event)
  if (!code || typeof code !== 'string') throw createError({ statusCode: 400, statusMessage: 'Code is required' })

  const claimCode = await prisma.claimCode.findUnique({ where: { code }, select: { id: true, maxClaims: true, expiresAt: true } })
  if (!claimCode) throw createError({ statusCode: 404, statusMessage: 'Invalid code' })
  if (claimCode.expiresAt && claimCode.expiresAt < new Date()) throw createError({ statusCode: 400, statusMessage: 'Code expired' })

  const prereqs = await prisma.claimCodePrerequisite.findMany({
    where: { codeId: claimCode.id },
    include: { ctoon: { select: { id: true, name: true } } }
  })
  if (prereqs.length > 0) {
    const owned = await prisma.userCtoon.findMany({ where: { userId, ctoonId: { in: prereqs.map(p => p.ctoonId) } }, select: { ctoonId: true } })
    const ownedIds = new Set(owned.map(o => o.ctoonId))
    const missing = prereqs.filter(p => !ownedIds.has(p.ctoonId)).map(p => p.ctoon.name)
    if (missing.length) throw createError({ statusCode: 400, statusMessage: `You must own the following cToons to redeem this code: ${missing.join(', ')}` })
  }

  const totalClaims = await prisma.claim.count({ where: { codeId: claimCode.id } })
  if (totalClaims >= claimCode.maxClaims) throw createError({ statusCode: 400, statusMessage: 'Code fully redeemed' })

  const already = await prisma.claim.findUnique({ where: { userId_codeId: { userId, codeId: claimCode.id } } })
  if (already) throw createError({ statusCode: 400, statusMessage: 'Code already redeemed' })

  const rewardDefs = await prisma.claimCodeReward.findMany({
    where: { codeId: claimCode.id },
    include: {
      ctoons: { include: { ctoon: { select: { id: true, name: true, initialQuantity: true, assetPath: true, rarity: true, set: true } } } },
      poolCtoons: { include: { ctoon: { select: { id: true, name: true, initialQuantity: true, assetPath: true, rarity: true, set: true } } } },
      backgrounds: { include: { background: { select: { id: true, label: true, imagePath: true, visibility: true } } } }
    }
  })

  const pointsToAward = rewardDefs.reduce((s, r) => s + (r.points ?? 0), 0)

  // Fixed awards
  const ctoonAwards = rewardDefs.flatMap(r =>
    r.ctoons.map(rc => ({
      ctoonId: rc.ctoon.id,
      name: rc.ctoon.name,
      quantity: rc.quantity,
      initialQuantity: rc.ctoon.initialQuantity ?? 0,
      assetPath: rc.ctoon.assetPath,
      rarity: rc.ctoon.rarity,
      set: rc.ctoon.set
    }))
  )

  // Pooled awards (unique without replacement)
  for (const r of rewardDefs) {
    const k = r.pooledUniqueCount ?? 0
    if (k > 0 && r.poolCtoons.length > 0) {
      const pool = [...r.poolCtoons] // uniform; ignore weights, or implement if desired
      // Fisher–Yates partial shuffle
      const take = Math.min(k, pool.length)
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
        ctoonAwards.push({
          ctoonId:        pool[i].ctoon.id,
          name:           pool[i].ctoon.name,
          quantity:       1,
          initialQuantity:pool[i].ctoon.initialQuantity ?? 0,
          assetPath:      pool[i].ctoon.assetPath,
          rarity:         pool[i].ctoon.rarity,
          set:            pool[i].ctoon.set
        })
      }
    }
  }

  const backgroundRewardsRaw = rewardDefs.flatMap(r =>
    r.backgrounds.map(rb => ({
      id: rb.backgroundId,
      label: rb.background?.label || null,
      imagePath: rb.background?.imagePath || null,
      visibility: rb.background?.visibility || 'CODE_ONLY'
    }))
  )
  const seenBg = new Set(), backgroundRewards = []
  for (const b of backgroundRewardsRaw) if (!seenBg.has(b.id)) { seenBg.add(b.id); backgroundRewards.push(b) }

  const counts = {}
  for (const award of ctoonAwards) {
    const { ctoonId } = award
    if (counts[ctoonId] == null) counts[ctoonId] = await prisma.userCtoon.count({ where: { ctoonId } })
  }

  await prisma.$transaction(async (tx) => {
    await tx.claim.create({ data: { userId, codeId: claimCode.id } })
    if (pointsToAward > 0) {
      const updated = await tx.userPoints.upsert({
        where: { userId },
        create: { userId, points: pointsToAward },
        update: { points: { increment: pointsToAward } }
      })
      await tx.pointsLog.create({ data: { userId, points: pointsToAward, total: updated.points, method: 'Redeem Code', direction: 'increase' } })
    }
    if (backgroundRewards.length) {
      await tx.userBackground.createMany({
        data: backgroundRewards.map(b => ({ userId, backgroundId: b.id, sourceCodeId: claimCode.id })),
        skipDuplicates: true
      })
    }
  })

  const mintedRecords = []
  for (const award of ctoonAwards) {
    for (let i = 0; i < award.quantity; i++) {
      const { ctoonId, name, initialQuantity } = award
      const mintNumber = counts[ctoonId] + 1
      counts[ctoonId]++
      const isFirstEdition = initialQuantity > 0 ? mintNumber <= initialQuantity : false
      await mintQueue.add('mintCtoon', { userId, ctoonId, isSpecial: true })
      mintedRecords.push({
        ctoonId, name, mintNumber, isFirstEdition,
        assetPath: award.assetPath, rarity: award.rarity, set: award.set
      })
    }
  }

  return { points: pointsToAward, ctoons: mintedRecords, backgrounds: backgroundRewards }
})
