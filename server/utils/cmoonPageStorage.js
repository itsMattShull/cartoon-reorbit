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
