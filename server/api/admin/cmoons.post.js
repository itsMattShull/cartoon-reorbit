// server/api/admin/cmoons.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor, isValidDiscordSnowflake } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const color = typeof body?.color === 'string' ? body.color.trim() : ''
  const discordRoleId = typeof body?.discordRoleId === 'string' ? body.discordRoleId.trim() : ''
  const captainIds = Array.isArray(body?.captainIds) ? [...new Set(body.captainIds.filter(x => typeof x === 'string'))] : []
  const prizeCtoons = Array.isArray(body?.prizeCtoons) ? body.prizeCtoons : []

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!isValidHexColor(color)) throw createError({ statusCode: 400, statusMessage: 'Color must be a hex value like #3366ff' })
  if (discordRoleId && !isValidDiscordSnowflake(discordRoleId)) {
    throw createError({ statusCode: 400, statusMessage: 'Discord Role ID must be a numeric snowflake' })
  }

  if (captainIds.length) {
    const validAdmins = await db.user.count({ where: { id: { in: captainIds }, isAdmin: true } })
    if (validAdmins !== captainIds.length) throw createError({ statusCode: 400, statusMessage: 'Captains must be existing admins' })
  }

  const prizeCtoonRows = prizeCtoons
    .filter(p => p?.ctoonId && typeof p.ctoonId === 'string')
    .map(p => ({ ctoonId: p.ctoonId, quantity: Math.max(1, Number(p.quantity || 1)) }))
  if (prizeCtoonRows.length) {
    const validCtoons = await db.ctoon.count({ where: { id: { in: prizeCtoonRows.map(p => p.ctoonId) } } })
    if (validCtoons !== new Set(prizeCtoonRows.map(p => p.ctoonId)).size) {
      throw createError({ statusCode: 400, statusMessage: 'One or more prize cToons do not exist' })
    }
  }

  const existing = await db.cMoon.findUnique({ where: { name } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'A cMoon with that name already exists' })

  const created = await db.cMoon.create({
    data: {
      name,
      color,
      discordRoleId: discordRoleId || null,
      captains: { create: captainIds.map(userId => ({ userId })) },
      prizeCtoons: { create: prizeCtoonRows },
    },
  })

  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, name } })
  invalidateCMoonList()

  return { id: created.id }
})
