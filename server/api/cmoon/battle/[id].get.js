// server/api/cmoon/battle/[id].get.js
// Fetches the current state of one of the caller's own battles — used to resume the popup after
// a page reload without losing progress.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { serializeBattleForClient } from '@/server/utils/cmoonEnemyBattle'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const battleId = event.context.params?.id
  const battle = await db.cMoonEnemyBattle.findUnique({
    where: { id: battleId },
    include: { enemyMember: { include: { faction: true } } },
  })
  if (!battle || battle.userId !== userId) throw createError({ statusCode: 404, statusMessage: 'Battle not found' })

  return { battle: serializeBattleForClient(battle) }
})
