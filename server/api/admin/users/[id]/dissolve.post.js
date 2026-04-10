// server/api/admin/users/[id]/dissolve.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { dissolveQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  // 1) Auth: must be admin
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event).catch(() => ({})) || {}
  const { scheduleConfig = null } = body

  // Resolve official account
  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({ where: { username: officialUsername } })
  if (!official) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }
  if (official.id === id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot dissolve the Official account' })
  }

  // Load target user
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, active: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Cannot dissolve an admin user' })
  if (!target.active) throw createError({ statusCode: 400, statusMessage: 'User is already inactive' })

  // Check if a dissolve job is already queued or active for this user
  const existingJob = await dissolveQueue.getJob(id)
  if (existingJob) {
    const state = await existingJob.getState()
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      throw createError({ statusCode: 409, statusMessage: 'A dissolve job is already in progress for this user.' })
    }
    // Stale completed/failed job — remove it so we can re-use the same jobId
    try { await existingJob.remove() } catch {}
  }

  // Enqueue the dissolve job (jobId = userId so we can look it up easily)
  const job = await dissolveQueue.add(
    'dissolve',
    {
      userId: id,
      officialId: official.id,
      officialUsername,
      adminId: me.id,
      adminUsername: me.username || me.id,
      scheduleConfig,
    },
    { jobId: id }
  )

  return { jobId: job.id }
})
