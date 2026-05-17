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
  // Load config for max unique visits per day
  let cfg
  try {
    cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { czoneVisitMaxPerDay: true } })
  } catch {
    cfg = null
  }
  const maxVisits = Number(cfg?.czoneVisitMaxPerDay ?? 10)

  const totalVisits = await prisma.visit.count({
    where: {
      userId: viewerId,
      createdAt: { gte: boundaryUtc },
    },
  })
  if (totalVisits >= maxVisits) {
    return { success: false, message: `Daily limit of ${maxVisits} visits reached` }
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

  // ── 3) fetch visit points config ────────────────────────────────────────
  let cfg2
  try {
    cfg2 = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { czoneVisitPoints: true } })
  } catch {
    cfg2 = null
  }
  const visitPoints = Number(cfg2?.czoneVisitPoints ?? 20)

  // ── 4) atomically log the visit and award points ─────────────────────────
  // All three operations run in one transaction to prevent TOCTOU races where
  // concurrent requests pass the duplicate-visit check before any write lands.
  try {
    await prisma.$transaction(async (tx) => {
      // Re-check total visits inside transaction
      const totalVisitsInTx = await tx.visit.count({
        where: { userId: viewerId, createdAt: { gte: boundaryUtc } },
      })
      if (totalVisitsInTx >= maxVisits) {
        throw new Error('LIMIT_REACHED')
      }

      // Re-check duplicate visit inside transaction
      const dupInTx = await tx.visit.findFirst({
        where: { userId: viewerId, zoneOwnerId: ownerId, createdAt: { gte: boundaryUtc } },
      })
      if (dupInTx) {
        throw new Error('ALREADY_VISITED')
      }

      await tx.visit.create({ data: { userId: viewerId, zoneOwnerId: ownerId } })

      const updated = await tx.userPoints.upsert({
        where:  { userId: viewerId },
        update: { points: { increment: visitPoints } },
        create: { userId: viewerId, points: visitPoints },
      })

      await tx.pointsLog.create({
        data: { userId: viewerId, points: visitPoints, total: updated.points, method: 'cZone Visit', direction: 'increase' },
      })
    })
  } catch (err) {
    if (err.message === 'LIMIT_REACHED') {
      return { success: false, message: `Daily limit of ${maxVisits} visits reached` }
    }
    if (err.message === 'ALREADY_VISITED') {
      return { success: false, message: 'Already awarded points for this zone owner in this period' }
    }
    throw err
  }

  return { success: true, message: 'Points awarded' }
})
