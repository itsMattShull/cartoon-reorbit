// server/utils/uiSoundLibraryUsage.js
//
// Pure helper for server/api/admin/global-config/ui-sounds/[id].delete.js: a library UiSound
// row is referenced by *path* from GlobalGameConfig (uiClickSoundPath / uiNavButtonSounds), not
// by id — see the UiSound model's comment in prisma/schema.prisma for why. Deleting a row whose
// path is still referenced would silently break whichever nav button (or the default) points at
// it, so the delete endpoint calls this first and refuses if anything comes back.
import { NAV_SOUND_SLOTS } from '#utils/navSoundSlots.js'

/**
 * @param {{ uiClickSoundPath?: string|null, uiNavButtonSounds?: Record<string,string>|null }} config
 * @param {string} path
 * @returns {string[]} labels of every slot (default and/or nav buttons) currently pointing at `path`
 */
export function findSlotsUsingPath(config, path) {
  if (!path) return []
  const labels = []
  const byKey = Object.fromEntries(NAV_SOUND_SLOTS.map(s => [s.key, s.label]))

  if (config?.uiClickSoundPath === path) labels.push(byKey.default)

  const navSounds = config?.uiNavButtonSounds
  if (navSounds && typeof navSounds === 'object') {
    for (const [key, assignedPath] of Object.entries(navSounds)) {
      if (assignedPath === path && byKey[key]) labels.push(byKey[key])
    }
  }

  return labels
}
