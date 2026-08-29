// server/api/admin/cmoons/[id]/ranks/[rankId].put.js — edit one cMoon rank.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { isValidDiscordSnowflake } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  const rankId = event.context.params?.rankId
  const rank = await db.cMoonRank.findUnique({ where: { id: rankId } })
  if (!rank || rank.cMoonId !== cMoonId) throw createError({ statusCode: 404, statusMessage: 'Rank not found' })

  const body = await readBody(event)
  // A tier-linked rank's name/sortOrder is owned by its CMoonRankTier (see
  // server/utils/cmoonRankTiers.js) and kept in sync across every cMoon from there — only
  // discordRoleId (legitimately per-cMoon/per-guild) stays editable here for it.
  const name = rank.tierId || typeof body?.name !== 'string' ? rank.name : body.name.trim()
  const sortOrder = rank.tierId || body?.sortOrder === undefined ? rank.sortOrder : (Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : rank.sortOrder)
  const discordRoleId = body?.discordRoleId === undefined ? rank.discordRoleId : (typeof body.discordRoleId === 'string' ? body.discordRoleId.trim() : '')

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (discordRoleId && !isValidDiscordSnowflake(discordRoleId)) {
    throw createError({ statusCode: 400, statusMessage: 'Discord Role ID must be a numeric snowflake' })
  }

  try {
    await db.cMoonRank.update({
      where: { id: rankId },
      data: { name, sortOrder, discordRoleId: discordRoleId || null },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another rank in this cMoon already uses that name or order' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonRank',
    key: `update:${rankId}`,
    prevValue: { name: rank.name, sortOrder: rank.sortOrder },
    newValue: { name, sortOrder },
  })

  return { ok: true }
})
