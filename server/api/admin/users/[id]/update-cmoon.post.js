// server/api/admin/users/[id]/update-cmoon.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const cMoonId = typeof body?.cMoonId === 'string' && body.cMoonId ? body.cMoonId : null

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, cMoonId: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  if (cMoonId) {
    const cmoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true, color: true } })
    if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
  }

  if (target.cMoonId === cMoonId) {
    const current = cMoonId ? await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true, color: true } }) : null
    return { ok: true, cMoonId, cMoonName: current?.name || null, cMoonColor: current?.color || null }
  }

  const prev = { cMoonId: target.cMoonId }

  const updated = await prisma.$transaction(async (tx) => {
    if (target.cMoonId) {
      await tx.cMoon.update({ where: { id: target.cMoonId }, data: { memberCount: { decrement: 1 } } })
    }
    if (cMoonId) {
      await tx.cMoon.update({ where: { id: cMoonId }, data: { memberCount: { increment: 1 } } })
    }
    await tx.user.update({
      where: { id: target.id },
      data: {
        cMoonId,
        cMoonSelectedAt: cMoonId ? new Date() : null,
        cMoonAutoAssigned: false,
        // A rank only means something within the cMoon it was earned in — clear it (and the
        // role-grant cursor) on any reassignment so a moved user doesn't keep showing a rank
        // badge for a cMoon they're no longer in. Contribution tracking already restarts at
        // 0 for the new cMoon on its own (server/cron/cmoon-points-aggregate.js sums from
        // the fresh cMoonSelectedAt set above), so the rank they re-earn will be accurate too.
        currentCMoonRankId: null,
        cMoonRankRoleGrantedAt: null,
      }
    })
    return cMoonId ? tx.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true, color: true } }) : null
  })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'cMoonId',
    prevValue: prev,
    newValue: { cMoonId }
  })

  return { ok: true, cMoonId, cMoonName: updated?.name || null, cMoonColor: updated?.color || null }
})
