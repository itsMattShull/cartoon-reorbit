import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(root, p), 'utf8')

const ENTRY = 'assets/css/tailwind.css'
const ADMIN_PAGE = 'pages/newsite/admin/[...path].vue'

// The newsite layout sets `color: #ffffff` on html/body, so any text that does
// not name its own colour inherits white. On a light surface — a `bg-white`
// card, a `bg-gray-50` panel, the admin console's own background — that renders
// white on white. These lock in the two rules that pair light surfaces with a
// readable foreground.

test('light background utilities get a dark default text colour', () => {
  const css = read(ENTRY)
  const base = css.slice(css.indexOf('@layer base'))
  const rule = base.match(/\[class~="bg-white"\][\s\S]*?\{[^}]*\}/)
  assert.ok(rule, 'no light-surface colour rule in @layer base')
  assert.match(rule[0], /color:\s*#[0-9a-f]{6}/i, 'must set an explicit colour')
  assert.doesNotMatch(rule[0], /color:\s*(inherit|#fff(fff)?|white)\b/i, 'must not be white or inherit')

  for (const bg of ['bg-white', 'bg-gray-50', 'bg-gray-100', 'bg-slate-50', 'bg-neutral-100', 'bg-stone-200']) {
    assert.ok(rule[0].includes(`[class~="${bg}"]`), `rule does not cover ${bg}`)
  }
})

test('tinted light surfaces are covered too', () => {
  // Alert/info boxes use the 50 and 100 shades, which are near-white
  // (bg-yellow-50 is #fefce8) and just as unreadable with inherited white text.
  const css = read(ENTRY)
  const base = css.slice(css.indexOf('@layer base'))
  for (const bg of ['bg-yellow-50', 'bg-blue-50', 'bg-red-100', 'bg-green-100', 'bg-rose-50', 'bg-emerald-100']) {
    assert.ok(base.includes(`[class~="${bg}"]`), `rule does not cover ${bg}`)
  }
})

test('the light-surface rule uses attribute selectors, not class selectors', () => {
  // Written as `.bg-white`, Tailwind treats these as utility definitions and
  // variant-expands them, emitting `.hover\:bg-gray-100:hover{color:…}` into
  // the utilities layer at (0,2,0) — enough to beat a `text-white` utility and
  // flip an element's text colour on hover. `[class~="…"]` matches the same
  // single class, stays at (0,1,0), and Tailwind's variant machinery ignores it.
  const css = read(ENTRY)
  const base = css.slice(css.indexOf('@layer base'))
  const selectors = base.match(/^\s*\.bg-(?:white|gray|slate|zinc|neutral|stone)[\w-]*\s*[,{]/gm) || []
  assert.deepEqual(selectors, [], 'use [class~="bg-…"] instead of .bg-… to avoid Tailwind variant expansion')
})

test('the light-surface rule lives in @layer base so utilities still win', () => {
  const css = read(ENTRY)
  const i = css.indexOf('@layer base')
  const j = css.indexOf('[class~="bg-white"]')
  assert.ok(i > -1 && j > i, 'the rule must be inside @layer base, not at top level')
})

test('the admin console panel sets an explicit text colour', () => {
  // The panel background is CSS, not a utility class, so content sitting
  // straight on it is not covered by the light-surface rule above.
  const src = read(ADMIN_PAGE)
  // Two rules carry this selector: a global one for scroll behaviour and the
  // scoped one that paints the panel. Only the painted one needs a colour.
  const block = (src.match(/\.newsite-admin-body\s*\{[^}]*\}/g) || [])
    .find(b => /background:/.test(b))
  assert.ok(block, '.newsite-admin-body rule with a background not found')
  // Strip comments first — the explanatory comment quotes `color: #ffffff` as
  // prose, and matching against it would test the wrong thing.
  const decls = block.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(decls, /color:\s*#[0-9a-f]{6}/i, 'the console panel must name a text colour')
  assert.doesNotMatch(decls, /color:\s*(inherit|#fff(fff)?|white)\b/i)
})

// The rule is only safe because no element wants white text on a light surface.
// If someone writes that combination, the element is unreadable either way and
// this catches it at the point it is introduced.
test('nothing asks for white text on a static light background', () => {
  const files = execSync("find pages components layouts -name '*.vue'", { cwd: root })
    .toString().trim().split('\n')

  // Only flag when both land in the same quoted class literal, so the two
  // branches of a ternary (`cond ? 'bg-green-600 text-white' : 'bg-white'`)
  // are not counted — those never apply at the same time.
  const LIGHT = /\bbg-(?:white|gray-(?:50|100|200)|slate-(?:50|100|200)|zinc-(?:50|100|200)|neutral-(?:50|100|200)|stone-(?:50|100|200))\b(?!\/)/

  const offenders = []
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8')
    const singles = src.match(/'[^'\n]*'/g) || []
    const doubles = (src.match(/"[^"\n]*"/g) || []).filter(d => !d.includes("'"))
    for (const lit of [...singles, ...doubles]) {
      if (!/\btext-white\b/.test(lit)) continue
      if (!LIGHT.test(lit)) continue
      offenders.push(`${f}: ${lit.slice(0, 110)}`)
    }
  }
  assert.deepEqual(offenders, [], 'white text on a light background is unreadable regardless of this rule')
})
