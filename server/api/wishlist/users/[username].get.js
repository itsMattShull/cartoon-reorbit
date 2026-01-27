// server/api/wishlist/users/[username].get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const username = event.context.params?.username
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' })
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      points: { select: { points: true } }, // UserPoints relation
      wishlistItems: {
        select: {
          id: true,
          offeredPoints: true,
          createdAt: true,
          ctoon: true
        }
      }
    }
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const available = user.points?.points ?? 0
  const wishlistItems = Array.isArray(user.wishlistItems) ? user.wishlistItems : []
  const ctoonIds = [...new Set(wishlistItems.map(item => item.ctoon?.id).filter(Boolean))]
  let viewerCtoons = []
  if (ctoonIds.length > 0) {
    viewerCtoons = await prisma.userCtoon.findMany({
      where: {
        userId: requesterId,
        ctoonId: { in: ctoonIds }
      },
      select: { ctoonId: true, mintNumber: true }
    })
  }

  const viewerInfo = new Map()
  for (const entry of viewerCtoons) {
    const info = viewerInfo.get(entry.ctoonId) || { count: 0, maxMint: null, hasMint: false }
    info.count += 1
    if (entry.mintNumber !== null && entry.mintNumber !== undefined) {
      info.hasMint = true
      info.maxMint = info.maxMint === null ? entry.mintNumber : Math.max(info.maxMint, entry.mintNumber)
    }
    viewerInfo.set(entry.ctoonId, info)
  }

  return wishlistItems.map(({ id, offeredPoints, createdAt, ctoon }) => {
    const info = viewerInfo.get(ctoon?.id) || { count: 0, maxMint: null, hasMint: false }
    return {
      id,
      offeredPoints,
      createdAt,
      hasEnough: available >= offeredPoints,
      ctoon,
      viewerOwnedCount: info.count,
      viewerTradeMintNumber: info.maxMint,
      viewerTradeUsesNewest: info.count > 0 && !info.hasMint
    }
  })
})
