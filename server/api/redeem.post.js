// server/api/redeem.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { mintQueue } from '../utils/queues'
import { QueueEvents } from 'bullmq'
import { prisma } from '@/server/prisma'
import { OG_GTOON_DISPLAY_SELECT, ogGtoonDisplay } from '~/server/utils/ogGtoonDisplay'
import { sumRewardPacks } from '@/server/utils/codeRewardPacks'
import { grantCodePacks } from '@/server/utils/codePackGrant'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { code } = await readBody(event)
  if (!code || typeof code !== 'string') throw createError({ statusCode: 400, statusMessage: 'Code is required' })

  const claimCode = await prisma.claimCode.findUnique({ where: { code }, select: { id: true, maxClaims: true, startsAt: true, expiresAt: true, prereqMinOwned: true } })
  if (!claimCode) throw createError({ statusCode: 404, statusMessage: 'Invalid code' })
  if (claimCode.startsAt && claimCode.startsAt > new Date()) throw createError({ statusCode: 400, statusMessage: 'This code is not yet available' })
  if (claimCode.expiresAt && claimCode.expiresAt < new Date()) throw createError({ statusCode: 400, statusMessage: 'Code expired' })

  const prereqs = await prisma.claimCodePrerequisite.findMany({
    where: { codeId: claimCode.id },
    include: { ctoon: { select: { id: true, name: true } } }
  })
  if (prereqs.length > 0) {
    const owned = await prisma.userCtoon.findMany({ where: { userId, ctoonId: { in: prereqs.map(p => p.ctoonId) } }, select: { ctoonId: true } })
    const ownedIds = new Set(owned.map(o => o.ctoonId))
    if (claimCode.prereqMinOwned != null) {
      // Pool mode: user must own at least X distinct cToons from the prerequisite pool
      const required = Math.min(claimCode.prereqMinOwned, prereqs.length)
      const ownedCount = prereqs.filter(p => ownedIds.has(p.ctoonId)).length
      if (ownedCount < required) {
        const poolNames = prereqs.map(p => p.ctoon.name)
        throw createError({ statusCode: 400, statusMessage: `You must own at least ${required} of the following cToons to redeem this code (you own ${ownedCount}): ${poolNames.join(', ')}` })
      }
    } else {
      const missing = prereqs.filter(p => !ownedIds.has(p.ctoonId)).map(p => p.ctoon.name)
      if (missing.length) throw createError({ statusCode: 400, statusMessage: `You must own the following cToons to redeem this code: ${missing.join(', ')}` })
    }
  }

  const totalClaims = await prisma.claim.count({ where: { codeId: claimCode.id } })
  if (totalClaims >= claimCode.maxClaims) throw createError({ statusCode: 400, statusMessage: 'Code fully redeemed' })

  const already = await prisma.claim.findUnique({ where: { userId_codeId: { userId, codeId: claimCode.id } } })
  if (already) throw createError({ statusCode: 400, statusMessage: 'Code already redeemed' })

  const rewardDefs = await prisma.claimCodeReward.findMany({
    where: { codeId: claimCode.id },
    include: {
      ctoons: { include: { ctoon: { select: { id: true, name: true, initialQuantity: true, assetPath: true, ...OG_GTOON_DISPLAY_SELECT, rarity: true, set: true } } } },
      poolCtoons: { include: { ctoon: { select: { id: true, name: true, initialQuantity: true, assetPath: true, ...OG_GTOON_DISPLAY_SELECT, rarity: true, set: true } } } },
      backgrounds: { include: { background: { select: { id: true, label: true, imagePath: true, visibility: true } } } },
      packs: { include: { pack: { select: { id: true, name: true, imagePath: true } } } }
    }
  })

  // Sealed packs awarded (the same pack in several reward batches is summed). Granted below — see the ordering note.
  const packAwards = sumRewardPacks(rewardDefs)
  const packInfo = new Map(rewardDefs.flatMap(r => (r.packs || []).map(rp => [rp.packId, rp.pack])))

  const pointsToAward = rewardDefs.reduce((s, r) => s + (r.points ?? 0), 0)

  // Fixed awards — skip any ctoon whose bonus window has already ended.
  const now = new Date()
  const ctoonAwards = rewardDefs.flatMap(r =>
    r.ctoons
      .filter(rc => {
        if (!rc.endBonusAt || rc.endBonusAt >= now) return true
        console.log('[redeem] skipped ctoon: bonus window ended', {
          codeId: claimCode.id, ctoonId: rc.ctoon.id, userId, endBonusAt: rc.endBonusAt, redeemedAt: now
        })
        return false
      })
      .map(rc => ({
        ctoonId: rc.ctoon.id,
        name: rc.ctoon.name,
        quantity: rc.quantity,
        initialQuantity: rc.ctoon.initialQuantity ?? 0,
        assetPath: rc.ctoon.assetPath,
        ...ogGtoonDisplay(rc.ctoon),
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
          ...ogGtoonDisplay(pool[i].ctoon),
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

  // A pack-only code (no cToon mints) has nothing that can fail after the claim, so its packs are created in the same
  // transaction as the claim. A code that also mints cToons creates its packs only after every mint has succeeded.
  const packsInClaimTx = ctoonAwards.length === 0
  let claimId = null
  let grantedPacks = []
  try {
    await prisma.$transaction(async (tx) => {
      // Serialise redemptions of THIS code and recount inside the lock. The count above ran outside any transaction,
      // so N parallel redeemers all saw "claims < maxClaims" and all got through — each one now also gets packs.
      await tx.$queryRaw`SELECT "id" FROM "ClaimCode" WHERE "id" = ${claimCode.id} FOR UPDATE`
      const claimsNow = await tx.claim.count({ where: { codeId: claimCode.id } })
      if (claimsNow >= claimCode.maxClaims) throw createError({ statusCode: 400, statusMessage: 'Code fully redeemed' })

      const claim = await tx.claim.create({ data: { userId, codeId: claimCode.id } })
      claimId = claim.id
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
      if (packsInClaimTx) grantedPacks = await grantCodePacks(tx, { userId, claimId: claim.id, awards: packAwards })
    })
  } catch (e) {
    // Two requests from the same user raced past the "already redeemed" check; the (userId, codeId) unique key decides.
    if (e?.code === 'P2002') throw createError({ statusCode: 400, statusMessage: 'Code already redeemed' })
    throw e
  }

  const mintedRecords = []
  let packGrantFailure = null
  let qe
  try {
    // Pack-only / points-only codes never touch Redis: no queue, no QueueEvents, so a Redis outage can't fail them.
    if (ctoonAwards.length) {
      qe = new QueueEvents(mintQueue.name, { connection: redisConnection })
      await qe.waitUntilReady()
    }
    for (const award of ctoonAwards) {
      for (let i = 0; i < award.quantity; i++) {
        const { ctoonId, name } = award
        const job = await mintQueue.add('mintCtoon', { userId, ctoonId, isSpecial: true, method: 'CODE_REDEEM' })
        await job.waitUntilFinished(qe)
        const minted = await prisma.userCtoon.findFirst({
          where: { userId, ctoonId },
          orderBy: { createdAt: 'desc' },
          select: { mintNumber: true, isFirstEdition: true }
        })
        mintedRecords.push({
          ctoonId,
          name,
          mintNumber: minted?.mintNumber ?? null,
          isFirstEdition: minted?.isFirstEdition ?? false,
          assetPath: award.assetPath,
          ...ogGtoonDisplay(award),
          rarity: award.rarity,
          set: award.set
        })
      }
    }
    // Every mint succeeded. Only now do this code's packs exist (see packsInClaimTx above) — so a failure above rolls
    // the claim back with no pack ever having been visible, openable or tradable.
    // The cToons are already minted at this point, so a failure HERE must not fall into the rollback below (it would
    // delete the claim and let the player redeem — and be minted — the same cToons again). grantCodePacks is idempotent
    // (unique sourceRef + ordinal), so retry it; if it still fails, keep the claim and report it.
    if (!packsInClaimTx) {
      let grantErr = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          grantedPacks = await prisma.$transaction(tx => grantCodePacks(tx, { userId, claimId, awards: packAwards }))
          grantErr = null
          break
        } catch (e) {
          grantErr = e
          await new Promise(r => setTimeout(r, 150 * (attempt + 1)))
        }
      }
      if (grantErr) {
        console.error(`[redeem] pack grant failed after mint for claim ${claimId} (user ${userId}):`, grantErr)
        packGrantFailure = grantErr
      }
    }
  } catch (mintErr) {
    // Mint failed — best-effort rollback of the claim so the user can retry
    try {
      await prisma.$transaction(async (tx) => {
        // No pack rows can exist here: packs are only created after every mint succeeded (or in the claim itself for a
        // pack-only code, which never reaches this block). So there is nothing to unwind for packs.
        await tx.claim.delete({ where: { userId_codeId: { userId, codeId: claimCode.id } } })
        if (pointsToAward > 0) {
          const updated = await tx.userPoints.update({
            where: { userId },
            data: { points: { decrement: pointsToAward } }
          })
          await tx.pointsLog.create({
            data: { userId, points: pointsToAward, total: updated.points, method: 'Redeem Code Reversal', direction: 'decrease' }
          })
        }
        if (backgroundRewards.length) {
          await tx.userBackground.deleteMany({ where: { userId, sourceCodeId: claimCode.id } })
        }
      })
    } catch {}
    throw createError({ statusCode: 500, statusMessage: mintErr?.message || 'Failed to mint cToon. Please try again.' })
  } finally {
    await qe?.close()
  }

  if (packGrantFailure) {
    // cToons delivered, claim kept (so nothing can be minted twice), packs not yet created.
    throw createError({
      statusCode: 500,
      statusMessage: 'Your code was redeemed but the pack reward could not be added. Please contact support — do not try the code again.'
    })
  }

  const packs = grantedPacks.map(g => ({
    packId: g.packId,
    name: packInfo.get(g.packId)?.name || 'Pack',
    imagePath: packInfo.get(g.packId)?.imagePath || null,
    quantity: g.userPackIds.length,
    userPackIds: g.userPackIds
  }))

  return { points: pointsToAward, ctoons: mintedRecords, backgrounds: backgroundRewards, packs }
})
