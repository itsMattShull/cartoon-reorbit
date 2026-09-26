// Same security properties as tests/sanitizeTutorialHtml.test.js pins for its sanitizer, plus
// coverage for the one real difference: a relative link to another Encyclopedia entry.

import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeEncyclopediaHtml } from '../server/utils/sanitizeEncyclopediaHtml.js'

test('passes through every allowed tag with no attributes', () => {
  const input = '<p>Hi</p><b>b</b><strong>s</strong><i>i</i><em>e</em><u>u</u>' +
    '<ul><li>one</li></ul><ol><li>two</li></ol><h2>h2</h2><h3>h3</h3><h4>h4</h4>' +
    '<br><blockquote>q</blockquote>'
  assert.equal(sanitizeEncyclopediaHtml(input), input)
})

test('drops disallowed tags but keeps their inner text (unwrap, not delete)', () => {
  assert.equal(sanitizeEncyclopediaHtml('<div>hello</div>'), 'hello')
  assert.equal(sanitizeEncyclopediaHtml('<span class="x">hi</span>'), 'hi')
  assert.equal(sanitizeEncyclopediaHtml('<p><font color="red">red</font> text</p>'), '<p>red text</p>')
})

test('strips every attribute from allowed tags except a validated href on <a>', () => {
  assert.equal(sanitizeEncyclopediaHtml('<p onclick="evil()">hi</p>'), '<p>hi</p>')
  assert.equal(sanitizeEncyclopediaHtml('<p style="color:red" class="x" id="y">hi</p>'), '<p>hi</p>')
})

test('drops script/style/iframe and everything nested inside them, not just the tags', () => {
  assert.equal(sanitizeEncyclopediaHtml('<script>alert(1)</script>after'), 'after')
  assert.equal(sanitizeEncyclopediaHtml('before<style>body{}</style>'), 'before')
  assert.equal(sanitizeEncyclopediaHtml('<iframe src="evil.com"><p>nested</p></iframe>after'), 'after')
  assert.equal(sanitizeEncyclopediaHtml('<svg onload="alert(1)"><script>bad()</script></svg>after'), 'after')
})

test('accepts http/https/mailto hrefs and rewrites target=_blank to a safe rel', () => {
  assert.equal(sanitizeEncyclopediaHtml('<a href="https://example.com">x</a>'), '<a href="https://example.com">x</a>')
  assert.equal(sanitizeEncyclopediaHtml('<a href="mailto:a@b.com">x</a>'), '<a href="mailto:a@b.com">x</a>')
  assert.equal(
    sanitizeEncyclopediaHtml('<a href="https://example.com" target="_blank">x</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
  )
})

test('rejects javascript: and unknown schemes, including numeric-entity obfuscation', () => {
  assert.equal(sanitizeEncyclopediaHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>')
  assert.equal(sanitizeEncyclopediaHtml('<a href="data:text/html,x">x</a>'), '<a>x</a>')
  assert.equal(sanitizeEncyclopediaHtml('<a href="&#106;avascript:alert(1)">x</a>'), '<a>x</a>')
})

test('accepts a relative link to another encyclopedia entry, and only that exact shape', () => {
  assert.equal(
    sanitizeEncyclopediaHtml('<a href="/newsite/encyclopedia/some-entry">x</a>'),
    '<a href="/newsite/encyclopedia/some-entry">x</a>',
  )
  // Anything else relative is rejected — this allowance is intentionally narrow.
  assert.equal(sanitizeEncyclopediaHtml('<a href="/newsite/admin">x</a>'), '<a>x</a>')
  assert.equal(sanitizeEncyclopediaHtml('<a href="/">x</a>'), '<a>x</a>')
  assert.equal(sanitizeEncyclopediaHtml('<a href="//evil.com">x</a>'), '<a>x</a>')
  assert.equal(sanitizeEncyclopediaHtml('<a href="/newsite/encyclopedia/../admin">x</a>'), '<a>x</a>')
})

test('malformed/unterminated markup can never become live output', () => {
  assert.equal(sanitizeEncyclopediaHtml('<p>unterminated'), '<p>unterminated')
  assert.equal(sanitizeEncyclopediaHtml('text < more text'), 'text &lt; more text')
  assert.equal(sanitizeEncyclopediaHtml('<a href="foo>bar" onclick="x">text</a>'), '<a>text</a>')
})

test('empty/non-string input returns empty string', () => {
  assert.equal(sanitizeEncyclopediaHtml(''), '')
  assert.equal(sanitizeEncyclopediaHtml(null), '')
  assert.equal(sanitizeEncyclopediaHtml(undefined), '')
})
