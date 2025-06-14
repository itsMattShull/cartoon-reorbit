// server/api/auth/me.get.js
import { defineEventHandler, createError, getCookie } from 'h3'
import jwt from 'jsonwebtoken'
import { prisma } from '@/server/prisma'
import { refreshDiscordTokenAndRoles } from '../../utils/refreshDiscordTokenAndRoles.js'

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

  // Fetch only the fields we need, including inGuild as a scalar
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      discordId: true,
      discordTag: true,
      discordAvatar: true,
      avatar: true,
      username: true,
      email: true,
      roles: true,
      isAdmin: true,
      inGuild: true,
      points: { select: { points: true } },
      ctoons: true
    }
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Ensure fresh tokens and up-to-date roles
  await refreshDiscordTokenAndRoles(prisma, user, config)

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
    needsSetup: !(user.username && user.avatar && user.ctoons.length > 0),
    inGuild: user.inGuild,
    isAdmin: user.isAdmin,
    ctoons: user.ctoons
  }
})
