import { defineEventHandler, createError, getRouterParam, setHeader } from 'h3'
import { readFile, access } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { redis } from '@/server/utils/redis'
import { sessionKey } from '@/server/utils/guessCtoonRuntime'

// Serves a question's artwork behind an opaque, per-run token.
//
// This route exists because Ctoon.assetPath is self-documenting: paths look like
// /images/cToons/Ed Edd n Eddy/space_outlaw_ed.gif, so the filename is the answer and the
// directory is the series. Handing that URL to the browser would let anyone read the answer
// off the DOM — and would eliminate every cross-series wrong answer for free. So the client
// only ever receives a random token, and only the caller's OWN session can redeem it.
//
// A token resolves for exactly two questions: the one currently pending, and the one after
// it (so the client can warm the next image). The next question's image without its choices
// is not an answerable question, so that prefetch leaks nothing.

// cToon art lives under public/ in development and under a sibling
// cartoon-reorbit-images/ directory in production, and the process's cwd differs between
// `nuxt dev` and the built Nitro output. Rather than guess, probe both roots — every
// candidate is still containment-checked before it is read.
const BASE_DIRS = [process.cwd(), resolve(process.cwd(), '..')]

const MIME_BY_EXT = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const token = getRouterParam(event, 'token')
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image token' })
  }

  let raw
  try {
    raw = await redis.get(sessionKey(userId))
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }
  if (!raw) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let session
  try {
    session = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const questions = Array.isArray(session?.qs) ? session.qs : []
  const cursor = Number(session?.i) || 0
  const redeemable = [questions[cursor], questions[cursor + 1]].filter(Boolean)
  const match = redeemable.find(q => q && q.t === token)
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const filePath = await resolveAssetFile(match.a)
  if (!filePath) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let bytes
  try {
    bytes = await readFile(filePath)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const ext = extOf(filePath)
  setHeader(event, 'Content-Type', MIME_BY_EXT[ext] || 'application/octet-stream')
  // No filename in the disposition, and no ETag/Last-Modified — anything derived from the
  // real file would put the answer back on the wire.
  setHeader(event, 'Content-Disposition', 'inline')
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return bytes
})

function extOf (p) {
  const i = p.lastIndexOf('.')
  return i < 0 ? '' : p.slice(i).toLowerCase()
}

// assetPath is admin-controlled, but the filename inside it comes straight from an
// unsanitized multipart upload (server/api/admin/ctoon.post.js writes imagePart.filename
// verbatim), so it is treated as hostile here: resolve, then confirm the result is still
// inside an allowed root before reading it.
async function resolveAssetFile (assetPath) {
  if (!assetPath || typeof assetPath !== 'string') return null
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) return null
  if (assetPath.includes('\0')) return null

  const trimmed = assetPath.replace(/^\//, '')
  const candidates = []

  for (const baseDir of BASE_DIRS) {
    const publicRoot = join(baseDir, 'public')
    candidates.push({ root: publicRoot, path: join(publicRoot, trimmed) })

    const imagesRoot = join(baseDir, 'cartoon-reorbit-images')
    const rel = assetPath.startsWith('/images/cToons/')
      ? assetPath.replace(/^\/images\/cToons\//, '')
      : assetPath.startsWith('/cToons/')
        ? assetPath.replace(/^\/cToons\//, '')
        : null
    if (rel) candidates.push({ root: imagesRoot, path: join(imagesRoot, 'cToons', rel) })
  }

  for (const candidate of candidates) {
    const resolved = resolve(candidate.path)
    const rootResolved = resolve(candidate.root)
    if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) continue
    try {
      await access(resolved)
      return resolved
    } catch {}
  }

  return null
}
