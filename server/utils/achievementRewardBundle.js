// server/utils/achievementRewardBundle.js
// Shared shape for "a reward bundle" (points + distinct cToons, each with their own
// quantity + backgrounds) — used identically for an achievement's own auto-grant reward and
// for each of its up to-4 claim options. Kept in one place so the create and edit admin
// endpoints (server/api/admin/achievements.post.js, server/api/admin/achievements/[id].put.js)
// can't drift from each other.
import { createError } from 'h3'

export function parseRewardBundle(rewards = {}) {
  return {
    points: Math.max(0, Number(rewards?.points || 0)) || 0,
    ctoons: (Array.isArray(rewards?.ctoons) ? rewards.ctoons : [])
      .filter(r => r?.ctoonId)
      .map(r => ({ ctoonId: String(r.ctoonId), quantity: Math.max(1, Number(r.quantity || 1)) })),
    backgrounds: (Array.isArray(rewards?.backgrounds) ? rewards.backgrounds : [])
      .filter(r => r?.backgroundId)
      .map(r => ({ backgroundId: String(r.backgroundId) })),
  }
}

export async function validateRewardBundleRefs(db, bundles) {
  const ctoonIds = [...new Set(bundles.flatMap(b => b.ctoons.map(c => c.ctoonId)))]
  if (ctoonIds.length) {
    const validCount = await db.ctoon.count({ where: { id: { in: ctoonIds } } })
    if (validCount !== ctoonIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more reward cToons do not exist' })
  }
  const backgroundIds = [...new Set(bundles.flatMap(b => b.backgrounds.map(bg => bg.backgroundId)))]
  if (backgroundIds.length) {
    const validCount = await db.background.count({ where: { id: { in: backgroundIds } } })
    if (validCount !== backgroundIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more reward backgrounds do not exist' })
  }
}
