// server/middleware/dailyPoints.js
// Uses **Luxon** instead of date‑fns‑tz for robust timezone handling

import { DateTime } from 'luxon'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const user = event.context.userId
  if (!user) return

  // 1. Current Chicago time (handles DST automatically)
  const chicagoNow = DateTime.now().setZone('America/Chicago')

  // 2. Boundary = most recent 8 PM Chicago time
  let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) {
    boundaryLocal = boundaryLocal.minus({ days: 1 })
  }

  // 3. Convert boundary to native JS Date in UTC for DB comparisons
  const boundaryUtc = boundaryLocal.toUTC().toJSDate()

  // 4. Ensure a UserPoints row exists
  await prisma.userPoints.upsert({
    where: { userId: user },
    create: { userId: user, points: 0, lastDailyAward: null },
    update: {},
  })

  // 5. Atomically award 500 points if not yet claimed this window
  await prisma.userPoints.updateMany({
    where: {
      userId: user,
      OR: [
        { lastDailyAward: null },
        { lastDailyAward: { lt: boundaryUtc } },
      ],
    },
    data: {
      points: { increment: 500 },
      lastDailyAward: chicagoNow.toUTC().toJSDate(),
    },
  })
})
