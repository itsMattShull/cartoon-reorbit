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

import { PrismaClient } from '@prisma/client'
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

let prisma
function db () {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

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
  const [pack, userPts] = await Promise.all([
    db().pack.findUnique({ where: { id: packId }, select: { id: true, price: true, inCmart: true } }),
    db().userPoints.findUnique({ where: { userId: me.id }, select: { points: true } })
  ])
  if (!pack || !pack.inCmart) {
    throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }
  if ((userPts?.points || 0) < pack.price) {
    throw createError({ statusCode: 400, statusMessage: 'Not enough points' })
  }

  /* 4.  transaction: deduct points + create sealed pack ----------------- */
  const result = await db().$transaction(async (tx) => {
    // 4-a  deduct points
    await tx.userPoints.update({
      where: { userId: me.id },
      data: { points: { decrement: pack.price } }
    })

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
