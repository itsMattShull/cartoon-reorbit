// server/utils/systemAccounts.js
//
// The app has a couple of non-player accounts that hold cToons and place bids:
// the official account used for insta-bid listings (server/api/auctions.post.js)
// and whatever OFFICIAL_USERNAME points at for dissolve payouts
// (server/socket-server.js). Anything they "win" is a system transfer, not a
// market sale, so valuation code needs to be able to exclude them.

import { prisma } from '@/server/prisma'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const OFFICIAL_AUCTION_USERNAME = 'CartoonReOrbitOfficial'

// These ids never change for the life of the process, so resolve them once.
let cached = null
let inFlight = null

export async function getSystemUserIds() {
  if (cached) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    const usernames = [OFFICIAL_AUCTION_USERNAME]
    if (process.env.OFFICIAL_USERNAME) usernames.push(process.env.OFFICIAL_USERNAME)

    let rows = []
    try {
      rows = await prisma.user.findMany({
        where: { username: { in: [...new Set(usernames)] } },
        select: { id: true }
      })
    } catch {
      // A lookup failure must not take down the endpoints that call this —
      // worst case we filter nothing out this time around.
      inFlight = null
      return [EXCLUDED_SYSTEM_USER_ID]
    }

    cached = [...new Set([EXCLUDED_SYSTEM_USER_ID, ...rows.map(r => r.id)])].filter(Boolean)
    inFlight = null
    return cached
  })()

  return inFlight
}

export function clearSystemUserIdsCache() {
  cached = null
  inFlight = null
}
