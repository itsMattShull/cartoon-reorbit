// server/api/czone-mail/wall/[username].get.js
//
// The public wall: messages left on one player's cZone, visible to visitors.
//
// Auth is required, matching every other "look at another player's stuff"
// endpoint here (wishlist, trade list). An anonymous version would make the whole
// message graph scrapeable without an account.
//
// The wall deliberately excludes anything the owner has removed or hidden and
// anything from a sender they have blocked — otherwise deleting an unwanted
// message from your inbox would leave it publicly displayed on your own cZone.

import { defineEventHandler, getQuery, getRouterParam, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

const MAX_LIMIT = 25

export default defineEventHandler(async (event) => {
  const viewerId = event.context.userId
  if (!viewerId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const username = getRouterParam(event, 'username')
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Missing username.' })

  const owner = await db.user.findUnique({
    where: { username },
    select: { id: true, czoneMailWallEnabled: true, banned: true, active: true }
  })
  if (!owner || owner.banned || owner.active === false) {
    throw createError({ statusCode: 404, statusMessage: 'That player was not found.' })
  }

  const isOwner = owner.id === viewerId

  // Owners always see their own wall so they can moderate it, even with the wall
  // switched off for visitors.
  if (!owner.czoneMailWallEnabled && !isOwner) {
    return { items: [], nextCursor: null, wallEnabled: false, isOwner }
  }

  const q = getQuery(event)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 10))
  const cursor = typeof q.cursor === 'string' && q.cursor ? q.cursor : null

  const blockedSenders = await db.userBlock.findMany({
    where: { blockerId: owner.id },
    select: { blockedId: true }
  })
  const blockedIds = blockedSenders.map(b => b.blockedId)

  const rows = await db.cZoneMail.findMany({
    where: {
      recipientId: owner.id,
      deletedAt: null,
      hiddenFromWall: null,
      ...(blockedIds.length ? { senderId: { notIn: blockedIds } } : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      emoji: true,
      createdAt: true,
      sender: { select: { username: true, avatar: true } }
    }
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return {
    items: page.map(r => ({
      id: r.id,
      body: r.body,
      emoji: r.emoji,
      createdAt: r.createdAt,
      senderUsername: r.sender?.username || null,
      senderAvatar: r.sender?.avatar || null
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    wallEnabled: owner.czoneMailWallEnabled,
    isOwner
  }
})
