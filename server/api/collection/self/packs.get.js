// GET /api/collection/self/packs?page=1&packId=<uuid>&summary=1
//
// The signed-in player's SEALED packs (My Collection > Packs). Only the caller's own rows; opened packs are gone from
// here by definition.
//
//   ?summary=1   -> { total, byPack } only (the tab badge + type chips; no rows)
//   ?page=N      -> 24 per page, newest first (served by the partial index UserPack_unopened_idx)
//   ?packId=...  -> only that pack type
//
// Each row carries `inAuction` / `inPendingTrade` (derived — see server/utils/userPackState.js) so the tile can show a
// chip and disable Open/Auction. Those are two set queries for the whole page, not per pack. The pack art/name comes
// from one join; nothing else about the pack (contents, odds) is sent here — that is the on-demand preview endpoint.
import { defineEventHandler, getQuery, createError, setHeader } from 'h3'
import { prisma } from '@/server/prisma'
import { getPackLockState } from '@/server/utils/userPackState'
import { isUuid } from '@/server/utils/tradeOfferRules'

export const PACKS_PAGE_SIZE = 24

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  setHeader(event, 'Cache-Control', 'no-store')

  const q = getQuery(event)
  const packId = typeof q.packId === 'string' && isUuid(q.packId) ? q.packId.toLowerCase() : null
  const page = Math.max(1, Math.min(10000, Number.parseInt(q.page, 10) || 1))

  const [groups] = await Promise.all([
    prisma.userPack.groupBy({ by: ['packId'], where: { userId, opened: false }, _count: { _all: true } })
  ])
  const packRows = groups.length
    ? await prisma.pack.findMany({ where: { id: { in: groups.map(g => g.packId) } }, select: { id: true, name: true, imagePath: true } })
    : []
  const packById = new Map(packRows.map(p => [p.id, p]))
  const byPack = groups
    .map(g => ({ packId: g.packId, name: packById.get(g.packId)?.name || 'Pack', imagePath: packById.get(g.packId)?.imagePath || null, count: g._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const total = byPack.reduce((n, g) => n + g.count, 0)

  if (String(q.summary) === '1') return { total, byPack }

  const filteredTotal = packId ? (byPack.find(g => g.packId === packId)?.count || 0) : total
  const rows = await prisma.userPack.findMany({
    where: { userId, opened: false, ...(packId ? { packId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PACKS_PAGE_SIZE,
    take: PACKS_PAGE_SIZE,
    select: { id: true, packId: true, createdAt: true, source: true }
  })
  const states = await getPackLockState(prisma, rows.map(r => r.id))

  return {
    total,
    byPack,
    page,
    pageSize: PACKS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(filteredTotal / PACKS_PAGE_SIZE)),
    items: rows.map(r => {
      const p = packById.get(r.packId)
      const s = states.get(r.id)
      return {
        id: r.id,
        packId: r.packId,
        name: p?.name || 'Pack',
        imagePath: p?.imagePath || null,
        createdAt: r.createdAt,
        source: r.source,
        inAuction: !!s?.inActiveAuction,
        inPendingTrade: !!s?.inPendingTrade
      }
    })
  }
})
