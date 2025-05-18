// server/middleware/dailyPoints.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // Only run for logged-in users
  const user = event.context.user
  if (!user) return

  // 1. Compute “window start” at 8 PM CST
  const now = new Date()
  const cstNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  )

  let boundary = new Date(cstNow)
  boundary.setHours(20, 0, 0, 0)      // today at 20:00 CST
  if (cstNow < boundary) {
    boundary.setDate(boundary.getDate() - 1)  // before 8 PM → go to yesterday 8 PM
  }

  // Convert boundary back to UTC for DB comparison
  const boundaryUtc = new Date(
    boundary.toLocaleString('en-US', { timeZone: 'UTC' })
  )

  // 2. Ensure there’s a UserPoints row
  const pts = await prisma.userPoints.upsert({
    where: { userId: user.id },
    create: { userId: user.id, points: 0, lastDailyAward: null },
    update: {}
  })

  // 3. If they haven’t yet received today’s award, give 500 and update timestamp
  if (!pts.lastDailyAward || new Date(pts.lastDailyAward) < boundaryUtc) {
    await prisma.userPoints.update({
      where: { userId: user.id },
      data: {
        points: { increment: 500 },
        lastDailyAward: new Date()
      }
    })
  }
})
