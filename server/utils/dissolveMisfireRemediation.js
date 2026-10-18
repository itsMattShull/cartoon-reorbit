// server/utils/dissolveMisfireRemediation.js
//
// Computes and executes the automated fix for a DissolveMisfireLog row: restore the cToon to
// the ORIGINAL auction winner (the first legitimate recipient after it was dissolved into the
// official account), and compensate everyone else who held it since — exactly their paid bid if
// they wrongly won the bogus second auction, or an approximate market value (the same cascade the
// Economy page uses) if they received it via an ordinary legitimate trade/grant in between. See
// prisma/schema.prisma's DissolveMisfireLog comment and this session's approved plan for the
// full policy (confirmed by the owner: always restore to the original winner, never to whoever
// merely held it most recently).
import { prisma } from '../prisma.js'
import { getAuctionReferenceValues, getCmartPrices, pickReferenceValue, MIN_SAMPLE_SIZE } from './economyValuation.js'
import { rarityFloor } from './auctionPriceSuggestion.js'
import { sendDiscordDMByDiscordId } from './discord.js'

export const DISSOLVE_MISFIRE_CORRECTION_METHOD = 'DISSOLVE_MISFIRE_CORRECTION'

// Methods that put the item into the official account's inventory as part of a dissolve —
// the starting point this remediation walks forward from. Both are written by the two paths
// that feed DissolveAuctionQueue (an admin-initiated dissolve, and the inactivity sweep).
const DISSOLVE_METHODS = ['DISSOLVE', 'DISSOLVE_INACTIVE']

/**
 * Read-only: walks the full CtoonOwnerLog history for a misfire's userCtoonId and returns either
 * a resolvable plan or a `{ blocked: reason }` object. Never mutates anything — used by both the
 * preview endpoint and the worker, so the worker only ever executes a plan an admin could also see.
 * @param {string} misfireLogId
 */
