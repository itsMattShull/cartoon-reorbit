// server/api/admin/site-themes/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor } from '@/server/utils/cmoon'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const HEX_FIELDS = ['orbitDarkBlue', 'orbitLightBlue', 'orbitGreen', 'bgColor', 'textColor']

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const theme = await db.siteTheme.findUnique({ where: { id } })
  if (!theme) throw createError({ statusCode: 404, statusMessage: 'Theme not found' })

  const body = await readBody(event)
  const name = body?.name === undefined ? theme.name : (typeof body.name === 'string' ? body.name.trim() : '')
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const data = { name }
  for (const field of HEX_FIELDS) {
    const value = body?.[field] === undefined ? theme[field] : (typeof body[field] === 'string' ? body[field].trim() : '')
    if (!isValidHexColor(value)) {
      throw createError({ statusCode: 400, statusMessage: `${field} must be a hex value like #336699` })
    }
    data[field] = value
  }

  if (name !== theme.name) {
    const dup = await db.siteTheme.findUnique({ where: { name } })
    if (dup && dup.id !== id) throw createError({ statusCode: 409, statusMessage: 'A theme with that name already exists' })
  }

  const updated = await db.siteTheme.update({ where: { id }, data })

  await logAdminChange(db, { userId: me.id, area: 'SiteTheme', key: `update:${id}`, prevValue: theme, newValue: updated })

  return { ok: true }
})
