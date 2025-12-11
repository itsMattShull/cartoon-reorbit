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

/**
 * Notifies all users who have the given ctoonId on their wishlist
 * that a new auction has started for it. Respects each user's
 * allowWishlistAuctionNotifications flag and ignores users without
 * a connected Discord DM channel.
 * Non-throwing: failures are swallowed.
 */
export async function notifyWishlistNewAuction(prisma, ctoonId, auctionId) {
  try {
    if (!ctoonId || !auctionId) return

    // Load basic auction + item details
    const auc = await prisma.auction.findUnique({
      where: { id: String(auctionId) },
      select: {
        id: true,
        initialBet: true,
        userCtoon: {
          select: {
            mintNumber: true,
            ctoon: { select: { name: true } }
          }
        }
      }
    })

    const ctoonName  = auc?.userCtoon?.ctoon?.name || 'cToon'
    const mintNumber = auc?.userCtoon?.mintNumber ?? null
    const startingBid = auc?.initialBet ?? 0

    // Determine if this is a Holiday item (suppress mint number)
    const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
      where: { ctoonId },
      select: { id: true }
    }))

    // Find all wishlisters for this cToon
    const wishers = await prisma.wishlistItem.findMany({
      where: { ctoonId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discordId: true,
            allowWishlistAuctionNotifications: true
          }
        }
      }
    })

    if (!wishers?.length) return

    const link = auctionLink(String(auctionId))
    const baseLines = [
      `🔔 A cToon on your wishlist is up for auction!`,
      `• Item: ${ctoonName}${(!isHolidayItem && mintNumber != null) ? ` (Mint #${mintNumber})` : ''}`,
      `• Starting bid: ${startingBid} pts`,
      ``,
      `View the auction: ${link}`
    ]

    for (const w of wishers) {
      const u = w.user
      if (!u?.discordId) continue
      if (u.username === 'CartoonReOrbitOfficial') continue
      if (!u.allowWishlistAuctionNotifications) continue
      try {
        await sendDiscordDMByDiscordId(u.discordId, baseLines.join('\n'))
      } catch {
        // ignore individual failures
      }
    }
  } catch {
    // Swallow failures to avoid blocking
  }
}
