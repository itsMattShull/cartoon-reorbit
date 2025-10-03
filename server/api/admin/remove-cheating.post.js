import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function rarityPrice(r) {
  const s = (r || '').toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (s === 'common') return 25
  if (s === 'uncommon') return 50
  if (s === 'rare') return 100
  if (s === 'very rare') return 187
  if (s === 'crazy rare') return 312
  return 50
}

async function createAuctionFor(tx, userCtoonId, initialBet, endAt, creatorId) {
  return tx.auction.create({
    data: {
      userCtoonId,
      initialBet,
      duration: 3,
      endAt,
      creatorId
    },
    select: { id: true }
  })
}

export default defineEventHandler(async (event) => {
  // admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // input
  const body = await readBody(event)
  const target = String(body?.target || '').trim()
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
  const targetId = idByName.get(target)
  const sourceIds = sources.map(n => idByName.get(n))
  const officialId = idByName.get('CartoonReOrbitOfficial')

  // find all target's ever-owned userCtoonIds
  const everRows = await prisma.ctoonOwnerLog.findMany({
    where: { userId: targetId, userCtoonId: { not: null } },
    select: { userCtoonId: true },
    distinct: ['userCtoonId']
  })
  const everIds = everRows.map(r => r.userCtoonId)
  if (!everIds.length) {
    // still enforce sources
    // continue; do not early-return so sources get handled
  }

  // earliest owner per userCtoon (for target-derived seeds)
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

  // only those currently owned by target can be transferred
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

  // compute points to remove from target
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

  const now = new Date()
  const endAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // transfer + create auctions for target-held seed items
  for (const row of currentSeeds) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const active = await tx.auction.findFirst({
          where: { userCtoonId: row.id, status: 'ACTIVE' },
          select: { id: true }
        })
        if (active) return null

        await tx.userCtoon.update({
          where: { id: row.id },
          data: { userId: officialId, isTradeable: false }
        })

        const initialBet = rarityPrice(row.ctoon?.rarity)
        const a = await createAuctionFor(tx, row.id, initialBet, endAt, officialId)

        await tx.ctoonOwnerLog.create({
          data: { userId: officialId, userCtoonId: row.id, ctoonId: row.ctoon?.id ?? null, mintNumber: row.mintNumber ?? null }
        })

        return { auctionId: a.id, initialBet }
      })
      if (!created) continue
      auctionsCreated++
      transferredCount++

      // best-effort Discord
      try {
        const channelId = process.env.AUCTION_CHANNEL_ID || '1401244687163068528'
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
          content: `A cheating enforcement auction is now live.`,
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
      } catch {}
    } catch {}
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
    } catch {}
  }

  // ENFORCE SOURCES: transfer all their CURRENT cToons and auction them
  if (sourceIds.length) {
    // fetch all current UserCtoons for sources
    // omit burned and skip ones already under ACTIVE auction
    const sourceItems = await prisma.userCtoon.findMany({
      where: {
        userId: { in: sourceIds },
        burnedAt: null
      },
      select: {
        id: true,
        userId: true,
        ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } },
        mintNumber: true
      }
    })

    for (const row of sourceItems) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const active = await tx.auction.findFirst({
            where: { userCtoonId: row.id, status: 'ACTIVE' },
            select: { id: true }
          })
          if (active) return null

          await tx.userCtoon.update({
            where: { id: row.id },
            data: { userId: officialId, isTradeable: false }
          })

          const initialBet = rarityPrice(row.ctoon?.rarity)
          const a = await createAuctionFor(tx, row.id, initialBet, endAt, officialId)

          await tx.ctoonOwnerLog.create({
            data: { userId: officialId, userCtoonId: row.id, ctoonId: row.ctoon?.id ?? null, mintNumber: row.mintNumber ?? null }
          })

          return { auctionId: a.id, initialBet }
        })
        if (!created) continue
        sourceAuctionsCreated++
        sourceTransferredCount++

        // best-effort Discord
        try {
          const channelId = process.env.AUCTION_CHANNEL_ID || '1401244687163068528'
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
            content: `A source enforcement auction is now live.`,
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
        } catch {}
      } catch {}
    }

    // Deactivate all source users
    const { count: deactivatedCount } = await prisma.user.updateMany({
      where: { id: { in: sourceIds }, active: true },
      data:  { active: false }
    })
  }

  return {
    target,
    sources,
    deactivatedSources: deactivatedCount,
    transferredCount,           // target-held seed items moved
    auctionsCreated,            // target-held seed auctions
    pointsRemoved,
    sourceTransferredCount,     // total items moved from all sources
    sourceAuctionsCreated       // auctions created from all sources
  }
})
