// server/api/admin/active-discord.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 1800 // 30 minutes

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

  // ── 2. Cache check ────────────────────────────────────────────────────────
  const cacheKey = 'admin:active-discord'
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  // ── 3. Query total users and those currently in the guild ────────────────
  const total  = await prisma.user.count()
  const active = await prisma.user.count({
    where: { inGuild: true }
  })

  // ── 4. Cache and return ───────────────────────────────────────────────────
  const result = { total, active }
  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
  return result
})
