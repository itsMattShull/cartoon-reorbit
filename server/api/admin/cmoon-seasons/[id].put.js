// server/api/admin/cmoon-seasons/[id].put.js
// Edits a season. A season that hasn't started yet may change freely, including its dates. Once
// started (including an already-ended one), startAt is locked — shifting when a LIVE window began
// would retroactively change what already counted toward it — but header/blurb/goal/tracker
// fields, and endAt, stay editable so an admin can fix a typo or extend/shorten a currently
// featured season without deleting and recreating it. A currently-ongoing season's endAt may
// never be set to a moment already in the past (so it can't be made to look like it silently
// ended before "now"), and symmetrically an already-ended season's endAt may never be set to the
// present or future (so it can't be silently resurrected as the live season by an edit that
// never meant to touch its dates at all).
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
  const now = Date.now()
  const started = existing.startAt.getTime() <= now
  // Distinct from `started`: a season that's already ENDED has an endAt already in the past by
  // definition, so the "can't set endAt in the past" guard below must not apply to it as written
  // — otherwise the edit form (which re-submits the existing endAt unchanged) could never save
  // ANY edit to a past season, including just fixing its header/blurb. Instead it gets the
  // mirror-image guard just below: its endAt must STAY in the past, so an edit that was never
  // meant to touch the dates at all can't silently resurrect it as the current season either.
  const alreadyEnded = existing.endAt.getTime() <= now

  const body = await readBody(event)
  const parsed = parseSeasonBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  if (started) {
    if (parsed.data.startAt.getTime() !== existing.startAt.getTime()) {
      throw createError({ statusCode: 400, statusMessage: "A season's start date can't change once it has started" })
    }
    if (alreadyEnded) {
      if (parsed.data.endAt.getTime() >= now) {
        throw createError({ statusCode: 400, statusMessage: "An already-ended season's end date can't be moved into the present or future" })
      }
    } else if (parsed.data.endAt.getTime() < now) {
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
