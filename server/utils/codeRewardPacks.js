// server/utils/codeRewardPacks.js
// Validation + merging for the packs a claim code awards (ClaimCodeReward.packs / RewardPack). Pure and import-light
// (h3 only) so `node --test` can load it; the existence check takes `db` as a parameter.
import { createError } from 'h3'
import { isUuid } from './tradeOfferRules.js'

/** Most of one pack type a code can award per redemption. */
export const MAX_PACK_QUANTITY_PER_CODE = 25
/** Most sealed packs one redemption can create across all pack types — each is a row and later a lock. */
export const MAX_PACKS_PER_CODE = 50

/**
 * Normalises one reward batch's packs: `[{ packId, quantity }]`, integer quantity 1..25, UUID ids, duplicates within
 * the batch merged (RewardPack is unique per (batch, pack), so submitting the same pack twice would otherwise violate
 * the constraint and 500).
 */
export function normalizeRewardPacks (raw, where = 'packs') {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw createError({ statusCode: 400, statusMessage: `${where} must be an array.` })
  const merged = new Map()
  raw.forEach((p, j) => {
    const packId = typeof p?.packId === 'string' ? p.packId.toLowerCase() : null
    if (!isUuid(packId)) throw createError({ statusCode: 400, statusMessage: `Invalid packId in ${where}[${j}].` })
    const quantity = p?.quantity
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PACK_QUANTITY_PER_CODE) {
      throw createError({ statusCode: 400, statusMessage: `Quantity in ${where}[${j}] must be a whole number from 1 to ${MAX_PACK_QUANTITY_PER_CODE}.` })
    }
    merged.set(packId, (merged.get(packId) || 0) + quantity)
  })
  return [...merged].map(([packId, quantity]) => {
    if (quantity > MAX_PACK_QUANTITY_PER_CODE) {
      throw createError({ statusCode: 400, statusMessage: `A code can award at most ${MAX_PACK_QUANTITY_PER_CODE} of one pack.` })
    }
    return { packId, quantity }
  })
}

/** Total packs across every reward batch, with the same pack in different batches counted together. */
export function totalRewardPacks (batches) {
  const perPack = new Map()
  for (const list of batches) for (const { packId, quantity } of list) perPack.set(packId, (perPack.get(packId) || 0) + quantity)
  return { perPack, total: [...perPack.values()].reduce((a, b) => a + b, 0) }
}

export function assertRewardPackLimits (batches) {
  const { perPack, total } = totalRewardPacks(batches)
  for (const q of perPack.values()) {
    if (q > MAX_PACK_QUANTITY_PER_CODE) throw createError({ statusCode: 400, statusMessage: `A code can award at most ${MAX_PACK_QUANTITY_PER_CODE} of one pack.` })
  }
  if (total > MAX_PACKS_PER_CODE) throw createError({ statusCode: 400, statusMessage: `A code can award at most ${MAX_PACKS_PER_CODE} packs in total.` })
}

/** Every pack id must exist — a dangling id would otherwise surface as an opaque FK error. */
export async function assertPacksExist (db, batches) {
  const ids = [...new Set(batches.flat().map(p => p.packId))]
  if (!ids.length) return
  const found = await db.pack.findMany({ where: { id: { in: ids } }, select: { id: true } })
  const have = new Set(found.map(p => p.id))
  const missing = ids.filter(id => !have.has(id))
  if (missing.length) throw createError({ statusCode: 400, statusMessage: `Unknown pack: ${missing[0]}` })
}

/**
 * What a redemption awards, summed across the code's reward batches: `[{ packId, quantity }]` in a stable order.
 * (RewardPack is only unique per batch, so the same pack can appear in several.)
 */
export function sumRewardPacks (rewardDefs) {
  const perPack = new Map()
  for (const r of rewardDefs) for (const rp of r.packs || []) perPack.set(rp.packId, (perPack.get(rp.packId) || 0) + (rp.quantity || 0))
  return [...perPack].sort(([a], [b]) => (a < b ? -1 : 1)).map(([packId, quantity]) => ({ packId, quantity }))
}
