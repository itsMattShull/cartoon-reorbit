// server/api/admin/cmoon-join-effects.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor } from '@/server/utils/cmoon'
import { isValidJoinEffectName, isValidJoinEffectText, isValidJoinEffectTextPosition, NAME_MAX_LENGTH, TEXT_MAX_LENGTH } from '@/server/utils/cmoonJoinEffect'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const backgroundColor = typeof body?.backgroundColor === 'string' ? body.backgroundColor.trim() : ''
  const text = body?.text === undefined || body?.text === null || body.text === '' ? null : String(body.text).trim()
  const textColor = typeof body?.textColor === 'string' && body.textColor.trim() ? body.textColor.trim() : '#FFFFFF'
  const textPosition = typeof body?.textPosition === 'string' && body.textPosition ? body.textPosition : 'BELOW_IMAGE'

  if (!isValidJoinEffectName(name)) {
    throw createError({ statusCode: 400, statusMessage: `Name is required (max ${NAME_MAX_LENGTH} characters)` })
  }
  if (!isValidHexColor(backgroundColor)) {
    throw createError({ statusCode: 400, statusMessage: 'Background color must be a hex value like #3366ff' })
  }
  if (!isValidHexColor(textColor)) {
    throw createError({ statusCode: 400, statusMessage: 'Text color must be a hex value like #ffffff' })
  }
  if (!isValidJoinEffectText(text)) {
    throw createError({ statusCode: 400, statusMessage: `Caption text must be ${TEXT_MAX_LENGTH} characters or fewer` })
  }
  if (!isValidJoinEffectTextPosition(textPosition)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid text position' })
  }

  let created
  try {
    created = await db.cMoonJoinEffect.create({
      data: { name, backgroundColor, text, textColor, textPosition },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A join effect with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonJoinEffect', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, name } })

  return { id: created.id }
})
