// server/utils/achievements.js
import { prisma } from '../../server/prisma.js'
import { mintQueue } from '../../server/utils/queues.js'
import { announceAchievement, assignDiscordRoleByName } from '../../server/utils/discord.js'
import { getWordleWinCount, getWordleCurrentStreak } from '../../server/utils/wordle.js'

let cachedAchievements     = null
let cachedAchievementsTime = 0
const ACHIEVEMENTS_TTL_MS  = 10 * 60 * 1000  // 10 minutes

function toIntOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function hasCumulativeActivityDays(db, userId, requiredDays) {
  const days = Math.floor(Number(requiredDays || 0))
  if (!Number.isFinite(days) || days <= 0) return true

  const count = await db.userDailyActivity.count({ where: { userId } })
  return count >= days
}

export async function evaluateUserAgainstAchievement(client, userId, ach) {
  const db = client || prisma
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true, cMoonId: true, cMoonPoints: true } })
  if (!user) {
    // console.log('[achievements] evaluate: user not found', { userId, ach: ach?.slug || ach?.id })
    return false
  }

  const achKey = ach?.slug || ach?.id
  // console.log('[achievements] evaluate: start', { userId, ach: achKey })

  // Points
  if (ach.pointsGte != null) {
    const up = await db.userPoints.findUnique({ where: { userId } })
    const pts = up?.points || 0
    if (pts < ach.pointsGte) {
      // console.log('[achievements] evaluate: fail points', { userId, ach: achKey, have: pts, need: ach.pointsGte })
      return false
    }
    // console.log('[achievements] evaluate: pass points', { userId, ach: achKey, have: pts, need: ach.pointsGte })
  }

  // Total cToons (exclude burned)
  if (ach.totalCtoonsGte != null) {
    const total = await db.userCtoon.count({ where: { userId, burnedAt: null } })
    if (total < ach.totalCtoonsGte) {
      // console.log('[achievements] evaluate: fail totalCtoons', { userId, ach: achKey, have: total, need: ach.totalCtoonsGte })
      return false
    }
    // console.log('[achievements] evaluate: pass totalCtoons', { userId, ach: achKey, have: total, need: ach.totalCtoonsGte })
  }

  // Unique cToons (exclude burned)
  if (ach.uniqueCtoonsGte != null) {
    const uniq = await db.userCtoon.findMany({
      where: { userId, burnedAt: null },
      distinct: ['ctoonId'],
      select: { ctoonId: true }
    })
    if (uniq.length < ach.uniqueCtoonsGte) {
      // console.log('[achievements] evaluate: fail uniqueCtoons', { userId, ach: achKey, have: uniq.length, need: ach.uniqueCtoonsGte })
      return false
    }
    // console.log('[achievements] evaluate: pass uniqueCtoons', { userId, ach: achKey, have: uniq.length, need: ach.uniqueCtoonsGte })
  }

  // Auctions won (closed with winner)
  if (ach.auctionsWonGte != null) {
    const won = await db.auction.count({
      where: { winnerId: userId, status: 'CLOSED' }
    })
    if (won < ach.auctionsWonGte) return false
  }

  // Auctions created (closed with winner)
  if (ach.auctionsCreatedGte != null) {
    const created = await db.auction.count({
      where: { creatorId: userId, status: 'CLOSED', winnerId: { not: null } }
    })
    if (created < ach.auctionsCreatedGte) return false
  }

  // Accepted trades (initiator or recipient)
  if (ach.tradesAcceptedGte != null) {
    const trades = await db.tradeOffer.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ initiatorId: userId }, { recipientId: userId }]
      }
    })
    if (trades < ach.tradesAcceptedGte) return false
  }

  // Accepted cToon suggestions
  if (ach.ctoonSuggestionsAcceptedGte != null) {
    const accepted = await db.ctoonUserSuggestion.count({
      where: { userId, status: 'ACCEPTED' }
    })
    if (accepted < ach.ctoonSuggestionsAcceptedGte) return false
  }

  // TKO round wins (counted rounds only)
  if (ach.tkoWinsGte != null) {
    const wins = await db.tkoRound.count({
      where: { winnerUserId: userId, counted: true }
    })
    if (wins < ach.tkoWinsGte) return false
  }

  // Wordle crown wins (total lifetime)
  if (ach.wordleWinsGte != null) {
    const wins = await getWordleWinCount(db, userId)
    if (wins < ach.wordleWinsGte) return false
  }

  // Wordle current consecutive crown streak
  if (ach.wordleCurrentStreakGte != null) {
    const streak = await getWordleCurrentStreak(db, userId)
    if (streak < ach.wordleCurrentStreakGte) return false
  }

  // Best Flappy Powerpuff score. Only ranked runs ever write a score row, so unlimited
  // free play cannot farm this.
  if (ach.flappyBestScoreGte != null) {
    const best = await db.flappyPowerpuffScore.aggregate({
      where: { userId },
      _max: { score: true }
    })
    if ((best._max.score ?? 0) < ach.flappyBestScoreGte) return false
  }

  // Points contributed to the user's CURRENT cMoon. Only meaningful paired with
  // cMoonRankId (below) — evaluated on its own it would just be "any cMoon member with
  // enough contribution," which isn't a real use case in the admin UI.
  if (ach.cMoonPointsGte != null) {
    if ((user.cMoonPoints || 0) < ach.cMoonPointsGte) return false
  }

  // cMoon rank reward: this achievement only applies to members of the specific cMoon that
  // rank belongs to (unlike every other criterion above, which is evaluated the same way
  // regardless of the user's faction).
  if (ach.cMoonRankId) {
    if (!ach.cMoonRank || user.cMoonId !== ach.cMoonRank.cMoonId) return false
  }

  // Cumulative active days based on activity logs
  if (ach.cumulativeActiveDaysGte != null) {
    const ok = await hasCumulativeActivityDays(db, userId, ach.cumulativeActiveDaysGte)
    if (!ok) return false
  }

  // User created before a given date
  if (ach.userCreatedBefore) {
    const cutoff = new Date(ach.userCreatedBefore)
    const created = user.createdAt ? new Date(user.createdAt) : null
    if (!created || !(created < cutoff)) {
      // console.log('[achievements] evaluate: fail createdBefore', { userId, ach: achKey, userCreatedAt: created?.toISOString?.(), cutoff: cutoff.toISOString() })
      return false
    }
    // console.log('[achievements] evaluate: pass createdBefore', { userId, ach: achKey, userCreatedAt: created.toISOString(), cutoff: cutoff.toISOString() })
  }

  // Required cToon ownership (must own at least one non-burned copy of each)
  const reqCtoons = Array.isArray(ach.requiredCtoons) ? ach.requiredCtoons : []
  for (const rc of reqCtoons) {
    const owned = await db.userCtoon.findFirst({ where: { userId, ctoonId: rc.ctoonId, burnedAt: null } })
    if (!owned) return false
  }

  // Set completion (AND across all sets)
  const setsReq = Array.isArray(ach.setsRequired) ? ach.setsRequired.filter(Boolean) : []
  for (const setName of setsReq) {
    const setCtoons = await db.ctoon.findMany({ where: { set: setName }, select: { id: true } })
    const setIds = setCtoons.map(c => c.id)
    if (setIds.length === 0) {
      // console.log('[achievements] evaluate: fail set empty', { userId, ach: achKey, set: setName })
      return false
    }
    const ownedDistinct = await db.userCtoon.findMany({
      where: { userId, burnedAt: null, ctoonId: { in: setIds } },
      distinct: ['ctoonId'],
      select: { ctoonId: true }
    })
    if (ownedDistinct.length < setIds.length) {
      // console.log('[achievements] evaluate: fail set missing', { userId, ach: achKey, set: setName, have: ownedDistinct.length, need: setIds.length })
      return false
    }
    // console.log('[achievements] evaluate: pass set', { userId, ach: achKey, set: setName })
  }

  // console.log('[achievements] evaluate: success', { userId, ach: achKey })
  return true
}

