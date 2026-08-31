// server/utils/sanitizeTutorialHtml.js
// Shared allowlist for admin-authored tutorial prose. Applied at save-time
// (so nothing unsafe is ever stored) and again at read-time (cheap insurance
// against a future write path that bypasses save-time sanitization).
//
// Hand-rolled rather than a library on purpose: sanitize-html@2.17.6+ pulls in
// htmlparser2@^12, which dropped its CommonJS build entirely ("type": "module",
// no "main" CJS entry) — sanitize-html itself is CJS and does a plain
// require('htmlparser2'), so require('sanitize-html') is broken under any Node
// require() regardless of pm2/bundler settings. That crashed the production
// dev server outright the first time a request touched this file. Every
// alternative sanitizer package carries the same category of risk (a
// transitive dependency's packaging can change under us at any time), so
// given how small and fixed the allowlist here is (9 tags, attributes on
// exactly one of them), a small self-contained implementation is safer than
// betting on a third party's package.json staying CJS-compatible forever.
//
// Security model: this is a linear tag-boundary scanner, not a full HTML
// parser, so it can misjudge where a malformed/adversarial tag ends. That is
// safe by construction here because every character that reaches the output
// comes from exactly one of two places: (a) a hardcoded tag string this file
// writes itself (e.g. `<p>`, `</p>`, a reconstructed `<a href="...">`), which
// is trusted by definition, or (b) escaped text (see escapeText below) that
// can never be reinterpreted as markup no matter how a browser's own,
// more-permissive HTML parser recovers from malformed input. A misjudged tag
// boundary can therefore make output look wrong, but never makes it unsafe.
// `#utils/...` (package.json "imports") rather than the `@/...` bundler alias — this file
// needs to be importable directly from a plain `node --test` unit test (see
// tests/sanitizeTutorialHtml.test.js), which the `@` alias can't resolve outside Nuxt/Vite.
import { SECTION_KEYS } from '#utils/tutorialSections.js'

const ALLOWED_TAGS = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'br', 'a', 'blockquote'])
const SELF_CLOSING_TAGS = new Set(['br'])
// Tags whose entire content (including any nested markup) must be discarded, not just
// unwrapped — these can carry executable or non-visible content rather than prose.
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript'])
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return '' }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return '' }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

// Every text token is decoded then re-escaped (rather than left as-is) so admin-typed
// entities round-trip correctly instead of accumulating an extra layer of escaping on
// every edit, while anything that looks like markup — whether typed by an admin or
// slipped in through a forged direct API call bypassing the editor entirely — always
// comes out as literal, inert text.
function escapeText(str) {
  return decodeEntities(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// A safe href must start with an allowed scheme once control characters (which some
// parsers have historically ignored inside a URL, letting e.g. "java\tscript:" slip
// past a naive check) are stripped, and once HTML entities are decoded — a browser
// decodes entities in an attribute value before using it as a URL, so a sanitizer that
// only checks the raw, still-encoded text can be bypassed by spelling "javascript:" with
// numeric character references.
function isSafeHref(raw) {
  if (typeof raw !== 'string') return false
  const decoded = decodeEntities(raw)
  // eslint-disable-next-line no-control-regex
  const stripped = decoded.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped)
  if (!match) return false
  return ALLOWED_SCHEMES.has(match[1].toLowerCase() + ':')
}

function safeHrefAttr(raw) {
  // A literal ">" inside a quoted attribute value is valid, unambiguous HTML on its own —
  // only the matching quote ends the value — but it is escaped anyway for a wider safety
  // margin against any context this value might later be copied into unquoted.
  return decodeEntities(raw).replace(/[\u0000-\u001F\u007F]/g, '').trim()
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/>/g, '&gt;')
}

