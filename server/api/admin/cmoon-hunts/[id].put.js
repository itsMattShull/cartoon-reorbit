// server/api/admin/cmoon-hunts/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { postCMoonHunt } from '@/server/utils/cmoonHunt'

const MAX_CLUES = 20

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const hunt = await db.cMoonHunt.findUnique({ where: { id } })
  if (!hunt) throw createError({ statusCode: 404, statusMessage: 'Hunt not found' })

  const body = await readBody(event)
  const title = body?.title === undefined ? hunt.title : (typeof body.title === 'string' ? body.title.trim() : '')
  const finalAnswer = body?.finalAnswer === undefined ? hunt.finalAnswer : (typeof body.finalAnswer === 'string' ? body.finalAnswer.trim() : '')
  const active = body?.active === undefined ? hunt.active : !!body.active

  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  if (!finalAnswer) throw createError({ statusCode: 400, statusMessage: 'Final answer is required' })

  // Clues are only editable before a hunt posts — once DMed out, reshuffling the clue set would
  // leave players holding stale text that no longer matches what's in the database, and an
  // already-recorded CMoonHuntAssignment would point at a clue an admin edit just changed out
  // from under it. A posted hunt can still be edited otherwise (title/finalAnswer/active).
  if (!hunt.postedAt && Array.isArray(body?.clues)) {
    const clueTexts = body.clues.map(c => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    if (!clueTexts.length) throw createError({ statusCode: 400, statusMessage: 'At least one clue is required' })
    if (clueTexts.length > MAX_CLUES) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_CLUES} clues are allowed` })
    await db.$transaction([
      db.cMoonHuntClue.deleteMany({ where: { huntId: id } }),
      db.cMoonHuntClue.createMany({ data: clueTexts.map((text, i) => ({ huntId: id, text, sortOrder: i })) }),
    ])
  }

  await db.cMoonHunt.update({ where: { id }, data: { title, finalAnswer, active } })

  // Rising edge only (not posted yet -> now active), same "stage it, then flip it on" shape as a
  // BOSS_LORE CMoonRiddle re-activation — never re-posts a hunt that already went out.
  let postResult = { posted: false }
  if (active && !hunt.active && !hunt.postedAt) {
    postResult = await postCMoonHunt(db, id)
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonHunt', key: `update:${id}`, prevValue: { title: hunt.title, active: hunt.active }, newValue: { title, active } })

  return { ok: true, posted: postResult.posted }
})
