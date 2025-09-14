// server/api/admin/ctoon-pool.get.js
// Returns cToons that still have supply left to mint (or are unlimited).
// Filters so that `owners < quantity` OR `quantity` is NULL.


import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  createError
} from 'h3'

/* ── Singleton Prisma ──────────────────────────────────────── */
import { prisma } from '@/server/prisma'

/* ── Route handler ─────────────────────────────────────────── */
export default defineEventHandler(async (event) => {
  /* 1️⃣  Admin auth via /api/auth/me */
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

  /* 2️⃣  Optional case‑insensitive name search */
  const { q = '' } = getQuery(event)
  const whereName = q
    ? { name: { contains: q, mode: 'insensitive' } }
    : undefined

  /* 3️⃣  Fetch with owner counts so we can compare */
  const raw = await prisma.ctoon.findMany({
    where: whereName,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      set: true,
      rarity: true,
      assetPath: true,
      quantity: true,         // total supply (null = unlimited)
      initialQuantity: true,
      inCmart: true,
      _count: { select: { owners: true } } // minted so far
    }
  })

  /* 4️⃣  Keep only those with remaining supply */
  const available = raw.filter(c =>
    c.quantity === null ||               // unlimited supply
    c._count.owners < c.quantity         // minted so far < max supply
  )

  /* 5️⃣  Strip the private _count before returning */
  return available.map(({ _count, ...rest }) => rest)
})
