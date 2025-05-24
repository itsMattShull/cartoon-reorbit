// /api/admin/packs.get.js
// List packs OR, when ?id=<uuid> is given, return that single pack.

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getQuery, createError } from 'h3'

let prisma
function db () {
  if (!prisma) prisma = new PrismaClient()
  return prisma
}

async function assertAdmin (event) {
  const user = event.context.user
  if (!user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}

export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const { id } = getQuery(event)

  try {
    if (id) {
      // ── SINGLE PACK ─────────────────────────────────────
      const pack = await db().pack.findUnique({
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
    return await db().pack.findMany({
      include: {
        rarityConfigs: true // include probabilities in list too
      },
      orderBy: { createdAt: 'desc' }
    })
  } catch (err) {
    console.error('[GET /api/admin/packs]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
