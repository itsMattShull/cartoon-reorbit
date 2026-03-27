// server/api/cmart/czones/buy.post.js
// Purchase an additional cZone slot with points.
//
// Rules
// -----
// • User must be logged in
// • Cost is firstAdditionalCzoneCost if user has 0 additionalCzones, else subsequentAdditionalCzoneCost
// • User must have enough available points (total minus active locks)
// • Deduct points, log the transaction, increment user's additionalCzones

import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  /* 1. Authenticate ------------------------------------------------------- */
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  /* 2. Fetch user record and global config -------------------------------- */
  const [userRecord, cfg, userPts, activeLocks] = await Promise.all([
    db.user.findUnique({
      where: { id: me.id },
      select: { additionalCzones: true }
    }),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' } }),
    db.userPoints.findUnique({ where: { userId: me.id }, select: { points: true } }),
    db.lockedPoints.findMany({
      where: { userId: me.id, status: 'ACTIVE' },
      select: { amount: true }
    })
  ])

  /* 3. Determine cost ----------------------------------------------------- */
  const currentAdditional = userRecord?.additionalCzones ?? 0
  const cost = currentAdditional < 1
    ? (cfg?.firstAdditionalCzoneCost      ?? 25000)
    : (cfg?.subsequentAdditionalCzoneCost ?? 50000)

  /* 4. Check available points -------------------------------------------- */
  const totalPoints = userPts?.points || 0
  const lockedSum   = activeLocks.reduce((acc, l) => acc + (l.amount || 0), 0)
  const available   = totalPoints - lockedSum

  if (available < cost) {
    throw createError({ statusCode: 400, statusMessage: 'Not enough points' })
  }

  /* 5. Transaction: deduct points + increment additionalCzones ----------- */
  await db.$transaction(async (tx) => {
    const updated = await tx.userPoints.update({
      where: { userId: me.id },
      data:  { points: { decrement: cost } }
    })

    await tx.pointsLog.create({
      data: {
        userId:    me.id,
        points:    cost,
        total:     updated.points,
        method:    'Bought Additional cZone',
        direction: 'decrease'
      }
    })

    await tx.user.update({
      where: { id: me.id },
      data:  { additionalCzones: { increment: 1 } }
    })
  })

  /* 6. Success ------------------------------------------------------------ */
  return { success: true }
})
