import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  let { initialReleasePercent, finalReleaseDelayHours } = body || {}

  initialReleasePercent = Number(initialReleasePercent)
  finalReleaseDelayHours = Number(finalReleaseDelayHours)

  if (Number.isNaN(initialReleasePercent) || initialReleasePercent < 0 || initialReleasePercent > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Initial Release % must be 0–100' })
  }
  if (Number.isNaN(finalReleaseDelayHours) || finalReleaseDelayHours < 1 || finalReleaseDelayHours > 72) {
    throw createError({ statusCode: 400, statusMessage: 'Delay (hours) must be 1–72' })
  }

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      dailyPointLimit: 250,
      initialReleasePercent,
      finalReleaseDelayHours
    },
    update: {
      initialReleasePercent,
      finalReleaseDelayHours
    }
  })

  try {
    for (const k of ['initialReleasePercent','finalReleaseDelayHours']) {
      const prev = before ? before[k] : undefined
      const next = updated ? updated[k] : undefined
      if (prev !== next) {
        await logAdminChange(db, { userId: me.id, area: 'GlobalGameConfig', key: k, prevValue: prev, newValue: next })
      }
    }
  } catch {}

  return {
    initialReleasePercent: updated.initialReleasePercent,
    finalReleaseDelayHours: updated.finalReleaseDelayHours
  }
})

