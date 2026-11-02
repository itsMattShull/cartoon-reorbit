// server/utils/auctionItem.js
// What an Auction is SELLING, for read paths. An auction sells exactly one of two things (Auction.kind):
//   CTOON — a minted card (userCtoonId → UserCtoon → Ctoon)
//   PACK  — a sealed pack (userPackId → UserPack → Pack)
// A pack auction has NO userCtoon, so any read that walks `auction.userCtoon.ctoon.…` without a guard throws on the
// first pack in the list — and on the Auction House list that is the whole page, on the ending-soon notifier it is every
// cToon alert. Every read path therefore (1) reads the cToon side with optional chaining and (2) layers
// `packItemFields(a)` on top for a pack, which supplies the fields the client renders (name, art, …) with the cToon-only
// ones nulled. tests/auctionItemAccess.test.js fails the build if an unguarded `.userCtoon.` read reappears.
//
// Import-free, so it can be loaded by plain Node (the socket server, tests) as well as Nitro.

/** Prisma `select` for the pack side of an auction. Spread into `include` / `select`: `{ userPack: PACK_ITEM_SELECT }`. */
export const PACK_ITEM_SELECT = Object.freeze({
  select: {
    id: true,
    packId: true,
    pack: { select: { id: true, name: true, imagePath: true } }
  }
})

/**
 * Like PACK_ITEM_SELECT plus what "can the seller list this again?" needs: who holds the pack now, whether it is still
 * sealed, and whether it is already in another auction or a pending trade.
 */
export const PACK_ITEM_OWNER_SELECT = Object.freeze({
  select: {
    id: true,
    packId: true,
    userId: true,
    opened: true,
    pack: { select: { id: true, name: true, imagePath: true } },
    auctions: { where: { status: 'ACTIVE' }, select: { id: true } },
    tradeOfferPacks: { where: { tradeOffer: { status: 'PENDING' } }, select: { id: true } }
  }
})

export const isPackAuction = (a) => a?.kind === 'PACK'

/**
 * The item fields the Auction House / detail / "my" lists render, for a PACK auction. Layer over the cToon fields:
 * `{ ...cToonFields, ...packItemFields(a) }` — it overrides name/art and blanks the cToon-only fields. Returns `{}` for a
 * cToon auction so it is always safe to spread.
 */
export function packItemFields (a) {
  if (!isPackAuction(a)) return {}
  const pack = a.userPack?.pack
  return {
    kind: 'PACK',
    userPackId: a.userPackId ?? null,
    packId: pack?.id ?? a.userPack?.packId ?? null,
    // cToon identity is meaningless for a pack; null (not undefined) so the client's `?? ` fallbacks behave.
    userCtoonId: null,
    ctoonId: null,
    name: pack?.name ?? 'Pack',
    assetPath: pack?.imagePath ?? null,
    set: null,
    cMoon: null,
    series: null,
    rarity: null,
    isGtoon: false,
    isOgGtoon: false,
    cost: null,
    power: null,
    characters: [],
    price: 0,
    mintNumber: null,
    isSecondEdition: false,
    secondEditionOverlayX: null,
    secondEditionOverlayY: null,
    secondEditionOverlaySize: null,
    isHolidayItem: false,
    isOwned: false
  }
}

/** Display name of whatever an auction sells — for notifications, Discord, logs. */
export function auctionItemName (a, fallback = null) {
  if (isPackAuction(a)) return a.userPack?.pack?.name ?? 'Pack'
  return a?.userCtoon?.ctoon?.name ?? fallback
}

/**
 * Ownership / re-list flags for a PACK auction, for "my auctions" style lists (needs PACK_ITEM_OWNER_SELECT).
 * An auction that closed without a winner never moved the pack, so whoever holds it NOW can put it straight back up —
 * keyed on current ownership, not on the auction's creator, exactly as for cToons.
 */
export function packOwnerFlags (a, viewerId) {
  if (!isPackAuction(a)) return {}
  const up = a.userPack
  const holds = !!up && up.userId === viewerId
  const free = !!up && !up.opened && (up.auctions?.length ?? 0) === 0 && (up.tradeOfferPacks?.length ?? 0) === 0
  return {
    isOwned: holds,
    isOwner: holds,
    hasActiveAuction: (up?.auctions?.length ?? 0) > 0,
    canRelist: a.status === 'CLOSED' && a.winnerId === null && holds && free
  }
}
