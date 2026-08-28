import { join } from 'node:path'

// Same layout convention as server/utils/backgroundStorage.js: production
// serves from the sibling cartoon-reorbit-images directory, dev from public/.
const baseDir = process.env.NODE_ENV === 'production'
  ? join(process.cwd(), '..')
  : process.cwd()

export function cmoonPageUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cmoon-pages')
    : join(baseDir, 'public', 'cmoon-pages')
}

export function cmoonPageFsPath(filename) {
  return join(cmoonPageUploadDir(), filename)
}

export function cmoonPagePublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/cmoon-pages/${filename}`
    : `/cmoon-pages/${filename}`
}

// Small pill-shaped button graphic shown in place of the plain "cWorld" text tile on a themed
// cToon modal, and optionally on other cMoons' pages too — a separate, smaller asset from the
// 800x600 page image above, so its own directory rather than overloading cmoon-pages/. Was
// previously a full-width 800x200 banner (directory name predates the rename to a small button).
export function cmoonButtonUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cmoon-buttons')
    : join(baseDir, 'public', 'cmoon-buttons')
}

export function cmoonButtonFsPath(filename) {
  return join(cmoonButtonUploadDir(), filename)
}

export function cmoonButtonPublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/cmoon-buttons/${filename}`
    : `/cmoon-buttons/${filename}`
}

// Wide masthead banner shown at the top of this cMoon's own page — distinct from the small
// button above (never shown on cToon ID cards or other cMoons' pages).
export function cmoonPageBannerUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cmoon-page-banners')
    : join(baseDir, 'public', 'cmoon-page-banners')
}

export function cmoonPageBannerFsPath(filename) {
  return join(cmoonPageBannerUploadDir(), filename)
}

export function cmoonPageBannerPublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/cmoon-page-banners/${filename}`
    : `/cmoon-page-banners/${filename}`
}

// Small square "avatar" shown next to a cMoon's colored name badge on member cZones — sized and
// presented like a player avatar, so its own small directory rather than overloading
// cmoon-pages/ or cmoon-banners/ (both much larger, differently-cropped assets).
export function cmoonAvatarUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cmoon-avatars')
    : join(baseDir, 'public', 'cmoon-avatars')
}

export function cmoonAvatarFsPath(filename) {
  return join(cmoonAvatarUploadDir(), filename)
}

export function cmoonAvatarPublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/cmoon-avatars/${filename}`
    : `/cmoon-avatars/${filename}`
}
