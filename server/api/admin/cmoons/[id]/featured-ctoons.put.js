// server/api/admin/cmoons/[id]/featured-ctoons.put.js
// Replaces this cMoon's curated "Featured cToons" list (the page's centerpiece grid) with an
// ordered list of up to 12 cToons. Every id must already be display-assigned to this exact cMoon
// (Ctoon.cMoonId === this cMoon's id) — "featured" is a curated subset of that existing
// assignment, never an independent pool, so an admin can't feature a cToon that isn't even
// thematically under this cMoon. The 12 cap is enforced here (400, not a silent truncation) —
// the admin UI enforces it too, but this is the real boundary.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const MAX_FEATURED = 12

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id }, select: { id: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const body = await readBody(event)
  const ctoonIds = Array.isArray(body?.ctoonIds) ? [...new Set(body.ctoonIds.filter(x => typeof x === 'string'))] : []

  if (ctoonIds.length > MAX_FEATURED) {
    throw createError({ statusCode: 400, statusMessage: `At most ${MAX_FEATURED} featured cToons are allowed` })
  }

  if (ctoonIds.length) {
    const owned = await db.ctoon.count({ where: { id: { in: ctoonIds }, cMoonId: id } })
    if (owned !== ctoonIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'Every featured cToon must already be assigned to display under this cMoon' })
    }
  }

  await db.$transaction(async (tx) => {
    await tx.cMoonFeaturedCtoon.deleteMany({ where: { cMoonId: id } })
    if (ctoonIds.length) {
      await tx.cMoonFeaturedCtoon.createMany({
        data: ctoonIds.map((ctoonId, i) => ({ cMoonId: id, ctoonId, sortOrder: i })),
      })
    }
  })

  await logAdminChange(db, { userId: me.id, area: `cMoon:${id}`, key: 'featuredCtoons', prevValue: null, newValue: ctoonIds })

  return { ok: true, ctoonIds }
})
