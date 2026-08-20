// prisma/auditAuctionOnlyCoverage.js
//
// Read-only. Answers "why was this mint never auctioned?" for a cToon that was
// released through the AuctionOnly system.
//
// For every copy of the named cToon it reports, side by side: who holds it, the
// scheduled AuctionOnly listing (if any) and whether it has fired, and every
// Auction row that has ever existed for it. That is enough to tell apart the
// reasons a mint can end up with no auction:
//
//   NEVER SCHEDULED   - no AuctionOnly row was ever created for it. Usually the
//                       batch simply did not reach this mint (an admin asking
//                       for N copies gets the N lowest available), or the copy
//                       was minted after the batch was created.
//   SCHEDULED, DUE    - a row exists, its start time has passed, and it has not
//                       fired. Something is wrong: check the Error Log and the
//                       Manage Auction Only page.
//   CONSUMED, NO SALE - the row is marked isStarted but no Auction row exists.
//                       activateAuctionOnlyRow marks a listing started and
//                       creates nothing when it finds another ACTIVE auction on
//                       the same copy, so a listing can be silently used up.
//                       These need rescheduling by hand.
//   PRE-EMPTED        - an auction exists that did NOT come from the scheduled
//                       listing (no auctionOnlyId, or a start price below the
//                       scheduled one). This is the signature of a copy that was
//                       auctioned by something else before its release.
//
// Usage:
//   node prisma/auditAuctionOnlyCoverage.js "Gold Edition Edd"
//   node prisma/auditAuctionOnlyCoverage.js "Gold Edition Edd" --mint 60

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../server/prisma.js'

const LOG = '[auditAuctionOnlyCoverage]'
const args = process.argv.slice(2)
const name = args.find(a => !a.startsWith('--'))
const mintIdx = args.indexOf('--mint')
const onlyMint = mintIdx !== -1 ? Number(args[mintIdx + 1]) : null

async function main() {
  if (!name) {
    console.error(`${LOG} usage: node prisma/auditAuctionOnlyCoverage.js "<cToon name>" [--mint N]`)
    process.exitCode = 1
    return
  }

  const ctoons = await prisma.ctoon.findMany({
    where: { name: { contains: name, mode: 'insensitive' } },
    select: { id: true, name: true, rarity: true, quantity: true, totalMinted: true }
  })
  if (!ctoons.length) {
    console.log(`${LOG} no cToon matching "${name}".`)
    return
  }

  for (const ctoon of ctoons) {
    console.log(
      `\n${LOG} ${ctoon.name} — ${ctoon.rarity}, ` +
      `${ctoon.totalMinted} minted of ${ctoon.quantity ?? 'unlimited'}`
    )

    const copies = await prisma.userCtoon.findMany({
      where: { ctoonId: ctoon.id, ...(onlyMint != null ? { mintNumber: onlyMint } : {}) },
      orderBy: { mintNumber: 'asc' },
      select: {
        id: true,
        mintNumber: true,
        isTradeable: true,
        burnedAt: true,
        createdAt: true,
        user: { select: { username: true } },
        auctionOnlyListings: {
          select: { id: true, pricePoints: true, startsAt: true, isStarted: true },
          orderBy: { startsAt: 'asc' }
        },
        auctions: {
          select: {
            id: true, status: true, initialBet: true, highestBid: true,
            auctionOnlyId: true, createdAt: true, winnerId: true, isFeatured: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!copies.length) {
      console.log(`  no copies${onlyMint != null ? ` with mint #${onlyMint}` : ''}.`)
      continue
    }

    const now = new Date()
    const buckets = {}

    for (const c of copies) {
      const listing = c.auctionOnlyListings[0] || null
      const auctions = c.auctions
      const fromListing = auctions.filter(a => a.auctionOnlyId)
      const preempting = auctions.filter(
        a => !a.auctionOnlyId && (!listing || a.initialBet < listing.pricePoints)
      )

      let verdict
      if (!listing && !auctions.length) verdict = 'NEVER SCHEDULED'
      else if (!listing && auctions.length) verdict = 'AUCTIONED, NEVER SCHEDULED'
      else if (listing && !listing.isStarted && listing.startsAt <= now) verdict = 'SCHEDULED, DUE — NOT FIRED'
      else if (listing && !listing.isStarted) verdict = 'SCHEDULED, PENDING'
      else if (listing?.isStarted && !fromListing.length && !auctions.length) verdict = 'CONSUMED, NO AUCTION'
      else if (listing?.isStarted && !fromListing.length) verdict = 'CONSUMED, NO AUCTION (other auctions exist)'
      else verdict = 'RELEASED OK'
      if (preempting.length && verdict !== 'RELEASED OK') verdict += ' + PRE-EMPTED'
      else if (preempting.length) verdict = 'PRE-EMPTED'

      buckets[verdict] = (buckets[verdict] || 0) + 1

      const flag = verdict === 'RELEASED OK' ? '   ' : '>> '
      console.log(
        `${flag}#${String(c.mintNumber ?? '?').padEnd(4)} ${verdict}\n` +
        `      held by ${c.user?.username ?? 'nobody'}` +
        `${c.burnedAt ? ' (BURNED)' : ''}, tradeable=${c.isTradeable}, minted ${c.createdAt.toISOString().slice(0, 10)}\n` +
        `      listing : ${listing
          ? `${listing.pricePoints} pts, starts ${listing.startsAt.toISOString()}, isStarted=${listing.isStarted}`
          : 'none'}\n` +
        `      auctions: ${auctions.length
          ? auctions.map(a =>
              `${a.status} start=${a.initialBet} high=${a.highestBid ?? 0}` +
              `${a.isFeatured ? ' featured' : ''}${a.auctionOnlyId ? ' (from listing)' : ' (NOT from listing)'}` +
              ` ${a.createdAt.toISOString().slice(0, 10)}`
            ).join('\n                ')
          : 'none'}`
      )
    }

    console.log(`\n  summary: ${Object.entries(buckets).map(([k, v]) => `${v} ${k}`).join(' | ')}`)
  }
}

main()
  .catch(err => { console.error(`${LOG} failed:`, err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
