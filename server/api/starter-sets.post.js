// server/api/starter-sets.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { mintQueue } from '../utils/queues'

export default defineEventHandler(async (event) => {
  // 1) Auth (rely on your auth middleware to set context)
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // 2) Input
  const { setId, setKey } = await readBody(event)
  if (!setId && !setKey) {
    throw createError({ statusCode: 400, statusMessage: 'setId or setKey required' })
  }

  // 3) Load the starter set with items + ctoons
  const where = setId ? { id: setId } : { key: String(setKey) }
  const set = await prisma.starterSet.findFirst({
    where: { ...where, isActive: true },
    include: {
      items: {
        orderBy: { position: 'asc' },
        select: {
          ctoon: {
            select: {
              id: true,
              perUserLimit: true
            }
          }
        }
      }
    }
  })

  if (!set) {
    throw createError({ statusCode: 404, statusMessage: 'Starter set not found or inactive' })
  }

  const ctoonIds = set.items
    .map(i => i.ctoon?.id)
    .filter(Boolean)

  if (!ctoonIds.length) {
    throw createError({ statusCode: 409, statusMessage: 'Starter set is empty' })
  }

  // 4) Check what the user already owns (and per-user limits)
  const existing = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { userId, ctoonId: { in: ctoonIds } },
    _count: { ctoonId: true }
  })
  const ownedCount = Object.fromEntries(existing.map(e => [e.ctoonId, e._count.ctoonId]))

  // Get per-user limits for those ids
  const ctoons = await prisma.ctoon.findMany({
    where: { id: { in: ctoonIds } },
    select: { id: true, perUserLimit: true }
  })
  const perUserMap = Object.fromEntries(ctoons.map(c => [c.id, c.perUserLimit]))

  // 5) Decide which to mint (skip ones over per-user limit)
  const toMint = []
  for (const id of ctoonIds) {
    const limit = perUserMap[id]
    const owned = ownedCount[id] || 0
    if (limit != null && owned >= limit) continue
    toMint.push(id)
  }

  if (!toMint.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No cToons could be granted (already owned or over limit)'
    })
  }

  // 6) Enqueue mints
  await Promise.all(
    toMint.map(ctoonId =>
      mintQueue.add('mintCtoon', { userId, ctoonId, isSpecial: true })
    )
  )

  return { success: true, added: toMint.length }
})
