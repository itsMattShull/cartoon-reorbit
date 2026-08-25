// server/api/admin/users/[id]/update-cmoon.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { reassignUserCMoon, CMoonError, CMOON_SELECT_ERRORS } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const cMoonId = typeof body?.cMoonId === 'string' && body.cMoonId ? body.cMoonId : null

  const prev = await prisma.user.findUnique({ where: { id }, select: { cMoonId: true } })
  if (!prev) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  let result
  try {
    result = await reassignUserCMoon(id, cMoonId)
  } catch (e) {
    if (e instanceof CMoonError) {
      if (e.code === CMOON_SELECT_ERRORS.NOT_FOUND) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
      if (e.code === CMOON_SELECT_ERRORS.BANNED) throw createError({ statusCode: 400, statusMessage: 'Cannot assign a banned user to a cMoon' })
    }
    throw e
  }

  // A no-op (already in that cMoon) never touched memberCount, so nothing to invalidate or log.
  if (prev.cMoonId !== cMoonId) {
    invalidateCMoonList()
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'Admin:Users',
      key: 'cMoonId',
      prevValue: { cMoonId: prev.cMoonId },
      newValue: { cMoonId }
    })
  }

  return { ok: true, ...result }
})
