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
// hold is open (pages/redeem.vue) — identical in appearance to an ordinary slow request.
import { prisma } from '../prisma.js'

// "at least 3 people have minted that code" — counted as ALL Claim rows for the same code,
// regardless of whether they happened before or after this hold was requested (see
// claimsSinceHold below). A plain constant, not an admin setting:
// nothing in the request asked for this to be tunable, and a stray mis-typed value here would
// silently defeat the whole feature.
export const HANDICAP_REQUIRED_RELEASE_CLAIMS = 3

export async function isUserHandicapped(userId) {
  if (!userId) return false
  const row = await prisma.handicapRedeemer.findUnique({ where: { userId }, select: { userId: true } })
  return !!row
}

/**
 * How many claims of this code exist in total. Deliberately NOT limited to claims made after the
 * hold was requested: a code that already had 3+ redemptions before the flagged player's attempt
 * should release immediately rather than waiting for 3 more. (A held player has no Claim row of
 * their own yet, so this never counts them.) `requestedAt` is kept in the signature only so the
 * callers don't change.
 */
export async function claimsSinceHold(codeId, _requestedAt) {
  return prisma.claim.count({ where: { codeId } })
}