export async function computeRemediationPlan(misfireLogId) {
  const misfire = await prisma.dissolveMisfireLog.findUnique({ where: { id: misfireLogId } })
  if (!misfire) return { blocked: 'Misfire log not found.' }
  if (misfire.resolvedAt) {
    return { alreadyResolved: true, misfireLogId, resolutionSummary: misfire.resolutionSummary }
  }

  const userCtoonId = misfire.userCtoonId
  if (!userCtoonId) return { blocked: 'No userCtoonId recorded for this misfire.' }

  const uc = await prisma.userCtoon.findUnique({
    where: { id: userCtoonId },
    select: {
      id: true, userId: true, burnedAt: true, ctoonId: true, mintNumber: true,
      ctoon: { select: { name: true, rarity: true } }
    }
  })
  if (!uc) return { blocked: 'This UserCtoon no longer exists.' }
  if (uc.burnedAt) return { blocked: 'This cToon copy has been burned and no longer exists to restore.' }

  // Never auto-transfer ownership out from under a currently-live auction (bidders may already
  // hold locked points against it). An admin needs to cancel it first, then re-scan/resolve.
  const activeAuction = await prisma.auction.findFirst({
    where: { userCtoonId, status: 'ACTIVE' },
    select: { id: true }
  })
  if (activeAuction) {
    return { blocked: `An auction (${activeAuction.id}) is still active for this cToon — cancel it first, then re-run the scan.` }
  }

  const history = await prisma.ctoonOwnerLog.findMany({
    where: { userCtoonId },
    orderBy: { createdAt: 'asc' },
    select: {
      userId: true, method: true, createdAt: true,
      user: { select: { username: true, active: true, banned: true } }
    }
  })

  let dissolveIdx = -1
  for (let i = history.length - 1; i >= 0; i--) {
    if (DISSOLVE_METHODS.includes(history[i].method)) { dissolveIdx = i; break }
  }
  if (dissolveIdx === -1) {
    return { blocked: "No DISSOLVE ownership event found in this cToon's history — cannot determine the original winner." }
  }

  const afterDissolve = history.slice(dissolveIdx + 1)
  if (!afterDissolve.length) {
    return { blocked: 'No ownership event recorded after the dissolve — nothing to restore.' }
  }

  const originalWinnerRow = afterDissolve[0]
  if (!originalWinnerRow.userId || !originalWinnerRow.user) {
    return { blocked: "The original winner's account no longer exists." }
  }
  if (originalWinnerRow.user.banned) {
    return { blocked: `The original winner (${originalWinnerRow.user.username || originalWinnerRow.userId}) is banned — needs a human decision.` }
  }
  if (originalWinnerRow.user.active === false) {
    return { blocked: `The original winner (${originalWinnerRow.user.username || originalWinnerRow.userId}) is inactive — needs a human decision.` }
  }

  const originalWinner = {
    userId: originalWinnerRow.userId,
    username: originalWinnerRow.user.username || null,
    since: originalWinnerRow.createdAt,
    method: originalWinnerRow.method
  }

  const currentOwnerId = uc.userId
  if (currentOwnerId === originalWinner.userId) {
    return { alreadyCorrect: true, misfireLogId, originalWinner, currentOwnerId }
  }

  // Every distinct person who held it since (besides the original winner), in the order first
  // encountered — each is a compensation entry, not a recipient of the item itself.
  const compensationMap = new Map()
  for (let i = 1; i < afterDissolve.length; i++) {
    const row = afterDissolve[i]
    if (!row.userId || row.userId === originalWinner.userId) continue
    if (!compensationMap.has(row.userId)) {
      compensationMap.set(row.userId, { userId: row.userId, username: row.user?.username ?? null })
    }
  }
  // Defensive: the live current owner must always be represented even if the log history is
  // somehow incomplete — otherwise this would silently take the item from someone uncompensated.
  if (currentOwnerId && !compensationMap.has(currentOwnerId)) {
    const curUser = await prisma.user.findUnique({ where: { id: currentOwnerId }, select: { username: true } })
    compensationMap.set(currentOwnerId, { userId: currentOwnerId, username: curUser?.username ?? null })
  }

  if (!compensationMap.size) {
    return { blocked: 'Could not determine who to compensate — ownership history is inconsistent.' }
  }

  const ctoonId = uc.ctoonId
  const [auctionRefs, cmartPrices] = await Promise.all([
    getAuctionReferenceValues([ctoonId]),
    getCmartPrices([ctoonId])
  ])
  const refValue = pickReferenceValue(ctoonId, auctionRefs, cmartPrices)
  const approxValue = refValue != null ? Math.round(refValue) : rarityFloor(uc.ctoon?.rarity)
  const approxBasis = refValue != null
    ? ((auctionRefs.get(ctoonId)?.count ?? 0) >= MIN_SAMPLE_SIZE ? 'auction_average' : 'cmart_price')
    : 'rarity_floor'

  const compensations = []
  for (const person of compensationMap.values()) {
    const isWrongWinner = misfire.wrongWinnerUserId
      && person.userId === misfire.wrongWinnerUserId
      && misfire.wrongWinnerPaidPoints != null
    if (isWrongWinner) {
      compensations.push({
        userId: person.userId,
        username: person.username,
        points: misfire.wrongWinnerPaidPoints,
        reason: 'Refund of the exact points paid for this cToon in the bogus auction.',
        basis: 'exact_refund'
      })
    } else {
      compensations.push({
        userId: person.userId,
        username: person.username,
        points: approxValue,
        reason: 'Approximate value of the cToon, now being returned to its original winner.',
        basis: approxBasis
      })
    }
  }

  const totalCompensationPoints = compensations.reduce((sum, c) => sum + c.points, 0)

  return {
    misfireLogId,
    userCtoonId,
    ctoonId,
    ctoonName: uc.ctoon?.name ?? misfire.ctoonName ?? null,
    mintNumber: uc.mintNumber ?? misfire.mintNumber ?? null,
    originalWinner,
    currentOwnerId,
    compensations,
    totalCompensationPoints
  }
}

