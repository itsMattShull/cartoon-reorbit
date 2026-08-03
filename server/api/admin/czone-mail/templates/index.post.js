// server/api/admin/czone-mail/templates/index.post.js
// Create a canned cMail sentence.

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

  const body = await readBody(event)
  const parsed = validateTemplateInput(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.error })

  const created = await db.cZoneMailTemplate.create({ data: parsed.value })
  clearCzoneMailTemplateCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'cZone Mail',
    key: 'template.create',
    prevValue: null,
    newValue: parsed.value
  })

  return { template: created }
})
