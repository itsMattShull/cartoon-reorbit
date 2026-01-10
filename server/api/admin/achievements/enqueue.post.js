// server/api/admin/achievements/enqueue.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { achievementsQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event).catch(() => ({}))
  const userId = body?.userId ? String(body.userId) : null
  const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String) : null
  const all = body?.all ?? (!userId && !userIds)

  let targets = []
  if (userId) targets = [userId]
  else if (userIds && userIds.length) targets = userIds
  else if (all) {
    const rows = await db.user.findMany({ where: { active: true, banned: false }, select: { id: true } })
    targets = rows.map(r => r.id)
  }

  let enq = 0
  for (const id of targets) {
    await achievementsQueue.add('processUserAchievements', { userId: id })
    enq++
  }

  return { enqueued: enq }
})

