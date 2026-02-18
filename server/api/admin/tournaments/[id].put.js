import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  const optInStartAt = new Date(body?.optInStartAt)
  const optInEndAt = new Date(body?.optInEndAt)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!optInStartAt || Number.isNaN(optInStartAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'optInStartAt is invalid' })
  }
  if (!optInEndAt || Number.isNaN(optInEndAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'optInEndAt is invalid' })
  }
  if (optInStartAt >= optInEndAt) {
    throw createError({ statusCode: 400, statusMessage: 'optInStartAt must be before optInEndAt' })
  }

  const updated = await prisma.gtoonTournament.update({
    where: { id: String(id) },
    data: {
      name,
      optInStartAt,
      optInEndAt
    },
    select: { id: true }
  })

  return { id: updated.id }
})
