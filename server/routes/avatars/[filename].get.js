// server/routes/avatars/[filename].get.js
//
// Fallback for /avatars/<filename> requests Nitro's built-in static handler can't serve —
// e.g. an avatar uploaded through the admin cMoon-affinity-reward picker
// (server/api/admin/avatars.post.js) after the app's most recent deploy. Nitro bakes public/
// into a request-time snapshot at build time (`nuxt build`); a file written to public/avatars
// afterward isn't in that snapshot and 404s until the next deploy rebuilds it in. Both
// dev.cartoon-reorbit.com and production run a full `nuxt build` + `nuxt start` per
// .github/workflows/deploy.yml (never a live `nuxt dev` server), so both are exposed.
//
// This route only ever gets a turn for the files Nitro's snapshot is missing: this app
// declares no custom nitro.publicAssets base in nuxt.config.js, so Nitro's static handler
// falls through to routes like this one instead of hard-404ing missing paths (see
// isPublicAssetURL in node_modules/nitropack/dist/rollup/index.mjs — it only short-circuits
// for configured non-root publicAssets bases, which this app has none of). Any avatar already
// in the build snapshot is still served directly by Nitro's own fast path and never reaches
// this handler at all; once the next deploy runs, a newly-uploaded avatar becomes part of the
// new snapshot and Nitro's fast path takes over for it too.
//
// server/utils/backgroundStorage.js / cmoonImageStorage.js document the sibling-directory +
// nginx convention every OTHER runtime-uploaded image type in this app already moved to, for
// this same class of bug — the restricted Avatar catalog (server/api/admin/avatars.post.js)
// predates that convention. This route is the smaller fix: it doesn't require touching the
// ~9 places across the app that already assume `/avatars/<filename>` (settings.vue,
// MyCzone.vue, Trade.vue, Leaderboards.vue, CMoonPage.vue, etc.), and it doesn't depend on an
// nginx config this checkout has no way to verify. If the catalog ever grows large enough to
// want out of the repo checkout entirely, migrating to that sibling-directory convention is
// the next step.
import { defineEventHandler, getRouterParam, createError, serveStatic, setHeader } from 'h3'
import { stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { sanitizeFilename, assertInside } from '@/server/utils/imageUploadValidation'

const AVATARS_DIR = path.resolve(process.cwd(), 'public', 'avatars')

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'filename')

  // Bare filename only, same shape server/api/auth/set-avatar.post.js already requires before
  // trusting a client-supplied avatar filename — no traversal, no NUL, no characters outside
  // the safe set sanitizeFilename allows.
  if (!raw || raw.includes('\0') || raw.includes('/') || raw.includes('\\') ||
      raw !== path.basename(raw) || sanitizeFilename(raw) !== raw) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid avatar filename' })
  }

  const ext = path.extname(raw).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) throw createError({ statusCode: 400, statusMessage: 'Invalid avatar filename' })

  let target
  try {
    target = assertInside(AVATARS_DIR, path.join(AVATARS_DIR, raw))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid avatar filename' })
  }

  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  // Not content-hashed in the URL (an admin could in principle re-upload under the same
  // filename), so a short revalidatable max-age rather than a long immutable one.
  setHeader(event, 'Cache-Control', 'public, max-age=3600')

  const served = await serveStatic(event, {
    getMeta: async () => {
      try {
        const stats = await stat(target)
        if (!stats.isFile()) return undefined
        // Weak etag from size+mtime (matches Nitro's own baked-asset approach) — cheap to
        // compute, no need to hash file contents just to support conditional GETs.
        const etag = `W/"${stats.size}-${Math.round(stats.mtimeMs)}"`
        return { size: stats.size, mtime: stats.mtimeMs, type: mime, etag }
      } catch {
        return undefined
      }
    },
    getContents: () => readFile(target),
  })

  if (served === false) throw createError({ statusCode: 404, statusMessage: 'Avatar not found' })
})
