// server/api/admin/cmoon-affinity/backfill.post.js
// One-off repair for a real bug in server/api/cmoon/[id]/contribute.post.js: before it was
// fixed, a single contribution large enough to cross MULTIPLE CMoonAffinityLevel thresholds at
// once only ever granted the single HIGHEST level's reward, silently forfeiting any lower
// level's reward forever (currentLevelId only ever moves forward, so a skipped level's
// threshold was never re-evaluated on a later contribution) — this is how a player could earn
// an avatar/background/border reward that never actually showed up anywhere.
//
// Re-grants any level reward a member's current affinitySpent already qualifies for but never
// received. Safe to run any number of times: grantRewardInTx's background/avatar grants check
// existing ownership first, and its border/glow grants are idempotent upserts, so nothing
// already owned is re-granted or duplicated. Never moves currentLevelId (already correctly at
// the highest reached level — only the in-between rewards were missed) and never grants a level
// the member hasn't actually reached.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { grantRewardInTx } from '@/server/utils/achievements'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const affinities = await db.cMoonAffinity.findMany({
    where: { affinitySpent: { gt: 0 } },
    select: { userId: true, cMoonId: true, affinitySpent: true },
  })

  let usersFixed = 0
  let backgroundsGranted = 0
  let avatarsGranted = 0

  for (const a of affinities) {
    const qualifyingLevels = await db.cMoonAffinityLevel.findMany({
      where: { cMoonId: a.cMoonId, threshold: { lte: a.affinitySpent } },
      orderBy: { threshold: 'asc' },
      include: { rewardAvatars: { select: { avatarId: true } } },
    })
    if (!qualifyingLevels.length) continue

    let grantedAnyForUser = false
    await db.$transaction(async (tx) => {
      for (const lvl of qualifyingLevels) {
        const reward = {
          backgrounds: [],
          avatars: [],
          borderCMoonId: lvl.grantsBorder ? a.cMoonId : null,
          glowCMoonId: lvl.grantsGlow ? a.cMoonId : null,
        }
        if (lvl.rewardBackgroundId) reward.backgrounds.push({ backgroundId: lvl.rewardBackgroundId })
        reward.avatars.push(...lvl.rewardAvatars.map(ra => ({ avatarId: ra.avatarId })))
        const granted = await grantRewardInTx(tx, a.userId, reward, `cmoonAffinity:backfill:${lvl.id}`)
        if (granted.backgrounds) { backgroundsGranted += granted.backgrounds; grantedAnyForUser = true }
        if (granted.avatars) { avatarsGranted += granted.avatars; grantedAnyForUser = true }

        // See contribute.post.js's identical auto-equip comment: mutually exclusive with each
        // other, so both checks require neither field set yet, and border (checked first) wins
        // if a single level somehow grants both.
        if (lvl.grantsBorder) {
          await tx.user.updateMany({
            where: { id: a.userId, equippedBorderCMoonId: null, equippedGlowCMoonId: null },
            data: { equippedBorderCMoonId: a.cMoonId },
          })
        }
        if (lvl.grantsGlow) {
          await tx.user.updateMany({
            where: { id: a.userId, equippedBorderCMoonId: null, equippedGlowCMoonId: null },
            data: { equippedGlowCMoonId: a.cMoonId },
          })
        }
      }
    })
    if (grantedAnyForUser) usersFixed++
  }

  return { usersChecked: affinities.length, usersFixed, backgroundsGranted, avatarsGranted }
})
