// ShortCard exposes its layout knobs as CSS custom properties. That contract is
// invisible to the compiler: a misspelled or renamed variable does not fail a
// build, it silently falls back to the default and the card looks plausible but
// wrong. That is exactly how the Auction House card view lost its View button —
// two separate grids set `--footer-height` on the grid container, ShortCard
// declared the same name on `.sc` itself, and a declaration on the element
// always beats one inherited from an ancestor, so both overrides were dead code
// that read as if it worked.
//
// These are cheap static checks over the .vue sources for the two invariants
// that keep the contract honest.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHORTCARD = 'components/newsite/ShortCard.vue'

const read = file => readFileSync(join(ROOT, file), 'utf8')

/** Strip `/* … *​/` comments so prose about variables is not mistaken for code. */
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every `<style>` block in an SFC, comments removed. */
function styleBlocks(source) {
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map(m => stripComments(m[1]))
}

/** `--sc-*` names the file reads, i.e. `var(--sc-foo, …)`. */
function varsRead(source) {
  return new Set(
    [...stripComments(source).matchAll(/var\(\s*(--sc-[a-z0-9-]+)/g)].map(m => m[1])
  )
}

/**
 * `--sc-*` names the file sets — both in a stylesheet (`--sc-foo: 4px`) and in a
 * template style binding (`:style="{ '--sc-foo': '4px' }"`).
 */
function varsWritten(source) {
  const written = new Set()
  for (const block of styleBlocks(source)) {
    for (const m of block.matchAll(/(--sc-[a-z0-9-]+)\s*:/g)) written.add(m[1])
  }
  const template = stripComments(source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ''))
  for (const m of template.matchAll(/['"](--sc-[a-z0-9-]+)['"]\s*:/g)) written.add(m[1])
  return written
}

function vueFilesUnder(...dirs) {
  const out = []
  const walk = dir => {
    let entries
    try { entries = readdirSync(join(ROOT, dir)) } catch { return }
    for (const entry of entries) {
      const rel = join(dir, entry)
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (entry.endsWith('.vue')) out.push(rel)
    }
  }
  dirs.forEach(walk)
  return out
}

test('ShortCard declares no --sc-* on itself, so a container can override it', () => {
  const declared = varsWritten(read(SHORTCARD))
  assert.deepEqual(
    [...declared].sort(),
    [],
    'ShortCard must only READ its --sc-* knobs, via var(--sc-x, <default>). Declaring a ' +
    'default on .sc shadows anything an ancestor grid sets, because inheritance is only ' +
    'consulted when the element\'s own cascade is empty — which turns every container-level ' +
    'override into dead code.'
  )
})

test('every --sc-* ShortCard reads has a fallback', () => {
  const css = stripComments(styleBlocks(read(SHORTCARD)).join('\n'))
  const withoutFallback = [...css.matchAll(/var\(\s*(--sc-[a-z0-9-]+)\s*\)/g)].map(m => m[1])
  assert.deepEqual(
    withoutFallback,
    [],
    'A knob with no fallback resolves to nothing for every consumer that does not set it, ' +
    'silently collapsing the card. Write var(--sc-x, <default>).'
  )
})

test('every --sc-* a consumer sets is one ShortCard actually reads', () => {
  const known = varsRead(read(SHORTCARD))
  const orphans = []

  for (const file of vueFilesUnder('components', 'pages', 'layouts')) {
    if (relative('.', file) === SHORTCARD) continue
    for (const name of varsWritten(read(file))) {
      if (!known.has(name)) orphans.push(`${file}: ${name}`)
    }
  }

  assert.deepEqual(
    orphans.sort(),
    [],
    'These files set a --sc-* variable that ShortCard never reads, so the declaration does ' +
    'nothing. Either the name is a typo, or a rename was left half-finished.'
  )
})
