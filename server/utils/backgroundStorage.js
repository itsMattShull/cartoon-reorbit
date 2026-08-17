import { join } from 'node:path'

// process.cwd() is the project root in both `nuxt dev` and production — PM2 launches
// `.output/server/index.mjs` with the project root as cwd (see ecosystem.config.cjs,
// whose `script` path is relative to it), so no environment branch is needed here.
//
// The three background filesystem endpoints previously hand-counted `..` segments off
// `import.meta.url` to reach the project root in production, on the assumption that a
// built route lives exactly as deep as its source file under server/api/. Nitro's
// node-server preset actually nests it three levels deeper — server/api/admin/backgrounds/[id]/…
// becomes .output/server/chunks/routes/api/admin/backgrounds/_id/… — so every one of
// those counts was short by 3. mkdir(..., { recursive: true }) never surfaced the
// mistake: it silently created the (wrong) directory, the upload "succeeded", and the
// path written to the DB pointed at a file that was never served, blanking every cZone
// using that background the moment it was edited.
const baseDir = process.cwd()

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
