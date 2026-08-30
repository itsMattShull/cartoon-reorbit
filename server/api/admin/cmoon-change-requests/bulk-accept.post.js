// server/api/admin/cmoon-change-requests/bulk-accept.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { reassignUserCMoon, CMoonError } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

// Sequential, single-user reassignUserCMoon calls per request — unlike Balance Teams this is
// bounded by however many requests an admin selects in one sitting (realistically dozens, not
// hundreds), so the N+1/lock-contention concern that ruled out looping reassignUserCMoon for
// Balance Teams doesn't apply here at this volume, and each move still gets its own live Discord
// role sync exactly like a single accept would.
export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event).catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'string' && id.trim()) : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No request IDs provided' })

  const candidates = await prisma.cMoonChangeRequest.findMany({
    where: { id: { in: ids }, status: 'IN_REVIEW' },
    include: {
      user: { select: { id: true, username: true, discordId: true } },
      requestedCMoon: { select: { id: true, name: true } },
    },
  })

  let processed = 0
  for (const request of candidates) {
    const claimed = await prisma.cMoonChangeRequest.updateMany({
      where: { id: request.id, status: 'IN_REVIEW' },
      data: { status: 'ACCEPTED' },
    })
    if (claimed.count === 0) continue

    try {
      const result = await reassignUserCMoon(request.userId, request.requestedCMoonId, { skipPointsReset: true })
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
        ).catch(() => {})
      }
      processed++
    } catch (err) {
      // Failed to actually move the player (stale state, banned, etc.) after already claiming
      // the request — revert so it doesn't sit as a falsely-successful ACCEPTED with no move
      // behind it, and move on to the rest of the batch rather than aborting it entirely.
      await prisma.cMoonChangeRequest.update({ where: { id: request.id }, data: { status: 'IN_REVIEW' } }).catch(() => {})
      if (!(err instanceof CMoonError)) console.warn('[cmoon-change-requests] bulk-accept failed for', request.id, err?.message || err)
    }
  }

  return { success: true, processed }
})
