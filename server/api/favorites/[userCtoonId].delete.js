// DELETE /api/favorites/:userCtoonId — clear the caller's favorite on one copy.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { favoriteWriteWhere, isUserCtoonUuid } from '@/server/utils/favoriteRules'
import { requireFavoriteActor, checkFavoriteRateLimit } from '@/server/utils/favoriteRequest'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const userId = await requireFavoriteActor(event)
  await checkFavoriteRateLimit(event, userId)

  // Raw UUIDs only, for the reason spelled out in the POST handler.
  const userCtoonId = event.context.params?.userCtoonId
  if (!isUserCtoonUuid(userCtoonId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cToon reference' })
  }

  // Same self-scoping as the POST: the compound where IS the authorization, so a
  // token naming somebody else's copy updates nothing instead of clearing their
  // favorite. Switching this to `update({ where: { id } })` would let any
  // authenticated user strip the protection off any copy in the game.
  //
  // A miss returns success rather than 404: unfavoriting something already
  // unfavorited is the caller's intended end state, and distinguishing "not
  // yours" from "not favorited" here would answer questions about other people's
  // copies that nothing else on this endpoint answers.
  await prisma.userCtoon.updateMany({
    where: favoriteWriteWhere(userCtoonId, userId),
    data: { favoritedByUserId: null }
  })

  return { success: true, isFavorite: false }
})
