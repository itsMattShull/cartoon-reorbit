// server/utils/handicapRedeem.js
//
// "Handicap Redeems" — an admin tool for the couple of players who reliably snipe mint #1/#2 off
// every new code. An admin flags a player by username (HandicapRedeemer, see its own schema
// comment). From then on, any code THEY redeem that awards a cToon is held rather than resolved
// immediately (HandicapRedeemHold) — see server/utils/codeRedemption.js, which owns the actual
// hold-vs-execute branching and the release logic itself. This file holds the pieces the admin
// endpoints need on their own: checking who's flagged, and the release-eligibility math.
//
// The flagged player is never told. The redeem page just shows "Redeeming..." for as long as the
// hold is open (pages/newsite/redeem.vue) — identical in appearance to an ordinary slow request.
import { prisma } from '../prisma.js'

// "at least 3 people have minted that code" — counted as OTHER players' Claim rows for the same
// code created strictly after this hold's own requestedAt (i.e. after the flagged player's own
// attempt), never counting claims that happened earlier. A plain constant, not an admin setting:
// nothing in the request asked for this to be tunable, and a stray mis-typed value here would
// silently defeat the whole feature.
export const HANDICAP_REQUIRED_RELEASE_CLAIMS = 3

export async function isUserHandicapped(userId) {
  if (!userId) return false
  const row = await prisma.handicapRedeemer.findUnique({ where: { userId }, select: { userId: true } })
  return !!row
}

/** How many OTHER claims of this code have landed since a given hold was requested. */
export async function claimsSinceHold(codeId, requestedAt) {
  return prisma.claim.count({ where: { codeId, claimedAt: { gt: requestedAt } } })
}
