// server/api/admin/czone-mail/templates/[id].put.js
// Edit a canned cMail sentence.
//
// Editing NEVER rewrites messages already sent: CZoneMail stores its own copy of
// the text. If a template turns out to read badly, changing it here fixes only
// future sends — use the delete route's `purgeMessages` option to retract the
// ones already delivered.

import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { validateTemplateInput } from '@/server/utils/czoneMailRules'
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

  const existing = await db.cZoneMailTemplate.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found.' })

  const body = await readBody(event)
  const parsed = validateTemplateInput({
    text:      body?.text      ?? existing.text,
    emoji:     body?.emoji     ?? existing.emoji,
    category:  body?.category  ?? existing.category,
    sortOrder: body?.sortOrder ?? existing.sortOrder,
    active:    body?.active    ?? existing.active
  })
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.error })

  const updated = await db.cZoneMailTemplate.update({ where: { id }, data: parsed.value })
  clearCzoneMailTemplateCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'cZone Mail',
    key: `template.update:${id}`,
    prevValue: {
      text: existing.text, emoji: existing.emoji, category: existing.category,
      sortOrder: existing.sortOrder, active: existing.active
    },
    newValue: parsed.value
  })

  return { template: updated }
})
