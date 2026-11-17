// The avatar picker's own list — every cToon the caller actually owns and could pick, matching
// exactly what server/utils/myOrbitSocket.js's 'join' handler itself accepts (owned, not burned).
// Deliberately NOT server/api/user/ctoons.get.js, which filters on isTradeable — the wrong
// semantics here (a non-tradeable cToon is still a fine avatar) and doesn't exclude burned ones.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const [rows, me] = await Promise.all([
    db.userCtoon.findMany({
      where: { userId, burnedAt: null },
      select: { id: true, ctoon: { select: { name: true, assetPath: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    db.user.findUnique({ where: { id: userId }, select: { myOrbitLastUserCtoonId: true } })
  ])

  return {
    ctoons: rows.map(r => ({ id: r.id, name: r.ctoon.name, assetPath: r.ctoon.assetPath })),
    lastUserCtoonId: me?.myOrbitLastUserCtoonId || null
  }
})
