// server/utils/secondEdition.js
// Shared validation for the Second Edition fields accepted by the add/edit cToon endpoints.
import { createError } from 'h3'

function clampPercent(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(100, Math.max(0, num))
}

/**
 * @param {object} fields raw form fields (strings from multipart, or already-typed from JSON body)
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string|null} currentCtoonId id of the cToon being edited (null when creating)
 */
export async function parseSecondEditionFields(fields, prisma, currentCtoonId = null) {
  const isSecondEdition = String(fields.isSecondEdition) === 'true' || fields.isSecondEdition === true

  let relatedFirstEditionId = fields.relatedFirstEditionId
  relatedFirstEditionId = relatedFirstEditionId == null || relatedFirstEditionId === ''
    ? null
    : String(relatedFirstEditionId)

  if (relatedFirstEditionId && currentCtoonId && relatedFirstEditionId === currentCtoonId) {
    throw createError({ statusCode: 400, statusMessage: 'A cToon cannot reference itself as its Related First Edition.' })
  }

  if (relatedFirstEditionId) {
    const target = await prisma.ctoon.findUnique({
      where: { id: relatedFirstEditionId },
      select: { id: true, isSecondEdition: true }
    })
    if (!target) {
      throw createError({ statusCode: 400, statusMessage: 'Related First Edition cToon not found.' })
    }
    if (target.isSecondEdition) {
      throw createError({ statusCode: 400, statusMessage: 'Related First Edition must not itself be a Second Edition.' })
    }

    const existingPair = await prisma.ctoon.findUnique({
      where: { relatedFirstEditionId },
      select: { id: true, name: true }
    })
    if (existingPair && existingPair.id !== currentCtoonId) {
      throw createError({ statusCode: 400, statusMessage: `"${existingPair.name}" is already set as the Second Edition for that cToon.` })
    }
  }

  const overlayX = isSecondEdition ? clampPercent(fields.secondEditionOverlayX, 75) : null
  const overlayY = isSecondEdition ? clampPercent(fields.secondEditionOverlayY, 75) : null
  const overlaySizeRaw = Number(fields.secondEditionOverlaySize)
  const overlaySize = isSecondEdition
    ? (Number.isFinite(overlaySizeRaw) && overlaySizeRaw > 0 ? Math.min(1000, overlaySizeRaw) : 100)
    : null

  return {
    isSecondEdition,
    relatedFirstEditionId: isSecondEdition ? relatedFirstEditionId : null,
    secondEditionOverlayX: overlayX,
    secondEditionOverlayY: overlayY,
    secondEditionOverlaySize: overlaySize
  }
}
