// server/utils/cmoonDispersal.js
// Shared serialization for one CMoonDispersalOption row — a cToon or a Pack, never both (see
// CMoonDispersalOption's own schema comment) — used by both the list and detail admin GET
// endpoints (server/api/admin/cmoon-dispersal-offers.get.js and .../[offerId].get.js) so they
// can never drift apart on the `kind`/field-name shape the admin UI relies on.
export function serializeDispersalOption(opt, extra = {}) {
  return opt.ctoon
    ? { id: opt.id, kind: 'CTOON', ctoonId: opt.ctoon.id, name: opt.ctoon.name, assetPath: opt.ctoon.assetPath, ...extra }
    : { id: opt.id, kind: 'PACK', packId: opt.pack.id, name: opt.pack.name, assetPath: opt.pack.imagePath, ...extra }
}
