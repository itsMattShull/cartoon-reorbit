// server/api/admin/czone-mail/templates/index.get.js
// Every template (active and disabled) plus recent-usage figures for the admin
// "Manage cZone Mail" page.

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const templates = await db.cZoneMailTemplate.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
  })

  // Sends still inside the retention window, so an admin can see what is being
  // picked *now* as well as the all-time counter the notify worker maintains.
  const recent = await db.cZoneMail.groupBy({
    by: ['templateId'],
    _count: { _all: true },
    where: { templateId: { not: null } }
  })
  const recentByTemplate = new Map(recent.map(r => [r.templateId, r._count._all]))

  return {
    templates: templates.map(t => ({
      id: t.id,
      text: t.text,
      emoji: t.emoji,
      category: t.category,
      sortOrder: t.sortOrder,
      active: t.active,
      usageCount: t.usageCount,
      lastUsedAt: t.lastUsedAt,
      recentCount: recentByTemplate.get(t.id) || 0
    }))
  }
})
