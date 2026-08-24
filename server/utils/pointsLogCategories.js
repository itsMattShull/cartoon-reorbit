// server/utils/pointsLogCategories.js
// Shared classification for PointsLog rows used by the admin analytics
// "Net Points Issued" / "Points Issued by Category" / "Points Spent by
// Category" charts.

// Methods that represent a balanced transfer between two accounts (a trade,
// an auction settlement, an admin correction, or an inactive-account
// dissolution) rather than the system actually minting or destroying points.
// Each of these always writes one 'increase' row and one 'decrease' row of
// the same amount in the same transaction, so they net to zero on their own
// — excluding them keeps the earned/spent figures a measure of real
// issuance and removal instead of internal shuffling between users.
export const TRANSFER_METHODS = [
  'Requested Trade',
  'Accepted Trade',
  'Wishlist Trade',
  'Auction',
  'ACCOUNT_DISSOLVE',
  'TRADE_AUDIT_REVOKE'
]

// SQL fragment excluding TRANSFER_METHODS rows, safe to inline into
// $queryRawUnsafe since the values are the static list above, not user input.
// Rows with a NULL method are kept (NULL NOT IN (...) is NULL/falsy in SQL,
// which would otherwise silently drop them).
export function transferExclusionSql(column = '"method"') {
  const quoted = TRANSFER_METHODS.map(m => `'${m.replace(/'/g, "''")}'`).join(', ')
  return `(${column} IS NULL OR ${column} NOT IN (${quoted}))`
}

// Buckets high-cardinality, per-instance method strings (one per achievement,
// one per cZone contest run) under a shared label so the category breakdown
// charts stay readable instead of growing one series per achievement ever
// created.
export function categoryLabel(method) {
  if (!method) return 'Other'
  if (method.startsWith('achievement:') || method.startsWith('achievementClaim:')) return 'Achievement Rewards'
  if (method.startsWith('cZone Contest')) return 'cZone Contest'
  if (method === 'lottery-win' || method === 'lottery-ticket') return 'Lottery'
  return method
}
