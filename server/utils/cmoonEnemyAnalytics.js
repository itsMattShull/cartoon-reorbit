// server/utils/cmoonEnemyAnalytics.js
// Usage analytics for cMoon Enemy Battles: how often a player engages an enemy the popup offers
// them (offer -> start), and how often a solo battle they start is actually played to the end
// (start -> complete). Offers are logged in CMoonEnemyOffer (see that model's schema comment);
// starts and outcomes come from the real CMoonEnemyBattle rows.
//
// The write helpers here are best-effort: analytics must never break or slow down gameplay, so
// every caller fires them without awaiting the result and errors are swallowed and logged.

// How long after an offer a matching start still counts as accepting it. The popup offer has no
// expiry of its own, but a player who started this enemy hours later almost certainly got a fresh
// offer in between, which is the one that should get the credit.
export const OFFER_ACCEPT_WINDOW_MINUTES = 60

export function logEnemyOffer(db, { userId, enemyMemberId, isRaidBoss }) {
  return db.cMoonEnemyOffer
    .create({ data: { userId, enemyMemberId, isRaidBoss: !!isRaidBoss } })
    .catch(err => console.error('[cmoon-enemy-analytics] offer log failed:', err))
}

// Stamps the player's most recent still-unaccepted offer of this enemy (within the window) as
// accepted. A start with no matching offer (an offer logged before this table existed, or a raid
// started from somewhere other than the popup) simply marks nothing.
export function markEnemyOfferAccepted(db, { userId, enemyMemberId }) {
  const since = new Date(Date.now() - OFFER_ACCEPT_WINDOW_MINUTES * 60 * 1000)
  return (async () => {
    const offer = await db.cMoonEnemyOffer.findFirst({
      where: { userId, enemyMemberId, acceptedAt: null, offeredAt: { gte: since } },
      orderBy: { offeredAt: 'desc' },
      select: { id: true },
    })
    if (offer) await db.cMoonEnemyOffer.update({ where: { id: offer.id }, data: { acceptedAt: new Date() } })
  })().catch(err => console.error('[cmoon-enemy-analytics] offer accept failed:', err))
}

// Percentage with one decimal, or null when there's nothing to divide by (rendered as "—" rather
// than a misleading 0%).
export function rate(numerator, denominator) {
  if (!denominator) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

// Buckets grouped solo battle counts into how those battles ended. Each row is
// { status, outcome, stale, count }; `stale` only matters for IN_PROGRESS rows and means the
// battle has had no action for longer than ABANDON_AFTER_MINUTES.
//   completed  — played to a result: WIN, LOSS, or UNCREDITED (someone else landed the kill
//                while this player was still fighting, so they didn't walk away)
//   abandoned  — ABANDONED, plus stale IN_PROGRESS battles: those are only stamped ABANDONED
//                when the same player next clicks Fight!, so a player who never comes back would
//                otherwise sit "in progress" forever
//   inProgress — genuinely still being played; left out of the completion rate entirely
export function summarizeSoloBattles(rows) {
  const out = { started: 0, wins: 0, losses: 0, uncredited: 0, abandoned: 0, inProgress: 0 }
  for (const r of rows) {
    const n = Number(r.count) || 0
    out.started += n
    if (r.status === 'IN_PROGRESS') {
      if (r.stale) out.abandoned += n
      else out.inProgress += n
    } else if (r.outcome === 'WIN') out.wins += n
    else if (r.outcome === 'LOSS') out.losses += n
    else if (r.outcome === 'UNCREDITED') out.uncredited += n
    else out.abandoned += n // ABANDONED (or any future non-result outcome)
  }
  out.completed = out.wins + out.losses + out.uncredited
  out.completionRate = rate(out.completed, out.completed + out.abandoned)
  return out
}

// Grouped offer counts ({ isRaidBoss, offered, accepted }) -> totals and the start rate, split
// solo vs raid since a raid boss offer asks for a much bigger commitment.
export function summarizeOffers(rows) {
  const solo = { offered: 0, accepted: 0 }
  const raid = { offered: 0, accepted: 0 }
  for (const r of rows) {
    const bucket = r.isRaidBoss ? raid : solo
    bucket.offered += Number(r.offered) || 0
    bucket.accepted += Number(r.accepted) || 0
  }
  solo.startRate = rate(solo.accepted, solo.offered)
  raid.startRate = rate(raid.accepted, raid.offered)
  return { solo, raid }
}
