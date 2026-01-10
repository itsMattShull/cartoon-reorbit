// server/api/admin/monster-battles/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = String(event.context.params?.id || '').trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const before = await db.monsterBattle.findUnique({
    where: { id },
    select: {
      id: true,
      player1UserId: true,
      player2UserId: true,
      player2IsAi: true,
      player1MonsterId: true,
      player2MonsterId: true,
      startedAt: true,
      endedAt: true,
      winnerUserId: true,
      winnerIsAi: true,
      endReason: true
    }
  })
  if (!before) throw createError({ statusCode: 404, statusMessage: 'Monster battle not found' })

  await db.monsterBattle.delete({ where: { id } })
  await logAdminChange(db, { userId: me.id, area: 'MonsterBattle', key: `delete:${id}`, prevValue: before, newValue: null })
  return { ok: true }
})
