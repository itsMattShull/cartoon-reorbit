// server/utils/codePackGrant.js
// Creates the sealed packs a redeemed code awards. Takes a transaction client so the caller decides what it is atomic
// with, and is IDEMPOTENT per claim: rows are keyed (sourceRef = claim id, sourceOrdinal = running index), so running
// it twice for one claim creates nothing new and returns the same pack ids.
//
// WHEN it runs matters (see server/api/redeem.post.js): a code that also mints cToons creates its packs only AFTER
// every mint has succeeded. Create them earlier and the player could open or trade them during the mint wait, then keep
// them when a mint failure rolls the claim back and re-redeem for a second set.
import { randomUUID } from 'node:crypto'

/**
 * @param {*} tx  Prisma transaction client (or client)
 * Also used for OG gToons tournament pack prizes (`source: 'OG_GTOONS_TOURNAMENT'`, `claimId` = the prize grant's id): same
 * idempotency, same audit trail, `method` = the source.
 *
 * @param {{ userId:string, claimId:string, awards:Array<{packId:string, quantity:number}>, source?:string }} p
 * @returns {Promise<Array<{ packId:string, userPackIds:string[] }>>}
 */
export async function grantCodePacks (tx, { userId, claimId, awards, source = 'CODE' }) {
  if (!awards.length) return []

  const rows = []
  let ordinal = 0
  for (const { packId, quantity } of awards) {
    for (let i = 0; i < quantity; i++) {
      rows.push({ id: randomUUID(), userId, packId, opened: false, source, sourceRef: claimId, sourceOrdinal: ordinal++ })
    }
  }
  const created = await tx.userPack.createMany({ data: rows, skipDuplicates: true })

  const granted = await tx.userPack.findMany({
    where: { sourceRef: claimId },
    orderBy: { sourceOrdinal: 'asc' },
    select: { id: true, packId: true }
  })
  // Audit trail only for a first run; a repeat inserted nothing new.
  if (created.count > 0) {
    await tx.packOwnerLog.createMany({
      data: granted.map(g => ({ userPackId: g.id, packId: g.packId, userId, method: source }))
    })
  }

  const byPack = new Map()
  for (const g of granted) {
    if (!byPack.has(g.packId)) byPack.set(g.packId, [])
    byPack.get(g.packId).push(g.id)
  }
  return awards.map(a => ({ packId: a.packId, userPackIds: byPack.get(a.packId) || [] }))
}
