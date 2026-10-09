// server/api/discord/register-commands.post.js
//
// A bulk PUT overwrites every guild command at once, so this is a state-changing admin mutation
// like any other — brought up to the same requireAdmin/assertSameOrigin convention the rest of
// server/api/admin/* uses (see server/utils/requireAdmin.js) now that it's reachable from a real
// UI button (Global Settings > Discord) rather than only a hand-crafted request. requireAdmin also
// drops the old self-loopback `/api/auth/me` HTTP call in favor of a direct DB read, and rejects a
// banned/deactivated admin rather than just checking `isAdmin`.
import { defineEventHandler, createError } from 'h3'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const APP_ID    = process.env.DISCORD_APP_ID
  const GUILD_ID  = process.env.DISCORD_GUILD_ID   // test guild
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!APP_ID || !GUILD_ID || !BOT_TOKEN) {
    throw createError({ statusCode: 500, statusMessage: 'Missing Discord env vars' })
  }

  const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`

  const commands = [
    {
      name: 'czone',
      description: 'Get a cZone link for a Discord user',
      options: [
        {
          type: 6,            // USER
          name: 'user',
          description: 'Discord user',
          required: true
        }
      ],
      dm_permission: true
    },
    {
      name: 'trade',
      description: 'Get a Create Trade link for a Discord user',
      options: [
        {
          type: 6,            // USER
          name: 'user',
          description: 'Discord user',
          required: true
        }
      ],
      dm_permission: true
    },
    {
      name: 'riddle',
      description: 'Submit an answer to this week\'s cMoon riddle',
      options: [
        {
          type: 3,            // STRING
          name: 'answer',
          description: 'Your answer',
          required: true
        }
      ],
      dm_permission: true
    },
    {
      name: 'hunt',
      description: 'Submit your team\'s combined answer to a cMoon scavenger hunt',
      options: [
        {
          type: 3,            // STRING
          name: 'answer',
          description: 'Your team\'s combined answer',
          required: true
        }
      ],
      dm_permission: true
    }
  ]

  const res = await $fetch(url, {
    method: 'PUT', // bulk overwrite
    headers: {
      Authorization: `${BOT_TOKEN}`, // if your BOT_TOKEN doesn’t include "Bot ", use `Authorization: \`Bot ${BOT_TOKEN}\``
      'Content-Type': 'application/json'
    },
    body: commands
  })

  return res
})
