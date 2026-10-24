# node-forge stand-in

`npm audit` reports high-severity GHSA-86w9-cpqp-85rv against **every** published `node-forge`
(`<=1.4.0`, which is the latest release) — no patched version exists.

`node-forge` reaches this project only through `nuxt → @nuxt/nitro-server → nitropack → listhen`.
`listhen` uses it for one thing: generating a self-signed certificate when the Nitro dev server is
asked to serve HTTPS. This project never does that, and `node-forge` is not in the production
build (`.output`).

The root `package.json` therefore overrides `node-forge` to this package, which contains no
cryptography and throws a clear error if anything ever calls into it. The version
(`1.4.1+local-stub`) is deliberately descriptive, not a real release.

**Remove the override** (and this directory) once either `node-forge` publishes a fixed release or
Nuxt/Nitro stop depending on `listhen` — then run `npm audit` to confirm.
