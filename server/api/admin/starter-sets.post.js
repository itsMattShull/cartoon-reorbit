import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

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

  const body = await readBody(event)
  const name = (body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const key = (body?.key || name).trim()
  const created = await prisma.starterSet.create({
    data: {
      key: slugify(key),
      name,
      description: body?.description ?? null,
      isActive: body?.isActive ?? true,
      sortOrder: typeof body?.sortOrder === 'number' ? body.sortOrder : 0
    }
  })

  return created
})
