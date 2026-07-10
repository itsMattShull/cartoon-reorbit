// server/utils/saleValidation.js
import { createError } from 'h3'
import { parseLocalYmdHm, centralLocalToUTC } from './centralTime.js'

export function validateSaleMeta(meta) {
  if (!meta?.name || typeof meta.name !== 'string' || !meta.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "name"' })
  }
  if (meta.name.trim().length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Name must be 120 characters or fewer' })
  }
  if (!Array.isArray(meta.items) || meta.items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one cToon is required' })
  }
  const dupCtoon = meta.items.map(i => i.ctoonId).find((id, i, a) => a.indexOf(id) !== i)
  if (dupCtoon) throw createError({ statusCode: 400, statusMessage: 'Duplicate cToon in sale items' })

  for (const item of meta.items) {
    if (!item.ctoonId || typeof item.ctoonId !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Each item requires a ctoonId' })
    }
    const price = Number(item.price)
    const limit = Number(item.perDayLimit)
    if (!Number.isInteger(price) || price < 0) {
      throw createError({ statusCode: 400, statusMessage: `Invalid sale price for cToon ${item.ctoonId}` })
    }
    if (!Number.isInteger(limit) || limit < 1) {
      throw createError({ statusCode: 400, statusMessage: `Invalid per-day limit for cToon ${item.ctoonId}` })
    }
  }
}

export function parseSaleWindow(meta) {
  const startAtLocal = String(meta?.startAtLocal || '').trim()
  const endAtLocal = String(meta?.endAtLocal || '').trim()
  if (!startAtLocal || !parseLocalYmdHm(startAtLocal)) {
    throw createError({ statusCode: 400, statusMessage: 'startAtLocal must be "YYYY-MM-DD HH:mm"' })
  }
  if (!endAtLocal || !parseLocalYmdHm(endAtLocal)) {
    throw createError({ statusCode: 400, statusMessage: 'endAtLocal must be "YYYY-MM-DD HH:mm"' })
  }
  const startAt = centralLocalToUTC(startAtLocal)
  const endAt = centralLocalToUTC(endAtLocal)
  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid start/end date-time' })
  }
  if (endAt.getTime() <= startAt.getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'End time must be after start time' })
  }
  return { startAt, endAt }
}
