// server/api/admin/cmoons/[id]/featured-ctoons.get.js
// The current curated "Featured cToons" list for one cMoon (up to 12, ordered), for the admin
// cMoons "Featured cToons" picker. Empty when an admin hasn't curated one yet — the public cMoon
// page falls back to the first 12 displayed-assigned cToons in that case (see
// server/api/cmoon/[id].get.js), but the admin picker itself only ever shows what's actually
// been curated.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id }, select: { id: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  // assignable: every cToon actually display-assigned to this cMoon (Ctoon.cMoonId === id) — the
  // only pool "featured" is ever allowed to pick from (see featured-ctoons.put.js's ownership
  // check). Sent alongside the current featured list so the admin picker's search doesn't need a
  // second round trip.
  const [rows, assignable] = await Promise.all([
    db.cMoonFeaturedCtoon.findMany({
      where: { cMoonId: id },
      orderBy: { sortOrder: 'asc' },
      select: { ctoonId: true, ctoon: { select: { name: true, assetPath: true } } },
    }),
    db.ctoon.findMany({
      where: { cMoonId: id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, assetPath: true },
    }),
  ])

  return {
    featuredCtoons: rows.map(r => ({ ctoonId: r.ctoonId, name: r.ctoon?.name || '', assetPath: r.ctoon?.assetPath || null })),
    assignableCtoons: assignable,
  }
})
