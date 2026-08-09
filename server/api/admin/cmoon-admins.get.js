// server/api/admin/cmoon-admins.get.js
// Lists admins eligible to be set as cMoon captains.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const admins = await db.user.findMany({
    where: { isAdmin: true, active: true },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  })
  return admins
})
