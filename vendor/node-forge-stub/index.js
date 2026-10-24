'use strict'

// Stand-in for node-forge. Every published node-forge (<= 1.4.0, the latest) is affected by
// GHSA-86w9-cpqp-85rv and there is no patched release. The only thing in this project's
// dependency tree that loads it is `listhen` (via nitropack), which uses it solely to generate
// self-signed certificates when the dev server is started with HTTPS. We don't do that, and
// node-forge is not part of the production build, so any use here is a mistake: fail loudly.
const unsupported = () => {
  throw new Error(
    'node-forge is stubbed out in this project (vendor/node-forge-stub) because every published ' +
    'version has an unpatched advisory. Dev-server HTTPS (self-signed certificates) is therefore ' +
    'unavailable. See vendor/node-forge-stub/README.md.'
  )
}

const forge = new Proxy({}, {
  get (_target, prop) {
    // Let module-interop probing (`__esModule`, `then`, Symbol.*) through without throwing.
    if (typeof prop === 'symbol' || prop === '__esModule' || prop === 'then' || prop === 'default') return undefined
    return new Proxy(unsupported, { get: () => unsupported })
  }
})

module.exports = forge
