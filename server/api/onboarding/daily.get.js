import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma as db } from '@/server/prisma'

const getChicagoDailyBoundary = () => {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < boundaryLocal) boundaryLocal = boundaryLocal.minus({ days: 1 })
  return boundaryLocal.toUTC().toJSDate()
}

const getChicagoMorningWindowStart = () => {
  const now = new Date()
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = now.getTime() - chicagoNow.getTime()
  const y = chicagoNow.getFullYear()
  const m = chicagoNow.getMonth()
  const d = chicagoNow.getDate()
  let resetUtcMs = new Date(y, m, d, 8, 0, 0).getTime() + offsetMs
  if (now.getTime() < resetUtcMs) resetUtcMs -= 24 * 60 * 60 * 1000
  return new Date(resetUtcMs)
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const [globalConfig, winwheelConfig, lottoSettings, barcodeConfig] = await Promise.all([
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        dailyLoginPoints: true,
        dailyPointLimit: true,
        czoneVisitMaxPerDay: true,
        czoneVisitPoints: true
      }
    }),
    db.gameConfig.findUnique({
      where: { gameName: 'Winwheel' },
      select: { maxDailySpins: true }
    }),
    db.lottoSettings.findUnique({
      where: { id: 'lotto' },
      select: { countPerDay: true }
    }),
    db.barcodeGameConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { monsterDailyScanLimit: true, scanPoints: true }
    })
  ])

  const dailyWindowStart = getChicagoDailyBoundary()
  const morningWindowStart = getChicagoMorningWindowStart()

  const [
    dailyLoginCount,
    czoneVisitCount,
    gamePointAgg,
    winwheelSpins,
    lottoUser
  ] = await Promise.all([
    db.pointsLog.count({
      where: { userId, method: 'Daily Login', createdAt: { gte: dailyWindowStart } }
    }),
    db.pointsLog.count({
      where: { userId, method: 'cZone Visit', createdAt: { gte: dailyWindowStart } }
    }),
    db.gamePointLog.aggregate({
      where: { userId, createdAt: { gte: dailyWindowStart } },
      _sum: { points: true }
    }),
    db.wheelSpinLog.count({
      where: { userId, createdAt: { gte: morningWindowStart } }
    }),
    db.lottoUser.findUnique({
      where: { userId },
      select: { purchasesToday: true, lastReset: true }
    })
  ])

  const dailyLoginPoints = Number(globalConfig?.dailyLoginPoints ?? 500)
  const dailyPointLimit = Number(globalConfig?.dailyPointLimit ?? 250)
  const czoneVisitMaxPerDay = Number(globalConfig?.czoneVisitMaxPerDay ?? 10)
  const czoneVisitPoints = Number(globalConfig?.czoneVisitPoints ?? 20)
  const winwheelMaxDailySpins = Number(winwheelConfig?.maxDailySpins ?? 0)
  const lottoCountPerDay = Number(lottoSettings?.countPerDay ?? 0)
  const monsterDailyScanLimit = Number(barcodeConfig?.monsterDailyScanLimit ?? 0)
  const scanPoints = Number(barcodeConfig?.scanPoints ?? 0)

  const gamePointsUsed = Number(gamePointAgg?._sum?.points || 0)

  const lastResetAt = lottoUser?.lastReset ? new Date(lottoUser.lastReset) : null
  const lottoPurchasesToday = (lastResetAt && lastResetAt.getTime() >= morningWindowStart.getTime())
    ? Number(lottoUser?.purchasesToday || 0)
    : 0

  let monsterScans = 0
  if (Number.isFinite(monsterDailyScanLimit) && monsterDailyScanLimit > 0) {
    monsterScans = await db.userBarcodeScan.count({
      where: { userId, lastScannedAt: { gte: morningWindowStart } }
    })
  }

  const status = {
    dailyLoginComplete: dailyLoginCount > 0,
    czoneVisitComplete: czoneVisitMaxPerDay > 0 && czoneVisitCount >= czoneVisitMaxPerDay,
    gamePointsComplete: dailyPointLimit > 0 && gamePointsUsed >= dailyPointLimit,
    winwheelComplete: winwheelMaxDailySpins > 0 && winwheelSpins >= winwheelMaxDailySpins,
    lottoComplete: lottoCountPerDay !== -1 && lottoCountPerDay > 0 && lottoPurchasesToday >= lottoCountPerDay,
    monsterScanComplete: monsterDailyScanLimit > 0 && monsterScans >= monsterDailyScanLimit
  }

  return {
    config: {
      dailyLoginPoints,
      dailyPointLimit,
      czoneVisitMaxPerDay,
      czoneVisitPoints,
      winwheelMaxDailySpins,
      lottoCountPerDay,
      monsterDailyScanLimit,
      scanPoints
    },
    status,
    counts: {
      dailyLoginCount,
      czoneVisitCount,
      gamePointsUsed,
      winwheelSpins,
      lottoPurchasesToday,
      monsterScans
    }
  }
})