async function getOrCreateUserPoints(tx, userId) {
  const up = await tx.userPoints.findUnique({ where: { userId } })
  if (up) return up
  return await tx.userPoints.create({ data: { userId, points: 0 } })
}

// Grants a reward bundle (points + backgrounds + avatars + a cMoon cZone border, transactionally)
// to a user. Shared by the auto-grant path (awardAchievementToUser), the claim-your-prize path
// (claimAchievementReward), and cMoon affinity level-ups (server/api/cmoon/[id]/contribute.post.js)
// so all three grant exactly the same way — one reward-granting path rather than a parallel one
// per feature. cToon mint jobs are NOT enqueued here — mintQueue.add isn't rollback-safe, so the
// caller must only enqueue the returned `ctoonJobs` after its transaction has committed (see
// enqueueCtoonJobs).
export async function grantRewardInTx(tx, userId, reward, method) {
  const summary = { points: 0, backgrounds: 0, avatars: 0, border: false, ctoonJobs: [] }
  if (!reward) return summary

  // Points
  const points = toIntOrNull(reward.points)
  if (points && points > 0) {
    await getOrCreateUserPoints(tx, userId)
    const updated = await tx.userPoints.update({ where: { userId }, data: { points: { increment: points } } })
    await tx.pointsLog.create({ data: { userId, points, total: updated.points, method, direction: 'increase' } })
    summary.points = points
  }

  // Backgrounds
  const bgIds = [...new Set((reward.backgrounds || []).map(b => b.backgroundId))]
  if (bgIds.length) {
    const existing = await tx.userBackground.findMany({
      where: { userId, backgroundId: { in: bgIds } },
      select: { backgroundId: true }
    })
    const existingSet = new Set(existing.map(b => b.backgroundId))
    const newBgIds = bgIds.filter(id => !existingSet.has(id))
    summary.backgrounds = newBgIds.length
    if (newBgIds.length) {
      await tx.userBackground.createMany({
        data: newBgIds.map(backgroundId => ({ userId, backgroundId, source: method })),
        skipDuplicates: true
      })
    }
  }

  // Avatars — same shape as backgrounds above, against the restricted Avatar catalog.
  const avatarIds = [...new Set((reward.avatars || []).map(a => a.avatarId))]
  if (avatarIds.length) {
    const existing = await tx.userAvatar.findMany({
      where: { userId, avatarId: { in: avatarIds } },
      select: { avatarId: true }
    })
    const existingSet = new Set(existing.map(a => a.avatarId))
    const newAvatarIds = avatarIds.filter(id => !existingSet.has(id))
    summary.avatars = newAvatarIds.length
    if (newAvatarIds.length) {
      await tx.userAvatar.createMany({
        data: newAvatarIds.map(avatarId => ({ userId, avatarId, source: method })),
        skipDuplicates: true
      })
    }
  }

  // cMoon border — idempotent grant of a persistent cZone border for one cMoon (upsert rather
  // than create+catch, since re-granting an already-owned border must be a silent no-op, not an
  // error).
  if (reward.borderCMoonId) {
    await tx.userCMoonBorder.upsert({
      where: { userId_cMoonId: { userId, cMoonId: reward.borderCMoonId } },
      create: { userId, cMoonId: reward.borderCMoonId },
      update: {}
    })
    summary.border = true
  }

  // cToons — resolve how many of each can actually be granted (supply-capped), but leave
  // enqueueing the mint jobs to the caller, post-commit.
  for (const rc of (reward.ctoons || [])) {
    const qty = Math.max(1, Number(rc.quantity || 1))
    const minted = await tx.userCtoon.count({ where: { ctoonId: rc.ctoonId } })
    const lim = rc?.ctoon?.quantity
    const canGive = lim == null ? qty : Math.max(0, Math.min(qty, lim - minted))
    if (canGive > 0) {
      summary.ctoonJobs.push({ ctoonId: rc.ctoonId, quantity: canGive, name: rc?.ctoon?.name || rc.ctoonId })
    }
  }

  return summary
}

