// server/api/admin/cmoon-season.post.js
// Updates the season header/blurb only — starting a new season (moving startedAt) is a separate,
// deliberately distinct action (see cmoon-season/start-new.post.js) since it changes what every
// tracker measures going forward, not just display text.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { sanitizeEncyclopediaHtml } from '@/server/utils/sanitizeEncyclopediaHtml'
import { getSeasonConfig, SEASON_CONFIG_ID } from '@/server/utils/cmoonSeason'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const HEADER_MAX_LENGTH = 80

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const header = typeof body?.header === 'string' ? body.header.trim() : ''
  if (!header || header.length > HEADER_MAX_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Header is required (max ${HEADER_MAX_LENGTH} characters)` })
  }
  const blurb = typeof body?.blurb === 'string' ? sanitizeEncyclopediaHtml(body.blurb) : ''

  const existing = await getSeasonConfig()
  const updated = await db.cMoonSeasonConfig.update({
    where: { id: SEASON_CONFIG_ID },
    data: { header, blurb },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonSeasonConfig',
    key: 'update',
    prevValue: { header: existing.header },
    newValue: { header: updated.header },
  })

  return { header: updated.header, blurb: updated.blurb, startedAt: updated.startedAt }
})
