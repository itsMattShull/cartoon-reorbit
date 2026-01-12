// server/utils/discord.js
export function auctionLink(auctionId) {
  // Keep this identical to your other DM base URL logic
  const isProd = process.env.NODE_ENV === 'production'
  return isProd
    ? `https://www.cartoonreorbit.com/auction/${auctionId}`
    : `http://localhost:3000/auction/${auctionId}`
}

function getAnnouncementsBotToken() {
  return process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || process.env.BOT_TOKEN
}

const DISCORD_API_BASE = 'https://discord.com/api/v10'

function getBotAuthHeader() {
  const token = process.env.BOT_TOKEN
  if (!token) return null
  return token.startsWith('Bot ') ? token : `Bot ${token}`
}

function normalizeRoleName(name) {
  return typeof name === 'string' ? name.trim() : ''
}

async function fetchGuildRoles() {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!authHeader || !guildId) return []
  try {
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
      headers: { Authorization: authHeader }
    })
    if (!res.ok) return []
    const roles = await res.json()
    return Array.isArray(roles) ? roles : []
  } catch {
    return []
  }
}

async function createGuildRole(roleName) {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!authHeader || !guildId) return null
  try {
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: roleName,
        permissions: '0',
        mentionable: false,
        hoist: false
      })
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function ensureGuildRoleByName(roleName) {
  const name = normalizeRoleName(roleName)
  if (!name) return null
  const roles = await fetchGuildRoles()
  const existing = roles.find(r => normalizeRoleName(r?.name) === name)
  if (existing?.id) return existing
  return await createGuildRole(name)
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function addRoleToMember(discordUserId, roleId) {
  const authHeader = getBotAuthHeader()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!discordUserId || !roleId || !authHeader || !guildId) return false

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: 'PUT', headers: { Authorization: authHeader } }
    )
    if (res.status === 204) return true
    if (res.status === 429) {
      let body = { retry_after: 5 }
      try { body = await res.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      continue
    }
    return false
  }
  return false
}

async function openDmChannel(discordId) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN || !discordId) return null

  try {
    const dmChannel = await $fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `${BOT_TOKEN}`,   // keeping consistent with your existing code
        'Content-Type': 'application/json'
      },
      body: { recipient_id: discordId }
    })
    return dmChannel?.id || null
  } catch {
    return null
  }
}

export async function sendDiscordDMByDiscordId(discordId, content) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN || !discordId) return false

  const channelId = await openDmChannel(discordId)
  if (!channelId) return false

  try {
    await $fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: { content }
    })
    return true
  } catch {
    return false
  }
}

export async function assignDiscordRoleByName(prisma, userId, roleName) {
  const name = normalizeRoleName(roleName)
  if (!name) return null
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true, inGuild: true }
  })
  if (!user?.discordId) return null
  if (user.inGuild === false) return null

  const role = await ensureGuildRoleByName(name)
  if (!role?.id) return null

  const ok = await addRoleToMember(user.discordId, role.id)
  return ok ? role.name : null
}

/**
 * Fetches the user’s discordId and sends an “outbid” message.
 * Non-throwing: failures are swallowed.
 */
export async function notifyOutbidByUserId(prisma, userId, auctionId) {
  if (!userId) return
  try {

    // Skip if user is the current leader
    const aucHead = await prisma.auction.findUnique({
      where: { id: String(auctionId) },
      select: { highestBidderId: true }
    })
    if (aucHead?.highestBidderId === userId) return

    // Skip if user never bid on this auction
    const hasBid = await prisma.bid.findFirst({
      where: { auctionId: String(auctionId), userId },
      select: { id: true }
    })
    if (!hasBid) return

    // 1) Who to DM
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true, allowAuctionNotifications: true, username: true }
    })
    if (!u?.discordId) return
    if (!u.allowAuctionNotifications) return
    // Skip system/official account
    if (u.username === 'CartoonReOrbitOfficial') return

    // 2) Load auction + cToon details
    const auc = await prisma.auction.findUnique({
      where: { id: String(auctionId) },
      select: {
        id: true,
        highestBid: true,
        userCtoon: {
          select: {
            mintNumber: true,
            ctoon: { select: { name: true } }
          }
        }
      }
    })
    const ctoonName = auc?.userCtoon?.ctoon?.name || 'cToon'
    const mintNumber = auc?.userCtoon?.mintNumber ?? null
    const highestBid = auc?.highestBid ?? 0

    // 3) Compose message
    const link = auctionLink(String(auctionId))
    const lines = [
      `⚠️ You’ve been outbid on an auction.`,
      `• Item: ${ctoonName}${mintNumber != null ? ` (Mint #${mintNumber})` : ''}`,
      `• Current highest bid: ${highestBid} pts`,
      ``,
      `View the auction: ${link}`
    ]

    await sendDiscordDMByDiscordId(u.discordId, lines.join('\n'))
  } catch {
    // ignore failures
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild channel helpers

async function fetchGuildChannels() {
  const BOT_TOKEN = process.env.BOT_TOKEN
  const GUILD_ID = process.env.DISCORD_GUILD_ID
  if (!BOT_TOKEN || !GUILD_ID) return []
  try {
    const channels = await $fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
      method: 'GET',
      headers: { 'Authorization': BOT_TOKEN }
    })
    return Array.isArray(channels) ? channels : []
  } catch {
    return []
  }
}

