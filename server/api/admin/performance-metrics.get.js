import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { getPerfMetrics } from '../../diagnostics/metrics.mjs'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const metrics = getPerfMetrics()

  // Compute thresholds for highlighting
  const impactScores = metrics.map(m => m.impactScore).filter(s => s > 0)
  const avgImpact = impactScores.length
    ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length
    : 0
  const highThreshold = avgImpact * 2

  return {
    metrics,
    thresholds: {
      highImpact: Math.round(highThreshold)
    },
    generatedAt: new Date().toISOString()
  }
})
