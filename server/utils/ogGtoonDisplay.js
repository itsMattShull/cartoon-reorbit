// server/utils/ogGtoonDisplay.js
// Fields every user-facing endpoint needs so the client can render an Original gToon as the round
// "card" (components/GtoonCard.vue) instead of a flat image. Spread OG_GTOON_DISPLAY_SELECT into a
// Prisma `select` for a Ctoon, then run the result through ogGtoonDisplay() to get response fields.
import { sanitizeGtoonCardStyle } from '../../utils/gtoonCardStyle.js'

export const OG_GTOON_DISPLAY_SELECT = {
  isOgGtoon: true,
  gtoonColor: true,
  gtoonValue: true,
  gtoonCardStyle: true
}

/** Response fields for a Ctoon row (or any object carrying the OG_GTOON_DISPLAY_SELECT columns). */
export function ogGtoonDisplay(ctoon) {
  if (!ctoon || !ctoon.isOgGtoon) return { isOgGtoon: false }
  return {
    isOgGtoon: true,
    gtoonColor: ctoon.gtoonColor ?? null,
    gtoonValue: ctoon.gtoonValue ?? null,
    gtoonCardStyle: sanitizeGtoonCardStyle(ctoon.gtoonCardStyle)
  }
}

/** Parses/validates an admin-submitted gtoonCardStyle (JSON string or object) for saving. */
export function parseGtoonCardStyleInput(raw) {
  if (raw === undefined || raw === null || raw === '') return null
  return sanitizeGtoonCardStyle(raw)
}
