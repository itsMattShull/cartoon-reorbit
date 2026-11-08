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
import { sumBattleUpgradeStatTotals } from './cmoonBattleUpgradeValidation.js'
// Pure helpers (bounds, error codes, findNextPrestigeLevel) live in their own import-free module
// so they can be unit-tested directly without pulling in Prisma — see that file's own header
// comment. Re-exported here so every existing call site can keep importing from this file.
export {
  PRESTIGE_LEVEL_MIN, PRESTIGE_LEVEL_MAX, PRESTIGE_THRESHOLD_MAX,
  CMOON_PRESTIGE_ERRORS, CMoonPrestigeError, findNextPrestigeLevel, parsePrestigeLevelBody,
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
    select: {
      id: true, cMoonId: true, cMoonPoints: true, prestigeLevel: true, banned: true,
      // The SECOND, prestige-exclusive rank ladder (see CMoonPrestigeRankTier's own schema
      // comment) — distinct from prestigeLevel/nextLevel above, which is purely "how many times
      // has this player prestiged." Only ever non-null while actually a member of a prestige
      // cMoon (currentCMoonPrestigeRankId is reset to null on every cMoon move — see
      // reassignUserCMoon).
      currentCMoonPrestigeRank: { select: { tier: { select: { name: true } } } },
    },
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
    currentPrestigeRankName: user.currentCMoonPrestigeRank?.tier?.name || null,
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
// performs the move via reassignUserCMoon, bumps prestigeLevel, writes one CMoonPrestigeLog row,
// and — ONLY the first time this player ever prestiges into this specific cMoon — grants its
// prize cToons (same "a voluntary team join earns its welcome prizes" stance selectCMoonForUser
// already takes — reassignUserCMoon itself never grants prizes, since every OTHER caller of it
// is an admin-driven move, not a player's own choice). The first-visit gate stops a player from
// farming duplicates by repeatedly hopping back and forth between the same two prestige cMoons.
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

  // Battle upgrades bought from the cMart's "Upgrades" tab (CMoonBattleUpgrade) are the ONE part
  // of cMoonHpAdjustment/cMoonStaminaAdjustment that prestige resets; a manual grant from the
  // separate "Manage User HP & Stamina" admin tool is untouched either way, since it was never
  // tracked here. Reads each purchase row's own grantedTotal (see that column's own schema
  // comment) — NOT the upgrade's current amount, which may have been edited since any of these
  // purchases happened.
  //
  // Bumped together with the prestige level/log/upgrade-row-delete below so a failure can never
  // leave one without the other (e.g. a level bump with no log row to show for it, invisible to
  // support trying to reconcile a discrepancy). Deliberately NOT caught/swallowed: reassignUserCMoon
  // above already committed its own move (points reset, new cMoon), so a failure here would
  // otherwise let this function return a false "success" — prizes granted, a prestigeLevel the
  // response claims but never actually wrote — instead of surfacing the real error. A player who
  // hits this rare failure is left moved-but-not-leveled-up, the same gap every other
  // reassignUserCMoon caller already accepts (its own transaction boundary is separate from
  // callers' follow-up work); worth a support look if it ever shows up in the server logs, not a
  // silent false-positive to the player.
  //
  // The battleUpgradePurchases read happens INSIDE this same transaction, as a SELECT ... FOR
  // UPDATE, immediately before the decrement and delete that depend on it — not as a plain
  // pre-transaction query (an ordinary SELECT never blocks on another transaction's uncommitted
  // write under Postgres's default READ COMMITTED isolation, so that only narrowed the race
  // window rather than closing it). FOR UPDATE takes a row lock, so a purchase
  // (cmoonBattleUpgradeOps.js's own INSERT ... ON CONFLICT DO UPDATE) still in flight when this
  // transaction reaches here makes this SELECT block until that purchase commits or rolls back —
  // guaranteeing the totals below are computed from the row's truly-latest committed state, never
  // a snapshot that a concurrent purchase is about to invalidate out from under the delete further
  // down.
  const [, prestigeLog] = await prisma.$transaction(async tx => {
    const battleUpgradePurchases = await tx.$queryRaw`
      SELECT u."grantedTotal" AS "grantedTotal", c.stat AS stat
      FROM "UserCMoonBattleUpgrade" u
      JOIN "CMoonBattleUpgrade" c ON c.id = u."upgradeId"
      WHERE u."userId" = ${userId}
      FOR UPDATE OF u
    `
    const { hpTotal, staminaTotal } = sumBattleUpgradeStatTotals(battleUpgradePurchases)

    const userUpdate = await tx.user.update({
      where: { id: userId },
      data: {
        prestigeLevel: newLevel, lastPrestigedAt: new Date(),
        // Subtracts back out exactly what the purchases above granted — never a flat reset to 0,
        // since that would also wipe out any UNRELATED manual adjustment from the "Manage User
        // HP & Stamina" admin tool, which this reset must never touch (see this function's own
        // comment above).
        ...(hpTotal ? { cMoonHpAdjustment: { decrement: hpTotal } } : {}),
        ...(staminaTotal ? { cMoonStaminaAdjustment: { decrement: staminaTotal } } : {}),
      },
    })
    const log = await tx.cMoonPrestigeLog.create({
      data: {
        userId,
        fromCMoonId: fromCMoon?.id || null,
        fromCMoonName: fromCMoon?.name || null,
        toCMoonId: toCMoon.id,
        toCMoonName: toCMoon.name,
        level: newLevel,
        pointsAtPrestige,
      },
    })
    // Removing (not zeroing) these rows is what lets the player buy back up to each upgrade's
    // own purchaseLimit again — see UserCMoonBattleUpgrade's own schema comment.
    await tx.userCMoonBattleUpgrade.deleteMany({ where: { userId } })
    return [userUpdate, log]
  })

  // Only a player's FIRST time ever prestiging into this specific cMoon earns its join prizes —
  // without this, a player could grind back and forth between just two prestige cMoons forever,
  // re-collecting the same fixed prize set on every hop (prestige levels only ever increase, so
  // nothing stops a return visit at a higher level). Mirrors the "only a genuine first-time
  // self-select may grant a prize" invariant selectCMoonForUser's own callers already enforce
  // (see tests/cmoonBalanceNoPrizeGrant.test.js) — this is prestige's equivalent check, scoped to
  // "have I ever prestiged INTO this cMoon before," since reassignUserCMoon (unlike
  // selectCMoonForUser) never grants prizes on its own.
  const priorVisit = await prisma.cMoonPrestigeLog.findFirst({
    where: { userId, toCMoonId: toCMoon.id, id: { not: prestigeLog.id } },
    select: { id: true },
  })

  // Mint jobs are not transactional (same reasoning selectCMoonForUser's own call documents) —
  // run after every DB write above has safely committed.
  const prizes = priorVisit ? [] : await grantCMoonPrizes(userId, toCMoon.id)

  return {
    cMoonId: toCMoon.id,
    cMoonName: toCMoon.name,
    prestigeLevel: newLevel,
    prestigeLevelTitle: nextLevel.title || null,
    prizes,
    discordRoleSynced: moveResult.discordRoleSynced,
  }
}
