// server/api/wishlist/accept/[id].post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  const recipientId = me?.id
  if (!recipientId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // params
  const wishlistItemId = event.context.params?.id
  if (!wishlistItemId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  // load wishlist item + cToon name
  const wi = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    select: { id: true, userId: true, ctoonId: true, offeredPoints: true, ctoon: { select: { name: true } } }
  })
  if (!wi) throw createError({ statusCode: 404, statusMessage: 'Wishlist item not found' })

  const initiatorId = wi.userId
  if (initiatorId === recipientId) throw createError({ statusCode: 400, statusMessage: 'Self trade not allowed' })
  if (!Number.isInteger(wi.offeredPoints) || wi.offeredPoints <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid offeredPoints' })
  }

  // preflight points
  const initiatorPts = await prisma.userPoints.findUnique({ where: { userId: initiatorId } })
  if ((initiatorPts?.points || 0) < wi.offeredPoints) {
    throw createError({ statusCode: 400, statusMessage: 'Wishlist owner lacks sufficient points' })
  }

  // preflight ownership
  const ownsCount = await prisma.userCtoon.count({
    where: { userId: recipientId, ctoonId: wi.ctoonId }
  })
  if (ownsCount === 0) throw createError({ statusCode: 400, statusMessage: 'You do not own this cToon' })

  // grab initiator discord id now for DM later
  const initiator = await prisma.user.findUnique({
    where: { id: initiatorId },
    select: { discordId: true, username: true }
  })

  // txn
  const result = await prisma.$transaction(async (tx) => {
    // re-check points in txn
    const ptsNow = await tx.userPoints.findUnique({ where: { userId: initiatorId } })
    if ((ptsNow?.points || 0) < wi.offeredPoints) {
      throw createError({ statusCode: 400, statusMessage: 'Wishlist owner lacks sufficient points' })
    }

    // pick highest mint owned by recipient
    let uc = await tx.userCtoon.findFirst({
      where: { userId: recipientId, ctoonId: wi.ctoonId, mintNumber: { not: null } },
      orderBy: { mintNumber: 'desc' },
      select: { id: true, ctoonId: true, mintNumber: true }
    })
    if (!uc) {
      uc = await tx.userCtoon.findFirst({
        where: { userId: recipientId, ctoonId: wi.ctoonId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, ctoonId: true, mintNumber: true }
      })
    }
    if (!uc) throw createError({ statusCode: 400, statusMessage: 'You no longer own this cToon' })

    // create accepted trade
    const offer = await tx.tradeOffer.create({
      data: { initiatorId, recipientId, pointsOffered: wi.offeredPoints, status: 'ACCEPTED' },
      select: { id: true }
    })

    // move points
    const afterInitiator = await tx.userPoints.update({
      where: { userId: initiatorId },
      data: { points: { decrement: wi.offeredPoints } }
    })
    await tx.pointsLog.create({
      data: { userId: initiatorId, points: wi.offeredPoints, total: afterInitiator.points, method: 'Wishlist Trade', direction: 'decrease' }
    })

    const afterRecipient = await tx.userPoints.upsert({
      where: { userId: recipientId },
      update: { points: { increment: wi.offeredPoints } },
      create: { userId: recipientId, points: wi.offeredPoints }
    })
    await tx.pointsLog.create({
      data: { userId: recipientId, points: wi.offeredPoints, total: afterRecipient.points, method: 'Wishlist Trade', direction: 'increase' }
    })

    // transfer highest mint to initiator
    const transferred = await tx.userCtoon.update({
      where: { id: uc.id },
      data: { userId: initiatorId }
    })
    await tx.ctoonOwnerLog.create({
      data: { userId: initiatorId, ctoonId: transferred.ctoonId, userCtoonId: transferred.id, mintNumber: transferred.mintNumber }
    })

    // remove wishlist item
    await tx.wishlistItem.delete({ where: { id: wishlistItemId } })

    return {
      offerId: offer.id,
      transferredUserCtoonId: transferred.id,
      transferredMint: transferred.mintNumber
    }
  })

  // try to DM initiator. do not fail endpoint if this errors.
  try {
    if (initiator?.discordId && process.env.BOT_TOKEN) {
      const BOT_TOKEN = process.env.BOT_TOKEN
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd ? 'https://www.cartoonreorbit.com/trade-offers' : 'http://localhost:3000/trade-offers'

      const dmChannel = await $fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          'Authorization': `${BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: { recipient_id: initiator.discordId }
      })

      const ctoonName = wi.ctoon?.name ?? 'a cToon'
      const messageContent = [
        `🎉 **${me.username}** traded **${ctoonName}** for **${wi.offeredPoints}** points from your Wishlist!`
      ].join('\n')

      await $fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `${BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: { content: messageContent }
      })
    }
  } catch {
    // ignore DM failures
  }

  return { success: true, ...result }
})
