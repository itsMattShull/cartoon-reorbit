import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Require an authenticated user
  let me
  try {
    const cookie = getRequestHeader(event, 'cookie') || ''
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {}
  if (!me || !me.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const defaults = { initialReleasePercent: 75, finalReleaseDelayHours: 12 }
  try {
    const cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    if (!cfg) return defaults
    const p = Number(cfg.initialReleasePercent ?? defaults.initialReleasePercent)
    const h = Number(cfg.finalReleaseDelayHours ?? defaults.finalReleaseDelayHours)
    return { initialReleasePercent: p, finalReleaseDelayHours: h }
  } catch {
    return defaults
  }
})
