// server/api/cmoon/battle/consider.post.js
// Called on ordinary page navigation (see layouts/newsite-template.vue) to maybe show the cMoon
// Enemy Battles popup — same chance-roll + cooldown shape as server/api/scavenger/consider.post.js,
// but with no natural "trigger action" to hang off of, so this fires on navigation instead.
// Never creates a CMoonEnemyBattle row itself — that only happens once the player actually
// chooses to fight (see start.post.js). A user with no cMoon is never offered an encounter: the
// whole feature is built around cMoons "working together," and a non-member's win would have
// nowhere to be credited.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { serializeEnemyForClient, serializeBattleForClient } from '@/server/utils/cmoonEnemyBattle'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { cMoonId: true, banned: true, active: true, lastCMoonBattlePopupAt: true },
  })
  if (!user || user.banned || !user.active) return { offered: false }
  if (!user.cMoonId) return { offered: false }

  // Resume an already-in-progress battle (e.g. the player navigated away mid-fight) rather than
  // rolling for a new one — the activeUserId sentinel/unique constraint guarantees at most one.
  const inProgress = await db.cMoonEnemyBattle.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
    include: { enemyMember: { include: { faction: true } } },
  })
  if (inProgress) {
    return { offered: true, resumed: true, battle: serializeBattleForClient(inProgress) }
  }

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

  // Pick one random active, undefeated enemy member (any faction). Excludes SHARED_POOL members
  // already at 0 HP (defeatedAt set) — a PER_PLAYER member's own currentHp is irrelevant here,
  // since every player's encounter with it starts fresh regardless of anyone else's history.
  const candidates = await db.cMoonEnemyMember.findMany({
    where: { active: true, defeatedAt: null, faction: { active: true } },
    include: { faction: true },
  })
  if (!candidates.length) return { offered: false }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)]

  await db.user.update({ where: { id: userId }, data: { lastCMoonBattlePopupAt: new Date() } })

  return { offered: true, resumed: false, enemy: serializeEnemyForClient(chosen) }
})
