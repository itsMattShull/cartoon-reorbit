import { join } from 'node:path'

// Generic version of the per-feature *Storage.js helpers (e.g. backgroundStorage.js): same
// dev/prod path split, parameterized by a feature name instead of copy-pasted per feature.
// New single-image-per-entity uploads should use this rather than adding another bespoke file.
//
// In production the real image store lives at /var/www/cartoon-reorbit-images, a SIBLING
// directory to the app's checkout (/var/www/cartoon-reorbit) — kept outside the repo because of
// its size, per the deploy's actual layout. PM2 launches `.output/server/index.mjs` with the
// repo root as cwd, so process.cwd() is reliably the repo root in both dev and prod; one step up
// from it is the parent directory containing both siblings.
const baseDir = process.env.NODE_ENV === 'production'
  ? join(process.cwd(), '..')
  : process.cwd()

export function uploadDir(feature) {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', feature)
    : join(baseDir, 'public', feature)
}

export function uploadFsPath(feature, filename) {
  return join(uploadDir(feature), filename)
}

export function uploadPublicPath(feature, filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/${feature}/${filename}`
    : `/${feature}/${filename}`
}
