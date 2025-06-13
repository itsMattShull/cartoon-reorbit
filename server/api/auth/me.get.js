import { refreshDiscordTokenAndRoles } from '../../utils/refreshDiscordTokenAndRoles.js'
import jwt from 'jsonwebtoken'
import { getCookie } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  // Try middleware‑injected userId first; otherwise fall back to the persistent JWT cookie.
  let userId = event.context.userId

  if (!userId) {
    const token = getCookie(event, 'session')
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret)
        userId = payload.sub
        event.context.userId = userId // make it available to downstream handlers
      } catch {
        // Invalid or expired cookie – treat as unauthenticated
      }
    }
  }

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      points: true,
      ctoons: true
    }
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Ensure fresh tokens and up-to-date roles
  await refreshDiscordTokenAndRoles(prisma, user, config)

  // Check if user is in the guild
  const guildRes = await $fetch(
    `https://discord.com/api/guilds/${config.discord.guildId}/members/${user.discordId}`,
    {
      method: 'GET',
      headers: {
        Authorization: config.botToken
      }
    }
  ).catch(() => null)

  const inGuild = !!guildRes

  // Return full session data
  return {
    id: user.id,
    discordId: user.discordId,
    discordTag: user.discordTag,
    discordAvatar: user.discordAvatar,
    avatar: user.avatar,
    username: user.username || null,
    email: user.email,
    roles: user.roles,
    points: user.points?.points || 0,
    needsSetup: !(user.username && user.avatar && user.ctoons && user.ctoons.length > 0),
    inGuild,
    isAdmin: user.isAdmin,
    ctoons: user.ctoons
  }
})
