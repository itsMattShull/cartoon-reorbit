// Node module-resolution hook for the db tests. The API handlers under test are written for Nuxt/Vite, which
// resolves things plain Node doesn't: the `@/` and `~/` aliases (both the repo root) and extensionless
// relative imports ('./tradeOfferRules'), plus Nuxt's `#imports` (stubbed by importsStub.mjs). Registered by dbKit.js.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

export async function resolve(specifier, context, nextResolve) {
  // Nuxt's auto-import module (useRuntimeConfig), imported by the auction bid handlers and server/utils/autoBid.js.
  if (specifier === '#imports') return nextResolve(new URL('./importsStub.mjs', import.meta.url).href, context)
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
    const base = join(ROOT, specifier.slice(2))
    for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context)
      }
    }
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[cm]?[jt]s$|\.json$/.test(specifier)) {
    const base = join(dirname(fileURLToPath(context.parentURL)), specifier)
    for (const candidate of [`${base}.js`, join(base, 'index.js')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context)
      }
    }
  }
  return nextResolve(specifier, context)
}
