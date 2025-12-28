// server/api/admin/locked-points/[id]/release.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
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
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing lock id' })

  const lock = await prisma.lockedPoints.findUnique({
    where: { id },
    select: { id: true, status: true }
  })
  if (!lock) throw createError({ statusCode: 404, statusMessage: 'Lock not found' })
  if (lock.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Lock already inactive' })
  }

  await prisma.lockedPoints.update({
    where: { id },
    data: { status: 'RELEASED' }
  })

  return { success: true }
})
