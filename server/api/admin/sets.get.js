// /api/admin/sets.get.js


import { defineEventHandler, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── Admin check ─────────────────────────────────────────────────────────
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

  // ── Fetch distinct sets ──────────────────────────────────────────────────
  const rows = await prisma.ctoon.findMany({
    select: { set: true }
  })
  const sets = Array.from(new Set(rows.map(r => r.set)))

  return sets
})
