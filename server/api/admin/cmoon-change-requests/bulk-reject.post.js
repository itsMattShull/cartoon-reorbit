// server/api/admin/cmoon-change-requests/bulk-reject.post.js
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

  const body = await readBody(event).catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'string' && id.trim()) : []
  const reason = normalizeString(body?.reason)
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No request IDs provided' })
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'Rejection reason required' })

  const candidates = await prisma.cMoonChangeRequest.findMany({
    where: { id: { in: ids }, status: 'IN_REVIEW' },
    include: {
      user: { select: { id: true, discordId: true } },
      requestedCMoon: { select: { name: true } },
    },
  })

  let processed = 0
  for (const request of candidates) {
    const claimed = await prisma.cMoonChangeRequest.updateMany({
      where: { id: request.id, status: 'IN_REVIEW' },
      data: { status: 'REJECTED', rejectionReason: reason },
    })
    if (claimed.count === 0) continue
    processed++

    if (request.user?.discordId) {
      const teamName = request.requestedCMoon?.name || 'that team'
      await sendDiscordDMByDiscordId(
        request.user.discordId,
        `Your request to join ${teamName} wasn't approved.\nReason: ${reason}`,
      ).catch(() => {})
    }
  }

  return { success: true, processed }
})
