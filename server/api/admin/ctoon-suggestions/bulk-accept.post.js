import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'
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
  const body = await readBody(event).catch(() => ({}))
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter(id => typeof id === 'string' && id.trim())
    : []

  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No suggestion IDs provided' })

  // Fetch all IN_REVIEW candidates up front
  const candidates = await prisma.ctoonUserSuggestion.findMany({
    where: { id: { in: ids }, status: 'IN_REVIEW' },
    include: {
      user: { select: { id: true, discordId: true } },
      ctoon: { select: { id: true, name: true } }
    }
  })

  // Map: userId -> { discordId, count }
  const userAccepted = new Map()

  for (const suggestion of candidates) {
    const newValues = suggestion.newValues || {}
    const name = normalizeString(newValues.name)
    const series = normalizeString(newValues.series)
    const set = normalizeString(newValues.set)
    const characters = normalizeCharacters(newValues.characters)
    const descriptionProvided = Object.prototype.hasOwnProperty.call(newValues, 'description')
    const descriptionValue = descriptionProvided && typeof newValues.description === 'string'
      ? newValues.description.trim()
      : ''
    const description = descriptionProvided ? (descriptionValue || null) : null

    // Skip suggestions with incomplete data
    if (!name || !series || !set || !characters.length) continue

    const updateData = { name, series, set, characters }
    if (descriptionProvided) updateData.description = description

    try {
      const accepted = await prisma.$transaction(async (tx) => {
        // Re-check status inside the transaction to guard against concurrent processing
        const current = await tx.ctoonUserSuggestion.findUnique({
          where: { id: suggestion.id },
          select: { status: true }
        })
        if (!current || current.status !== 'IN_REVIEW') return false

        await tx.ctoon.update({ where: { id: suggestion.ctoonId }, data: updateData })
        await tx.ctoonUserSuggestion.update({
          where: { id: suggestion.id },
          data: { status: 'ACCEPTED' }
        })
        return true
      })

      if (!accepted) continue

      const userId = suggestion.user?.id
      const discordId = suggestion.user?.discordId
      if (userId) {
        if (!userAccepted.has(userId)) {
          userAccepted.set(userId, { discordId, count: 0 })
        }
        userAccepted.get(userId).count++
      }
    } catch {
      // Skip this suggestion if the transaction fails (e.g., concurrent modification)
      continue
    }
  }

  // Send one Discord DM per unique user summarising how many were accepted
  for (const { discordId, count } of userAccepted.values()) {
    if (!discordId) continue
    const were = count !== 1 ? 'were' : 'was'
    const plural = count !== 1 ? 's' : ''
    const message = `✅ ${count} of your cToon suggestion${plural} ${were} accepted! We appreciate you contributing to the community.`
    await sendDiscordDMByDiscordId(discordId, message).catch(() => {})
  }

  const processed = [...userAccepted.values()].reduce((sum, u) => sum + u.count, 0)
  return { success: true, processed }
})
