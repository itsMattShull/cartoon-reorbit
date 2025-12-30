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

  // Trigger logs (only starts + reasons we still track)
  const logs = await db.scavengerTriggerLog.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { createdAt: true, triggerSource: true, started: true, reason: true }
  })
  const startedLogs = logs.filter(l => l.started)
  const startedCount = startedLogs.length
  const reasonCounts = logs.reduce((acc, l) => {
    acc[l.reason || 'unknown'] = (acc[l.reason || 'unknown'] || 0) + 1
    return acc
  }, {})

  // Started by day
  const startedByDayMap = new Map()
  for (const l of startedLogs) {
    const k = startOfDay(l.createdAt).toISOString().slice(0,10)
    startedByDayMap.set(k, (startedByDayMap.get(k) || 0) + 1)
  }
  const startedByDay = Array.from(startedByDayMap.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))

  // Outcomes from completed sessions
  const sessions = await db.scavengerSession.findMany({
    where: { createdAt: { gte: from, lte: to }, status: 'COMPLETED' },
    select: { resultType: true, pointsAwarded: true, triggerSource: true }
  })
  const outcomes = { NOTHING: 0, POINTS: 0, EXCLUSIVE_CTOON: 0 }
  let pointsAwardedTotal = 0
  const completionsByTrigger = new Map()
  for (const s of sessions) {
    outcomes[s.resultType || 'NOTHING'] = (outcomes[s.resultType || 'NOTHING'] || 0) + 1
    if (s.pointsAwarded) pointsAwardedTotal += s.pointsAwarded
    const trig = s.triggerSource || 'unknown'
    completionsByTrigger.set(trig, (completionsByTrigger.get(trig) || 0) + 1)
  }
  const pointsAwardedAvg = sessions.length ? Math.round(pointsAwardedTotal / sessions.length) : 0

  // Triggers breakdown
  const triggerMap = new Map()
  for (const l of startedLogs) {
    const row = triggerMap.get(l.triggerSource) || { trigger: l.triggerSource, starts: 0, completions: 0 }
    row.starts += 1
    triggerMap.set(l.triggerSource, row)
  }
  // attach completions to each trigger row
  for (const [trig, count] of completionsByTrigger.entries()) {
    const row = triggerMap.get(trig) || { trigger: trig, starts: 0, completions: 0 }
    row.completions = count
    triggerMap.set(trig, row)
  }
  const triggers = Array.from(triggerMap.values()).sort((a,b) => (b.starts || 0) - (a.starts || 0))

  return {
    from: from.toISOString(), to: to.toISOString(), days: d,
    startedCount, reasonCounts, startedByDay,
    outcomes, pointsAwardedTotal, pointsAwardedAvg, triggers
  }
})
