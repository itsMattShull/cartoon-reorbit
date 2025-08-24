import { defineEventHandler, getRequestHeader, getRouterParam, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Admin check
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

  const setId = getRouterParam(event, 'id')
  const body = await readBody(event)
  const ctoonId = body?.ctoonId
  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'ctoonId required' })

  // Ensure set exists
  const set = await prisma.starterSet.findUnique({ where: { id: setId } })
  if (!set) throw createError({ statusCode: 404, statusMessage: 'Starter set not found' })

  // Determine next position
  const max = await prisma.starterSetItem.aggregate({
    where: { setId },
    _max: { position: true }
  })
  const nextPos = (max._max.position ?? -1) + 1

  try {
    const created = await prisma.starterSetItem.create({
      data: { setId, ctoonId, position: nextPos }
    })
    return created
  } catch (e) {
    // Unique constraint if the cToon is already in the set
    if (e?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'cToon already in this set' })
    }
    throw e
  }
})
