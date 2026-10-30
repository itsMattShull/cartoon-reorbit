// server/api/cmoon/battle/consider.post.js
// Called on ordinary page navigation (see layouts/newsite-template.vue) to maybe show the cMoon
// Enemy Battles popup — same chance-roll + cooldown shape as server/api/scavenger/consider.post.js,
// but with no natural "trigger action" to hang off of, so this fires on navigation instead.
// Never creates a CMoonEnemyBattle row itself — that only happens once the player actually
// chooses to fight (see start.post.js). Offered to every eligible user regardless of cMoon
// membership — a non-member can still win cToon/avatar/background/points prizes and progress
// achievements, just never earns cMoon points (see resolveWin in action.post.js). `inCMoon` tells
// the client whether to show the "earns cMoon points" line at all.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { serializeEnemyForClient, serializeBattleForClient, SPECIAL_ATTACK_SELECT } from '@/server/utils/cmoonEnemyBattle'
import { checkRaidBossAvailability } from '@/server/utils/cmoonEnemyRaid'
import { filterToHighestRank, pickWeightedEnemy, filterCappedNonRaidCandidates, countRecentSoloStarts } from '@/server/utils/cmoonEnemy'
import { pingFinalBossAppeared } from '@/server/utils/cmoonDiscordEvents'
import { logEnemyOffer } from '@/server/utils/cmoonEnemyAnalytics'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { cMoonId: true, banned: true, active: true, lastCMoonBattlePopupAt: true, allowCMoonEnemyPopups: true },
  })
  if (!user || user.banned || !user.active) return { offered: false }

  // Resume an already-in-progress battle (e.g. the player navigated away mid-fight) rather than
  // rolling for a new one — the activeUserId sentinel/unique constraint guarantees at most one.
  const inProgress = await db.cMoonEnemyBattle.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
    include: {
      enemyMember: {
        include: {
          faction: { include: { appearEffect: true, specialAttack: true, taunts: { where: { active: true }, orderBy: { sortOrder: 'asc' } } } },
          taunts: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
      cMoon: { include: { specialAttack: true } },
      user: { select: { chosenSpecialAttack: { select: SPECIAL_ATTACK_SELECT } } },
    },
  })
  if (inProgress) {
    return { offered: true, resumed: true, battle: serializeBattleForClient(inProgress), inCMoon: !!user.cMoonId }
  }
  // A raid boss (server/utils/cmoonRaidSocket.js) is socket-driven, not tracked here — if the
  // player already has an active raid participation, they'd get its own notification/created
  // event to return to, so this popup should stay quiet rather than rolling a second, unrelated
  // encounter on top of it.
  const activeRaid = await db.cMoonEnemyRaidParticipant.findFirst({ where: { userId, activeUserId: userId }, select: { id: true } })
  if (activeRaid) return { offered: false }

  // Full per-player opt-out (Settings page) — unlike the spawn cap below (which only narrows the
  // pool to raid bosses), this blocks the popup outright, solo and raid offers alike: a player who
  // asked to stop being shown it shouldn't still get raid-boss interruptions.
  if (!user.allowCMoonEnemyPopups) return { offered: false }

  const config = await getGlobalConfig()
  // Master switch, off by default — checked before the chance roll (and before even querying
  // enemy candidates below) so a disabled feature is fully inert, not just "never rolls." A
  // battle already IN_PROGRESS when this is flipped off still resumes above rather than being
  // stranded — this only gates offering NEW encounters.
  if (!config?.cMoonEnemyBattlesEnabled) return { offered: false }

  const chancePercent = config?.cMoonBattlePopupChancePercent ?? 0
  if (chancePercent <= 0) return { offered: false }

  const cooldownMinutes = config?.cMoonBattlePopupCooldownMinutes ?? 0
  if (cooldownMinutes > 0 && user.lastCMoonBattlePopupAt) {
    const nextAllowed = new Date(user.lastCMoonBattlePopupAt.getTime() + cooldownMinutes * 60 * 1000)
    if (nextAllowed > new Date()) return { offered: false }
  }

  if (Math.random() * 100 >= chancePercent) return { offered: false }

  // This player's own lifetime win count — gates minPriorDefeats below (see that column's own
  // schema comment). Only queried once the chance roll above already passed, since that roll
  // fails far more often than not (default 3%) and this query would otherwise run on every
  // navigation for nothing.
  const personalWinCount = await db.cMoonEnemyBattle.count({ where: { userId, outcome: 'WIN' } })

  // Pick one random active, undefeated, unlocked-for-this-player enemy member (any faction).
  // Excludes SHARED_POOL members already at 0 HP (defeatedAt set) — a PER_PLAYER member's own
  // currentHp is irrelevant here, since every player's encounter with it starts fresh regardless
  // of anyone else's history.
  const rawCandidates = await db.cMoonEnemyMember.findMany({
    where: {
      active: true, defeatedAt: null, faction: { active: true }, minPriorDefeats: { lte: personalWinCount },
      // A raid boss can only ever be fought through the raid flow (server/utils/cmoonRaidSocket.js),
      // which requires a cMoon (to draw teammates from, announce for, and credit points to) — a
      // player with no cMoon has no way to engage one at all, so it must never be offered to them.
      ...(user.cMoonId ? {} : { isRaidBoss: false }),
    },
    include: {
      faction: { include: { appearEffect: true, specialAttack: true, taunts: { where: { active: true }, orderBy: { sortOrder: 'asc' } } } },
      taunts: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
    },
  })
  // raidOneTime/raidCooldownMinutes can't be expressed as a single Prisma `where` filter (the
  // cooldown cutoff is a per-row computation against each member's own raidCooldownMinutes) — see
  // checkRaidBossAvailability's own comment for why this is shared with cmoonraid:start's
  // authoritative check rather than reimplemented here. Likewise for an unsolved BOSS_LORE
  // CMoonRiddle gate — one batched query for every raid-boss candidate's riddle (if any), rather
  // than a query per candidate inside the filter below.
  const raidBossIds = rawCandidates.filter(m => m.isRaidBoss).map(m => m.id)
  const bossLoreRiddles = raidBossIds.length
    ? await db.cMoonRiddle.findMany({
        where: { kind: 'BOSS_LORE', active: true, enemyMemberId: { in: raidBossIds } },
        select: { enemyMemberId: true, solvedAt: true },
      })
    : []
  const riddleSolvedByEnemyId = new Map(bossLoreRiddles.map(r => [r.enemyMemberId, !!r.solvedAt]))
  let candidates = rawCandidates.filter(m => !m.isRaidBoss
    || checkRaidBossAvailability({ ...m, riddleGateSolved: riddleSolvedByEnemyId.get(m.id) ?? true }).available)
  if (!candidates.length) return { offered: false }

  // Non-raid-boss spawn cap (admin-configurable, 0 = disabled) — see
  // GlobalGameConfig.cMoonEnemySpawnCapCount's own schema comment. Only queried once there's
  // actually a candidate pool to narrow, same "don't query for nothing" stance as personalWinCount
  // above. Raid bosses stay offerable either way (filterCappedNonRaidCandidates never removes them).
  const spawnCapCount = config?.cMoonEnemySpawnCapCount ?? 0
  if (spawnCapCount > 0) {
    const recentNonRaidCount = await countRecentSoloStarts(db, userId, config?.cMoonEnemySpawnCapWindowHours ?? 4)
    candidates = filterCappedNonRaidCandidates(candidates, recentNonRaidCount, spawnCapCount)
    if (!candidates.length) return { offered: false }
  }

  // "Higher tiered enemies first" (admin toggle) narrows the pool to only the highest
  // CMoonEnemyRank actually present among this player's eligible candidates BEFORE weighting —
  // full precedence, not merely extra weight. Off by default, which leaves every eligible rank in
  // one pool together, the original behavior before either of these existed. Either way, the
  // final pick is a weighted roll by each candidate's own occurrencePercent (see that column's own
  // schema comment) rather than the old plain uniform pick.
  const tierFiltered = filterToHighestRank(candidates, !!config?.cMoonEnemyHigherTierFirst)
  const chosen = pickWeightedEnemy(tierFiltered)
  // Admin analytics only (offer -> start rate); fire-and-forget, never delays the popup. Logged
  // here, at the one place a NEW offer is made — a resumed battle (early return above) is not an
  // offer.
  logEnemyOffer(db, { userId, enemyMemberId: chosen.id, isRaidBoss: chosen.isRaidBoss })

  // Deliberately NOT stamping lastCMoonBattlePopupAt / logging to CMoonEnemyPopupLog here — see
  // those columns' own schema comments. Both only record an ACTUAL engagement now (start.post.js
  // for a solo fight, the raid-start socket handler for a raid boss), never a mere offer, so
  // declining ("Not now") costs nothing: the very next navigation can roll and offer again. Only
  // choosing to fight spends the cooldown/spawn-cap slot.

  // A raid-boss FINAL_BOSS already gets its own announceCMoonRaidBoss ping once a raid actually
  // starts — this only ever fires for a SOLO Final Boss encounter, which otherwise has no
  // announcement at all.
  if (!chosen.isRaidBoss && chosen.rank === 'FINAL_BOSS' && user.cMoonId) {
    pingFinalBossAppeared(user.cMoonId, chosen.id, chosen.name).catch(() => {})
  }

  // Only worth the extra read when pity is actually enabled for this member — see
  // serializeEnemyForClient's own comment on why this is the one caller that supplies a real
  // streak (the OFFER screen is the "should I fight this" decision point pity progress matters
  // most at). A player with no row yet (never had an empty win against this member) simply shows
  // 0/threshold, same starting point as the real upsert in action.post.js would create.
  const pityRow = chosen.pityThreshold > 0
    ? await db.cMoonEnemyRewardPity.findUnique({
        where: { userId_enemyMemberId: { userId, enemyMemberId: chosen.id } },
        select: { emptyWinStreak: true },
      })
    : null
  const pityEmptyWinStreak = chosen.pityThreshold > 0 ? (pityRow?.emptyWinStreak || 0) : null

  return {
    offered: true, resumed: false, enemy: serializeEnemyForClient(chosen, pityEmptyWinStreak), inCMoon: !!user.cMoonId,
    // Display-only hints for the OFFER screen's "Make this a private raid" checkbox and solo-fight
    // flavor text (see CMoonBattlePopupHost.vue) — never the real gate, which cmoonraid:start/
    // cmoonraid:forceStart enforce server-side regardless of what a stale client sends. Only
    // meaningful for a raid boss; omitted entirely for a non-raid offer since neither applies.
    ...(chosen.isRaidBoss ? {
      raidPrivateLobbiesEnabled: config?.cMoonRaidPrivateLobbiesEnabled !== false,
      raidSoloQueueEnabled: config?.cMoonRaidSoloQueueEnabled !== false,
    } : {}),
  }
})
