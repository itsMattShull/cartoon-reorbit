// /api/admin/packs.get.js
// List packs OR, when ?id=<uuid> is given, return that single pack.

import { defineEventHandler, getQuery, createError } from 'h3'

import { prisma } from '@/server/prisma'
async function assertAdmin (event) {
  const user = event.context.user
  if (!user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}

export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const { id, page = '1', limit = '50' } = getQuery(event)

  try {
    if (id) {
      // ── SINGLE PACK ─────────────────────────────────────
      const pack = await prisma.pack.findUnique({
        where: { id },
        include: {
          rarityConfigs: true, // includes probabilityPercent
          ctoonOptions: {
            include: { ctoon: true } // optional: enrich cToon details
          }
        }
      })
      if (!pack) {
        throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
      }
      return pack
    }

    // ── LIST ALL PACKS ────────────────────────────────────
    const pageNum = Math.max(parseInt(page, 10) || 1, 1)
    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
    const skip = (pageNum - 1) * take

    const [total, items] = await Promise.all([
      prisma.pack.count(),
      prisma.pack.findMany({
        include: {
          rarityConfigs: true // include probabilities in list too
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ])

    return { items, total, page: pageNum, limit: take }
  } catch (err) {
    console.error('[GET /api/admin/packs]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