// Enqueues the mint jobs returned by grantRewardInTx, once the caller's transaction has
// safely committed. Returns the same `{ name, quantity }[]` shape the old inline logic did.
async function enqueueCtoonJobs(userId, ctoonJobs, method) {
  const granted = []
  for (const job of ctoonJobs) {
    for (let i = 0; i < job.quantity; i++) {
      await mintQueue.add('mintCtoon', { userId, ctoonId: job.ctoonId, isSpecial: true, method })
    }
    granted.push({ name: job.name, quantity: job.quantity })
  }
  return granted
}

// Grants a cMoon rank if it outranks the user's current rank for that same cMoon. Locks the
// user row (FOR UPDATE) so two concurrent rank-ups for the same user can't both read a stale
// "current rank" and race. Returns { id, name } if a new rank was granted, else null (no
// rank achieved yet — the user's already at/above it, or they've since left that cMoon).
async function grantCMoonRank(tx, userId, cMoonRankId) {
  const newRank = await tx.cMoonRank.findUnique({
    where: { id: cMoonRankId },
    select: { id: true, name: true, sortOrder: true, cMoonId: true }
  })
  if (!newRank) return null

  const [locked] = await tx.$queryRaw`
    SELECT "cMoonId", "currentCMoonRankId" FROM "User" WHERE id = ${userId} FOR UPDATE
  `
  if (!locked || locked.cMoonId !== newRank.cMoonId) return null

  let currentSortOrder = -Infinity
  if (locked.currentCMoonRankId) {
    const current = await tx.cMoonRank.findUnique({ where: { id: locked.currentCMoonRankId }, select: { sortOrder: true } })
    currentSortOrder = current?.sortOrder ?? -Infinity
  }
  if (newRank.sortOrder <= currentSortOrder) return null

  // Reset the role-grant cursor so syncCMoonDiscordRoles picks up and grants the NEW rank's
  // Discord role too — it's add-only, so the previous rank's role (if any) is left in place.
  await tx.user.update({ where: { id: userId }, data: { currentCMoonRankId: newRank.id, cMoonRankRoleGrantedAt: null } })
  return { id: newRank.id, name: newRank.name }
}

