// server/api/admin/cmoon-seasons/[id].put.js
// Edits a season — only allowed while it hasn't started yet (startAt still in the future).
// Editing a currently-running or already-completed season is deliberately disallowed: a current
// season's trackers/goal are already being measured against live play, and a past season's recap
// numbers should stay exactly what actually happened — simpler and safer than reconciling either.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { sanitizeEncyclopediaHtml } from '@/server/utils/sanitizeEncyclopediaHtml'
import { parseSeasonBody } from '@/server/utils/cmoonSeasonValidation'
import { assertNoOverlap } from '@/server/utils/cmoonSeasons'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const existing = await db.cMoonSeason.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Season not found' })
  if (existing.startAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Only a season that has not started yet can be edited' })
  }

  const body = await readBody(event)
  const parsed = parseSeasonBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  try {
    await assertNoOverlap(parsed.data.startAt, parsed.data.endAt, id)
  } catch (err) {
    throw createError({ statusCode: err.statusCode || 400, statusMessage: err.message })
  }

  const blurb = typeof body?.blurb === 'string' ? sanitizeEncyclopediaHtml(body.blurb) : ''

  await db.$transaction([
    db.cMoonSeasonTracker.deleteMany({ where: { seasonId: id } }),
    db.cMoonSeason.update({
      where: { id },
      data: {
        ...parsed.data,
        blurb,
        trackers: { create: parsed.trackers },
      },
    }),
  ])

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonSeason',
    key: `update:${id}`,
    prevValue: { header: existing.header, startAt: existing.startAt, endAt: existing.endAt },
    newValue: { header: parsed.data.header, startAt: parsed.data.startAt, endAt: parsed.data.endAt },
  })

  return { ok: true }
})
