// server/cron/sync-guild-members.js

import 'dotenv/config'
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import cron from 'node-cron'

const BOT_TOKEN   = process.env.BOT_TOKEN
const GUILD_ID    = process.env.DISCORD_GUILD_ID
const DISCORD_API = 'https://discord.com/api/v10'

async function syncGuildMembers() {
  try {
    // 1) page through all guild members
    let after = '0'
    const memberIds = []
    const memberList = []

    while (true) {
      const res = await fetch(
        `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `${BOT_TOKEN}` } }
      )
      if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`)

      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break

      batch.forEach(m => {
        memberIds.push(m.user.id)
        memberList.push(m)
      })
      after = batch[batch.length - 1].user.id
      if (batch.length < 1000) break
    }

    // 2) flip on/off inGuild flags
    await prisma.user.updateMany({
      where: { discordId: { in: memberIds }, inGuild: false },
      data:  { inGuild: true }
    })
    await prisma.user.updateMany({
      where: { inGuild: true, discordId: { notIn: memberIds } },
      data:  { inGuild: false }
    })

    // 3) sync Discord “server booster” status
    //   • anyone in this batch with m.premium_since===null → not boosting
    //   • anyone with a non-null premium_since → is boosting since that timestamp
    const nonBoosterIds = memberList
      .filter(m => m.premium_since === null)
      .map(m => m.user.id)
    if (nonBoosterIds.length) {
      await prisma.user.updateMany({
        where: { discordId: { in: nonBoosterIds } },
        data:  { isBooster: false, boosterSince: null }
      })
    }

    const boosterMembers = memberList.filter(m => m.premium_since !== null)
    for (const m of boosterMembers) {
      await prisma.user.updateMany({
        where: { discordId: m.user.id },
        data: {
          isBooster:   true,
          boosterSince: new Date(m.premium_since)
        }
      })
    }

    // 4) load database usernames for these IDs
    const dbUsers = await prisma.user.findMany({
      where: { discordId: { in: memberIds } },
      select: { discordId: true, username: true }
    })
    const nameMap = new Map(dbUsers.map(u => [u.discordId, u.username]))

    // 5) synchronize nicknames with backoff & error handling
    const updated = []
    for (const m of memberList) {
      const dbName = nameMap.get(m.user.id)
      if (!dbName || m.nick === dbName) continue

      let attempts = 0
      let done     = false

      while (!done && attempts < 3) {
        attempts++
        const patch = await fetch(
          `${DISCORD_API}/guilds/${GUILD_ID}/members/${m.user.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nick: dbName })
          }
        )

        if (patch.ok) {
          updated.push(`${m.user.id}→${dbName}`)
          done = true

        } else if (patch.status === 429) {
          let body = { retry_after: 5 }
          try { body = await patch.json() } catch {}
          const waitMs = (body.retry_after || 5) * 1000
          await new Promise(r => setTimeout(r, waitMs))

        } else {
          let err = {}
          try { err = await patch.json() } catch {}
          if (err.code !== 50013) {
            // optionally log other errors here
          }
          done = true
        }
      }
    }

    // 6) final report (optional logging)
    console.log(
      `[sync-guild] processed ${memberList.length} members, ` +
      `nicknames updated: ${updated.length}, ` +
      `boosters: ${boosterMembers.length}`
    )

  } catch (err) {
    // console.error('[sync-guild] sync failed:', err)
  }
}

// run now, then every day at midnight
await syncGuildMembers()
cron.schedule('0 0 * * *', syncGuildMembers)
