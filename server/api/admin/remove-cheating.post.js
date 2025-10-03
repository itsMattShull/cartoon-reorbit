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
    return { transferredCount: 0, auctionsCreated: 0, pointsRemoved: 0, note: 'Target has no history.' }
  }

  // earliest owner per userCtoon
  const logs = await prisma.ctoonOwnerLog.findMany({
    where: { userCtoonId: { in: everIds } },
    select: { userCtoonId: true, userId: true, createdAt: true },
    orderBy: [{ userCtoonId: 'asc' }, { createdAt: 'asc' }]
  })
  const firstOwnerById = new Map()
  for (const row of logs) {
    if (!firstOwnerById.has(row.userCtoonId) && row.userId) firstOwnerById.set(row.userCtoonId, row.userId)
  }

  // seedIds = originated at any source
  const seedIds = []
  for (const [uctId, ownerId] of firstOwnerById.entries()) {
    if (sourceIds.includes(ownerId)) seedIds.push(uctId)
  }
  if (!seedIds.length) {
    return { transferredCount: 0, auctionsCreated: 0, pointsRemoved: 0, note: 'No relevant seed items.' }
  }

  // only those currently owned by target can be transferred
  const currentSeeds = await prisma.userCtoon.findMany({
    where: { id: { in: seedIds }, userId: targetId, burnedAt: null },
    select: {
      id: true,
      userId: true,
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } },
      mintNumber: true
    }
  })
  const idsToTransfer = currentSeeds.map(r => r.id)

  // compute auction points gained previously for all seeds, then deduct
  const agg = await prisma.auction.aggregate({
    where: { userCtoonId: { in: seedIds }, status: 'CLOSED', creatorId: targetId, winnerId: { not: null } },
    _sum: { highestBid: true }
  })
  const pointsToRemove = Math.max(0, agg._sum.highestBid || 0)

  let auctionsCreated = 0
  let transferredCount = 0
  const now = new Date()
  const endAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // transfer + create auctions atomically per item
  for (const row of currentSeeds) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        // confirm not already under active auction
        const active = await tx.auction.findFirst({
          where: { userCtoonId: row.id, status: 'ACTIVE' },
          select: { id: true }
        })
        if (active) return null

        // transfer ownership to official
        await tx.userCtoon.update({
          where: { id: row.id },
          data: { userId: officialId, isTradeable: false }
        })

        // create auction directly
        const initialBet = rarityPrice(row.ctoon?.rarity)
        const a = await tx.auction.create({
          data: {
            userCtoonId: row.id,
            initialBet,
            duration: 3,
            endAt,
            creatorId: officialId
          },
          select: { id: true }
        })

        // owner log for transfer
        await tx.ctoonOwnerLog.create({
          data: { userId: officialId, userCtoonId: row.id, ctoonId: row.ctoon?.id ?? null, mintNumber: row.mintNumber ?? null }
        })

        return { auctionId: a.id, initialBet }
      })
      if (!created) continue
      auctionsCreated++
      transferredCount++

      // best-effort Discord post
      try {
        const botToken  = process.env.BOT_TOKEN
        const channelId = process.env.AUCTION_CHANNEL_ID || '1401244687163068528'
        const baseUrl   =
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
      } catch {}
    } catch {}
  }

  // remove points from target (if any)
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

  return {
    target,
    sources,
    transferredCount,
    auctionsCreated,
    pointsRemoved
  }
})
