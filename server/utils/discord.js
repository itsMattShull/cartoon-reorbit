// server/utils/discord.js
export function auctionLink(auctionId) {
  // Keep this identical to your other DM base URL logic
  const isProd = process.env.NODE_ENV === 'production'
  return isProd
    ? `https://www.cartoonreorbit.com/auction/${auctionId}`
    : `http://localhost:3000/auction/${auctionId}`
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
    return true
  } catch {
    return false
  }
}

export async function announceAchievement(prisma, userId, achievementTitle) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, username: true } })
    if (!user?.discordId) return
    const channelName = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL || 'announcements'
    const tag = `<@${user.discordId}>`
    const title = String(achievementTitle || 'an achievement')
    const msg = `🎉 Congrats ${tag}! You unlocked “${title}”.`
    await sendGuildChannelMessageByName(channelName, msg)
  } catch {
    // swallow in worker/cron context
  }
}
