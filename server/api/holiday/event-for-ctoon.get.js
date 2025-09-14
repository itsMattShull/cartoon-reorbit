// Returns the most-recent HolidayEvent (active or not) that lists the given ctoonId
import { prisma } from '@/server/prisma'
import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const ctoonId = getQuery(event).ctoonId
  if (!ctoonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId' })
  }

  const ev = await prisma.holidayEvent.findFirst({
    where: { items: { some: { ctoonId } } },
    orderBy: { startsAt: 'desc' },
    select: { id: true, name: true, startsAt: true, endsAt: true, minRevealAt: true }
  })

  return ev || null
})
