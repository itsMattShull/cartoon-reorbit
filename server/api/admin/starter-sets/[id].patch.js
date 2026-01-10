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

  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  // Ensure the set exists
  const existing = await prisma.starterSet.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Starter set not found' })

  const updated = await prisma.starterSet.update({
    where: { id },
    data: {
      name: typeof body.name === 'string' ? body.name : existing.name,
      description: body.description ?? existing.description,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : existing.isActive,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : existing.sortOrder
    }
  })

  return updated
})
