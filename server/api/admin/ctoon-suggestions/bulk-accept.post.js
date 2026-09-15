import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'
import { prisma } from '@/server/prisma'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'
import { buildCtoonSuggestionUpdateData } from '@/server/utils/ctoonSuggestions'
import { logAdminChange } from '@/server/utils/adminChangeLog'

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
    // Skip suggestions with incomplete data
    const updateData = await buildCtoonSuggestionUpdateData(suggestion.newValues)
    if (!updateData) continue

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

      if (Object.prototype.hasOwnProperty.call(updateData, 'cMoonId')) {
        await logAdminChange(prisma, {
          userId: me.id,
          area: 'Ctoon:suggestionCMoon',
          key: 'cMoonId',
          prevValue: { ctoonId: suggestion.ctoonId, cMoonId: suggestion.oldValues?.cMoonId ?? null },
          newValue: { cMoonId: updateData.cMoonId, suggestionId: suggestion.id }
        })
      }

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
