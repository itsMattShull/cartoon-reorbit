// server/middleware/dailyPoints.js
import { DateTime } from 'luxon'
import { prisma }   from '@/server/prisma'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const user = event.context.userId
  if (!user) return

  // 1. Current Chicago time
  const chicagoNow = DateTime.now().setZone('America/Chicago')

  // 2. Boundary = most recent 8 PM Chicago
  let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) {
    boundaryLocal = boundaryLocal.minus({ days: 1 })
  }
  const boundaryUtc = boundaryLocal.toUTC().toJSDate()

  // 3. Ensure UserPoints exists
  await prisma.userPoints.upsert({
    where: { userId: user },
    create: { userId: user, points: 0, lastDailyAward: null },
    update: {}
  })

  // 4. Try to award 500 if not yet claimed this window
  const { count } = await prisma.userPoints.updateMany({
    where: {
      userId: user,
      OR: [
        { lastDailyAward: null },
        { lastDailyAward: { lt: boundaryUtc } }
      ]
    },
    data: {
      points: { increment: 500 },
      lastDailyAward: chicagoNow.toUTC().toJSDate()
    }
  })

  // 5. Only log if we actually incremented
  if (count > 0) {
    await prisma.pointsLog.create({
      data: {
        userId:    user,
        points:    500,
        method:    "Daily Login",
        direction: 'increase'
      }
    })
  }
})
