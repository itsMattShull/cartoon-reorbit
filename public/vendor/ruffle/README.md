# Ruffle (vendored)

Self-hosted build of [Ruffle](https://ruffle.rs), the open-source (MIT/Apache-2.0) Flash
emulator, used by `components/RufflePlayer.vue` to play `.swf` cToons on cZones and uploaded
Flash games (see `prisma/schema.prisma`'s `Ctoon.swfPath`/`FlashGame.swfPath`).

These files are the unmodified contents of the `@ruffle-rs/ruffle` npm package (currently
`0.7.1`), served statically from `/vendor/ruffle/` — not loaded from Ruffle's own CDN, so there's
no third-party dependency or network fetch at runtime. `ruffle.js` is the loader; it picks
whichever of the two `*.wasm` builds the visitor's browser supports and lazy-loads it (and its
matching `core.ruffle.*.js` chunk) only when a page actually mounts a player — nothing here is
pulled in by pages that don't use Flash content.

## Upgrading

```
npm install @ruffle-rs/ruffle@<version> --no-save
cp node_modules/@ruffle-rs/ruffle/ruffle.js \
   node_modules/@ruffle-rs/ruffle/core.ruffle.*.js \
   node_modules/@ruffle-rs/ruffle/*.wasm \
   node_modules/@ruffle-rs/ruffle/LICENSE_* \
   public/vendor/ruffle/
npm uninstall @ruffle-rs/ruffle
```

`--no-save`/the final `uninstall` keep it out of `package.json` on purpose — nothing in app code
`import`s the npm package, only these static files, so there's no reason to carry it as a
permanent dependency reinstalled on every `npm install`. `.js.map` source maps are intentionally
left out of this folder to keep the vendored footprint smaller; re-copy them too if you need to
debug Ruffle's own minified JS.
