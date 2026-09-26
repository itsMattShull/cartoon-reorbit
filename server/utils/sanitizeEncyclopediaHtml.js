// server/utils/sanitizeEncyclopediaHtml.js
// Shared allowlist for admin-authored Encyclopedia entry bodies (and, since it's exactly the same
// shape of content, the cMoon Season blurb too — see CMoonSeasonConfig.blurb's own comment in
// prisma/schema.prisma). Applied at save-time and again at read-time, same belt-and-suspenders
// stance as server/utils/sanitizeTutorialHtml.js.
//
// This is a deliberate near-duplicate of sanitizeTutorialHtml.js's tokenizer/escaping engine,
// not a shared import from it — see that file's own header comment for why a hand-rolled
// sanitizer exists here at all (sanitize-html's transitive htmlparser2 dependency broke CJS
// require() outright). Keeping the two independent means an Encyclopedia-only change (the
// relative-href allowance below) can never alter what the Tutorial page — which has its own
// long-standing, separately tested behavior — accepts.
//
// The one real difference from the Tutorial sanitizer: isSafeHref here ALSO accepts a relative
// link to another Encyclopedia entry's own page, since "entries can link to each other" is a
// named requirement of this feature the Tutorial page never had. That allowance is intentionally
// narrow — only `/newsite/encyclopedia/{slug}` (letters/digits/hyphens only, matching how a slug
// is generated in utils/encyclopediaSlug.js), nothing else relative, so this can't become
// an open redirect or a way to reference an arbitrary internal route.
//
// Security model: identical to sanitizeTutorialHtml.js — a linear tag-boundary scanner, not a
// full HTML parser, but every character reaching the output is either a hardcoded trusted tag
// string this file writes itself or text that has been escaped so it can never be reinterpreted
// as markup. A misjudged tag boundary can make output look wrong, never unsafe.

const ALLOWED_TAGS = new Set(['p', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'br', 'a', 'blockquote'])
const SELF_CLOSING_TAGS = new Set(['br'])
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript'])
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])
// Mirrors the slug shape utils/encyclopediaSlug.js produces (lowercase letters, digits,
// hyphens, 1-96 chars) — kept as a literal regex here rather than importing that file, so this
// sanitizer's safety property doesn't depend on a second file's own definition ever changing
// compatibly; a slug format change is a deliberate, reviewable edit to this line too.
const INTERNAL_ENTRY_LINK_RE = /^\/newsite\/encyclopedia\/[a-z0-9-]{1,96}$/

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

function escapeText(str) {
  return decodeEntities(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isSafeHref(raw) {
  if (typeof raw !== 'string') return false
  const decoded = decodeEntities(raw)
  // eslint-disable-next-line no-control-regex
  const stripped = decoded.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (INTERNAL_ENTRY_LINK_RE.test(stripped)) return true
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped)
  if (!match) return false
  return ALLOWED_SCHEMES.has(match[1].toLowerCase() + ':')
}

function safeHrefAttr(raw) {
  return decodeEntities(raw).replace(/[\u0000-\u001F\u007F]/g, '').trim()
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/>/g, '&gt;')
}

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

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? len : end + 3
      continue
    }
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

export function sanitizeEncyclopediaHtml(html) {
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
    if (!name) continue

    if (DROP_CONTENT_TAGS.has(name)) {
      if (!closing) { dropDepth = 1; dropTagName = name }
      continue
    }

    if (!ALLOWED_TAGS.has(name)) continue

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
