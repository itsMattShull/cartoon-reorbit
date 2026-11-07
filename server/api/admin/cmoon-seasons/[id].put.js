// server/api/admin/cmoon-seasons/[id].put.js
// Edits a season. A season that hasn't started yet may change freely, including its dates. Once
// started (including an already-ended one), startAt is locked — shifting when a LIVE window began
// would retroactively change what already counted toward it — but header/blurb/goal/tracker
// fields, and endAt, stay editable so an admin can fix a typo or extend/shorten a currently
// featured season without deleting and recreating it. endAt may never be set to a moment already
// in the past, so a started season can't be made to look like it silently ended before "now."
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
  const started = existing.startAt.getTime() <= Date.now()

  const body = await readBody(event)
  const parsed = parseSeasonBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  if (started) {
    if (parsed.data.startAt.getTime() !== existing.startAt.getTime()) {
      throw createError({ statusCode: 400, statusMessage: "A season's start date can't change once it has started" })
    }
    if (parsed.data.endAt.getTime() < Date.now()) {
      throw createError({ statusCode: 400, statusMessage: "A started season's end date can't be set in the past" })
    }
  }

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
