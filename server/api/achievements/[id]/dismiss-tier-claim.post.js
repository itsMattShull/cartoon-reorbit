// server/api/achievements/[id]/dismiss-tier-claim.post.js
// Lets a player permanently hide one "already claimed this rank's reward in another cMoon"
// dead-end claim card from their own cMoon page (see annotateUnclaimableTierClaims in
// server/utils/achievementTierDismissal.js) — never touches AchievementUser/AchievementClaim or
// actual claim eligibility, and only ever succeeds for a card that's genuinely blocked.
import { defineEventHandler, createError } from 'h3'
import { dismissUnclaimableTierClaim } from '@/server/utils/achievementTierDismissal'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  assertSameOrigin(event)

  const achievementId = event.context.params?.id
  if (!achievementId) throw createError({ statusCode: 400, statusMessage: 'Missing achievement id' })

  const result = await dismissUnclaimableTierClaim(userId, achievementId)
  if (!result.dismissed) {
    throw createError({ statusCode: 400, statusMessage: 'This reward is not blocked — nothing to dismiss' })
  }
  return { ok: true }
})
