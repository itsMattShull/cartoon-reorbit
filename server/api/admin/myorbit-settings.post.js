// Master on/off switch for MyOrbit — kept as its own tiny endpoint rather than folded into the
// room list GET/save routes, same "keep each feature area independently rip-out-able" rationale
// cmoon-pvp-settings.post.js's own header comment gives for its own separation from the general
// global-config endpoint. Checked by server/utils/myOrbitSocket.js's 'join' handler on every new
// room entry (never retroactively kicks anyone already in a room).
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateGlobalConfigCache } from '@/server/utils/cmoon'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  if (typeof body?.myOrbitEnabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'myOrbitEnabled must be a boolean' })
  }

  const existing = await db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { myOrbitEnabled: true } })

  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', myOrbitEnabled: body.myOrbitEnabled },
    update: { myOrbitEnabled: body.myOrbitEnabled }
  })
  invalidateGlobalConfigCache()

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbit', key: 'myOrbitEnabled',
    prevValue: { myOrbitEnabled: !!existing?.myOrbitEnabled }, newValue: { myOrbitEnabled: updated.myOrbitEnabled }
  })

  return { myOrbitEnabled: updated.myOrbitEnabled }
})
