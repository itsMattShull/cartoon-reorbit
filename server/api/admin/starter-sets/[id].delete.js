import { defineEventHandler, getRequestHeader, getRouterParam, createError } from 'h3'
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

  // Ensure it exists
  const existing = await prisma.starterSet.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Starter set not found' })

  await prisma.starterSet.delete({ where: { id } })
  return { ok: true }
})
