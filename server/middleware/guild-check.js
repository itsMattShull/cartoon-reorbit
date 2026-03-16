import { refreshDiscordTokenAndRoles } from '../utils/refreshDiscordTokenAndRoles.js'
import { prisma } from '@/server/prisma'
import { getOrSet, invalidate } from '@/server/utils/cache'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) return

  const config = useRuntimeConfig(event)

  const cacheKey = `user:guild:${userId}`
  let user = await getOrSet(cacheKey, 120, () =>
    prisma.user.findUnique({ where: { id: userId } })
  )

  if (!user || !user.discordId) return

  // Only attempt token refresh when the cached token is near expiry.
  // refreshDiscordTokenAndRoles already skips internally, but we avoid
  // deserializing the Date from Redis each time by checking the raw value.
  const tokenExpiresAt = user.tokenExpiresAt ? new Date(user.tokenExpiresAt) : null
  const tokenExpired = !tokenExpiresAt || tokenExpiresAt.getTime() < Date.now() + 60_000
  if (tokenExpired) {
    // Token needs refresh — bypass cache, get fresh user, refresh, then re-cache
    user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    user = await refreshDiscordTokenAndRoles(user, config)
    // Re-cache updated user
    await invalidate(cacheKey)
    await getOrSet(cacheKey, 120, () => Promise.resolve(user))
  }

  // If the user has no roles, assume they're not in the guild
  if (!user.roles) {
    console.warn('User not in guild – skipping invite redirect for now.')
  }

  event.context.user = user
})
