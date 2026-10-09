import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  // Each field only updates when actually present in the body — Settings.vue saves these two
  // toggles independently (one $fetch per toggle), so an unconditional coercion here would
  // silently flip whichever field wasn't included in THIS request back to false.
  const data = {}
  if (body?.allowAuctionNotifications !== undefined) data.allowAuctionNotifications = Boolean(body.allowAuctionNotifications)
  if (body?.allowCMoonEnemyPopups !== undefined) data.allowCMoonEnemyPopups = Boolean(body.allowCMoonEnemyPopups)

  const updated = await db.user.update({
    where: { id: me.id },
    data,
    select: { allowAuctionNotifications: true, allowCMoonEnemyPopups: true }
  })
  return {
    allowAuctionNotifications: updated.allowAuctionNotifications,
    allowCMoonEnemyPopups: updated.allowCMoonEnemyPopups,
  }
})
