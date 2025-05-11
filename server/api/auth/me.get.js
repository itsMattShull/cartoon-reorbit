import { refreshDiscordTokenAndRoles } from '../../utils/refreshDiscordTokenAndRoles.js'
import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const config = useRuntimeConfig(event)

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
    ctoons: user.ctoons
  }
})
