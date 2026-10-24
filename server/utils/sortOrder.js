// server/utils/sortOrder.js
// Admin-list ordering only (see the GET endpoints' orderBy) — a generous but finite band so a
// malformed client value can't land something absurd in an Int column. Shared by the encyclopedia,
// cMoon season tracker and cMoon enemy validators.
export const SORT_ORDER_MIN = -9999
export const SORT_ORDER_MAX = 9999

export function isValidSortOrder(value) {
  return Number.isInteger(value) && value >= SORT_ORDER_MIN && value <= SORT_ORDER_MAX
}
