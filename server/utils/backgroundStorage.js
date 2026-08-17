import { join } from 'node:path'

// In production the real image store lives at /var/www/cartoon-reorbit-images,
// a SIBLING directory to the app's checkout (/var/www/cartoon-reorbit) — kept
// outside the repo because of its size, per the deploy's actual layout. PM2
// launches `.output/server/index.mjs` with the repo root as cwd (its `script`
// path in ecosystem.config.cjs is relative to it, and this is also true under
// `nuxt dev`), so process.cwd() is reliably the repo root in both cases; one
// step up from it is the parent directory containing both siblings.
//
// This replaces per-file `__dirname`-based "count the .. to reach the root"
// math, which has to be hand-recomputed for every route file's nesting depth
// and silently breaks the moment it's wrong: mkdir(..., { recursive: true })
// creates whatever bogus path the miscount produces without ever raising an
// error, so a bad count reads as "the upload succeeded" while writing nowhere
// nginx will ever serve from.
const baseDir = process.env.NODE_ENV === 'production'
  ? join(process.cwd(), '..')
  : process.cwd()

export function backgroundUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'backgrounds')
    : join(baseDir, 'public', 'backgrounds')
}

export function backgroundFsPath(filename) {
  return join(backgroundUploadDir(), filename)
}

export function backgroundPublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/backgrounds/${filename}`
    : `/backgrounds/${filename}`
}
