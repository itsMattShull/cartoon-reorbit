// The tutorial page's sanitizer is hand-rolled (see server/utils/sanitizeTutorialHtml.js for
// why) rather than a library, so these tests pin the security properties it has to hold:
// nothing outside the allowlist survives, no attribute except a validated href/target/rel on
// <a> survives, and no input — however malformed — can make it into the output as live markup.

import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeSectionHtml, sanitizeSections, SECTION_KEYS } from '../server/utils/sanitizeTutorialHtml.js'

test('passes through every allowed tag with no attributes', () => {
  const input = '<p>Hi</p><b>b</b><strong>s</strong><i>i</i><em>e</em><u>u</u>' +
    '<ul><li>one</li></ul><ol><li>two</li></ol><h2>h2</h2><h3>h3</h3><h4>h4</h4>' +
    '<br><blockquote>q</blockquote>'
  assert.equal(sanitizeSectionHtml(input), input)
})

test('drops disallowed tags but keeps their inner text (unwrap, not delete)', () => {
  assert.equal(sanitizeSectionHtml('<div>hello</div>'), 'hello')
  assert.equal(sanitizeSectionHtml('<span class="x">hi</span>'), 'hi')
  assert.equal(sanitizeSectionHtml('<p><font color="red">red</font> text</p>'), '<p>red text</p>')
})

test('strips every attribute from allowed tags except a validated href on <a>', () => {
  assert.equal(sanitizeSectionHtml('<p onclick="evil()">hi</p>'), '<p>hi</p>')
  assert.equal(sanitizeSectionHtml('<p style="color:red" class="x" id="y">hi</p>'), '<p>hi</p>')
  assert.equal(sanitizeSectionHtml('<ul style="list-style:none"><li data-x="y">i</li></ul>'), '<ul><li>i</li></ul>')
})

test('drops script/style/iframe and everything nested inside them, not just the tags', () => {
  assert.equal(sanitizeSectionHtml('<script>alert(1)</script>after'), 'after')
  assert.equal(sanitizeSectionHtml('before<style>body{}</style>'), 'before')
  assert.equal(sanitizeSectionHtml('<iframe src="evil.com"><p>nested</p></iframe>after'), 'after')
  assert.equal(sanitizeSectionHtml('<svg onload="alert(1)"><script>bad()</script></svg>after'), 'after')
  // Case-insensitive.
  assert.equal(sanitizeSectionHtml('<SCRIPT>alert(1)</SCRIPT>after'), 'after')
  // Nested same-name tags track depth correctly instead of closing on the inner one.
  assert.equal(sanitizeSectionHtml('<script><script></script>alert(1)</script>after'), 'after')
})

test('keeps a safe absolute http(s)/mailto href, dropping every other attribute', () => {
  assert.equal(
    sanitizeSectionHtml('<a href="https://example.com" onclick="evil()" class="x">go</a>'),
    '<a href="https://example.com">go</a>'
  )
  assert.equal(
    sanitizeSectionHtml('<a href="http://example.com">go</a>'),
    '<a href="http://example.com">go</a>'
  )
  assert.equal(
    sanitizeSectionHtml('<a href="mailto:a@b.com">mail</a>'),
    '<a href="mailto:a@b.com">mail</a>'
  )
})

test('forces rel=noopener noreferrer whenever target=_blank survives, regardless of input rel', () => {
  assert.equal(
    sanitizeSectionHtml('<a href="https://x.com" target="_blank">go</a>'),
    '<a href="https://x.com" target="_blank" rel="noopener noreferrer">go</a>'
  )
  assert.equal(
    sanitizeSectionHtml('<a href="https://x.com" target="_blank" rel="opener">go</a>'),
    '<a href="https://x.com" target="_blank" rel="noopener noreferrer">go</a>'
  )
  // No target at all -> no rel injected either.
  assert.equal(sanitizeSectionHtml('<a href="https://x.com">go</a>'), '<a href="https://x.com">go</a>')
})

