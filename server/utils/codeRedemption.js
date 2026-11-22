// server/utils/codeRedemption.js
//
// The actual code-redemption logic, extracted unchanged out of server/api/redeem.post.js so it
// can be called a second way: to silently RELEASE a held "Handicap Redeems" hold (see
// server/utils/handicapRedeem.js) once enough other players have minted the same code, not just
// from the player's own HTTP request.
//
// For an ordinary (non-flagged) player this function behaves exactly as redeem.post.js always
// has — same validation order, same transaction shape, same mint loop, same pack-grant retry,
// same rollback-on-mint-failure. The only new behavior is the handicap branch inserted right
// after ctoonAwards is computed (see "Handicap Redeems" below): a flagged player whose code
// awards a cToon gets a HandicapRedeemHold instead of an actual redemption, and sees
// `{ redeeming: true }` where they'd otherwise see their rewards.
import { mintQueue, redisConnection } from './queues.js'
import { QueueEvents } from 'bullmq'
import { prisma } from '../prisma.js'
import { OG_GTOON_DISPLAY_SELECT, ogGtoonDisplay } from './ogGtoonDisplay.js'
import { sumRewardPacks } from './codeRewardPacks.js'
import { grantCodePacks } from './codePackGrant.js'
import { createError } from 'h3'
import { isUserHandicapped, claimsSinceHold, HANDICAP_REQUIRED_RELEASE_CLAIMS } from './handicapRedeem.js'

/**
 * Redeems `code` for `userId`. Returns `{ points, ctoons, backgrounds, packs }` on success, or
 * `{ redeeming: true }` if this player is handicapped and the code awards a cToon (see the
 * "Handicap Redeems" section below) — there is nothing else for a caller to distinguish; both
 * shapes are 200s. Throws an h3 `createError(...)` on any validation or mint failure, exactly as
 * redeem.post.js always has — callers that just re-throw preserve the existing error contract.
 *
 * `bypassHandicap` is for internal use only (releaseEligibleHandicapHolds, below): it skips the
 * handicap branch entirely so a hold's own release can actually execute the redemption it's been
 * holding, rather than recreating the same hold forever.
 */
