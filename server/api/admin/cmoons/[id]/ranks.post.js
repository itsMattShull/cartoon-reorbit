// server/api/admin/cmoons/[id]/ranks.post.js — create a new rank in one cMoon's ladder.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin } from '@/server/utils/adminAuth'
import { isValidDiscordSnowflake } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)

  const cMoonId = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0
  const discordRoleId = typeof body?.discordRoleId === 'string' ? body.discordRoleId.trim() : ''

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (discordRoleId && !isValidDiscordSnowflake(discordRoleId)) {
    throw createError({ statusCode: 400, statusMessage: 'Discord Role ID must be a numeric snowflake' })
  }

  let created
  try {
    created = await db.cMoonRank.create({
      data: { cMoonId, name, sortOrder, discordRoleId: discordRoleId || null },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another rank in this cMoon already uses that name or order' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonRank', key: `create:${created.id}`, prevValue: null, newValue: { cMoonId, name, sortOrder } })

  return { id: created.id }
})
