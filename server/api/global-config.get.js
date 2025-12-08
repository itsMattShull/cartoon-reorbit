// server/api/global-config.get.js (public-safe fields)
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
  // Fetch singleton; if missing, synthesize defaults (no writes in public endpoint)
  const cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  return {
    dailyPointLimit:    cfg?.dailyPointLimit    ?? 250,
    dailyLoginPoints:   cfg?.dailyLoginPoints   ?? 500,
    dailyNewUserPoints: cfg?.dailyNewUserPoints ?? 1000,
    czoneVisitPoints:   cfg?.czoneVisitPoints   ?? 20,
    czoneVisitMaxPerDay: cfg?.czoneVisitMaxPerDay ?? 10
  }
})
