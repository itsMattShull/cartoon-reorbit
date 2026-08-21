import { join } from 'node:path'

// See the long comment in server/utils/backgroundStorage.js: process.cwd() is
// reliably the repo root under both `nuxt dev` and the built PM2 process, and
// the production image store is a sibling directory to the checkout. Do not
// reintroduce __dirname-relative '..' counting here — it silently breaks per
// route-file nesting depth.
const baseDir = process.env.NODE_ENV === 'production'
  ? join(process.cwd(), '..')
  : process.cwd()

export function cmoonJoinEffectUploadDir() {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'cmoon-join-effects')
    : join(baseDir, 'public', 'cmoon-join-effects')
}

export function cmoonJoinEffectFsPath(filename) {
  return join(cmoonJoinEffectUploadDir(), filename)
}

export function cmoonJoinEffectPublicPath(filename) {
  return process.env.NODE_ENV === 'production'
    ? `/images/cmoon-join-effects/${filename}`
    : `/cmoon-join-effects/${filename}`
}
