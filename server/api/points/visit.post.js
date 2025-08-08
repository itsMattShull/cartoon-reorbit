// server/api/visit.post.js

import { defineEventHandler, readBody } from 'h3'
import { DateTime } from 'luxon'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const viewerId = event.context.user?.id
  const ownerId  = body.zoneOwnerId

  // ── guard clauses ──────────────────────────────────────────────────────
  if (!viewerId || !ownerId || viewerId === ownerId) {
    return { success: false, message: 'Invalid visit' }
  }

  // ── compute CST daily window boundary (8 PM CST → 7 : 59 PM next day) ──
  const chicagoNow   = DateTime.now().setZone('America/Chicago')
  let boundaryLocal  = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) {
    boundaryLocal = boundaryLocal.minus({ days: 1 })
  }
  const boundaryUtc  = boundaryLocal.toUTC().toJSDate()

  // ── 1) overall visits in window ─────────────────────────────────────────
  const totalVisits = await prisma.visit.count({
    where: {
      userId: viewerId,
      createdAt: { gte: boundaryUtc },
    },
  })
  if (totalVisits >= 10) {
    return { success: false, message: 'Daily limit of 10 visits reached' }
  }

  // ── 2) one visit per owner in window ────────────────────────────────────
  const existingForOwner = await prisma.visit.findFirst({
    where: {
      userId:      viewerId,
      zoneOwnerId: ownerId,
      createdAt:   { gte: boundaryUtc },
    },
  })
  if (existingForOwner) {
    return { success: false, message: 'Already awarded points for this zone owner in this period' }
  }

  // ── 3) log the visit ────────────────────────────────────────────────────
  await prisma.visit.create({
    data: { userId: viewerId, zoneOwnerId: ownerId },
  })

  // ── 4) award points ─────────────────────────────────────────────────────
  const updated = await prisma.userPoints.upsert({
    where:  { userId: viewerId },
    update: { points: { increment: 20 } },
    create: { userId: viewerId, points: 20 },
  })

  await prisma.pointsLog.create({
    data: { userId: viewerId, points: 20, total: updated.points, method: "cZone Visit", direction: 'increase' }
  });

  return { success: true, message: 'Points awarded' }
})
