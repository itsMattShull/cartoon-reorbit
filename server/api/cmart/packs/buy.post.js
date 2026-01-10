// server/api/cmart/packs/buy.post.js
// Player buys a sealed Pack with points.
//
// Body: { packId: "uuid" }
//
// Rules
// -----
// • user must be logged-in
// • pack must exist + be inCmart = true
// • user must have ≥ pack.price points
// • deduct points, create a UserPack row (sealed)

import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

import { prisma as db } from '@/server/prisma'


export default defineEventHandler(async (event) => {
  /* 1.  authenticate user ------------------------------------------------ */
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  /* 2.  parse body ------------------------------------------------------- */
  const { packId } = await readBody(event)
  if (!packId) {
    throw createError({ statusCode: 400, statusMessage: 'packId required' })
  }

  /* 3.  lookup pack & user points --------------------------------------- */
  const [pack, userPts, activeLocks] = await Promise.all([
    db.pack.findUnique({ where: { id: packId }, select: { id: true, price: true, inCmart: true } }),
    db.userPoints.findUnique({ where: { userId: me.id }, select: { points: true } }),
    db.lockedPoints.findMany({
      where: { userId: me.id, status: 'ACTIVE' },
      select: { amount: true }
    })
  ])
  if (!pack || !pack.inCmart) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }
  const totalPoints = userPts?.points || 0
  const lockedSum = activeLocks.reduce((acc, lock) => acc + (lock.amount || 0), 0)
  const availablePoints = totalPoints - lockedSum
  if (availablePoints < pack.price) {
    throw createError({ statusCode: 400, statusMessage: 'Not enough available points' })
  }

  /* 4.  transaction: deduct points + create sealed pack ----------------- */
  const result = await db.$transaction(async (tx) => {
    // 4-a  deduct points
    const updated = await tx.userPoints.update({
      where: { userId: me.id },
      data: { points: { decrement: pack.price } }
    })

    await tx.pointsLog.create({
      data: { userId: me.id, points: pack.price, total: updated.points, method: "Bought Pack", direction: 'decrease' }
    });

    // 4-b  create UserPack (sealed)
    const userPack = await tx.userPack.create({
      data: {
        userId: me.id,
        packId: pack.id,
        opened: false   // unopened
      }
    })

    return userPack
  })

  /* 5.  success response ------------------------------------------------- */
  return { success: true, userPackId: result.id }
})
