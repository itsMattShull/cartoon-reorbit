// server/utils/packAvailability.js
// ---------------------------------------------------------------------------
// Shared depletion check for Packs.
//
// A pack contains one or more rarities (PackRarityConfig). Each rarity is
// satisfied at open time by picking from the pack's PackCtoonOptions whose
// underlying Ctoon has the same rarity. A Ctoon is "out" once its minted
// count (plus any pending mints we're about to perform) hits its quantity.
//
// Because some cToons in a pack can also be sold directly in the cToons
// section, a rarity can become unsatisfiable without anyone ever opening
// the pack. This helper computes whether a Pack should currently be
// considered sold out based on its sellOutBehavior, so the buy endpoint
// can refuse the purchase (and the open-pack endpoint can reuse the same
// logic).
// ---------------------------------------------------------------------------
import { prisma as defaultPrisma } from '../prisma.js'

/**
 * Compute current depletion state for a pack.
 *
 * @param {string} packId
 * @param {object} [opts]
 * @param {import('@prisma/client').PrismaClient | object} [opts.tx]
 *        Prisma client or transaction client. Defaults to the global client.
 * @param {Record<string, number>} [opts.pendingMintCounts]
 *        Map of ctoonId → count of mints that are about to happen but
 *        haven't been recorded yet (used during open-pack to account for
 *        the cToons being minted in the current transaction).
 * @returns {Promise<{
 *   pack: { id: string, sellOutBehavior: string } | null,
 *   rarityStatuses: Array<{ rarity: string, total: number, remaining: number, depleted: boolean }>,
 *   anyRarityEmpty: boolean,
 *   allRaritiesEmpty: boolean,
 *   shouldUnlist: boolean
 * }>}
 */
export async function checkPackDepletion(packId, opts = {}) {
  const tx      = opts.tx || defaultPrisma
  const pending = opts.pendingMintCounts || {}

  const pack = await tx.pack.findUnique({
    where: { id: packId },
    select: {
      id: true,
      sellOutBehavior: true,
      rarityConfigs: { select: { rarity: true } },
      ctoonOptions: {
        select: {
          ctoonId: true,
          ctoon: { select: { id: true, rarity: true, quantity: true } }
        }
      }
    }
  })

  if (!pack) {
    return {
      pack: null,
      rarityStatuses: [],
      anyRarityEmpty: false,
      allRaritiesEmpty: false,
      shouldUnlist: false
    }
  }

  const optionsByRarity = {}
  for (const opt of pack.ctoonOptions) {
    if (!opt.ctoon) continue
    ;(optionsByRarity[opt.ctoon.rarity] ||= []).push(opt)
  }

  const rarityStatuses = []
  for (const rc of pack.rarityConfigs) {
    const options = optionsByRarity[rc.rarity] || []
    let remaining = 0
    for (const opt of options) {
      const c = opt.ctoon
      if (c.quantity === null) {
        remaining += 1
        continue
      }
      const minted     = await tx.userCtoon.count({ where: { ctoonId: c.id } })
      const pendingFor = pending[c.id] || 0
      if (minted + pendingFor < c.quantity) remaining += 1
    }
    rarityStatuses.push({
      rarity:   rc.rarity,
      total:    options.length,
      remaining,
      depleted: remaining === 0
    })
  }

  const anyRarityEmpty   = rarityStatuses.some(r => r.depleted)
  const allRaritiesEmpty = rarityStatuses.length > 0 && rarityStatuses.every(r => r.depleted)
  const sellOutBehavior  = pack.sellOutBehavior || 'REMOVE_ON_ANY_RARITY_EMPTY'
  const shouldUnlist     = sellOutBehavior === 'KEEP_IF_SINGLE_RARITY_EMPTY'
    ? allRaritiesEmpty
    : anyRarityEmpty

  return {
    pack: { id: pack.id, sellOutBehavior },
    rarityStatuses,
    anyRarityEmpty,
    allRaritiesEmpty,
    shouldUnlist
  }
}
