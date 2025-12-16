// server/middleware/dailyPoints.js
import { DateTime } from 'luxon'
import { prisma }   from '@/server/prisma'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) return

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
    where: { userId },
    create: { userId, points: 0, lastDailyAward: null },
    update: {}
  })

  // 4. Determine award based on account age
  //    Load global config for dynamic point values with safe fallbacks
  let cfg
  try {
    cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: {
      dailyLoginPoints: true, dailyNewUserPoints: true
    } })
  } catch {
    cfg = null
  }
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true }
  })

  // Calculate UTC threshold for “7 days ago” in Chicago time
  const sevenDaysAgoLocal = chicagoNow.minus({ days: 7 })
  const sevenDaysAgoUtc = sevenDaysAgoLocal.toUTC().toJSDate()

  // If user.createdAt is after threshold → new user → 1000, else 500
  const newUser = (userRecord?.createdAt >= sevenDaysAgoUtc)
  const awardPoints = newUser
    ? Number(cfg?.dailyNewUserPoints ?? 1000)
    : Number(cfg?.dailyLoginPoints   ?? 500)

  // 5. Award points if eligible, and log
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.userPoints.updateMany({
      where: {
        userId,
        OR: [
          { lastDailyAward: null },
          { lastDailyAward: { lt: boundaryUtc } }
        ]
      },
      data: {
        points:         { increment: awardPoints },
        lastDailyAward: chicagoNow.toUTC().toJSDate()
      }
    })

    if (count > 0) {
      const updated = await tx.userPoints.findUnique({ where: { userId } })
      await tx.pointsLog.create({
        data: {
          userId,
          points:    awardPoints,
          total:     updated.points,
          method:    "Daily Login",
          direction: 'increase'
        }
      })
    }
  })
})
