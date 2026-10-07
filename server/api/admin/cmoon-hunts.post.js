// server/api/admin/cmoon-hunts.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { postCMoonHunt } from '@/server/utils/cmoonHunt'

const MAX_CLUES = 20

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const finalAnswer = typeof body?.finalAnswer === 'string' ? body.finalAnswer.trim() : ''
  const active = body?.active === undefined ? true : !!body.active
  const clueTexts = Array.isArray(body?.clues)
    ? body.clues.map(c => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    : []

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  if (!finalAnswer) throw createError({ statusCode: 400, statusMessage: 'Final answer is required' })
  if (!clueTexts.length) throw createError({ statusCode: 400, statusMessage: 'At least one clue is required' })
  if (clueTexts.length > MAX_CLUES) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_CLUES} clues are allowed` })

  const created = await db.cMoonHunt.create({
    data: {
      title, finalAnswer, active,
      clues: { create: clueTexts.map((text, i) => ({ text, sortOrder: i })) },
    },
  })

  // Ad-hoc/event-driven, same as a BOSS_LORE CMoonRiddle — an admin creating an active hunt means
  // "send it now", not "stage it for later" (that's what creating it inactive is for).
  let postResult = { posted: false }
  if (active) {
    postResult = await postCMoonHunt(db, created.id)
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonHunt', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, title: created.title, clueCount: clueTexts.length } })

  return { id: created.id, posted: postResult.posted }
})
