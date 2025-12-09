// server/api/admin/lotto-settings.js
import { defineEventHandler, getRequestHeader, createError, readBody, getMethod } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  // Authenticate & authorize
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

  const method = getMethod(event)
  if (method === 'GET') {
    let row = await db.lottoSettings.findUnique({ where: { id: 'lotto' } })
    if (!row) {
      row = await db.lottoSettings.create({
        data: { id: 'lotto', baseOdds: 1.0, incrementRate: 0.02, countPerDay: 5, cost: 1 }
      })
    }
    return row
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const { baseOdds, incrementRate, countPerDay, cost } = body
    if (baseOdds == null || typeof baseOdds !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "baseOdds"' })
    }
    if (incrementRate == null || typeof incrementRate !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "incrementRate"' })
    }
    if (countPerDay == null || typeof countPerDay !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "countPerDay"' })
    }
    if (cost == null || typeof cost !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "cost"' })
    }

    try {
      const before = await db.lottoSettings.findUnique({ where: { id: 'lotto' } })
      const result = await db.lottoSettings.upsert({
        where: { id: 'lotto' },
        create: { id: 'lotto', baseOdds: Number(baseOdds), incrementRate: Number(incrementRate), countPerDay: Number(countPerDay), cost: Number(cost) },
        update: { baseOdds: Number(baseOdds), incrementRate: Number(incrementRate), countPerDay: Number(countPerDay), cost: Number(cost) }
      })

      const fields = ['baseOdds', 'incrementRate', 'countPerDay', 'cost']
      for (const k of fields) {
        const prevVal = before ? before[k] : undefined
        const nextVal = result ? result[k] : undefined
        if (prevVal !== nextVal) {
          await logAdminChange(db, { userId: me.id, area: 'LottoSettings', key: k, prevValue: prevVal, newValue: nextVal })
        }
      }
      return result
    } catch (err) {
      console.error('[/api/admin/lotto-settings] save error', err)
      throw createError({ statusCode: 500, statusMessage: 'Failed to save lotto settings' })
    }
  }

  throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
})
