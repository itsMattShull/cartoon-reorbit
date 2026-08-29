// server/api/achievements/[id]/claim.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { claimAchievementReward, AchievementClaimError } from '@/server/utils/achievements'

const ERROR_STATUS = {
  NOT_UNLOCKED: { statusCode: 403, statusMessage: 'You have not unlocked this achievement' },
  NOT_CLAIMABLE: { statusCode: 400, statusMessage: 'This achievement has no claimable reward' },
  INVALID_OPTION: { statusCode: 400, statusMessage: 'Invalid reward option' },
  ALREADY_CLAIMED: { statusCode: 409, statusMessage: 'You already claimed a reward for this achievement' },
  TIER_ALREADY_CLAIMED: { statusCode: 409, statusMessage: 'You already claimed this rank\'s reward in another cMoon' },
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const achievementId = event.context.params?.id
  const body = await readBody(event)
  const optionId = typeof body?.optionId === 'string' ? body.optionId : ''
  if (!optionId) throw createError({ statusCode: 400, statusMessage: 'optionId is required' })

  try {
    const result = await claimAchievementReward(userId, achievementId, optionId)
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof AchievementClaimError) {
      throw createError(ERROR_STATUS[err.code] || { statusCode: 400, statusMessage: 'Unable to claim reward' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Unable to claim reward' })
  }
})
