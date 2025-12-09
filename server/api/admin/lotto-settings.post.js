// server/api/admin/lotto-settings.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
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

  const body = await readBody(event)
  const { baseOdds, incrementRate, countPerDay, cost } = body

  // Validate
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
      create: {
        id: 'lotto',
        baseOdds: Number(baseOdds),
        incrementRate: Number(incrementRate),
        countPerDay: Number(countPerDay),
        cost: Number(cost)
      },
      update: {
        baseOdds: Number(baseOdds),
        incrementRate: Number(incrementRate),
        countPerDay: Number(countPerDay),
        cost: Number(cost)
      }
    })

    // Log field changes
    const fields = ['baseOdds', 'incrementRate', 'countPerDay', 'cost']
    for (const k of fields) {
      const prevVal = before ? before[k] : undefined
      const nextVal = result ? result[k] : undefined
      if (prevVal !== nextVal) {
        await logAdminChange(db, {
          userId: me.id,
          area: 'LottoSettings',
          key: k,
          prevValue: prevVal,
          newValue: nextVal
        })
      }
    }

    return result
  } catch (err) {
    console.error('[POST /api/admin/lotto-settings] Error saving settings', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save lotto settings' })
  }
})