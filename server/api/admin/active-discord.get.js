// server/api/admin/active-discord.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // ── 1. Admin check via your /api/auth/me endpoint ─────────────────────────
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

  // ── 2. Query total users and those currently in the guild ────────────────
  const total  = await prisma.user.count()
  const active = await prisma.user.count({
    where: { inGuild: true }
  })

  // ── 3. Return the raw counts; client can compute % if needed ─────────────
  return { total, active }
})
