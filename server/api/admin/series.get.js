// server/api/admin/series.get.js


import { defineEventHandler, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── 1. Admin check via your /api/auth/me endpoint ───────────────────────
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

  // ── 2. Fetch distinct non-null series from the Ctoon table ─────────────
  const records = await prisma.ctoon.findMany({
    where: { series: { not: null } },
    distinct: ['series'],
    select: { series: true },
    orderBy: { series: 'asc' }
  })

  // ── 3. Return as an array of strings ─────────────────────────────────
  return records.map(r => r.series)
})
