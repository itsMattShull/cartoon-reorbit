import { defineEventHandler } from 'h3'
import { getGameLeaderboard } from '@/server/utils/gameLeaderboard'

export default defineEventHandler(async (event) => {
  return getGameLeaderboard({
    table: 'FlappyPowerpuffScore',
    scoreColumn: 'score',
    direction: 'desc',
    // Must stay unique to this game — reusing another game's key serves its board here for
    // the whole cache TTL, which is easy to miss in review.
    cacheKey: 'flappypowerpuff:leaderboard:v1',
    userId: event.context.userId || null
  })
})