export async function awardAchievementToUser(client, userId, achievement) {
  const db = client || prisma

  const txResult = await db.$transaction(async (tx) => {
    // Create marker (will throw on duplicate due to unique)
    await tx.achievementUser.create({ data: { achievementId: achievement.id, userId } })

    // Rank grant is independent of isClaimable/rewards below — a rank-up achievement is
    // never claimable (enforced at save time) and may carry no `AchievementReward` row at all.
    const cMoonRank = achievement.cMoonRankId
      ? await grantCMoonRank(tx, userId, achievement.cMoonRankId)
      : null

    // Claimable achievements don't auto-grant a reward — the user picks one of
    // up to 4 options via POST /api/achievements/:id/claim instead.
    if (achievement.isClaimable) {
      return { points: 0, backgrounds: 0, ctoonJobs: [], cMoonRank }
    }

    // Excludes reward rows owned by a claim option (belt-and-suspenders: isClaimable=false
    // achievements shouldn't have any, but this keeps the two reward tracks unambiguous).
    const reward = await tx.achievementReward.findFirst({
      where: { achievementId: achievement.id, claimOption: null },
      include: {
        ctoons:      { select: { ctoonId: true, quantity: true, ctoon: { select: { quantity: true, name: true } } } },
        backgrounds: { select: { backgroundId: true } },
      }
    })

    const granted = await grantRewardInTx(tx, userId, reward, `achievement:${achievement.slug}`)
    return { ...granted, cMoonRank }
  })

  const ctoons = await enqueueCtoonJobs(userId, txResult.ctoonJobs, 'ACHIEVEMENT')
  const awardSummary = { points: txResult.points, ctoons, backgrounds: txResult.backgrounds, cMoonRank: txResult.cMoonRank }

  // Non-transactional side-effects. cMoon-rank Discord roles are deliberately NOT granted
  // here — they go through the nightly syncCMoonDiscordRoles reconciliation cron instead,
  // the same add-only convention the base cMoon role already uses (see server/utils/discord.js
  // and server/cron/sync-guild-members.js), so this stays the achievement-role convention
  // (assign by name, synchronously) without also inventing a second synchronous, snowflake-
  // based grant path here.
  let assignedRoleName = null
  if (achievement?.discordRoleName) {
    try {
      assignedRoleName = await assignDiscordRoleByName(db, userId, achievement.discordRoleName)
    } catch {}
  }

  if (achievement?.notifyDiscord) {
    try {
      await announceAchievement(db, userId, achievement.title, awardSummary, assignedRoleName)
    } catch {}
  }
}

