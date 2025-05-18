// server/api/visit.post.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, readBody } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const viewerId = event.context.user?.id
  const ownerId  = body.zoneOwnerId

  // invalid or self-visit
  if (!viewerId || !ownerId || viewerId === ownerId) {
    return { success: false, message: 'Invalid visit' }
  }

  // ── compute CST "window start" at 8pm CST ───────────────────────────────
  const now     = new Date()
  const cstNow  = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
  )
  let windowStart = new Date(cstNow)
  windowStart.setHours(20, 0, 0, 0)      // today at 20:00 CST
  if (cstNow < windowStart) {
    windowStart.setDate(windowStart.getDate() - 1)  // move back to yesterday 20:00
  }
  // convert back to UTC for DB comparison
  const windowStartUtc = new Date(
    windowStart.toLocaleString('en-US', { timeZone: 'UTC' })
  )

  // ── 1) overall visits in window ─────────────────────────────────────────
  const totalVisits = await prisma.visit.count({
    where: {
      userId: viewerId,
      createdAt: { gte: windowStartUtc }
    }
  })
  if (totalVisits >= 10) {
    return { success: false, message: 'Daily limit of 10 visits reached' }
  }

  // ── 2) one visit per owner in window ────────────────────────────────────
  const existingForOwner = await prisma.visit.findFirst({
    where: {
      userId:      viewerId,
      zoneOwnerId: ownerId,
      createdAt:   { gte: windowStartUtc }
    }
  })
  if (existingForOwner) {
    return { success: false, message: 'Already awarded points for this zone owner in this period' }
  }

  // ── 3) log the visit ─────────────────────────────────────────────────────
  await prisma.visit.create({
    data: { userId: viewerId, zoneOwnerId: ownerId }
  })

  // ── 4) award points ──────────────────────────────────────────────────────
  await prisma.userPoints.upsert({
    where: { userId: viewerId },
    update: { points: { increment: 20 } },
    create: { userId: viewerId, points: 20 }
  })

  return { success: true, message: 'Points awarded' }
})
