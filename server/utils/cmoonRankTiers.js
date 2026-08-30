// server/utils/cmoonRankTiers.js
// Provisions/resyncs the per-cMoon CMoonRank + auto-managed Achievement rows a universal
// CMoonRankTier drives, so an admin configures one shared rank ladder (name, point threshold,
// up to 6 universal reward-cToon choices, defaulting to 5) instead of building it out once
// per cMoon by hand.
// See the CMoonRankTier model comment in prisma/schema.prisma for the overall design.
//
// This module is the ONLY thing that ever writes a tier-managed Achievement/AchievementClaimOption
// row — it goes straight through Prisma, never through server/api/admin/achievements.post.js or
// [id].put.js. Those endpoints deliberately still refuse to let a HAND-AUTHORED achievement combine
// cMoonRankId with isClaimable (a rank-up an admin builds by hand always just auto-grants); relaxing
// that validation to let a request produce this combination would let a crafted/CSRF'd call to the
// public achievements endpoint fabricate an arbitrary "self-granting rank + arbitrary reward" row.
// Writing directly from this internal sync path avoids that risk entirely while still reusing
// achievements.js's existing grant/claim engine (awardAchievementToUser, claimAchievementReward)
// completely unmodified.
import { prisma } from '../prisma.js'

// A tier's reward-choice count is admin-configurable per tier (CMoonRankTier.maxRewardChoices),
// not a single fixed number — these two bound the allowed range, and DEFAULT is what a newly
// created tier starts at (matches the Prisma column default).
export const MIN_TIER_REWARD_CHOICES = 1
export const MAX_TIER_REWARD_CTOONS = 6
export const DEFAULT_TIER_REWARD_CHOICES = 5

export function isValidMaxRewardChoices(value) {
  return Number.isInteger(value) && value >= MIN_TIER_REWARD_CHOICES && value <= MAX_TIER_REWARD_CTOONS
}

function tierAchievementSlug(tier, cMoonId) {
  return `cmoon-rank-tier-${tier.sortOrder}-${cMoonId}`
}

// Resyncs one achievement's AchievementClaimOption rows to match a tier's current reward-cToon
// list. Additive by design, never a blind delete-then-recreate: AchievementClaimOption/
// AchievementClaim carry Restrict FKs specifically so a player's already-made claim can never be
// silently invalidated (see the model comments) — deleting an option any player has claimed
// would throw a foreign-key violation and abort the whole sync. Instead: an option matching a
// still-configured reward cToon is left alone entirely, a newly-added reward cToon gets a new
// option, and an option whose cToon fell OUT of the tier's list is only removed if nobody has
// claimed it yet; otherwise it's left in place as a harmless legacy choice — the tier editor no
// longer offers it, but an already-exercised choice isn't retroactively broken.
async function resyncClaimOptions(tx, achievementId, rewardCtoons) {
  const existing = await tx.achievementClaimOption.findMany({
    where: { achievementId },
    include: {
      reward: { include: { ctoons: { select: { ctoonId: true } } } },
      claims: { select: { id: true }, take: 1 },
    },
  })

  const existingByCtoonId = new Map()
  for (const opt of existing) {
    const ctoonId = opt.reward?.ctoons?.[0]?.ctoonId
    if (ctoonId) existingByCtoonId.set(ctoonId, opt)
  }
  const wantedCtoonIds = new Set(rewardCtoons.map(r => r.ctoonId))

  for (const opt of existing) {
    const ctoonId = opt.reward?.ctoons?.[0]?.ctoonId
    if (ctoonId && !wantedCtoonIds.has(ctoonId) && opt.claims.length === 0) {
      await tx.achievementClaimOption.delete({ where: { id: opt.id } })
      // Only safe to remove now that the option referencing it (Restrict FK) is gone.
      await tx.achievementReward.delete({ where: { id: opt.rewardId } })
    }
  }

  let sortOrder = 0
  for (const r of rewardCtoons) {
    if (!existingByCtoonId.has(r.ctoonId)) {
      const reward = await tx.achievementReward.create({
        data: { achievementId, points: 0, ctoons: { create: [{ ctoonId: r.ctoonId, quantity: 1 }] } },
      })
      await tx.achievementClaimOption.create({
        data: { achievementId, label: r.ctoonName || 'Reward cToon', sortOrder, rewardId: reward.id },
      })
    }
    sortOrder++
  }
}

