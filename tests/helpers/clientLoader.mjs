// Node module hooks that let the real client composable (composables/useOgGtoonsSocket.js) run under `node --test`, against a
// real Socket.IO server, without Nuxt: the `#imports` and `@/` aliases, `import.meta.env`, and a socket.io-client wrapper that
// identifies each simulated player (globalThis.__TEST_UID) in the handshake.
import { existsSync, statSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const HELP = fileURLToPath(new URL('./', import.meta.url))

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || ''
  if (specifier === '#imports') return nextResolve(pathToFileURL(join(HELP, 'importsStub.mjs')).href, context)
  // The wrapper itself must reach the real package.
  if (specifier === 'socket.io-client' && !parent.endsWith('/ioWrapper.mjs')) {
    return nextResolve(pathToFileURL(join(HELP, 'ioWrapper.mjs')).href, context)
  }
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
    const base = join(ROOT, specifier.slice(2))
    for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context)
    }
  }
  if (specifier.startsWith('.') && parent.startsWith('file:') && !/\.[cm]?[jt]s$|\.json$/.test(specifier)) {
    const base = join(dirname(fileURLToPath(parent)), specifier)
    for (const candidate of [`${base}.js`, join(base, 'index.js')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context)
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.includes('/composables/') && url.includes('.js')) {
    const file = fileURLToPath(url.split('?')[0])
    const src = readFileSync(file, 'utf8').replace(/import\.meta\.env\.PROD/g, 'false')
    return { format: 'module', source: src, shortCircuit: true }
  }
  return nextLoad(url, context)
}
