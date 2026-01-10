// server/api/admin/global-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  // 1) Authenticate & authorize
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

  // 2) Read + validate payload
  const body = await readBody(event)
  const {
    dailyPointLimit,
    dailyLoginPoints,
    dailyNewUserPoints,
    czoneVisitPoints,
    czoneVisitMaxPerDay,
    phashDuplicateThreshold,
    dhashDuplicateThreshold
  } = body

  // minimally require the existing cap; other fields optional with defaults
  if (dailyPointLimit == null || typeof dailyPointLimit !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid "dailyPointLimit", must be a number'
    })
  }

  const payload = {
    dailyPointLimit: Number(dailyPointLimit),
    // allow partial updates; coerce to number if provided else keep existing via upsert+update
    dailyLoginPoints:   (typeof dailyLoginPoints   === 'number') ? Number(dailyLoginPoints)   : undefined,
    dailyNewUserPoints: (typeof dailyNewUserPoints === 'number') ? Number(dailyNewUserPoints) : undefined,
    czoneVisitPoints:   (typeof czoneVisitPoints   === 'number') ? Number(czoneVisitPoints)   : undefined,
    czoneVisitMaxPerDay:(typeof czoneVisitMaxPerDay=== 'number') ? Number(czoneVisitMaxPerDay): undefined,
    phashDuplicateThreshold: (typeof phashDuplicateThreshold === 'number') ? Number(phashDuplicateThreshold) : undefined,
    dhashDuplicateThreshold: (typeof dhashDuplicateThreshold === 'number') ? Number(dhashDuplicateThreshold) : undefined
  }

  // 3) Upsert the singleton global config row
  try {
    const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
    const result = await db.globalGameConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        dailyPointLimit: payload.dailyPointLimit,
        dailyLoginPoints:   payload.dailyLoginPoints   ?? 500,
        dailyNewUserPoints: payload.dailyNewUserPoints ?? 1000,
        czoneVisitPoints:   payload.czoneVisitPoints   ?? 20,
        czoneVisitMaxPerDay: payload.czoneVisitMaxPerDay ?? 10,
        phashDuplicateThreshold: payload.phashDuplicateThreshold ?? 14,
        dhashDuplicateThreshold: payload.dhashDuplicateThreshold ?? 16
      },
      update: {
        dailyPointLimit: payload.dailyPointLimit,
        // only update fields that were provided
        ...(payload.dailyLoginPoints   !== undefined ? { dailyLoginPoints:   payload.dailyLoginPoints }   : {}),
        ...(payload.dailyNewUserPoints !== undefined ? { dailyNewUserPoints: payload.dailyNewUserPoints } : {}),
        ...(payload.czoneVisitPoints    !== undefined ? { czoneVisitPoints:    payload.czoneVisitPoints }    : {}),
        ...(payload.czoneVisitMaxPerDay !== undefined ? { czoneVisitMaxPerDay: payload.czoneVisitMaxPerDay } : {}),
        ...(payload.phashDuplicateThreshold !== undefined ? { phashDuplicateThreshold: payload.phashDuplicateThreshold } : {}),
        ...(payload.dhashDuplicateThreshold !== undefined ? { dhashDuplicateThreshold: payload.dhashDuplicateThreshold } : {})
      }
    })
    // Log field-level changes
    const fields = [
      'dailyPointLimit',
      'dailyLoginPoints',
      'dailyNewUserPoints',
      'czoneVisitPoints',
      'czoneVisitMaxPerDay',
      'phashDuplicateThreshold',
      'dhashDuplicateThreshold'
    ]
    for (const k of fields) {
      const prevVal = before ? before[k] : undefined
      const nextVal = result ? result[k] : undefined
      if (prevVal !== nextVal) {
        await logAdminChange(db, {
          userId: me.id,
          area: 'GlobalGameConfig',
          key: k,
          prevValue: prevVal,
          newValue: nextVal
        })
      }
    }
    return result
  } catch (err) {
    console.error('Error upserting GlobalGameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save global settings' })
  }
})
