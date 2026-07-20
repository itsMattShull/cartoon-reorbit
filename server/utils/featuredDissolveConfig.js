// server/utils/featuredDissolveConfig.js
// Shared logic for determining which cToons are "featured" when an account is
// dissolved. Admins configure the qualifying rarities/series/sets via the
// "Edit Featured" modal on /admin/dissolve-queue; this module reads that config
// and applies it to a given cToon.
import { prisma } from '../prisma.js'

function toArray(json) {
  return Array.isArray(json) ? json.filter(v => typeof v === 'string' && v.trim()) : []
}

// Loads the admin-configured featured rule set. Falls back to empty rules
// (nothing featured) if no GlobalGameConfig row exists yet.
export async function getFeaturedDissolveConfig() {
  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      featuredDissolveRarities: true,
      featuredDissolveSeries: true,
      featuredDissolveSets: true,
    }
  })

  return {
    rarities: toArray(config?.featuredDissolveRarities),
    series:   toArray(config?.featuredDissolveSeries),
    sets:     toArray(config?.featuredDissolveSets),
  }
}

// Case-insensitive membership check against a config list.
function matches(value, list) {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return list.some(entry => entry.trim().toLowerCase() === v)
}

// ctoon: { rarity, series, set }, config: result of getFeaturedDissolveConfig()
export function isCtoonFeatured(ctoon, config) {
  return (
    matches(ctoon?.rarity, config.rarities) ||
    matches(ctoon?.series, config.series) ||
    matches(ctoon?.set, config.sets)
  )
}
