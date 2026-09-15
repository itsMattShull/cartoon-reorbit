import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { sendDiscordDMByDiscordId } from '@/server/utils/discord'
import { buildCtoonSuggestionUpdateData } from '@/server/utils/ctoonSuggestions'
import { logAdminChange } from '@/server/utils/adminChangeLog'

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

  const updateData = await buildCtoonSuggestionUpdateData(suggestion.newValues)
  if (!updateData) {
    throw createError({ statusCode: 400, statusMessage: 'Suggestion data incomplete' })
  }

  const [updatedCtoon] = await prisma.$transaction([
    prisma.ctoon.update({
      where: { id: suggestion.ctoonId },
      data: updateData
    }),
    prisma.ctoonUserSuggestion.update({
      where: { id: suggestion.id },
      data: { status: 'ACCEPTED' }
    })
  ])

  if (Object.prototype.hasOwnProperty.call(updateData, 'cMoonId')) {
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'Ctoon:suggestionCMoon',
      key: 'cMoonId',
      prevValue: { ctoonId: suggestion.ctoonId, cMoonId: suggestion.oldValues?.cMoonId ?? null },
      newValue: { cMoonId: updateData.cMoonId, suggestionId: suggestion.id }
    })
  }

  const discordId = suggestion.user?.discordId
  if (discordId) {
    const displayName = updateData.name || suggestion.ctoon?.name || 'cToon'
    const message = `✅ Thanks for suggesting updates for ${displayName}! Your suggestion was accepted. We appreciate you contributing to the community.`
    await sendDiscordDMByDiscordId(discordId, message)
  }

  return { success: true, ctoon: updatedCtoon }
})
