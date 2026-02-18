import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'
import { prisma } from '@/server/prisma'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  const id = event.context.params.id
  const body = await readBody(event).catch(() => ({}))
  const reason = normalizeString(body?.reason)

  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'Rejection reason required' })

  const suggestion = await prisma.ctoonUserSuggestion.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, discordId: true } },
      ctoon: { select: { id: true, name: true } }
    }
  })

  if (!suggestion) throw createError({ statusCode: 404, statusMessage: 'Suggestion not found' })
  if (suggestion.status !== 'IN_REVIEW') {
    throw createError({ statusCode: 400, statusMessage: 'Suggestion already reviewed' })
  }

  const newName = normalizeString(suggestion.newValues?.name)

  await prisma.ctoonUserSuggestion.update({
    where: { id: suggestion.id },
    data: { status: 'REJECTED', rejectionReason: reason }
  })

  const discordId = suggestion.user?.discordId
  if (discordId) {
    const displayName = newName || suggestion.ctoon?.name || 'cToon'
    const message = `Thanks for suggesting updates for ${displayName}. After review, we weren't able to accept this suggestion.\nReason: ${reason}\nWe appreciate you contributing to the community!`
    await sendDiscordDMByDiscordId(discordId, message)
  }

  return { success: true }
})
