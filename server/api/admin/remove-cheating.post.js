import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

const sleep = (ms) => new Promise(res => setTimeout(res, ms))

function rarityPrice(r) {
  const s = (r || '').toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (s === 'common') return 25
  if (s === 'uncommon') return 50
  if (s === 'rare') return 100
  if (s === 'very rare') return 187
  if (s === 'crazy rare') return 312
  return 50
}

async function createAuction(tx, userCtoonId, initialBet, endAt, creatorId) {
  return tx.auction.create({
    data: { userCtoonId, initialBet, duration: 3, endAt, creatorId },
    select: { id: true }
  })
}

export default defineEventHandler(async (event) => {
  // admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // input
  const body = await readBody(event)
  const target  = String(body?.target || '').trim()
  const sources = Array.isArray(body?.sources) ? body.sources.map(s => String(s || '').trim()).filter(Boolean) : []
  if (!target) throw createError({ statusCode: 400, statusMessage: 'target is required' })
  if (!sources.length) throw createError({ statusCode: 400, statusMessage: 'at least one source is required' })

  // resolve users
  const users = await prisma.user.findMany({
    where: { username: { in: [target, ...sources, 'CartoonReOrbitOfficial'] } },
    select: { id: true, username: true }
  })
  const idByName = new Map(users.map(u => [u.username, u.id]))
  const missing = [target, ...sources, 'CartoonReOrbitOfficial'].filter(n => !idByName.has(n))
  if (missing.length) throw createError({ statusCode: 400, statusMessage: `Unknown username(s): ${missing.join(', ')}` })

  const targetId   = idByName.get(target)
  const sourceIds  = sources.map(n => idByName.get(n))
  const officialId = idByName.get('CartoonReOrbitOfficial')

  // target’s ever-owned items
  const everRows = await prisma.ctoonOwnerLog.findMany({
    where: { userId: targetId, userCtoonId: { not: null } },
    select: { userCtoonId: true },
    distinct: ['userCtoonId']
  })
  const everIds = everRows.map(r => r.userCtoonId)

  // seeds: originated from a source and later owned by target
  let seedIds = []
  if (everIds.length) {
    const logs = await prisma.ctoonOwnerLog.findMany({
      where: { userCtoonId: { in: everIds } },
      select: { userCtoonId: true, userId: true, createdAt: true },
      orderBy: [{ userCtoonId: 'asc' }, { createdAt: 'asc' }]
    })
    const firstOwnerById = new Map()
    for (const row of logs) {
      if (!firstOwnerById.has(row.userCtoonId) && row.userId) firstOwnerById.set(row.userCtoonId, row.userId)
    }
    for (const [uctId, ownerId] of firstOwnerById.entries()) {
      if (sourceIds.includes(ownerId)) seedIds.push(uctId)
    }
  }

  // only currently owned by target
  const currentSeeds = seedIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: seedIds }, userId: targetId, burnedAt: null },
        select: {
          id: true,
          userId: true,
          ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } },
          mintNumber: true
        }
      })
    : []

  // auction points to remove from target
  let pointsToRemove = 0
  if (seedIds.length) {
    const agg = await prisma.auction.aggregate({
      where: { userCtoonId: { in: seedIds }, status: 'CLOSED', creatorId: targetId, winnerId: { not: null } },
      _sum: { highestBid: true }
    })
    pointsToRemove = Math.max(0, agg._sum.highestBid || 0)
  }

  let auctionsCreated = 0
  let transferredCount = 0
  let sourceAuctionsCreated = 0
  let sourceTransferredCount = 0
  let deactivatedCount = 0

  const targetErrors = [] // [{userCtoonId, phase, message}]
  const sourceErrors = []

  const now = new Date()
  const endAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // helper to post to Discord with 2s delay and error capture
  async function notifyDiscord(row, created) {
    await sleep(2000)
    const botToken = process.env.BOT_TOKEN
    const guildId  = process.env.DISCORD_GUILD_ID

    if (!botToken || !guildId) {
      console.error('Missing BOT_TOKEN or DISCORD_GUILD_ID env vars.')
      return
    }

    // Ensure proper Discord auth header
    const authHeader =
      botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`

    // 1) Look up the "cmart-alerts" channel by name
    const channelsRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
        },
      }
    )

    if (!channelsRes.ok) {
      console.error(
        'Failed to fetch guild channels:',
        channelsRes.status,
        channelsRes.statusText
      )
      return
    }

    const channels = await channelsRes.json()
    const targetChannel = channels.find(
      (ch) => ch.type === 0 && ch.name === 'cmart-alerts' // type 0 = text channel
    )

    if (!targetChannel) {
      console.error('No channel named "cmart-alerts" found in the guild.')
      return
    }

    const channelId = targetChannel.id
    const baseUrl =
      process.env.PUBLIC_BASE_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://www.cartoonreorbit.com'
        : `http://localhost:${process.env.SOCKET_PORT || 3000}`)
    const auctionLink = `${baseUrl}/auction/${created.auctionId}`
    const rawImageUrl = row.ctoon?.assetPath
      ? (row.ctoon.assetPath.startsWith('http') ? row.ctoon.assetPath : `${baseUrl}${row.ctoon.assetPath}`)
      : null
    const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null
    const payload = {
      content: `A new auction is now live!`,
      embeds: [{
        title: row.ctoon?.name || 'cToon',
        url: auctionLink,
        description: [
          `**Rarity:** ${row.ctoon?.rarity ?? 'N/A'}`,
          `**Mint #:** ${row.mintNumber ?? 'N/A'}`,
          `**Starting Bid:** ${created.initialBet} pts`,
          `**Duration:** 3 day(s)`
        ].join('\n'),
        ...(imageUrl ? { image: { url: imageUrl } } : {})
      }]
    }
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `${process.env.BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }

  // process one item with 2s pauses between phases; return {auctionId, initialBet}
  async function processItem(row, errorSink) {
    // phase 1: transfer
    try {
      await sleep(2000)
      await prisma.$transaction(async (tx) => {
        const active = await tx.auction.findFirst({
          where: { userCtoonId: row.id, status: 'ACTIVE' },
          select: { id: true }
        })
        if (active) throw new Error('Item already has an ACTIVE auction.')

        await tx.userCtoon.update({
          where: { id: row.id },
          data: { userId: officialId, isTradeable: false }
        })

        await tx.userTradeListItem.deleteMany({
          where: { userCtoonId: row.id, userId: { not: officialId } }
        })

        await tx.ctoonOwnerLog.create({
          data: { userId: officialId, userCtoonId: row.id, ctoonId: row.ctoon?.id ?? null, mintNumber: row.mintNumber ?? null }
        })
      })
      transferredCount++ // caller will override to sourceTransferredCount when needed
    } catch (e) {
      errorSink.push({ userCtoonId: row.id, phase: 'transfer', message: String(e?.message || e) })
      return null
    }

    // phase 2: auction
    let created
    try {
      await sleep(2000)
      created = await prisma.$transaction(async (tx) => {
        const active = await tx.auction.findFirst({
          where: { userCtoonId: row.id, status: 'ACTIVE' },
          select: { id: true }
        })
        if (active) throw new Error('ACTIVE auction found after transfer.')

        const initialBet = rarityPrice(row.ctoon?.rarity)
        const a = await createAuction(tx, row.id, initialBet, endAt, officialId)
        return { auctionId: a.id, initialBet }
      })
    } catch (e) {
      errorSink.push({ userCtoonId: row.id, phase: 'auction', message: String(e?.message || e) })
      return null
    }

    // phase 3: discord
    try {
      await notifyDiscord(row, created)
    } catch (e) {
      errorSink.push({ userCtoonId: row.id, phase: 'discord', message: String(e?.message || e) })
      // non-fatal
    }

    return created
  }

  // target-held seed items
  for (const row of currentSeeds) {
    const res = await processItem(row, targetErrors)
    if (res) auctionsCreated++
    else {
      // if transfer succeeded but auction failed, our counter increment may be off.
      // We keep counters consistent with successful auction creation only.
    }
  }

  // remove points from target
  let pointsRemoved = 0
  if (pointsToRemove > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        const up = await tx.userPoints.upsert({
          where: { userId: targetId },
          update: { points: { decrement: pointsToRemove } },
          create: { userId: targetId, points: Math.max(0, 0 - pointsToRemove) }
        })
        await tx.pointsLog.create({
          data: {
            userId: targetId,
            direction: 'decrease',
            points: pointsToRemove,
            total: up.points,
            method: 'CHEATING_REVOKE_AUCTION'
          }
        })
        pointsRemoved = pointsToRemove
      })
    } catch (e) {
      // expose points removal failure
      targetErrors.push({ userCtoonId: null, phase: 'points', message: String(e?.message || e) })
    }
  }

  // sources: transfer all their current items and auction
  if (sourceIds.length) {
    const sourceItems = await prisma.userCtoon.findMany({
      where: { userId: { in: sourceIds }, burnedAt: null },
      select: {
        id: true,
        userId: true,
        ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } },
        mintNumber: true
      }
    })

    for (const row of sourceItems) {
      const beforeTransfers = sourceTransferredCount
      const res = await processItem(row, sourceErrors)
      if (res) {
        sourceAuctionsCreated++
        // processItem already incremented transferredCount; adjust counters for source buckets
        if (sourceTransferredCount === beforeTransfers) {
          sourceTransferredCount++
          transferredCount-- // avoid double-counting across target vs source buckets
        }
      } else {
        // nothing else
      }
    }

    // deactivate sources
    try {
      const { count } = await prisma.user.updateMany({
        where: { id: { in: sourceIds }, active: true },
        data:  { active: false, banned: true } 
      })
      deactivatedCount = count
    } catch (e) {
      sourceErrors.push({ userCtoonId: null, phase: 'deactivate_sources', message: String(e?.message || e) })
    }
  }

  return {
    target,
    sources,
    deactivatedSources: deactivatedCount,
    transferredCount,            // target + source transfers combined
    auctionsCreated,             // auctions from target-held seeds
    pointsRemoved,
    sourceTransferredCount,      // transfers from sources
    sourceAuctionsCreated,       // auctions from sources
    // detailed errors to display in UI
    errors: {
      target: targetErrors,
      sources: sourceErrors
    }
  }
})
