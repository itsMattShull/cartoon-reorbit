// server/api/admin/achievements/settings.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const incoming = typeof body?.achievementDiscordChannelId === 'string'
    ? body.achievementDiscordChannelId.trim()
    : ''
  const nextValue = incoming || null

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const result = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      dailyPointLimit: 250,
      dailyLoginPoints: 500,
      dailyNewUserPoints: 1000,
      czoneVisitPoints: 20,
      czoneVisitMaxPerDay: 10,
      czoneCount: 3,
      achievementDiscordChannelId: nextValue
    },
    update: {
      achievementDiscordChannelId: nextValue
    }
  })

  if ((before?.achievementDiscordChannelId || null) !== nextValue) {
    await logAdminChange(db, {
      userId: me.id,
      area: 'Achievements',
      key: 'achievementDiscordChannelId',
      prevValue: before?.achievementDiscordChannelId || null,
      newValue: nextValue
    })
  }

  return { achievementDiscordChannelId: result.achievementDiscordChannelId || '' }
})
