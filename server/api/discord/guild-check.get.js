import 'dotenv/config'
import { defineEventHandler, createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  // 1) Must be authenticated
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const config = useRuntimeConfig()

  // 2) Load the user and ensure they have a Discord link
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.discordId) {
    return { inGuild: false }
  }

  // 3) Check guild membership via Discord API
  let inGuild = false
  try {
    const botToken = config.discord.botToken || process.env.BOT_TOKEN
    const guildId = config.discord.guildId || process.env.DISCORD_GUILD_ID
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${user.discordId}`,
      { headers: { Authorization: `${botToken}` } }
    )

    console.log(res)
    console.log(" ")
    inGuild = res.ok

    // Persist membership status
    await prisma.user.update({
      where: { id: userId },
      data: { inGuild }
    })
  } catch (err) {
    console.error('Discord membership check failed:', err)
  }

  return { inGuild }
})