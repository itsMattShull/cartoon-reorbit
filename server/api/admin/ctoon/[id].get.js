// /api/admin/ctoon/[id].get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  /* ── Admin check ─────────────────────────────────────────── */
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  /* ── Fetch the cToon ─────────────────────────────────────── */
  try {
    const ctoon = await prisma.ctoon.findUnique({
      where: { id },
      select: {
        // core details
        id: true, name: true, series: true, set: true, type: true,
        rarity: true, assetPath: true, releaseDate: true,
        price: true, inCmart: true, codeOnly: true,
        quantity: true, initialQuantity: true, perUserLimit: true,
        characters: true,

        // NEW G-toon fields
        isGtoon:    true,
        gtoonType:  true,
        cost:       true,
        power:      true,
        abilityKey: true,
        abilityData:true,

        // advisory schedule fields
        initialReleaseAt: true,
        finalReleaseAt:   true,
        initialReleaseQty: true,
        finalReleaseQty:   true
      }
    })

    if (!ctoon) throw createError({ statusCode: 404, statusMessage: 'cToon not found' })

    return { success: true, ctoon }
  } catch (err) {
    console.error(err)
    throw createError({ statusCode: 500, statusMessage: err.message || 'Internal Server Error' })
  }
})
