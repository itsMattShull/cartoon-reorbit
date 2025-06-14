// server/cron/sync-guild-members.js
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'

console.log('[sync-guild] loading cron script…')

;(async () => {
  console.log('[sync-guild] scheduling job (every minute)…')
  const { default: cron } = await import('node-cron')

  cron.schedule('* * * * *', async () => {
    try {
      const BOT_TOKEN   = process.env.BOT_TOKEN
      const GUILD_ID    = process.env.DISCORD_GUILD_ID
      const DISCORD_API = 'https://discord.com/api/v10'

      let after = '0'
      const memberIds = []

      // page through all members
      while (true) {
        const res = await fetch(
          `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
          { headers: { Authorization: `${BOT_TOKEN}` } }
        )
        const batch = await res.json()
        if (!Array.isArray(batch) || batch.length === 0) break

        batch.forEach(m => memberIds.push(m.user.id))
        after = batch[batch.length - 1].user.id
        if (batch.length < 1000) break
      }

      // flip on only the stale false → true
      const turnedOn = await prisma.user.updateMany({
        where: { discordId: { in: memberIds }, inGuild: false },
        data:  { inGuild: true },
      })

      // flip off only the stale true → false
      const turnedOff = await prisma.user.updateMany({
        where: { inGuild: true, discordId: { notIn: memberIds } },
        data:  { inGuild: false },
      })
    } catch (err) {
      console.error('[sync-guild] sync failed:', err)
    }
  })
})()
