// server/api/admin/czone-mail/templates/[id].delete.js
//
// Retire a template. This is a SOFT delete (active = false) by default, because
// CZoneMail.templateId is the only way to find every message that was sent from
// a given template — and that link is what makes a retraction possible.
//
// Pass `purgeMessages: true` to also soft-delete every message already sent from
// this template. That is the remedy when a template ships with an unintended
// reading: deactivating it alone leaves every copy already delivered sitting in
// players' inboxes and on their public walls.

import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { clearCzoneMailTemplateCache } from '@/server/utils/czoneMailConfigCache'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing template id.' })

  const body = await readBody(event).catch(() => ({}))
  const purgeMessages = Boolean(body?.purgeMessages)

  const existing = await db.cZoneMailTemplate.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found.' })

  await db.cZoneMailTemplate.update({ where: { id }, data: { active: false } })
  clearCzoneMailTemplateCache()

  let purged = 0
  if (purgeMessages) {
    const result = await db.cZoneMail.updateMany({
      where: { templateId: id, deletedAt: null },
      data: { deletedAt: new Date() }
    })
    purged = result.count
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'cZone Mail',
    key: `template.retire:${id}`,
    prevValue: { text: existing.text, active: existing.active },
    newValue: { active: false, purgeMessages, purged }
  })

  return { success: true, purged }
})
