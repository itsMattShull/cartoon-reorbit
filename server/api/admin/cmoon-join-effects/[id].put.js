// server/api/admin/cmoon-join-effects/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor } from '@/server/utils/cmoon'
import { isValidJoinEffectName, isValidJoinEffectText, isValidJoinEffectTextPosition, NAME_MAX_LENGTH, TEXT_MAX_LENGTH } from '@/server/utils/cmoonJoinEffect'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const effect = await db.cMoonJoinEffect.findUnique({ where: { id } })
  if (!effect) throw createError({ statusCode: 404, statusMessage: 'Join effect not found' })

  const body = await readBody(event)
  const name = body?.name === undefined ? effect.name : String(body.name).trim()
  const backgroundColor = body?.backgroundColor === undefined ? effect.backgroundColor : String(body.backgroundColor).trim()
  const vignette = body?.vignette === undefined ? effect.vignette : !!body.vignette
  const text = body?.text === undefined ? effect.text : (body.text === null || body.text === '' ? null : String(body.text).trim())
  const textColor = body?.textColor === undefined || !String(body.textColor).trim() ? effect.textColor : String(body.textColor).trim()
  const textPosition = body?.textPosition === undefined || !body.textPosition ? effect.textPosition : body.textPosition

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

  try {
    await db.cMoonJoinEffect.update({ where: { id }, data: { name, backgroundColor, vignette, text, textColor, textPosition } })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A join effect with that name already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonJoinEffect', key: `update:${id}`, prevValue: { name: effect.name }, newValue: { name } })

  return { ok: true }
})
