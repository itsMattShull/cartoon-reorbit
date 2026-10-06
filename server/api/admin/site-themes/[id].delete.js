// server/api/admin/site-themes/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const theme = await db.siteTheme.findUnique({ where: { id } })
  if (!theme) throw createError({ statusCode: 404, statusMessage: 'Theme not found' })

  const config = await db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { activeSiteThemeId: true } })
  if (config?.activeSiteThemeId === id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete the currently active theme — switch to another theme (or the default) first' })
  }

  await db.siteTheme.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'SiteTheme', key: `delete:${id}`, prevValue: theme, newValue: null })

  return { ok: true }
})
