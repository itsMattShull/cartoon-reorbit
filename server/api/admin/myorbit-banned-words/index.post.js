import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitBannedWordBody } from '@/server/utils/myOrbitModeration'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMyOrbitBannedWordBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  let created
  try {
    created = await db.myOrbitBannedWord.create({ data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'That phrase is already on the list' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitBannedWord', key: `create:${created.id}`,
    prevValue: null, newValue: { phrase: created.phrase }
  })

  return { id: created.id, phrase: created.phrase }
})
