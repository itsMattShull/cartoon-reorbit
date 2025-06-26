// server/cron/sync-guild-members.js
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import cron from 'node-cron'

const BOT_TOKEN   = process.env.BOT_TOKEN
const GUILD_ID    = process.env.DISCORD_GUILD_ID
const DISCORD_API = 'https://discord.com/api/v10'

async function syncGuildMembers() {
  try {
    // 1) page through the guild
    let after = '0'
    const members = []
    while (true) {
      const res = await fetch(
        `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Discord API ${res.status}: ${body}`)
      }
      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break

      members.push(...batch)
      after = batch[batch.length - 1].user.id
      if (batch.length < 1000) break
    }

    // 2) flip on/off your inGuild flag
    const memberIds = members.map(m => m.user.id)
    await prisma.user.updateMany({
      where: { discordId: { in: memberIds }, inGuild: false },
      data:  { inGuild: true },
    })
    await prisma.user.updateMany({
      where: { inGuild: true, discordId: { notIn: memberIds } },
      data:  { inGuild: false },
    })

    // 3) pull all of your matching user records
    const users = await prisma.user.findMany({
      where: { discordId: { in: memberIds } },
      select: { discordId: true, username: true }
    })
    const nameMap = new Map(users.map(u => [u.discordId, u.username]))

    // 4) for each member, if their guild‐nick !== your User.username, PATCH it
    const updated = []
    for (const m of members) {
      const dbName = nameMap.get(m.user.id)
      if (dbName && m.nick !== dbName) {
        const patch = await fetch(
          `${DISCORD_API}/guilds/${GUILD_ID}/members/${m.user.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bot ${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nick: dbName })
          }
        )
        if (patch.ok) {
          updated.push(dbName)
        } else {
          console.warn(
            `[sync-guild] failed to patch nick for ${m.user.id}:`,
            await patch.text()
          )
        }
      }
    }

    // 5) report
    console.log(
      `[sync-guild] processed ${members.length} members, ` +
      `updated ${updated.length} nick${updated.length === 1 ? '' : 's'}: ` +
      updated.join(', ')
    )
  }
  catch (err) {
    console.error('[sync-guild] sync failed:', err)
  }
}

// run once immediately
await syncGuildMembers()

// then schedule daily at midnight
cron.schedule('0 0 * * *', syncGuildMembers)