// Splits html into text and tag tokens, treating a quote character inside a tag as
// opening/closing a span that a `>` cannot terminate — the same rule real HTML parsers
// use, so `<a href="foo>bar">` is recognized as one tag rather than being cut short.
function tokenize(html) {
  const tokens = []
  const len = html.length
  let i = 0
  while (i < len) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      tokens.push({ type: 'text', value: html.slice(i) })
      break
    }
    if (lt > i) tokens.push({ type: 'text', value: html.slice(i, lt) })

    // Comments can smuggle conditional/downlevel-revealed markup in some parsers — drop
    // them outright rather than trying to interpret what's inside.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? len : end + 3
      continue
    }
    // Doctype / processing instructions — not expected in this content, drop them.
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt + 1)
      i = end === -1 ? len : end + 1
      continue
    }

    let j = lt + 1
    let quote = null
    while (j < len) {
      const c = html[j]
      if (quote) {
        if (c === quote) quote = null
      } else if (c === '"' || c === "'") {
        quote = c
      } else if (c === '>') {
        break
      }
      j++
    }
    if (j >= len) {
      // Unterminated tag (e.g. a stray "<" with no closing ">" anywhere after it) — the
      // remainder is emitted as a single text token below, which escapeText() will
      // neutralize on output, so this can never surface as live markup either way.
      tokens.push({ type: 'text', value: html.slice(lt) })
      break
    }
    tokens.push({ type: 'tag', raw: html.slice(lt, j + 1) })
    i = j + 1
  }
  return tokens
}

function parseTag(raw) {
  const closing = raw[1] === '/'
  const body = raw.slice(closing ? 2 : 1, -1).trim()
  const nameMatch = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(body)
  if (!nameMatch) return { closing, name: null, attrsRaw: '' }
  return { closing, name: nameMatch[1].toLowerCase(), attrsRaw: body.slice(nameMatch[0].length) }
}

function extractAttr(attrsRaw, attrName) {
  const re = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const m = re.exec(attrsRaw)
  if (!m) return null
  return m[2] !== undefined ? m[2] : m[3]
}

export function sanitizeSectionHtml(html) {
  if (typeof html !== 'string' || !html) return ''

  const tokens = tokenize(html)
  let out = ''
  let dropDepth = 0
  let dropTagName = null

  for (const tok of tokens) {
    if (dropDepth > 0) {
      if (tok.type === 'tag') {
        const { closing, name } = parseTag(tok.raw)
        if (name === dropTagName) {
          if (closing) dropDepth--
          else dropDepth++
        }
      }
      continue
    }

    if (tok.type === 'text') {
      out += escapeText(tok.value)
      continue
    }

    const { closing, name, attrsRaw } = parseTag(tok.raw)
    if (!name) continue // malformed tag — drop it

    if (DROP_CONTENT_TAGS.has(name)) {
      if (!closing) { dropDepth = 1; dropTagName = name }
      continue
    }

    if (!ALLOWED_TAGS.has(name)) continue // unwrap: drop the tag itself, keep surrounding content

    if (SELF_CLOSING_TAGS.has(name)) {
      out += `<${name}>`
      continue
    }

    if (closing) {
      out += `</${name}>`
      continue
    }

    if (name === 'a') {
      const href = extractAttr(attrsRaw, 'href')
      const target = extractAttr(attrsRaw, 'target')
      if (href && isSafeHref(href)) {
        // Force safe rel whenever a link opens a new tab, regardless of what the editor
        // produced — closes the reverse-tabnabbing gap even if a future editor config
        // starts emitting target=_blank on its own.
        out += target === '_blank'
          ? `<a href="${safeHrefAttr(href)}" target="_blank" rel="noopener noreferrer">`
          : `<a href="${safeHrefAttr(href)}">`
      } else {
        out += '<a>'
      }
      continue
    }

    out += `<${name}>`
  }

  return out
}

/** Sanitizes every known section key in a sections object, dropping anything else. */
export function sanitizeSections(sections) {
  const src = sections && typeof sections === 'object' ? sections : {}
  const out = {}
  for (const key of SECTION_KEYS) {
    out[key] = sanitizeSectionHtml(src[key])
  }
  return out
}

export { SECTION_KEYS }
