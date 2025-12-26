// server/api/monsters/battle.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const monster = await db.userMonster.findFirst({
    where: { userId: String(me.id), lastSelected: true },
    select: { id: true, hp: true },
  })
  if (!monster) throw createError({ statusCode: 404, statusMessage: 'Monster not found' })

  const nextHp = Math.max(0, Math.floor(Number(monster.hp) / 2))
  const updated = await db.userMonster.update({
    where: { id: monster.id },
    data: { hp: nextHp },
    select: { id: true, hp: true },
  })

  return { ok: true, monster: updated }
})
