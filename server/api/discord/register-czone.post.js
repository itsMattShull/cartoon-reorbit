// server/api/discord/register-czone.post.js
import { defineEventHandler, createError } from 'h3'

export default defineEventHandler(async () => {
  const APP_ID   = process.env.DISCORD_APP_ID
  const GUILD_ID = process.env.DISCORD_GUILD_ID   // test guild
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!APP_ID || !GUILD_ID || !BOT_TOKEN) {
    throw createError({ statusCode: 500, statusMessage: 'Missing Discord env vars' })
  }

  const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`

  const cmd = {
    name: 'czone',
    description: 'Get a cZone link for a Discord user',
    options: [
      {
        type: 6, // USER
        name: 'user',
        description: 'Discord user',
        required: true
      }
    ],
    dm_permission: true
  }

  const res = await $fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `${BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: cmd
  })

  return res
})
