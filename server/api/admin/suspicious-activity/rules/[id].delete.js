import { defineEventHandler, getRequestHeader, getRouterParam, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = getRouterParam(event, 'id')

  const existing = await db.suspiciousActivityRule.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Rule not found' })

  // Conditions cascade-delete via schema
  await db.suspiciousActivityRule.delete({ where: { id } })

  return { ok: true }
})
