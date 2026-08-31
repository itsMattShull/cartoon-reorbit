// server/api/admin/cmoon-change-requests/[id]/accept.post.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { reassignUserCMoon, CMoonError, CMOON_SELECT_ERRORS } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing request id' })

  const request = await prisma.cMoonChangeRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, discordId: true } },
      requestedCMoon: { select: { id: true, name: true } },
    },
  })
  if (!request) throw createError({ statusCode: 404, statusMessage: 'Request not found' })

  // Guarded transition, not a plain read-then-write: two admins double-clicking Accept (or an
  // Accept racing a Reject/cancel) only lets one of them actually flip IN_REVIEW -> ACCEPTED —
  // the loser sees count===0 and gets a clean 409 instead of double-processing the same request.
  const claimed = await prisma.cMoonChangeRequest.updateMany({
    where: { id, status: 'IN_REVIEW' },
    data: { status: 'ACCEPTED' },
  })
  if (claimed.count === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Request already reviewed' })
  }

  let result
  try {
    // Same shared path as any other admin-driven reassignment (including an admin's Balance
    // Teams move) — cMoonPoints resets under the new team, same as always; the player's actual
    // affinity progress and any cToons/cosmetics already earned are untouched by this, since
    // those are permanent per-(user, cMoon) records rather than derived from current membership.
    result = await reassignUserCMoon(request.userId, request.requestedCMoonId)
  } catch (err) {
    // The move failed after we already claimed the request (e.g. the player's cMoon changed
    // since they submitted — a Balance Teams run or another accepted request moved them in the
    // meantime, or they got banned, or the target cMoon was deleted). Revert to IN_REVIEW rather
    // than leaving the request stuck as a falsely-successful ACCEPTED with no actual move behind
    // it, so the admin can see it's still pending and re-evaluate against current state.
    await prisma.cMoonChangeRequest.update({ where: { id }, data: { status: 'IN_REVIEW' } }).catch(() => {})
    if (err instanceof CMoonError) {
      if (err.code === CMOON_SELECT_ERRORS.STALE_STATE) {
        throw createError({ statusCode: 409, statusMessage: 'This player’s cMoon changed since the request was submitted — please review again' })
      }
      if (err.code === CMOON_SELECT_ERRORS.NOT_FOUND) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
      if (err.code === CMOON_SELECT_ERRORS.BANNED) throw createError({ statusCode: 400, statusMessage: 'Cannot move a banned user' })
    }
    throw err
  }

  invalidateCMoonList()
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:cMoons',
    key: 'changeRequestAccepted',
    prevValue: { cMoonId: request.currentCMoonId },
    newValue: { cMoonId: request.requestedCMoonId },
    targetUserId: request.userId,
    targetUsername: request.user?.username || null,
  })

  if (request.user?.discordId) {
    const teamName = result.cMoonName || request.requestedCMoon?.name || 'your new team'
    await sendDiscordDMByDiscordId(
      request.user.discordId,
      `✅ Your request to join ${teamName} was approved! You've been moved to your new cMoon.`,
    )
  }

  return { ok: true, cMoonId: result.cMoonId, cMoonName: result.cMoonName }
})
