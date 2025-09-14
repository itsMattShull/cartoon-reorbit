// /api/admin/holiday-events.get.js
// List holiday events OR, when ?id=<uuid> is given, return that single event.

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

  const { id } = getQuery(event)

  try {
    if (id) {
      // ── SINGLE HOLIDAY EVENT ───────────────────────────────
      const holidayEvent = await prisma.holidayEvent.findUnique({
        where: { id },
        include: {
          items: {
            include: { ctoon: true }
          },
          poolEntries: {
            include: { ctoon: true }
          },
          _count: {
            select: { items: true, poolEntries: true }
          }
        }
      })
      if (!holidayEvent) {
        throw createError({ statusCode: 404, statusMessage: 'Holiday event not found' })
      }
      return holidayEvent
    }

    // ── LIST ALL HOLIDAY EVENTS ─────────────────────────────
    return await prisma.holidayEvent.findMany({
      include: {
        _count: { select: { items: true, poolEntries: true } }
      },
      orderBy: { startsAt: 'desc' }
    })
  } catch (err) {
    console.error('[GET /api/admin/holiday-events]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