async function notifyRemediationParties(plan) {
  try {
    const userIds = [plan.originalWinner.userId, ...plan.compensations.map(c => c.userId)]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, discordId: true }
    })
    const discordById = new Map(users.map(u => [u.id, u.discordId]))
    const label = `${plan.ctoonName || 'a cToon'}${plan.mintNumber != null ? ` (Mint #${plan.mintNumber})` : ''}`

    const winnerDiscordId = discordById.get(plan.originalWinner.userId)
    if (winnerDiscordId) {
      await sendDiscordDMByDiscordId(winnerDiscordId, [
        `Good news! ${label} was mistakenly auctioned off a second time by our system after you`,
        `originally won it — it's been restored to your collection.`
      ].join(' '))
    }

    for (const comp of plan.compensations) {
      const discordId = discordById.get(comp.userId)
      if (!discordId) continue
      await sendDiscordDMByDiscordId(discordId, [
        `${label} that you received was mistakenly auctioned off a second time by our system and`,
        `has been returned to its original winner. To make this right, you've been credited`,
        `${comp.points} points.`
      ].join(' '))
    }
  } catch (e) {
    console.error('[dissolve-misfire-remediation] failed to send notification DMs:', e?.message || e)
  }
}

/**
 * Executes a plan returned by computeRemediationPlan (must not be blocked/alreadyCorrect/
 * alreadyResolved). Re-verifies the live ownership state inside the transaction so a plan
 * computed for a preview can never be executed against data that's since changed underneath it.
 * @param {object} plan
 * @param {{ adminId: string, adminUsername: string }} admin
 */
export async function executeRemediationPlan(plan, { adminId, adminUsername }) {
  if (!plan || plan.blocked || plan.alreadyCorrect || plan.alreadyResolved) {
    throw new Error('Cannot execute a blocked, already-correct, or already-resolved plan.')
  }

  const resolutionSummary = await prisma.$transaction(async (tx) => {
    const uc = await tx.userCtoon.findUnique({
      where: { id: plan.userCtoonId },
      select: { userId: true, burnedAt: true }
    })
    if (!uc || uc.burnedAt) throw new Error('UserCtoon no longer exists or has been burned.')
    if (uc.userId !== plan.currentOwnerId) {
      throw new Error('Ownership changed since this plan was computed — re-run the preview.')
    }
    const activeAuction = await tx.auction.findFirst({
      where: { userCtoonId: plan.userCtoonId, status: 'ACTIVE' },
      select: { id: true }
    })
    if (activeAuction) throw new Error(`Auction ${activeAuction.id} is now active for this cToon — aborting.`)

    await tx.userCtoon.update({
      where: { id: plan.userCtoonId },
      data: { userId: plan.originalWinner.userId, isTradeable: true }
    })

    await tx.ctoonOwnerLog.create({
      data: {
        userId: plan.originalWinner.userId,
        ctoonId: plan.ctoonId,
        userCtoonId: plan.userCtoonId,
        mintNumber: plan.mintNumber,
        method: DISSOLVE_MISFIRE_CORRECTION_METHOD,
        counterpartyUserId: plan.currentOwnerId
      }
    })

    for (const comp of plan.compensations) {
      const updated = await tx.userPoints.upsert({
        where: { userId: comp.userId },
        update: { points: { increment: comp.points } },
        create: { userId: comp.userId, points: comp.points }
      })
      await tx.pointsLog.create({
        data: {
          userId: comp.userId,
          direction: 'increase',
          points: comp.points,
          total: updated.points,
          method: DISSOLVE_MISFIRE_CORRECTION_METHOD
        }
      })
    }

    const summary = {
      originalWinner: plan.originalWinner,
      compensations: plan.compensations,
      totalCompensationPoints: plan.totalCompensationPoints
    }

    await tx.dissolveMisfireLog.update({
      where: { id: plan.misfireLogId },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: adminId ?? null,
        resolvedByUsername: adminUsername ?? null,
        resolutionSummary: summary
      }
    })

    return summary
  })

  notifyRemediationParties(plan).catch(() => {})

  return resolutionSummary
}
