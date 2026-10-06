// server/api/admin/site-themes.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor } from '@/server/utils/cmoon'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const HEX_FIELDS = ['orbitDarkBlue', 'orbitLightBlue', 'orbitGreen', 'bgColor', 'textColor']

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const data = { name }
  for (const field of HEX_FIELDS) {
    const value = typeof body?.[field] === 'string' ? body[field].trim() : ''
    if (!isValidHexColor(value)) {
      throw createError({ statusCode: 400, statusMessage: `${field} must be a hex value like #336699` })
    }
    data[field] = value
  }

  const existing = await db.siteTheme.findUnique({ where: { name } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'A theme with that name already exists' })

  const created = await db.siteTheme.create({ data })

  await logAdminChange(db, { userId: me.id, area: 'SiteTheme', key: `create:${created.id}`, prevValue: null, newValue: created })

  return { id: created.id }
})
