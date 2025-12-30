// server/api/monsters/select.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const id = body?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const monster = await db.userMonster.findFirst({
    where: { id: String(id), userId: String(me.id) },
    select: { id: true },
  })
  if (!monster) throw createError({ statusCode: 404, statusMessage: 'Monster not found' })

  await db.userMonster.updateMany({
    where: { userId: String(me.id), lastSelected: true },
    data: { lastSelected: false, lastInteractionAt: new Date() },
  })

  await db.userMonster.update({
    where: { id: monster.id },
    data: { lastSelected: true, lastInteractionAt: new Date() },
  })

  return { ok: true }
})
