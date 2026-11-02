// server/utils/openUserPack.js
// Opens ONE sealed pack for its owner: picks the cToons, consumes the pack, prunes sold-out options from the pack's
// pool, and queues the free mints. Shared by every place a pack can be opened (cMart after a purchase, My Collection >
// Packs, the Redeem page) through POST /api/packs/open — there is no other entry point.
//
// Takes `db` and `mintQueue` as parameters (no Nitro aliases, no singletons) so it can be exercised directly.
//
// ── Concurrency ───────────────────────────────────────────────────────────────────────────────────────────────────
// Everything that decides the outcome happens in ONE transaction, in the global lock order documented in
// userPackState.js:  Pack row (FOR NO KEY UPDATE)  ->  the UserPack row (FOR UPDATE, then lock-state re-check).
//   * The UserPack lock + re-check is what stops a pack being opened while it sits in a pending trade / active auction,
//     and makes a double-click or parallel requests open it exactly once.
//   * The Pack lock serialises concurrent opens of the SAME pack type. Opening mutates that pack's shared pool (it
//     deletes sold-out options, redistributes their weight and shrinks rarity counts, and may unlist the pack);
//     unserialised, two openers read the same weights and overwrite each other, or lock the same rows in opposite
//     order and deadlock. NO KEY UPDATE (not FOR UPDATE) so cMart purchases — which only take a KEY SHARE on the Pack
//     row through the UserPack foreign key — are not blocked while a pack is being opened.
//   * The pool is built INSIDE the lock from one grouped minted-count query, then reused for the pruning pass (the old
//     code ran a count query per option, twice, plus two more per pulled cToon).
// Mints are queued AFTER the commit, so a failed commit never leaves free cToons queued for a pack that is still sealed.
import { createError } from 'h3'
import { lockAndAssertPacks, logPackOwners } from './userPackState.js'
import { ogGtoonDisplay } from './ogGtoonDisplay.js'

const TIME_BASED_CAP = 999999999

/** Retry a failed mint a couple of times: a transient DB/Redis blip must not cost a player a cToon from a pack that is
 *  already consumed. A genuine "cToon sold out" simply fails the same way each time and lands in the failed set. */
export const MINT_JOB_OPTS = Object.freeze({ attempts: 3, backoff: { type: 'exponential', delay: 2000 } })

function pickWeighted (opts, rng) {
  const total = opts.reduce((t, o) => t + o.weight, 0)
  const r = rng() * total
  let acc = 0
  for (const o of opts) {
    acc += o.weight
    if (r <= acc) return o
  }
  return opts[opts.length - 1]
}

/**
 * @param {object} p
 * @param {import('@prisma/client').PrismaClient} p.db
 * @param {{ addBulk: Function }} p.mintQueue
 * @param {string} p.userId       the caller (must own the pack)
 * @param {string} p.userPackId
 * @param {() => number} [p.rng]  injectable for tests; defaults to Math.random
 * @returns {Promise<Array<object>>} one card per cToon pulled, in the shape the reveal overlay renders
 */
