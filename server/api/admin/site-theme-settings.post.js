// server/api/admin/site-theme-settings.post.js
// Dedicated toggle + "which theme is active" setter — kept separate from the general
// site-themes CRUD endpoints the same way cmoon-settings.post.js is kept separate from the
// cMoon CRUD endpoints it sits next to.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const existing = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { useDefaultSiteTheme: true, activeSiteThemeId: true },
  })

  const data = {}
  if (body?.useDefaultSiteTheme !== undefined) {
    data.useDefaultSiteTheme = !!body.useDefaultSiteTheme
  }
  if (body?.activeSiteThemeId !== undefined) {
    const themeId = typeof body.activeSiteThemeId === 'string' && body.activeSiteThemeId ? body.activeSiteThemeId : null
    if (themeId) {
      const theme = await db.siteTheme.findUnique({ where: { id: themeId }, select: { id: true } })
      if (!theme) throw createError({ statusCode: 400, statusMessage: 'Theme not found' })
    }
    data.activeSiteThemeId = themeId
  }

  // Turning the default off with no theme ever chosen (activeSiteThemeId null both before this
  // request and after it) would silently fall back to... the same hardcoded defaults it was
  // trying to turn off — confusing, not dangerous, but worth refusing outright rather than
  // letting an admin think they've switched to a custom look when nothing actually changed.
  const willUseDefault = data.useDefaultSiteTheme !== undefined ? data.useDefaultSiteTheme : existing?.useDefaultSiteTheme ?? true
  const willHaveThemeId = data.activeSiteThemeId !== undefined ? data.activeSiteThemeId : existing?.activeSiteThemeId
  if (!willUseDefault && !willHaveThemeId) {
    throw createError({ statusCode: 400, statusMessage: 'Select a theme before turning the default theme off' })
  }

  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data,
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'SiteTheme',
    key: 'settings',
    prevValue: existing,
    newValue: { useDefaultSiteTheme: updated.useDefaultSiteTheme, activeSiteThemeId: updated.activeSiteThemeId },
  })

  return { useDefaultSiteTheme: updated.useDefaultSiteTheme, activeSiteThemeId: updated.activeSiteThemeId }
})
