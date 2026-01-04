// server/api/admin/achievements/settings.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  let config = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  if (!config) {
    config = await db.globalGameConfig.create({
      data: {
        id: 'singleton',
        dailyPointLimit: 250,
        dailyLoginPoints: 500,
        dailyNewUserPoints: 1000,
        czoneVisitPoints: 20,
        czoneVisitMaxPerDay: 10
      }
    })
  }

  return {
    achievementDiscordChannelId: config.achievementDiscordChannelId || ''
  }
})
