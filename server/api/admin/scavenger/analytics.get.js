// server/api/admin/scavenger/analytics.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0,0,0,0)
  return x
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { days = '30' } = getQuery(event)
  const d = Math.max(1, Math.min(365, Number(days) || 30))
  const to = new Date()
  const from = new Date(Date.now() - d * 24 * 3600 * 1000)

  // Trigger attempts
  const logs = await db.scavengerTriggerLog.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { createdAt: true, triggerSource: true, started: true, reason: true }
  })
  const attemptsCount = logs.length
  const startedCount = logs.filter(l => l.started).length
  const reasonCounts = logs.reduce((acc, l) => {
    acc[l.reason || 'unknown'] = (acc[l.reason || 'unknown'] || 0) + 1
    return acc
  }, {})

  // Started by day
  const startedByDayMap = new Map()
  for (const l of logs) {
    if (!l.started) continue
    const k = startOfDay(l.createdAt).toISOString().slice(0,10)
    startedByDayMap.set(k, (startedByDayMap.get(k) || 0) + 1)
  }
  const startedByDay = Array.from(startedByDayMap.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))

  // Outcomes from completed sessions
  const sessions = await db.scavengerSession.findMany({
    where: { createdAt: { gte: from, lte: to }, status: 'COMPLETED' },
    select: { resultType: true, pointsAwarded: true }
  })
  const outcomes = { NOTHING: 0, POINTS: 0, EXCLUSIVE_CTOON: 0 }
  let pointsAwardedTotal = 0
  for (const s of sessions) {
    outcomes[s.resultType || 'NOTHING'] = (outcomes[s.resultType || 'NOTHING'] || 0) + 1
    if (s.pointsAwarded) pointsAwardedTotal += s.pointsAwarded
  }
  const pointsAwardedAvg = sessions.length ? Math.round(pointsAwardedTotal / sessions.length) : 0

  // Triggers breakdown
  const triggerMap = new Map()
  for (const l of logs) {
    const row = triggerMap.get(l.triggerSource) || { trigger: l.triggerSource, attempts: 0, starts: 0 }
    row.attempts += 1
    if (l.started) row.starts += 1
    triggerMap.set(l.triggerSource, row)
  }
  const triggers = Array.from(triggerMap.values()).sort((a,b) => b.attempts - a.attempts)

  return {
    from: from.toISOString(), to: to.toISOString(), days: d,
    attemptsCount, startedCount, reasonCounts, startedByDay,
    outcomes, pointsAwardedTotal, pointsAwardedAvg, triggers
  }
})