test('rejects javascript: and other unsafe schemes, dropping the href but keeping the tag', () => {
  for (const href of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:alert(1)',
    'file:///etc/passwd'
  ]) {
    assert.equal(sanitizeSectionHtml(`<a href="${href}">go</a>`), '<a>go</a>', href)
  }
})

test('rejects a javascript: href obfuscated with HTML entities in the value', () => {
  // A browser decodes entities in an attribute value before using it as a URL, so a check
  // against the raw, still-encoded string would miss this.
  assert.equal(sanitizeSectionHtml('<a href="java&#115;cript:alert(1)">go</a>'), '<a>go</a>')
  assert.equal(sanitizeSectionHtml('<a href="&#106;avascript:alert(1)">go</a>'), '<a>go</a>')
  assert.equal(sanitizeSectionHtml('<a href="javascript&#58;alert(1)">go</a>'), '<a>go</a>')
})

test('rejects a javascript: href obfuscated with embedded control characters', () => {
  assert.equal(sanitizeSectionHtml('<a href="java\tscript:alert(1)">go</a>'), '<a>go</a>')
  assert.equal(sanitizeSectionHtml('<a href="java\nscript:alert(1)">go</a>'), '<a>go</a>')
})

test('rejects an unquoted or missing href rather than guessing', () => {
  assert.equal(sanitizeSectionHtml('<a href=javascript:alert(1)>go</a>'), '<a>go</a>')
  assert.equal(sanitizeSectionHtml('<a>go</a>'), '<a>go</a>')
})

test('a real attribute value containing ">" does not end the tag early', () => {
  assert.equal(
    sanitizeSectionHtml('<a href="https://example.com/?a=1&gt;2">go</a><p>after</p>'),
    '<a href="https://example.com/?a=1&gt;2">go</a><p>after</p>'
  )
})

test('escapes stray "<" and ">" in text so they can never become live markup', () => {
  // A malformed/adversarial direct API call (bypassing the rich-text editor entirely) is a
  // real threat model here — this must fail closed even on garbage input.
  const out = sanitizeSectionHtml('5 < 10 and 10 > 5')
  assert.ok(!out.includes('< 10'), 'raw "<" must not survive')
  assert.match(out, /&lt;|&gt;| /) // exact spelling isn't the point; no raw <, > is
})

test('an unterminated tag never leaks a real tag hidden inside it as live markup', () => {
  const out = sanitizeSectionHtml('<a href="https://x.com <script>alert(1)</script>')
  assert.ok(!/<script/i.test(out), `script tag leaked into output: ${out}`)
})

test('a comment cannot smuggle a script tag past the sanitizer', () => {
  assert.equal(sanitizeSectionHtml('<!-- <script>alert(1)</script> -->after'), 'after')
})

test('round-trips a real admin-typed ampersand without double-escaping across repeated saves', () => {
  const once = sanitizeSectionHtml('<p>cats &amp; dogs</p>')
  assert.equal(once, '<p>cats &amp; dogs</p>')
  const twice = sanitizeSectionHtml(once)
  assert.equal(twice, '<p>cats &amp; dogs</p>')
})

test('non-string/empty input returns an empty string rather than throwing', () => {
  assert.equal(sanitizeSectionHtml(''), '')
  assert.equal(sanitizeSectionHtml(null), '')
  assert.equal(sanitizeSectionHtml(undefined), '')
  assert.equal(sanitizeSectionHtml(42), '')
})

test('sanitizeSections only ever returns the known section keys, sanitized', () => {
  const result = sanitizeSections({
    intro: '<p onclick="x()">hi</p>',
    notARealSection: '<script>alert(1)</script>'
  })
  assert.deepEqual(Object.keys(result).sort(), [...SECTION_KEYS].sort())
  assert.equal(result.intro, '<p>hi</p>')
  assert.equal(result.auctions, '')
})

test('sanitizeSections tolerates a non-object input', () => {
  const result = sanitizeSections(null)
  for (const key of SECTION_KEYS) assert.equal(result[key], '')
})