async function findTextChannelIdByName(name) {
  const target = String(name || '').trim().toLowerCase()
  if (!target) return null
  const channels = await fetchGuildChannels()
  const ch = channels.find(ch => ch?.type === 0 && String(ch?.name || '').toLowerCase() === target)
  // console.log('findTextChannelIdByName:', name, '->', ch?.id || 'not found')
  return ch?.id || null
}

export async function sendGuildChannelMessageByName(channelName, content) {
  const BOT_TOKEN = process.env.BOT_TOKEN
  if (!BOT_TOKEN) return false
  try {
    const channelId = await findTextChannelIdByName(channelName)
    if (!channelId) return false
    await $fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': BOT_TOKEN,
        'Content-Type': 'application/json'
      },
      body: { content }
    })
    // console.log('sendGuildChannelMessageByName succeeded')
    return true
  } catch {
    // console.log('sendGuildChannelMessageByName failed')
    return false
  }
}

// New: Send to a channel by its ID (no lookup by name)
export async function sendGuildChannelMessageById(channelId, content, tokenOverride = null) {
  const rawToken = tokenOverride || process.env.BOT_TOKEN
  if (!rawToken || !channelId) return false
  const authHeader = rawToken.startsWith('Bot ') ? rawToken : `Bot ${rawToken}`
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    })
    // console.log('sendGuildChannelMessageById succeeded')
    return true
  } catch(e) {
    // console.error('sendGuildChannelMessageById failed:', e)
    return false
  }
}

function formatList(items) {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export async function announceAchievement(prisma, userId, achievementTitle, rewardSummary = null, roleName = null) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, username: true } })
    if (!user?.discordId) return
    const config = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { achievementDiscordChannelId: true }
    })
    const channelId = (config?.achievementDiscordChannelId || '').trim() || process.env.DISCORD_ANNOUNCEMENTS_CHANNEL
    const botToken = getAnnouncementsBotToken()
    if (!channelId || !botToken) return
    const tag = `<@${user.discordId}>`
    const title = String(achievementTitle || 'an achievement')
    let msg = `🎉 Congrats ${tag}! You unlocked “${title}”.`
    if (rewardSummary) {
      const parts = []
      if (rewardSummary.points && rewardSummary.points > 0) {
        parts.push(`${rewardSummary.points} points`)
      }
      if (Array.isArray(rewardSummary.ctoons)) {
        for (const ctoon of rewardSummary.ctoons) {
          if (!ctoon?.name || !ctoon?.quantity) continue
          parts.push(ctoon.quantity > 1 ? `${ctoon.name} ×${ctoon.quantity}` : ctoon.name)
        }
      }
      if (rewardSummary.backgrounds && rewardSummary.backgrounds > 0) {
        parts.push(
          rewardSummary.backgrounds === 1
            ? '1 background unlocked for your cZones'
            : `${rewardSummary.backgrounds} backgrounds unlocked for your cZones`
        )
      }
      if (parts.length) {
        msg += ` You received ${formatList(parts)}.`
      }
    }
    const trimmedRole = normalizeRoleName(roleName)
    if (trimmedRole) {
      msg += ` You also received the ${trimmedRole} role.`
    }
    await sendGuildChannelMessageById(channelId, msg, botToken)
  } catch {
    // swallow in worker/cron context
  }
}
