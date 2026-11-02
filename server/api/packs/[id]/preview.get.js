// GET /api/packs/:id/preview
//
// What's inside a pack TYPE and the current odds — for a pack you own, are trading, or can see in an auction.
//
// This is NOT /api/cmart/packs/:id. That one only serves packs currently listed in cMart (inCmart:true), which is
// exactly the wrong set here: a pack that has sold out gets unlisted, and gifted / code / PvP-win packs may never have
// been listed — so the owner's "what's in this?" tap would 404 for the very packs this feature creates.
//
// Authorization (this exposes a pack's full contents and odds, so it is not public):
//   * the pack is listed in cMart (already public there), OR
//   * the caller owns an unopened pack of this type, OR
//   * the caller is a party to a pending trade involving this type, OR
//   * an active auction is selling this type (the auction page is public).
// cToons whose release date is still in the future are left out so a staged, unreleased cToon is never leaked through
// a code-only pack. The odds are "current": opening a pack removes sold-out cToons and re-weights the rest.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'
import { isUuid } from '@/server/utils/tradeOfferRules'
import { OG_GTOON_DISPLAY_SELECT, ogGtoonDisplay } from '@/server/utils/ogGtoonDisplay'

async function loadPreview (id) {
  const pack = await prisma.pack.findUnique({
    where: { id },
    select: {
      id: true, name: true, imagePath: true,
      rarityConfigs: { select: { rarity: true, count: true, probabilityPercent: true } },
      ctoonOptions: {
        select: {
          weight: true, ctoonId: true,
          ctoon: {
            select: {
              name: true, rarity: true, assetPath: true, ...OG_GTOON_DISPLAY_SELECT, isGtoon: true, cost: true, power: true,
              inCmart: true, releaseDate: true, isSecondEdition: true,
              secondEditionOverlayX: true, secondEditionOverlayY: true, secondEditionOverlaySize: true
            }
          }
        }
      }
    }
  })
  if (!pack) return null
  const now = Date.now()
  return {
    id: pack.id,
    name: pack.name,
    imagePath: pack.imagePath,
    rarityConfigs: pack.rarityConfigs,
    ctoonOptions: pack.ctoonOptions
      .filter(o => !o.ctoon.releaseDate || new Date(o.ctoon.releaseDate).getTime() <= now)
      .map(o => ({
        ctoonId: o.ctoonId, name: o.ctoon.name, assetPath: o.ctoon.assetPath, ...ogGtoonDisplay(o.ctoon),
        rarity: o.ctoon.rarity, isGtoon: o.ctoon.isGtoon, cost: o.ctoon.cost, power: o.ctoon.power,
        inCmart: o.ctoon.inCmart, weight: o.weight, isSecondEdition: o.ctoon.isSecondEdition,
        secondEditionOverlayX: o.ctoon.secondEditionOverlayX, secondEditionOverlayY: o.ctoon.secondEditionOverlayY,
        secondEditionOverlaySize: o.ctoon.secondEditionOverlaySize
      }))
  }
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  const id = String(event.context.params?.id || '').toLowerCase()
  if (!isUuid(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid pack id' })

  const listed = await prisma.pack.findFirst({ where: { id, inCmart: true }, select: { id: true } })
  if (!listed) {
    const [owns, inMyTrade, inAuction] = await Promise.all([
      prisma.userPack.findFirst({ where: { userId, packId: id, opened: false }, select: { id: true } }),
      prisma.tradeOfferPack.findFirst({
        where: {
          userPack: { packId: id },
          tradeOffer: { status: 'PENDING', OR: [{ initiatorId: userId }, { recipientId: userId }] }
        },
        select: { id: true }
      }),
      prisma.auction.findFirst({ where: { kind: 'PACK', status: 'ACTIVE', userPack: { packId: id } }, select: { id: true } })
    ])
    // Same answer for "doesn't exist" and "not yours to see", so this can't be used to enumerate packs.
    if (!owns && !inMyTrade && !inAuction) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  }

  const preview = await cachedJson(`pack-preview:${id}`, 60, () => loadPreview(id))
  if (!preview) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  return preview
})
