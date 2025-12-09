// server/api/admin/global-config.get.js
import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

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

  // 2) Try to fetch the singleton global config
  let config = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' }
  })

  // 3) If not found, create with a default cap (e.g. 100)
  if (!config) {
    config = await db.globalGameConfig.create({
      data: {
        id: 'singleton',
        dailyPointLimit: 250,
        // new fields defaults
        dailyLoginPoints: 500,
        dailyNewUserPoints: 1000,
        czoneVisitPoints: 20,
        czoneVisitMaxPerDay: 10
      }
    })
  }

  // 4) Return it
  return config
})
