// server/utils/cmoonPrestigeRankTiers.js
//
// The prestige-exclusive rank ladder — see CMoonPrestigeRankTier's own schema comment for the
// full "how this differs from the universal CMoonRankTier ladder and from CMoonPrestigeLevel"
// explanation. In short: an admin authors ONE global ladder here, exactly like the universal one
// (server/utils/cmoonRankTiers.js), but it is mirrored ONLY onto cMoons flagged isPrestigeCMoon —
// provisioned the moment a cMoon turns that flag on, deprovisioned the moment it turns it off.
//
// Deliberately NOT routed through the Achievement engine the universal ladder uses — that engine
// is a shared, 15+-criteria model with its own admin-form validation rules (see Achievement's own
// schema comment on cMoonRankId/isClaimable), and reusing it here would mean extending that
// delicate shared surface for a feature that doesn't need its claim-choice UX (a prestige rank
// grants exactly ONE admin-configured reward automatically, no "pick one of up to 6" step). So
// this ladder is self-contained: its own grant function (maybeGrantCMoonPrestigeRank), called
// from the exact same trigger point the Achievement engine's own processAchievementsForUser
// already is (see that function in server/utils/achievements.js) — every existing path that
// re-evaluates a user's achievements after their cMoonPoints might have changed (the periodic
// cron, a solo/raid win, a TKO win) automatically re-evaluates this ladder too, for free.
import { prisma } from '../prisma.js'
import { grantRewardInTx, enqueueCtoonJobs } from './achievements.js'
// Pure validation (name/threshold/reward-type/id-XOR/quantity) lives in its own import-free
// module so it can be unit-tested directly without pulling in Prisma/BullMQ/Discord via
// achievements.js above — see that file's own header comment. Re-exported here so every
// existing call site (the three admin CRUD endpoints) can keep importing from this file.
export { PRESTIGE_RANK_THRESHOLD_MAX, parsePrestigeRankTierBody } from './cmoonPrestigeRankValidation.js'

async function provisionTierForOneCMoon(tx, tierId, cMoonId) {
  // Nothing to update on an existing row — a tier's own name/threshold/reward live on
  // CMoonPrestigeRankTier itself (unlike the universal ladder's CMoonRank, which denormalizes
  // name/sortOrder onto each per-cMoon copy for its own achievement-title wiring); this mirror
  // row is purely "this cMoon's ladder includes this tier," so upsert's update branch is a no-op.
  await tx.cMoonPrestigeRank.upsert({
    where: { cMoonId_tierId: { cMoonId, tierId } },
    create: { cMoonId, tierId },
    update: {},
  })
}

// Provisions one tier's CMoonPrestigeRank for every CURRENTLY prestige-flagged cMoon — called
// right after that tier is created or edited, so a brand-new/changed rung is immediately
// climbable in every prestige cMoon rather than waiting for one of them to be re-flagged.
export async function provisionTierAcrossPrestigeCMoons(tierId) {
  await prisma.$transaction(async (tx) => {
    const tier = await tx.cMoonPrestigeRankTier.findUnique({ where: { id: tierId }, select: { id: true } })
    if (!tier) return
    const cmoons = await tx.cMoon.findMany({ where: { isPrestigeCMoon: true }, select: { id: true } })
    for (const cmoon of cmoons) await provisionTierForOneCMoon(tx, tierId, cmoon.id)
  }, { timeout: 30_000 })
}

// Provisions EVERY existing tier's rank for one cMoon — called when that cMoon's isPrestigeCMoon
// flips on (at creation or via the admin edit endpoint), so its ladder is immediately complete.
export async function provisionAllPrestigeTiersForCMoon(cMoonId) {
  await prisma.$transaction(async (tx) => {
    const tiers = await tx.cMoonPrestigeRankTier.findMany({ select: { id: true } })
    for (const tier of tiers) await provisionTierForOneCMoon(tx, tier.id, cMoonId)
  }, { timeout: 30_000 })
}

// Called when a cMoon's isPrestigeCMoon flips OFF — this cMoon is no longer a prestige
// destination, so its mirrored ladder has nothing left to be "the prestige ladder" for. Deleting
// these rows cascades User.currentCMoonPrestigeRankId to null for anyone who held one (see that
// field's own onDelete: SetNull), which is the correct behavior: a rank earned on a ladder that
// no longer exists for this cMoon isn't a real rank anymore.
export async function deprovisionCMoonPrestigeRanks(cMoonId) {
  await prisma.cMoonPrestigeRank.deleteMany({ where: { cMoonId } })
}

// Whether a tier can be safely deleted: false the instant any player currently HOLDS one of its
// mirrored ranks (User.currentCMoonPrestigeRankId pointing at a CMoonPrestigeRank for this tier)
// — never silently take away an earned rank, same "Restrict"-style caution CMoonPrizeCtoon's own
// ctoon FK and the universal ladder's tierEarnedCount already take elsewhere in this codebase.
export async function tierHolderCount(tierId) {
  return prisma.user.count({ where: { currentCMoonPrestigeRank: { tierId } } })
}

