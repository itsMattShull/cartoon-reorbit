// server/api/admin/scavenger/pool.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const ctoonId = String(body?.ctoonId || '')
  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId' })

  // Validate cToon exists
  const exists = await db.ctoon.findUnique({ where: { id: ctoonId }, select: { id: true } })
  if (!exists) throw createError({ statusCode: 404, statusMessage: 'cToon not found' })

  try {
    const row = await db.scavengerExclusiveCtoon.create({ data: { ctoonId } })
    return { ok: true, existed: false, row }
  } catch (err) {
    // Unique violation means it already exists; return the existing row
    if (err?.code === 'P2002') {
      const existing = await db.scavengerExclusiveCtoon.findUnique({ where: { ctoonId } })
      if (existing) return { ok: true, existed: true, row: existing }
    }
    throw err
  }
})
