// server/api/cmoon/choose-special-attack.post.js
// Sets (or clears) the caller's own cMoon special-attack choice — see User.chosenSpecialAttackId's
// own schema comment. Mirrors server/api/czone/border.post.js's "re-check ownership/eligibility
// from the database, never trust a client-supplied id blindly" shape: a null body clears the
// choice (falls back to the player's cMoon's own assigned special, same as before this feature
// existed); a non-null id must point at an attack that currently has playerChoice: true.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)

  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const specialAttackId = body?.specialAttackId ? String(body.specialAttackId) : null

  if (specialAttackId) {
    const attack = await db.cMoonSpecialAttack.findUnique({ where: { id: specialAttackId }, select: { playerChoice: true } })
    if (!attack || !attack.playerChoice) {
      throw createError({ statusCode: 403, statusMessage: 'That special attack is not available to choose' })
    }
  }

  await db.user.update({ where: { id: userId }, data: { chosenSpecialAttackId: specialAttackId } })

  return { success: true, chosenSpecialAttackId: specialAttackId }
})