export async function redeemClaimCode(userId, code, { bypassHandicap = false } = {}) {
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

  // ── Handicap Redeems ──────────────────────────────────────────────────────────────────────
  // A flagged player (see server/utils/handicapRedeem.js) redeeming a code that mints at least
  // one cToon never reaches the transaction below — instead of their actual reward, they get
  // `{ redeeming: true }`, same as every other in-progress request looks from the client's own
  // point of view (pages/newsite/redeem.vue just shows "Redeeming…"). A code with no cToon award
  // is let through normally: "3 people have minted that code" can never become true for a
  // points/background-only code, so holding those would lock the player out of them forever.
  if (ctoonAwards.length > 0 && !bypassHandicap) {
    if (await isUserHandicapped(userId)) {
      try {
        await prisma.handicapRedeemHold.create({ data: { userId, codeId: claimCode.id, requestedAt: new Date() } })
      } catch (err) {
        // Two concurrent attempts (double-click, two open tabs) both read "no existing hold"
        // before either insert committed — the loser hits the unique key, not a real problem,
        // same spirit as the P2002 race already handled below for the real Claim row.
        if (err?.code !== 'P2002') throw err
      }
      // Whether this is the first attempt, a resubmission, or the loser of the race above, the
      // response is identical either way — nothing here ever reveals that a hold already exists.
      return { redeeming: true }
    }
    // Not currently flagged — but a PENDING hold can still exist here if an admin flagged this
    // player, they got held, and were later unflagged before it released (see
    // [userId].delete.js's own comment: unflagging deliberately never touches an existing hold).
    // This ordinary redemption is about to succeed for real via the transaction below, so clear
    // it now — otherwise it sits there forever, and every future claim of this code wastes a
    // release attempt on it that can only ever fail with "already redeemed". A RELEASING hold is
    // left alone: that row is actively owned by an in-flight release (see releaseHold below).
    await prisma.handicapRedeemHold.deleteMany({ where: { userId, codeId: claimCode.id, status: 'PENDING' } })
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

  const result = { points: pointsToAward, ctoons: mintedRecords, backgrounds: backgroundRewards, packs }

  // A real Claim for this code now exists — check whether it just cleared the release threshold
  // for any OTHER handicapped player's pending hold on the same code. Fire-and-forget: this must
  // never slow down or fail the redeemer who just triggered it, and a hold that doesn't release
  // this time retries on the next real claim of this code.
  if (ctoonAwards.length > 0) {
    releaseEligibleHandicapHolds(claimCode.id, code).catch(err => {
      console.error(`[handicapRedeem] release check failed for code ${claimCode.id}:`, err)
    })
  }

  return result
}

/**
 * Actually executes one hold (via `bypassHandicap`) and marks it COMPLETED with the result.
 * Shared by the automatic threshold-based release below and the admin's manual "force release"
 * action (server/api/admin/handicap-redeems/holds/[id]/release.post.js) — the only difference
 * between those two callers is whether they bothered checking the threshold first.
 *
 * Every successful redemption this triggers (via redeemClaimCode) fires its OWN
 * releaseEligibleHandicapHolds at its own end — including a release's own bypassHandicap call —
 * so this same hold can genuinely be picked up by a second, re-entrant check before this call's
 * own write has landed. The PENDING->RELEASING flip below is an optimistic-lock UPDATE
 * (conditioned on still being PENDING) BEFORE the redemption itself runs, specifically so only
 * one caller ever "wins" that race — the loser returns null immediately rather than attempting
 * (and failing) a second real redemption for the same user. RELEASING, not COMPLETED, is the
 * claimed-but-not-done state deliberately: every reader (redeem/status.get.js, pending.get.js)
 * treats RELEASING exactly like PENDING, so a poll landing in the gap between this claim and the
 * redemption actually finishing never sees a "COMPLETED" hold with no resultJson yet. Reverted
 * back to PENDING if the redemption actually fails, so a genuine failure still gets retried later.
 */
async function releaseHold(hold, code) {
  const claimed = await prisma.handicapRedeemHold.updateMany({
    where: { id: hold.id, status: 'PENDING' },
    data: { status: 'RELEASING' }
  })
  if (claimed.count === 0) return null // already claimed by a concurrent/re-entrant release check

  try {
    const result = await redeemClaimCode(hold.userId, code, { bypassHandicap: true })
    await prisma.handicapRedeemHold.update({
      where: { id: hold.id },
      data: { status: 'COMPLETED', completedAt: new Date(), resultJson: JSON.stringify(result) }
    })
    return result
  } catch (err) {
    await prisma.handicapRedeemHold.update({ where: { id: hold.id }, data: { status: 'PENDING' } })
    throw err
  }
}

/**
 * Checks every still-PENDING hold on this code and actually executes any whose flagged player
 * has now waited long enough — i.e. at least HANDICAP_REQUIRED_RELEASE_CLAIMS other players have
 * claimed this same code since that hold was first requested. Safe to call repeatedly/
 * concurrently — see releaseHold's own comment on how a hold can never be double-released.
 */
export async function releaseEligibleHandicapHolds(codeId, code) {
  const pending = await prisma.handicapRedeemHold.findMany({ where: { codeId, status: 'PENDING' } })
  for (const hold of pending) {
    try {
      const othersCount = await claimsSinceHold(codeId, hold.requestedAt)
      if (othersCount < HANDICAP_REQUIRED_RELEASE_CLAIMS) continue
      await releaseHold(hold, code)
    } catch (err) {
      // Left PENDING (releaseHold already reverted it) — retried the next time this code gets a
      // real claim. A code that has since hit maxClaims will never release this way; see
      // HandicapRedeemHold's own schema comment and the admin "force release" action for that.
      console.error(`[handicapRedeem] failed to release hold ${hold.id} (user ${hold.userId}, code ${codeId}):`, err?.statusMessage || err?.message || err)
    }
  }
}

/**
 * Retry path for the flagged player's own redeem page (see server/api/redeem/status.get.js): if
 * THIS user's hold on this code is still PENDING and enough other claims have landed since, release
 * it now. The automatic release in redeemClaimCode only fires off someone else's successful claim,
 * so a release that was missed or failed (mint error, race) would otherwise sit until yet another
 * player claimed the code. Never throws — a hold that can't release yet just stays PENDING and the
 * page's next retry tries again.
 */
export async function retryReleaseUserHold(userId, codeId, code) {
  try {
    const hold = await prisma.handicapRedeemHold.findUnique({ where: { userId_codeId: { userId, codeId } } })
    if (!hold || hold.status !== 'PENDING') return
    const othersCount = await claimsSinceHold(codeId, hold.requestedAt)
    if (othersCount < HANDICAP_REQUIRED_RELEASE_CLAIMS) return
    await releaseHold(hold, code)
  } catch (err) {
    console.error(`[handicapRedeem] retry release failed (user ${userId}, code ${codeId}):`, err?.statusMessage || err?.message || err)
  }
}

/**
 * An admin's manual override: executes a specific still-PENDING hold right now, ignoring
 * HANDICAP_REQUIRED_RELEASE_CLAIMS entirely — e.g. because the code will realistically never get
 * 3 more redemptions (it's old, or near maxClaims). Throws (and leaves the hold untouched) if the
 * underlying redemption itself fails, same as redeemClaimCode always does — callers should
 * surface that error rather than silently swallowing it, since this one IS the explicit,
 * synchronous action an admin asked for, not a background retry.
 */
export async function forceReleaseHold(holdId) {
  const hold = await prisma.handicapRedeemHold.findUnique({ where: { id: holdId }, include: { code: { select: { code: true } } } })
  if (!hold) throw createError({ statusCode: 404, statusMessage: 'Hold not found' })
  if (hold.status === 'RELEASING') throw createError({ statusCode: 409, statusMessage: 'That hold is already being released — try again in a moment' })
  if (hold.status !== 'PENDING') throw createError({ statusCode: 400, statusMessage: 'That hold has already been released' })
  const result = await releaseHold(hold, hold.code.code)
  if (!result) throw createError({ statusCode: 409, statusMessage: 'That hold was just released by something else — refresh and try again' })
  return result
}
