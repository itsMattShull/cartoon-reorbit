// server/utils/cmoonPrestige.js
//
// cMoon Prestige: once a player's current cMoonPoints reach the admin-configured threshold for
// their NEXT prestige level (see CMoonPrestigeLevel), they can elect to reset their cMoonPoints
// to 0 and move into an admin-designated "prestige" cMoon (CMoon.isPrestigeCMoon), permanently
// bumping User.prestigeLevel. It's deliberately built as a thin wrapper around
// reassignUserCMoon (server/utils/cmoon.js) — the same shared "move a user between cMoons"
// path every other team-change feature (admin reassign, captain auto-align, Balance Teams,
// accepted CMoonChangeRequest) already uses — rather than a parallel implementation, so
// prestiging gets the exact same cMoonPoints reset, rank-reset (which is what actually resets
// cMoon Enemy Battle max HP — see getPlayerCombatMaxHp in cmoon.js, which derives it live from
// currentCMoonRank rather than storing it), Discord role sync, and memberCount bookkeeping for
// free, with zero risk of silently drifting from how every other cMoon move behaves.
//
// Unlike CMoonChangeRequest (admin-approval required), prestiging is immediate and entirely
// player-driven — the player already earned the right to do it by hitting the point threshold,
// there is nothing for an admin to approve.
//
// "Keep all rewards and previous achievements" needs no special handling here: achievements/
// claims are keyed to the user, never the cMoon, and claimAchievementReward's own cMoon-hop
// guard (server/utils/achievements.js) already treats every cMoon move identically regardless
// of cause — prestiging is simply another hop through the same guard.
import { prisma } from '../prisma.js'
import { getGlobalConfig, reassignUserCMoon, grantCMoonPrizes } from './cmoon.js'
// Pure helpers (bounds, error codes, findNextPrestigeLevel) live in their own import-free module
// so they can be unit-tested directly without pulling in Prisma — see that file's own header
// comment. Re-exported here so every existing call site can keep importing from this file.
export {
  PRESTIGE_LEVEL_MIN, PRESTIGE_LEVEL_MAX, PRESTIGE_THRESHOLD_MAX,
  CMOON_PRESTIGE_ERRORS, CMoonPrestigeError, findNextPrestigeLevel,
} from './cmoonPrestigeLevels.js'
import { findNextPrestigeLevel, CMoonPrestigeError, CMOON_PRESTIGE_ERRORS } from './cmoonPrestigeLevels.js'

// Read-only — never mutates anything, safe to call on every Settings-page load. Returns the full
// picture the client needs to render the Prestige section: whether the feature is on at all,
// the player's current level, the next level's requirement (or null if unconfigured), how many
// more points are needed (0 if already eligible), eligibility itself, why they're blocked if they
// are, and the list of cMoons they could actually prestige into right now.
export async function getPrestigeStatus(userId) {
  const config = await getGlobalConfig()
  if (!config?.cMoonPrestigeEnabled) {
    return { enabled: false }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, cMoonId: true, cMoonPoints: true, prestigeLevel: true, banned: true },
  })
  if (!user) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.NOT_FOUND)

  const levels = await prisma.cMoonPrestigeLevel.findMany({ orderBy: { level: 'asc' } })
  const nextLevel = findNextPrestigeLevel(levels, user.prestigeLevel)

  const base = {
    enabled: true,
    currentLevel: user.prestigeLevel,
    nextLevel: nextLevel ? nextLevel.level : null,
    nextLevelTitle: nextLevel?.title || null,
    pointThreshold: nextLevel ? nextLevel.pointThreshold : null,
    currentPoints: user.cMoonPoints,
  }

  if (!user.cMoonId) return { ...base, eligible: false, blockedReason: 'NO_CMOON', prestigeCMoons: [] }
  if (!nextLevel) return { ...base, eligible: false, blockedReason: 'NO_LEVEL_CONFIGURED', prestigeCMoons: [] }
  if (user.cMoonPoints < nextLevel.pointThreshold) {
    return { ...base, eligible: false, blockedReason: 'BELOW_THRESHOLD', prestigeCMoons: [] }
  }

  const [activeBattle, activeRaidParticipant] = await Promise.all([
    prisma.cMoonEnemyBattle.findUnique({ where: { activeUserId: userId } }),
    prisma.cMoonEnemyRaidParticipant.findUnique({ where: { activeUserId: userId } }),
  ])
  if (activeBattle) return { ...base, eligible: false, blockedReason: 'ACTIVE_BATTLE', prestigeCMoons: [] }
  if (activeRaidParticipant) return { ...base, eligible: false, blockedReason: 'ACTIVE_RAID', prestigeCMoons: [] }

  // Same field selection as the public /api/cmoons list (server/api/cmoons.get.js) — exactly
  // what the client's cmoonJoinEffectDescriptor() needs to play the destination's own full-screen
  // join effect, nothing more. Excludes the player's own current cMoon (even if it happens to be
  // isPrestigeCMoon) and anything joinLocked — prestige respects joinLocked exactly like a normal
  // join, never a bypass (see CMoon.isPrestigeCMoon's own schema comment).
  const prestigeCMoons = await prisma.cMoon.findMany({
    where: { isPrestigeCMoon: true, joinLocked: false, id: { not: user.cMoonId } },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, color: true, avatarPath: true, memberCount: true,
      effectType: true,
      customJoinEffect: { select: { backgroundColor: true, vignette: true, imagePath: true, text: true, textColor: true, textPosition: true } },
    },
  })

  return { ...base, eligible: true, blockedReason: null, prestigeCMoons }
}

