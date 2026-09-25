import test from 'node:test'
import assert from 'node:assert/strict'

import { slugify, isValidSlug, isValidTitle, parseEntryBody, TITLE_MAX_LENGTH } from '../server/utils/encyclopedia.js'

test('slugify kebab-cases a title', () => {
  assert.equal(slugify('The Great cToon War!'), 'the-great-ctoon-war')
  assert.equal(slugify('  leading/trailing spaces  '), 'leading-trailing-spaces')
  assert.equal(slugify('Already-kebab-case'), 'already-kebab-case')
  assert.equal(slugify(''), '')
})

test('isValidSlug only accepts lowercase letters, digits, and hyphens', () => {
  assert.equal(isValidSlug('valid-slug-123'), true)
  assert.equal(isValidSlug('Invalid Slug'), false)
  assert.equal(isValidSlug('has_underscore'), false)
  assert.equal(isValidSlug(''), false)
  assert.equal(isValidSlug('a'.repeat(97)), false)
})

test('isValidTitle enforces non-empty and the max length', () => {
  assert.equal(isValidTitle('A title'), true)
  assert.equal(isValidTitle(''), false)
  assert.equal(isValidTitle('   '), false)
  assert.equal(isValidTitle('a'.repeat(TITLE_MAX_LENGTH)), true)
  assert.equal(isValidTitle('a'.repeat(TITLE_MAX_LENGTH + 1)), false)
})

test('parseEntryBody: create auto-derives the slug from the title when omitted', () => {
  const parsed = parseEntryBody({ title: 'My New Entry' }, undefined)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.slug, 'my-new-entry')
  assert.equal(parsed.data.active, true)
  assert.equal(parsed.data.sortOrder, 0)
})

test('parseEntryBody: create rejects the reserved "entries" slug', () => {
  const parsed = parseEntryBody({ title: 'Entries', slug: 'entries' }, undefined)
  assert.equal(parsed.ok, false)
})

test('parseEntryBody: update with an edited title never re-derives an existing slug', () => {
  const existing = { title: 'Old Title', slug: 'old-slug', body: '', active: true, sortOrder: 0 }
  const parsed = parseEntryBody({ title: 'Completely New Title' }, existing)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.slug, 'old-slug')
})

test('parseEntryBody: update can still explicitly change the slug', () => {
  const existing = { title: 'Title', slug: 'old-slug', body: '', active: true, sortOrder: 0 }
  const parsed = parseEntryBody({ slug: 'new-slug' }, existing)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.slug, 'new-slug')
})

test('parseEntryBody: body HTML is sanitized before being stored', () => {
  const parsed = parseEntryBody({ title: 'X', body: '<p onclick="evil()">hi</p><script>bad()</script>' }, undefined)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.body, '<p>hi</p>')
})

test('parseEntryBody: rejects a missing title, an invalid slug, and an out-of-range sortOrder', () => {
  assert.equal(parseEntryBody({ title: '' }, undefined).ok, false)
  assert.equal(parseEntryBody({ title: 'X', slug: 'Not Valid' }, undefined).ok, false)
  assert.equal(parseEntryBody({ title: 'X', sortOrder: 100000 }, undefined).ok, false)
})
