import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const defaults = { initialReleasePercent: 75, finalReleaseDelayHours: 12 }
  let cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  if (!cfg) {
    cfg = await db.globalGameConfig.create({
      data: { id: 'singleton', dailyPointLimit: 250, ...defaults }
    })
  }
  return {
    initialReleasePercent: cfg.initialReleasePercent ?? defaults.initialReleasePercent,
    finalReleaseDelayHours: cfg.finalReleaseDelayHours ?? defaults.finalReleaseDelayHours
  }
})