// The mutating action. Re-validates everything from getPrestigeStatus server-side (never trusts
// a client that already saw eligible:true moments ago) plus the chosen destination itself, then
// performs the move via reassignUserCMoon, bumps prestigeLevel, grants the destination's prize
// cToons (same "a voluntary team join earns its welcome prizes" stance selectCMoonForUser
// already takes — reassignUserCMoon itself never grants prizes, since every OTHER caller of it
// is an admin-driven move, not a player's own choice), and writes one CMoonPrestigeLog row.
export async function prestigeUser(userId, newCMoonId) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonPrestigeEnabled) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.DISABLED)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, cMoonId: true, cMoonPoints: true, prestigeLevel: true },
  })
  if (!user) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.NOT_FOUND)
  if (!user.cMoonId) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.NO_CMOON)
  if (user.cMoonId === newCMoonId) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.SAME_CMOON)

  const levels = await prisma.cMoonPrestigeLevel.findMany({ orderBy: { level: 'asc' } })
  const nextLevel = findNextPrestigeLevel(levels, user.prestigeLevel)
  if (!nextLevel) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.NO_LEVEL_CONFIGURED)
  if (user.cMoonPoints < nextLevel.pointThreshold) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.BELOW_THRESHOLD)

  const [activeBattle, activeRaidParticipant] = await Promise.all([
    prisma.cMoonEnemyBattle.findUnique({ where: { activeUserId: userId } }),
    prisma.cMoonEnemyRaidParticipant.findUnique({ where: { activeUserId: userId } }),
  ])
  if (activeBattle) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.ACTIVE_BATTLE)
  if (activeRaidParticipant) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.ACTIVE_RAID)

  const [fromCMoon, toCMoon] = await Promise.all([
    prisma.cMoon.findUnique({ where: { id: user.cMoonId }, select: { id: true, name: true } }),
    prisma.cMoon.findUnique({ where: { id: newCMoonId }, select: { id: true, name: true, isPrestigeCMoon: true, joinLocked: true } }),
  ])
  if (!toCMoon) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.TARGET_NOT_FOUND)
  if (!toCMoon.isPrestigeCMoon) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.NOT_PRESTIGE_CMOON)
  if (toCMoon.joinLocked) throw new CMoonPrestigeError(CMOON_PRESTIGE_ERRORS.LOCKED)

  const pointsAtPrestige = user.cMoonPoints
  const newLevel = nextLevel.level

  // reassignUserCMoon's own `updateMany({ where: { cMoonId: target.cMoonId } })` concurrency gate
  // (see its own comment) already makes this safe against a second concurrent mover — if this
  // user's cMoonId changed between the read above and here, that call throws STALE_STATE and
  // nothing below it (the level bump, the log row) ever runs.
  const moveResult = await reassignUserCMoon(userId, newCMoonId)

  await prisma.user.update({
    where: { id: userId },
    data: { prestigeLevel: newLevel, lastPrestigedAt: new Date() },
  })

  await prisma.cMoonPrestigeLog.create({
    data: {
      userId,
      fromCMoonId: fromCMoon?.id || null,
      fromCMoonName: fromCMoon?.name || null,
      toCMoonId: toCMoon.id,
      toCMoonName: toCMoon.name,
      level: newLevel,
      pointsAtPrestige,
    },
  }).catch((e) => console.error('[cmoonPrestige] CMoonPrestigeLog write failed:', e?.message || e))

  // Mint jobs are not transactional (same reasoning selectCMoonForUser's own call documents) —
  // run after every DB write above has safely committed.
  const prizes = await grantCMoonPrizes(userId, toCMoon.id)

  return {
    cMoonId: toCMoon.id,
    cMoonName: toCMoon.name,
    prestigeLevel: newLevel,
    prestigeLevelTitle: nextLevel.title || null,
    prizes,
    discordRoleSynced: moveResult.discordRoleSynced,
  }
}
