// server/api/admin/site-themes.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [themes, config] = await Promise.all([
    db.siteTheme.findMany({ orderBy: { name: 'asc' } }),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { useDefaultSiteTheme: true, activeSiteThemeId: true },
    }),
  ])

  return {
    useDefaultSiteTheme: config?.useDefaultSiteTheme ?? true,
    activeSiteThemeId: config?.activeSiteThemeId || null,
    themes,
  }
})