export async function processAchievementsForUser(userId) {
  // Only process active + non-banned users
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true, banned: true } })
  if (!user) {
    // console.log('[achievements] process: skip no user', { userId })
    return { awarded: 0 }
  }
  if (!user.active || user.banned) {
    // console.log('[achievements] process: skip inactive/banned', { userId, active: user.active, banned: user.banned })
    return { awarded: 0 }
  }

  if (!cachedAchievements || Date.now() - cachedAchievementsTime > ACHIEVEMENTS_TTL_MS) {
    cachedAchievements     = await prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        requiredCtoons: { select: { ctoonId: true } },
        cMoonRank:      { select: { id: true, cMoonId: true, sortOrder: true } },
      }
    })
    cachedAchievementsTime = Date.now()
  }
  const achievements = cachedAchievements

  let awarded = 0
  for (const ach of achievements) {
    // Skip if already achieved
    const has = await prisma.achievementUser.findUnique({ where: { achievementId_userId: { achievementId: ach.id, userId } } })
    if (has) {
      // console.log('[achievements] process: skip already has', { userId, ach: ach.slug })
      continue
    }

    const ok = await evaluateUserAgainstAchievement(prisma, userId, ach)
    if (!ok) {
      // console.log('[achievements] process: not eligible', { userId, ach: ach.slug })
      continue
    }

    try {
      await awardAchievementToUser(prisma, userId, ach)
      awarded++
    } catch (err) {
      // uniqueness or other issue — skip; continue others
      // console.log('[achievements] process: award failed', { userId, ach: ach.slug, error: err?.message })
    }
  }

  // console.log('[achievements] process: complete', { userId, awarded })
  return { awarded }
}

export class AchievementClaimError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// User picks exactly one of an achievement's claim options. The unique
// constraint on AchievementClaim(achievementId, userId) is the atomic guard
// against double-claiming (concurrent double-submit both racing to insert —
// the second insert throws P2002 and is treated as ALREADY_CLAIMED here).
export async function claimAchievementReward(userId, achievementId, optionId) {
  const achieved = await prisma.achievementUser.findUnique({
    where: { achievementId_userId: { achievementId, userId } },
  })
  if (!achieved) throw new AchievementClaimError('NOT_UNLOCKED')

  const ach = await prisma.achievement.findUnique({ where: { id: achievementId }, select: { isClaimable: true } })
  if (!ach?.isClaimable) throw new AchievementClaimError('NOT_CLAIMABLE')

  const option = await prisma.achievementClaimOption.findUnique({
    where: { id: optionId },
    include: {
      reward: {
        include: {
          ctoons:      { select: { ctoonId: true, quantity: true, ctoon: { select: { quantity: true, name: true } } } },
          backgrounds: { select: { backgroundId: true } },
        }
      }
    },
  })
  // Load-bearing anti-abuse check: without this a user could unlock a cheap achievement and
  // then claim an option that belongs to a different, more valuable achievement's option list.
  if (!option || option.achievementId !== achievementId) throw new AchievementClaimError('INVALID_OPTION')

  let txResult
  try {
    txResult = await prisma.$transaction(async (tx) => {
      await tx.achievementClaim.create({ data: { achievementId, userId, optionId } })
      return grantRewardInTx(tx, userId, option.reward, `achievementClaim:${achievementId}`)
    })
  } catch (err) {
    if (err?.code === 'P2002') throw new AchievementClaimError('ALREADY_CLAIMED')
    throw err
  }

  // Minting is not transactional (queue add can't roll back), so it runs after
  // the claim row has safely committed — same pattern as awardAchievementToUser.
  const ctoons = await enqueueCtoonJobs(userId, txResult.ctoonJobs, 'ACHIEVEMENT_CLAIM')

  // Read-only and unrelated to the reward grant, so it stays outside the transaction above.
  // Scoped strictly to this same `userId` — never client-suppliable — so a claim can only ever
  // surface the caller's own cMoon effect, never another user's.
  const claimant = await prisma.user.findUnique({ where: { id: userId }, select: { cMoon: { select: { effectType: true } } } })
  const cMoonEffectType = claimant?.cMoon?.effectType || null

  return { label: option.label, points: option.reward.points, ctoons, backgrounds: txResult.backgrounds, cMoonEffectType }
}
