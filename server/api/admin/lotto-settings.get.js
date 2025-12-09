// server/api/admin/lotto-settings.get.js
import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

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

  // Fetch or create singleton
  let row = await db.lottoSettings.findUnique({ where: { id: 'lotto' } })
  if (!row) {
    row = await db.lottoSettings.create({
      data: {
        id: 'lotto',
        baseOdds: 1.0,
        incrementRate: 0.02,
        countPerDay: 5
      }
    })
  }
  return row
})