// server/api/monsters/rename.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const name = String(body?.name || '')
  if (!/^[A-Za-z]{1,10}$/.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Name must be 1-10 letters' })
  }

  const monster = await db.userMonster.findFirst({
    where: { userId: String(me.id), lastSelected: true },
    select: { id: true },
  })
  if (!monster) throw createError({ statusCode: 404, statusMessage: 'Monster not found' })

  await db.userMonster.update({
    where: { id: monster.id },
    data: { customName: name },
  })

  return { ok: true }
})
