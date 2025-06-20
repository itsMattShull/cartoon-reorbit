// server/api/admin/packs/[id].get.js
// GET  /api/admin/packs/:id
// Returns full pack details for the admin-edit page.

import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

/* ───────── auth helper (same pattern as your PATCH file) ───────── */
async function assertAdmin (event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } })
    .catch(() => null)

  if (!me)         throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!me.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
}

/* ───────── main handler ───────────────────────────────────────── */
export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const packId = event.context.params.id
  if (!packId) throw createError({ statusCode: 400, statusMessage: 'Missing id param' })

  try {
    const pack = await db.pack.findUnique({
      where:   { id: packId },
      include: {
        rarityConfigs: true,                   // [{ rarity, count, probabilityPercent }]
        ctoonOptions: {
          include: { ctoon: true }            // include full cToon rows for UI
        }
      }
    })

    if (!pack) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })

    return pack
  } catch (err) {
    // bubble up explicit h3 errors, re-wrap everything else
    if (err.statusCode) throw err
    console.error('[GET /api/admin/packs/:id]', err)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
