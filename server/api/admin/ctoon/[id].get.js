// /api/admin/ctoon/[id].get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const id = event.context.params.id

  /* ── Admin check ─────────────────────────────────────────── */
  await requireAdmin(event)

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
        characters: true, description: true, soundPath: true,
        cMoonId: true,

        // NEW G-toon fields
        isGtoon:    true,
        gtoonType:  true,
        cost:       true,
        power:      true,
        abilityKey: true,
        abilityData:true,

        // mint limit fields
        mintLimitType: true,
        mintEndDate: true,
        timeBasedLimitCount: true,
        timeBasedLimitWindowDays: true,

        // advisory schedule fields
        initialReleaseAt: true,
        finalReleaseAt:   true,
        initialReleaseQty: true,
        finalReleaseQty:   true,

        // Second Edition fields
        isSecondEdition: true,
        relatedFirstEditionId: true,
        secondEditionOverlayX: true,
        secondEditionOverlayY: true,
        secondEditionOverlaySize: true,
        relatedFirstEdition: { select: { id: true, name: true, assetPath: true } }
      }
    })

    if (!ctoon) throw createError({ statusCode: 404, statusMessage: 'cToon not found' })

    return { success: true, ctoon }
  } catch (err) {
    console.error(err)
    throw createError({ statusCode: 500, statusMessage: err.message || 'Internal Server Error' })
  }
})
