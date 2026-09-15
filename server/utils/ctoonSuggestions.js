// Shared by server/api/admin/ctoon-suggestions/[id]/accept.post.js and
// .../bulk-accept.post.js so the two accept paths can't drift — bulk-accept
// used to build its own copy of this update-data logic, which meant a field
// added to one silently never reached the other.
import { prisma } from '@/server/prisma'

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCharacters(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(v => String(v || '').trim())
    .filter(Boolean)
}

// Builds the Ctoon.update() `data` for an IN_REVIEW suggestion's newValues.
// Returns null when the suggestion's required fields are incomplete.
//
// A suggestion's cMoonId can go stale between submission and review (the
// referenced cMoon can be deleted by an admin in the meantime). Rather than
// let that fail the whole accept — losing the name/series/set/etc. edits
// along with it — this re-validates the cMoon still exists and silently
// drops just the cMoon change when it doesn't, keeping the cToon's current tag.
export async function buildCtoonSuggestionUpdateData(newValues) {
  const values = newValues || {}
  const name = normalizeString(values.name)
  const series = normalizeString(values.series)
  const set = normalizeString(values.set)
  const characters = normalizeCharacters(values.characters)
  if (!name || !series || !set || !characters.length) return null

  const descriptionProvided = Object.prototype.hasOwnProperty.call(values, 'description')
  const descriptionValue = descriptionProvided && typeof values.description === 'string'
    ? values.description.trim()
    : ''
  const description = descriptionProvided ? (descriptionValue || null) : null

  const updateData = { name, series, set, characters }
  if (descriptionProvided) updateData.description = description

  const cMoonIdProvided = Object.prototype.hasOwnProperty.call(values, 'cMoonId')
  if (cMoonIdProvided) {
    const cMoonId = normalizeString(values.cMoonId) || null
    if (cMoonId) {
      const stillExists = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true } })
      if (stillExists) updateData.cMoonId = cMoonId
    } else {
      updateData.cMoonId = null
    }
  }

  return updateData
}
