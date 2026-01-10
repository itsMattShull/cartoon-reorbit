// server/api/admin/scavenger/step-image.delete.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const storyId = String(body?.storyId || '')
  const pathKey = (body?.path ?? '').toString()
  if (!storyId) throw createError({ statusCode: 400, statusMessage: 'Missing storyId' })
  if (pathKey.length > 3 || /[^AB]/.test(pathKey)) {
    if (!(pathKey === '' || pathKey === 'A' || pathKey === 'B' || pathKey === 'AA' || pathKey === 'AB' || pathKey === 'BA' || pathKey === 'BB')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
    }
  }

  const layer = (pathKey.length || 0) + 1
  await db.scavengerStep.updateMany({
    where: { storyId, layer, path: pathKey },
    data: { imagePath: null }
  })
  return { ok: true }
})