// Deletes a tier and every cMoon's mirror of it. Caller (the admin DELETE endpoint) must have
// already confirmed via tierHolderCount() that nobody currently holds it — this function does
// not re-check. onDelete: Cascade on CMoonPrestigeRank.tier means the mirror rows (and in turn,
// via SetNull, any holder's currentCMoonPrestigeRankId — already confirmed empty) are cleaned up
// by the database itself; no separate deleteMany needed, unlike the universal ladder's own
// deleteTierAndProvisionedRows, whose CMoonRank relation has no such cascade.
export async function deleteTierAndProvisionedRows(tierId) {
  await prisma.cMoonPrestigeRankTier.delete({ where: { id: tierId } })
}

// Converts one tier row into the duck-typed reward shape grantRewardInTx (server/utils/
// achievements.js) already knows how to grant — the exact same shape an AchievementReward row's
// relations present, so this reuses that function's ctoon-supply-cap math, avatar/background
// ownership dedup, and pack-grant batching verbatim instead of re-implementing any of it.
function buildRewardShape(tier) {
  if (tier.rewardType === 'POINTS') return { points: tier.quantity }
  if (tier.rewardType === 'CTOON') return { ctoons: [{ ctoonId: tier.ctoonId, quantity: tier.quantity, ctoon: tier.ctoon }] }
  if (tier.rewardType === 'AVATAR') return { avatars: [{ avatarId: tier.avatarId }] }
  if (tier.rewardType === 'BACKGROUND') return { backgrounds: [{ backgroundId: tier.backgroundId }] }
  if (tier.rewardType === 'PACK') return { packs: [{ packId: tier.packId, quantity: tier.quantity }] }
  return {}
}

// The grant check — called from processAchievementsForUser (server/utils/achievements.js) on
// every one of its existing triggers, so this never needs a trigger path of its own. No-ops
// instantly for anyone not currently a member of a prestige cMoon. Locks the user row (FOR
// UPDATE) so two concurrent calls for the same user can't both read a stale "current rank" and
// double-grant — same race guard grantCMoonRank (the universal ladder's own grant function) uses.
// Returns { rank, grant } if a new rank was granted, else null.
export async function maybeGrantCMoonPrestigeRank(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, cMoonId: true, cMoonPoints: true, currentCMoonPrestigeRankId: true,
      cMoon: { select: { isPrestigeCMoon: true } },
    },
  })
  if (!user?.cMoonId || !user.cMoon?.isPrestigeCMoon) return null

  const eligible = await prisma.cMoonPrestigeRank.findFirst({
    where: { cMoonId: user.cMoonId, tier: { pointThreshold: { lte: user.cMoonPoints } } },
    include: { tier: { include: { ctoon: { select: { quantity: true, name: true } } } } },
    orderBy: { tier: { sortOrder: 'desc' } },
  })
  if (!eligible) return null

  const currentRank = user.currentCMoonPrestigeRankId
    ? await prisma.cMoonPrestigeRank.findUnique({
      where: { id: user.currentCMoonPrestigeRankId }, select: { tier: { select: { sortOrder: true } } },
    })
    : null
  if (eligible.tier.sortOrder <= (currentRank?.tier?.sortOrder ?? -Infinity)) return null

  const txResult = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw`
      SELECT "cMoonId", "currentCMoonPrestigeRankId" FROM "User" WHERE id = ${userId} FOR UPDATE
    `
    if (!locked || locked.cMoonId !== eligible.cMoonId) return null

    let lockedSortOrder = -Infinity
    if (locked.currentCMoonPrestigeRankId) {
      const lockedRank = await tx.cMoonPrestigeRank.findUnique({
        where: { id: locked.currentCMoonPrestigeRankId }, select: { tier: { select: { sortOrder: true } } },
      })
      lockedSortOrder = lockedRank?.tier?.sortOrder ?? -Infinity
    }
    if (eligible.tier.sortOrder <= lockedSortOrder) return null

    await tx.user.update({ where: { id: userId }, data: { currentCMoonPrestigeRankId: eligible.id } })
    const grant = await grantRewardInTx(
      tx, userId, buildRewardShape(eligible.tier), `cmoon-prestige-rank:${eligible.tier.id}`, 'CMOON_PRESTIGE_RANK',
    )
    return { rank: { id: eligible.tier.id, name: eligible.tier.name, sortOrder: eligible.tier.sortOrder }, grant }
  })
  if (!txResult) return null

  // Mint jobs are not transactional (same reasoning grantCMoonPrizes/awardAchievementToUser's own
  // calls document) — enqueued only now that the transaction above has safely committed.
  if (txResult.grant.ctoonJobs.length) {
    await enqueueCtoonJobs(userId, txResult.grant.ctoonJobs, 'CMOON_PRESTIGE_RANK')
  }
  return txResult
}
