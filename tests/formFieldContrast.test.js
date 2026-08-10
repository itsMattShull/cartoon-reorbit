import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

const TAILWIND_ENTRY = 'assets/css/tailwind.css'

// Tailwind's preflight sets `color: inherit` on form controls, and the newsite
// layout sets `color: #ffffff` on html/body. Without an explicit default, every
// field that does not name its own colour renders white on a white background
// and the text you type is invisible.

test('the tailwind entry exists and still emits all three layers', () => {
  assert.ok(existsSync(join(root, TAILWIND_ENTRY)), `${TAILWIND_ENTRY} is the module's cssPath; deleting it silently drops these base rules`)
  const css = read(TAILWIND_ENTRY)
  for (const directive of ['@tailwind base', '@tailwind components', '@tailwind utilities']) {
    assert.ok(css.includes(directive), `${TAILWIND_ENTRY} must keep ${directive}`)
  }
})

test('form controls get a readable default colour in the base layer', () => {
  const css = read(TAILWIND_ENTRY)
  const base = css.slice(css.indexOf('@layer base'))
  assert.ok(base.length, 'no @layer base block')

  const rule = base.match(/input\s*,\s*select\s*,\s*textarea\s*\{[^}]*\}/)
  assert.ok(rule, 'no input/select/textarea rule in @layer base')
  assert.match(rule[0], /color:\s*#[0-9a-f]{6}/i, 'the rule must set an explicit colour')
  assert.doesNotMatch(rule[0], /color:\s*(inherit|#fff(fff)?|white)\b/i, 'the default must not be white or inherit')
})

test('the default is in @layer base so utilities and scoped CSS still win', () => {
  const css = read(TAILWIND_ENTRY)
  const i = css.indexOf('@layer base')
  const j = css.search(/input\s*,\s*select\s*,\s*textarea\s*\{/)
  assert.ok(i > -1 && j > i, 'the rule must live inside @layer base, not at top level')
})

test('the rule does not set -webkit-text-fill-color', () => {
  // In WebKit the fill colour beats `color`. Setting it here would override the
  // fields that intentionally render white on a dark panel (the cToon filter,
  // cZone editor and sidebar search boxes), which set `color` but not the fill.
  const css = read(TAILWIND_ENTRY)
  const base = css.slice(css.indexOf('@layer base'))
  const rule = base.match(/input\s*,\s*select\s*,\s*textarea\s*\{[^}]*\}/)
  assert.doesNotMatch(rule[0], /-webkit-text-fill-color/, 'would override dark-panel inputs')
})

test('buttons are deliberately excluded from the default', () => {
  // Buttons commonly rely on inheriting white over a coloured background
  // (bg-blue-600 with no text-white). Forcing them dark would break those.
  const css = read(TAILWIND_ENTRY)
  const base = css.slice(css.indexOf('@layer base'))
  const rule = base.match(/(^|\n)\s*(button\s*,\s*)?input\s*,\s*select\s*,\s*textarea\s*\{/)
  assert.ok(rule, 'rule not found')
  assert.ok(!/button/.test(rule[0]), 'button must not be in the form-control colour rule')
})

// The base default is only safe because nothing depends on a field inheriting
// white. If someone adds a dark-background field without naming its colour,
// this catches it — that field would render dark-on-dark.
test('no field relies on inheriting white text', () => {
  const files = execSync("find pages components layouts -name '*.vue'", { cwd: root })
    .toString().trim().split('\n')

  const DARK_BG = /bg-(?:black|slate-[6789]|gray-[6789]|zinc-[6789]|neutral-[6789]|stone-[6789]|blue-[6789]|indigo-[6789])\d*/
  const HAS_COLOR = /\btext-(?:white|black|slate|gray|grey|zinc|neutral|stone|red|blue|green|indigo|purple|amber|yellow|emerald|teal|cyan|sky|violet|fuchsia|pink|rose|orange|lime)-?\d*\b/
  const SKIP_TYPES = /type=["'](?:hidden|checkbox|radio|file|range|color|submit|button|image)["']/

  const offenders = []
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8')
    for (const tag of src.match(/<(?:input|select|textarea)\b[^>]*>/gs) || []) {
      if (SKIP_TYPES.test(tag)) continue
      if (HAS_COLOR.test(tag)) continue
      if (DARK_BG.test(tag)) offenders.push(`${f}: ${tag.replace(/\s+/g, ' ').slice(0, 100)}`)
    }
  }
  assert.deepEqual(offenders, [], 'these fields sit on a dark background but name no text colour, so they will render dark-on-dark')
})
