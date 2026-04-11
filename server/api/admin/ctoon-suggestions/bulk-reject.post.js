import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'
import { prisma } from '@/server/prisma'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter(id => typeof id === 'string' && id.trim())
    : []
  const reason = normalizeString(body?.reason)

  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No suggestion IDs provided' })
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'Rejection reason required' })

  // Fetch all IN_REVIEW candidates up front
  const candidates = await prisma.ctoonUserSuggestion.findMany({
    where: { id: { in: ids }, status: 'IN_REVIEW' },
    include: {
      user: { select: { id: true, discordId: true } }
    }
  })

  // Map: userId -> { discordId, count }
  const userRejected = new Map()

  for (const suggestion of candidates) {
    try {
      const rejected = await prisma.$transaction(async (tx) => {
        // Re-check status inside the transaction to guard against concurrent processing
        const current = await tx.ctoonUserSuggestion.findUnique({
          where: { id: suggestion.id },
          select: { status: true }
        })
        if (!current || current.status !== 'IN_REVIEW') return false

        await tx.ctoonUserSuggestion.update({
          where: { id: suggestion.id },
          data: { status: 'REJECTED', rejectionReason: reason }
        })
        return true
      })

      if (!rejected) continue

      const userId = suggestion.user?.id
      const discordId = suggestion.user?.discordId
      if (userId) {
        if (!userRejected.has(userId)) {
          userRejected.set(userId, { discordId, count: 0 })
        }
        userRejected.get(userId).count++
      }
    } catch {
      // Skip this suggestion if the transaction fails (e.g., concurrent modification)
      continue
    }
  }

  // Send one Discord DM per unique user summarising how many were rejected
  for (const { discordId, count } of userRejected.values()) {
    if (!discordId) continue
    const were = count !== 1 ? 'were' : 'was'
    const plural = count !== 1 ? 's' : ''
    const message = `${count} of your cToon suggestion${plural} ${were} reviewed and couldn't be accepted.\nReason: ${reason}\nWe appreciate you contributing to the community!`
    await sendDiscordDMByDiscordId(discordId, message).catch(() => {})
  }

  const processed = [...userRejected.values()].reduce((sum, u) => sum + u.count, 0)
  return { success: true, processed }
})
