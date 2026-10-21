// server/api/admin/cmoon-seasons.post.js
// Creates a new cMoon season (the "+ Add Season" admin flow) — can be scheduled for a future start
// date, or start immediately. Replaces the old cmoon-season.post.js (singleton update) and
// cmoon-season/start-new.post.js (singleton rollover); see the CMoonSeason model's own schema
// comment for why.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { sanitizeEncyclopediaHtml } from '@/server/utils/sanitizeEncyclopediaHtml'
import { parseSeasonBody } from '@/server/utils/cmoonSeasonValidation'
import { assertNoOverlap, nextSeasonNumber } from '@/server/utils/cmoonSeasons'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseSeasonBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  try {
    await assertNoOverlap(parsed.data.startAt, parsed.data.endAt)
  } catch (err) {
    throw createError({ statusCode: err.statusCode || 400, statusMessage: err.message })
  }

  const blurb = typeof body?.blurb === 'string' ? sanitizeEncyclopediaHtml(body.blurb) : ''
  const seasonNumber = await nextSeasonNumber()

  const created = await db.cMoonSeason.create({
    data: {
      ...parsed.data,
      blurb,
      seasonNumber,
      trackers: { create: parsed.trackers },
    },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonSeason',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, seasonNumber: created.seasonNumber, header: created.header, startAt: created.startAt, endAt: created.endAt },
  })

  return { id: created.id, seasonNumber: created.seasonNumber }
})
