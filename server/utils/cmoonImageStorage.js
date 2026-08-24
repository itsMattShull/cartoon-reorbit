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

// Small banner graphic shown in place of the plain "cWorld" text tile on a
// themed cToon modal — a separate, smaller asset from the 800x600 page image
// above, so its own directory rather than overloading cmoon-pages/.
export function cmoonBannerUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cmoon-banners')
    : join(baseDir, 'public', 'cmoon-banners')
}

export function cmoonBannerFsPath(filename) {
  return join(cmoonBannerUploadDir(), filename)
}

export function cmoonBannerPublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/cmoon-banners/${filename}`
    : `/cmoon-banners/${filename}`
}
