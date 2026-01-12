import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCharacters(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(v => String(v || '').trim())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

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

  const newValues = suggestion.newValues || {}
  const name = normalizeString(newValues.name)
  const series = normalizeString(newValues.series)
  const set = normalizeString(newValues.set)
  const characters = normalizeCharacters(newValues.characters)

  if (!name || !series || !set || !characters.length) {
    throw createError({ statusCode: 400, statusMessage: 'Suggestion data incomplete' })
  }

  const [updatedCtoon] = await prisma.$transaction([
    prisma.ctoon.update({
      where: { id: suggestion.ctoonId },
      data: { name, series, set, characters }
    }),
    prisma.ctoonUserSuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'ACCEPTED' }
    })
  ])

  const discordId = suggestion.user?.discordId
  if (discordId) {
    const displayName = name || suggestion.ctoon?.name || 'cToon'
    const message = `✅ Thanks for suggesting updates for ${displayName}! Your suggestion was accepted. We appreciate you contributing to the community.`
    await sendDiscordDMByDiscordId(discordId, message)
  }

  return { success: true, ctoon: updatedCtoon }
})
