// server/cron/sync-guild-members.js
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import { default as cron } from 'node-cron'

const BOT_TOKEN   = process.env.BOT_TOKEN
const GUILD_ID    = process.env.DISCORD_GUILD_ID
const DISCORD_API = 'https://discord.com/api/v10'

async function syncGuildMembers() {
  try {
    let after = '0'
    const memberIds = []

    // page through all guild members
    while (true) {
      const res = await fetch(
        `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `${BOT_TOKEN}` } }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Discord API ${res.status}: ${body}`)
      }

      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break

      batch.forEach(m => memberIds.push(m.user.id))
      after = batch[batch.length - 1].user.id

      if (batch.length < 1000) break
    }

    // flip on users who are now in guild but were marked out
    const turnedOn = await prisma.user.updateMany({
      where: { discordId: { in: memberIds }, inGuild: false },
      data:  { inGuild: true },
    })

    // flip off users who left
    const turnedOff = await prisma.user.updateMany({
      where: { inGuild: true, discordId: { notIn: memberIds } },
      data:  { inGuild: false },
    })
  } catch (err) {
    console.error('[sync-guild] sync failed:', err)
  }
}

// run once immediately
await syncGuildMembers()

// then schedule daily at midnight
cron.schedule('0 0 * * *', syncGuildMembers)