// Upserts one tier's CMoonRank + auto-managed Achievement for a single cMoon, then resyncs its
// claim options. `cMoonName` is passed in (rather than queried here) so callers looping over
// every cMoon can fetch names once up front instead of N+1.
async function syncTierForOneCMoon(tx, tier, rewardCtoons, cMoonId, cMoonName) {
  let rank
  try {
    rank = await tx.cMoonRank.upsert({
      where: { cMoonId_tierId: { cMoonId, tierId: tier.id } },
      create: { cMoonId, tierId: tier.id, name: tier.name, sortOrder: tier.sortOrder },
      update: { name: tier.name, sortOrder: tier.sortOrder },
    })
  } catch (err) {
    // A legacy hand-authored custom rank (tierId null) in this specific cMoon already uses this
    // name or sortOrder — CMoonRank's own @@unique([cMoonId, name])/@@unique([cMoonId, sortOrder])
    // constraints (shared with the tier system, not just among tiers) reject the upsert. Surface
    // a clear, actionable error rather than a raw P2002 — the whole sync is one transaction, so
    // this cleanly aborts every cMoon's update, not just this one's.
    if (err?.code === 'P2002') {
      throw new Error(`"${tier.name}" (order ${tier.sortOrder}) collides with an existing custom rank in "${cMoonName}" — rename or remove that rank first.`)
    }
    throw err
  }

  const title = `${cMoonName || 'cMoon'} — ${tier.name}`
  const description = `Reach ${tier.pointThreshold.toLocaleString()} cMoon points to earn ${tier.name}.`

  let achievement = await tx.achievement.findFirst({
    where: { cMoonRankTierId: tier.id, cMoonRankId: rank.id },
  })
  if (!achievement) {
    achievement = await tx.achievement.create({
      data: {
        slug: tierAchievementSlug(tier, cMoonId),
        title,
        description,
        isActive: true,
        isClaimable: true,
        cMoonPointsGte: tier.pointThreshold,
        cMoonRankId: rank.id,
        cMoonRankTierId: tier.id,
      },
    })
  } else if (
    achievement.title !== title ||
    achievement.description !== description ||
    achievement.cMoonPointsGte !== tier.pointThreshold ||
    !achievement.isActive
  ) {
    achievement = await tx.achievement.update({
      where: { id: achievement.id },
      data: { title, description, cMoonPointsGte: tier.pointThreshold, isActive: true },
    })
  }

  await resyncClaimOptions(tx, achievement.id, rewardCtoons)
  return { rank, achievement }
}

// Full resync: given a tier's current id (its name/sortOrder/pointThreshold/reward-cToon list are
// re-read fresh from the database, not trusted from a caller-supplied object, so this is safe to
// call right after any admin write), provisions/updates that tier's CMoonRank + Achievement for
// EVERY existing cMoon. Wrapped in one transaction — the security review this feature went
// through flagged an unwrapped multi-cMoon loop as a "half-wired tier" risk (a crash partway
// through leaves some cMoons with a rank but no matching achievement); an admin's cMoon count is
// small (single digits to a few dozen), so one all-or-nothing transaction is cheap and simplest.
export async function syncTierAcrossCMoons(tierId) {
  await prisma.$transaction(async (tx) => {
    const tier = await tx.cMoonRankTier.findUnique({
      where: { id: tierId },
      include: { rewardCtoons: { orderBy: { sortOrder: 'asc' }, include: { ctoon: { select: { name: true } } } } },
    })
    if (!tier) return

    const rewardCtoons = tier.rewardCtoons.map(r => ({ ctoonId: r.ctoonId, ctoonName: r.ctoon?.name }))
    const cmoons = await tx.cMoon.findMany({ select: { id: true, name: true } })

    for (const cmoon of cmoons) {
      await syncTierForOneCMoon(tx, tier, rewardCtoons, cmoon.id, cmoon.name)
    }
  }, { timeout: 30_000 })
}

// Provisions EVERY existing tier's rank + achievement for one brand-new cMoon (called right after
// server/api/admin/cmoons.post.js creates it), so a new faction starts with the full universal
// ladder already wired up rather than only picking it up the next time an existing tier happens
// to be edited.
export async function provisionAllTiersForCMoon(cMoonId) {
  await prisma.$transaction(async (tx) => {
    const cmoon = await tx.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true } })
    if (!cmoon) return

    const tiers = await tx.cMoonRankTier.findMany({
      include: { rewardCtoons: { orderBy: { sortOrder: 'asc' }, include: { ctoon: { select: { name: true } } } } },
    })
    for (const tier of tiers) {
      const rewardCtoons = tier.rewardCtoons.map(r => ({ ctoonId: r.ctoonId, ctoonName: r.ctoon?.name }))
      await syncTierForOneCMoon(tx, tier, rewardCtoons, cmoon.id, cmoon.name)
    }
  }, { timeout: 30_000 })
}

// Whether a tier can be safely deleted: false the instant any player has actually earned one of
// its per-cMoon achievements (AchievementUser existing implies the rank/reward is real and lived
// experience for that player — never silently orphan that, mirroring the "Restrict" caution this
// schema uses elsewhere, e.g. CMoonPrizeCtoon's ctoon FK).
export async function tierEarnedCount(tierId) {
  return prisma.achievementUser.count({ where: { achievement: { cMoonRankTierId: tierId } } })
}

// Deletes a tier and everything it provisioned. Caller (the admin DELETE endpoint) must have
// already confirmed via tierEarnedCount() that nobody has earned it — this function does not
// re-check, so it is only ever safe to call right after that guard passes in the same request.
export async function deleteTierAndProvisionedRows(tierId) {
  await prisma.$transaction(async (tx) => {
    const achievements = await tx.achievement.findMany({
      where: { cMoonRankTierId: tierId },
      select: { id: true },
    })
    for (const { id: achievementId } of achievements) {
      const options = await tx.achievementClaimOption.findMany({ where: { achievementId }, select: { id: true, rewardId: true } })
      for (const opt of options) {
        await tx.achievementClaimOption.delete({ where: { id: opt.id } })
        await tx.achievementReward.delete({ where: { id: opt.rewardId } })
      }
      await tx.achievement.delete({ where: { id: achievementId } })
    }
    await tx.cMoonRank.deleteMany({ where: { tierId } })
    await tx.cMoonRankTier.delete({ where: { id: tierId } })
  }, { timeout: 30_000 })
}
