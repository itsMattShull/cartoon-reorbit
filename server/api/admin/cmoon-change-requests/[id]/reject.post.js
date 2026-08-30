// server/api/admin/cmoon-change-requests/[id]/reject.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing request id' })

  const body = await readBody(event).catch(() => ({}))
  const reason = normalizeString(body?.reason)
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'Rejection reason required' })

  const request = await prisma.cMoonChangeRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, discordId: true } },
      requestedCMoon: { select: { name: true } },
    },
  })
  if (!request) throw createError({ statusCode: 404, statusMessage: 'Request not found' })

  // Same guarded transition as accept — only one caller can win the IN_REVIEW -> REJECTED flip.
  const claimed = await prisma.cMoonChangeRequest.updateMany({
    where: { id, status: 'IN_REVIEW' },
    data: { status: 'REJECTED', rejectionReason: reason },
  })
  if (claimed.count === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Request already reviewed' })
  }

  if (request.user?.discordId) {
    const teamName = request.requestedCMoon?.name || 'that team'
    await sendDiscordDMByDiscordId(
      request.user.discordId,
      `Your request to join ${teamName} wasn't approved.\nReason: ${reason}`,
    )
  }

  return { ok: true }
})