export async function openUserPack ({ db, mintQueue, userId, userPackId, rng = Math.random }) {
  // Unlocked peek, only to learn which Pack row to lock first (lock order: Pack, then UserPack). Everything that
  // matters is re-read and re-checked under the locks below.
  const peek = await db.userPack.findUnique({ where: { id: userPackId }, select: { userId: true, packId: true, opened: true } })
  if (!peek || peek.userId !== userId) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  if (peek.opened) throw createError({ statusCode: 400, statusMessage: 'Pack already opened' })

  let cards
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Pack" WHERE "id" = ${peek.packId} FOR NO KEY UPDATE`
    // Throws 404 (not yours) / 400 (opened) / 409 (in an active auction or a pending trade).
    await lockAndAssertPacks(tx, [userPackId], { ownerId: userId })

    const pack = await tx.pack.findUnique({
      where: { id: peek.packId },
      include: {
        rarityConfigs: { orderBy: { id: 'asc' } },
        ctoonOptions: { orderBy: { id: 'asc' }, include: { ctoon: true } }
      }
    })
    if (!pack) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })

    // One query for every option's minted count (was a count() per option, twice over).
    const ctoonIds = [...new Set(pack.ctoonOptions.map(o => o.ctoonId))]
    const mintedRows = ctoonIds.length
      ? await tx.userCtoon.groupBy({ by: ['ctoonId'], where: { ctoonId: { in: ctoonIds } }, _count: { _all: true } })
      : []
    const minted = new Map(mintedRows.map(r => [r.ctoonId, r._count._all]))

    /* ── 1. Build pools & choose cToons ─────────────────────── */
    const poolByRarity = {}
    for (const opt of pack.ctoonOptions) {
      const c = opt.ctoon
      // Time-based mint window guard: once mintEndDate has passed, treat the cToon as depleted even if the finalize
      // job hasn't written the real quantity yet (still the TIME_BASED_CAP sentinel) — same logic buy.post.js uses.
      if (c.mintLimitType === 'timeBased' && c.mintEndDate && new Date(c.mintEndDate) <= new Date()) {
        if (c.quantity === TIME_BASED_CAP) continue
      }
      if (c.quantity !== null && (minted.get(c.id) || 0) >= c.quantity) continue
      ;(poolByRarity[c.rarity] ||= []).push({ ctoon: c, weight: opt.weight })
    }

    const chosen = []
    for (const rc of pack.rarityConfigs) {
      const pool = poolByRarity[rc.rarity] || []
      if (!pool.length || !(rng() * 100 < rc.probabilityPercent)) continue
      const local = [...pool]
      for (let i = 0; i < rc.count && local.length; i++) {
        const pick = pickWeighted(local, rng)
        chosen.push(pick.ctoon)
        local.splice(local.findIndex(o => o.ctoon.id === pick.ctoon.id), 1)
      }
    }
    // Nothing pullable: the transaction rolls back, the pack stays sealed and unconsumed — the player loses nothing.
    if (!chosen.length) {
      throw createError({ statusCode: 409, statusMessage: 'Nothing is left to pull from this pack right now. It is still sealed.' })
    }

    const chosenCounts = chosen.reduce((m, c) => { m[c.id] = (m[c.id] || 0) + 1; return m }, {})

    // "New!" is decided here, server-side and before minting, so the client never races a snapshot of its collection.
    const ownedRows = await tx.userCtoon.findMany({
      where: { userId, ctoonId: { in: Object.keys(chosenCounts) }, burnedAt: null },
      select: { ctoonId: true },
      distinct: ['ctoonId']
    })
    const owned = new Set(ownedRows.map(r => r.ctoonId))

    /* ── 2. Consume the pack, prune depleted options, rebalance weights ─────────── */
    // We hold the UserPack row lock, so this always matches; the count check is belt and braces.
    const claimed = await tx.userPack.updateMany({
      where: { id: userPackId, userId, opened: false },
      data: { opened: true, openedAt: new Date() }
    })
    if (claimed.count !== 1) throw createError({ statusCode: 400, statusMessage: 'Pack already opened' })

    await logPackOwners(tx, [{ userPackId, packId: pack.id, userId, method: 'OPEN' }])

    const sellOutBehavior = pack.sellOutBehavior || 'REMOVE_ON_ANY_RARITY_EMPTY'
    let anyRarityEmpty = false
    let remainingRarityCount = 0

    for (const rc of pack.rarityConfigs) {
      const options = pack.ctoonOptions.filter(o => o.ctoon.rarity === rc.rarity)
      const depleted = []
      const remaining = []
      for (const opt of options) {
        const total = (minted.get(opt.ctoonId) || 0) + (chosenCounts[opt.ctoonId] || 0)
        const isOut = opt.ctoon.quantity !== null && total >= opt.ctoon.quantity
        ;(isOut ? depleted : remaining).push(opt)
      }

      if (depleted.length > 0) {
        await tx.packCtoonOption.deleteMany({ where: { id: { in: depleted.map(o => o.id) } } })
      }

      // Redistribute the depleted options' weight across the survivors.
      if (depleted.length > 0 && remaining.length > 0) {
        const totalDepletedWeight = depleted.reduce((sum, o) => sum + o.weight, 0)
        const baseShare = Math.floor(totalDepletedWeight / remaining.length)
        let extraShare = totalDepletedWeight - baseShare * remaining.length
        for (const opt of remaining) {
          const share = baseShare + (extraShare-- > 0 ? 1 : 0)
          if (share !== 0) {
            await tx.packCtoonOption.update({ where: { id: opt.id }, data: { weight: opt.weight + share } })
          }
        }
      }

      const allowZeroCount = sellOutBehavior === 'KEEP_IF_SINGLE_RARITY_EMPTY'
      const nextCount = remaining.length
      if (nextCount < rc.count && (nextCount > 0 || allowZeroCount)) {
        await tx.packRarityConfig.update({ where: { id: rc.id }, data: { count: nextCount } })
      }

      if (!remaining.length) anyRarityEmpty = true
      else remainingRarityCount += 1
    }

    const shouldUnlist = sellOutBehavior === 'KEEP_IF_SINGLE_RARITY_EMPTY'
      ? remainingRarityCount === 0
      : anyRarityEmpty
    if (shouldUnlist) await tx.pack.update({ where: { id: pack.id }, data: { inCmart: false } })

    cards = chosen.map(c => ({
      id: c.id,
      name: c.name,
      assetPath: c.assetPath,
      ...ogGtoonDisplay(c),
      rarity: c.rarity,
      isGtoon: c.isGtoon,
      cost: c.cost,
      power: c.power,
      // The number the mint will assign (an unlocked estimate, exactly as before: minted so far + 1).
      mintNumber: (minted.get(c.id) || 0) + 1,
      inCmart: c.inCmart,
      isNew: !owned.has(c.id),
      isSecondEdition: c.isSecondEdition,
      secondEditionOverlayX: c.secondEditionOverlayX,
      secondEditionOverlayY: c.secondEditionOverlayY,
      secondEditionOverlaySize: c.secondEditionOverlaySize
    }))
  }, { timeout: 15000, maxWait: 5000 })

  /* ── 3. queue the free mints (after commit) ───────────────── */
  await mintQueue.addBulk(cards.map(c => ({
    name: 'mintCtoon',
    data: { userId, ctoonId: c.id, isSpecial: true, userPackId },
    opts: MINT_JOB_OPTS
  })))

  return cards
}
