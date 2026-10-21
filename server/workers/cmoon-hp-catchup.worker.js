// server/workers/cmoon-hp-catchup.worker.js
// Admin one-time correction tool: "HP Catch Up" (Admin > cMoons), see
// server/api/admin/cmoons/hp-catch-up.post.js.
//
// There is no stored "HP" value anywhere to patch — a player's cMoon Enemy Battle max HP is read
// live off User.currentCMoonRank.tier.cMoonEnemyBattleHpBonus the moment a NEW battle starts (see
// getPlayerCombatMaxHp() in server/utils/cmoon.js), so the only thing that can ever make a
// player's HP wrong is a wrong currentCMoonRankId. This tool does two things, per cMoon, in order:
//
//  1. Re-runs provisionAllTiersForCMoon(cMoonId) — idempotent/safe to call repeatedly — to repair
//     a cMoon whose rank ladder never fully wired up. Investigation found that
//     server/api/admin/cmoons.post.js's own call to this (right after cMoon creation) used to run
//     unprotected: if it threw after the cMoon row was already committed, that cMoon was left with
//     zero ranks/achievements ever provisioned for ANY of its members, and no visible error
//     afterward. That call site is now hardened (try/catch + an admin-change-log flag), but this
//     tool is the actual repair path for any cMoon a gap like that already happened to, past or
//     future, with no need to know which one.
//  2. Recomputes every current cMoon member's correct currentCMoonRankId from their real
//     cMoonPoints — the exact same safe correction server/workers/cmoon-rank-recalc.worker.js
//     already performs (see server/utils/cmoonRankRecalc.js, shared by both). "Recalculate cMoon
//     Points" is still the tool to reach for broadly (it also fixes cMoonPoints), but is scoped
//     the same way; the two overlap on purpose rather than risk disagreeing on what a member's
//     correct rank is.
//
// Deliberately does NOT touch any already-in-progress CMoonEnemyBattle.playerMaxHp — that snapshot
// staying stable mid-fight is existing, intentional behavior (see that column's own schema
// comment). Only a player's NEXT new battle picks up a corrected HP bonus.
//
// Same "one at a time, job.updateProgress" shape as cmoon-rank-recalc.worker.js, processing cMoons
// (for the provisioning pass) then members (for the rank pass) sequentially rather than in
// parallel, so this stays a low, steady load rather than a burst — see that worker's own header
// comment for why a single sequential job (not N parallel ones) is the deliberate choice here.
import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { logAdminChange } from '../utils/adminChangeLog.js'
import { announceCMoonRankUpFromRecalc } from '../utils/cmoonDiscordEvents.js'
import { recorrectUserRank } from '../utils/cmoonRankRecalc.js'
import { provisionAllTiersForCMoon } from '../utils/cmoonRankTiers.js'

const QUEUE_KEY = process.env.CMOON_HP_CATCHUP_QUEUE_KEY || 'cmoonHpCatchUpQueue'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const RECENT_LIMIT = 25

const worker = new Worker(QUEUE_KEY, async (job) => {
  const { adminId } = job.data || {}

  const cmoons = await prisma.cMoon.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })

  let cmoonsRepaired = 0
  const provisioningFailures = []

  for (const cmoon of cmoons) {
    try {
      await provisionAllTiersForCMoon(cmoon.id)
    } catch (err) {
      provisioningFailures.push({ cMoonId: cmoon.id, cMoonName: cmoon.name, error: err?.message || String(err) })
      console.error(`[cmoon-hp-catchup worker] provisionAllTiersForCMoon failed for cMoon ${cmoon.id} (${cmoon.name}):`, err)
      continue
    }
    cmoonsRepaired++
    await job.updateProgress({
      phase: 'provisioning',
      pct: 0,
      cmoonsProcessed: cmoonsRepaired + provisioningFailures.length,
      cmoonsTotal: cmoons.length,
      processed: 0,
      total: 0,
      recent: [],
    })
  }

  const candidates = await prisma.user.findMany({
    where: { cMoonId: { not: null } },
    select: {
      id: true, username: true, cMoonId: true, cMoonSelectedAt: true,
      cMoonPoints: true, currentCMoonRankId: true,
      cMoon: { select: { name: true, discordChannelId: true } },
      currentCMoonRank: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  })

  const total = candidates.length
  let processed = 0
  let ranksCorrected = 0
  let upgraded = 0
  let downgraded = 0
  let cleared = 0
  const recent = []

  await job.updateProgress({
    phase: 'ranks', pct: 0, processed, total, recent,
    cmoonsProcessed: cmoons.length, cmoonsTotal: cmoons.length,
  })

  for (const user of candidates) {
    const correction = await recorrectUserRank(user)
    if (correction) {
      ranksCorrected++
      if (correction.rankChanged) {
        if (correction.kind === 'cleared') cleared++
        else if (correction.kind === 'upgraded') {
          upgraded++
          announceCMoonRankUpFromRecalc(correction.discordChannelId, correction.cMoonName, correction.username, correction.newRank, correction.newRankSortOrder).catch(() => {})
        } else {
          downgraded++
        }
      }
    }

    processed++
    const entry = {
      username: user.username,
      cMoonName: user.cMoon?.name || null,
      oldPoints: user.cMoonPoints,
      newPoints: correction ? correction.newPoints : user.cMoonPoints,
      oldRank: user.currentCMoonRank?.name || null,
      newRank: correction ? correction.newRank : (user.currentCMoonRank?.name || null),
    }
    recent.push(entry)
    if (recent.length > RECENT_LIMIT) recent.shift()

    await job.updateProgress({
      phase: 'ranks',
      pct: total ? Math.round((processed / total) * 100) : 100,
      processed, total, recent, current: entry,
      cmoonsProcessed: cmoons.length, cmoonsTotal: cmoons.length,
    })
  }

  const summary = {
    cmoonsTotal: cmoons.length,
    cmoonsRepaired,
    provisioningFailures,
    membersChecked: total,
    ranksCorrected,
    upgraded,
    downgraded,
    cleared,
  }

  await logAdminChange(prisma, {
    userId: adminId,
    area: 'Admin:CMoons',
    key: 'hpCatchUp',
    prevValue: { cmoonCount: cmoons.length, candidateCount: total },
    newValue: summary,
  })

  return summary
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[cmoon-hp-catchup worker] Job ${job?.id} failed:`, err)
})

export default worker
