// server/utils/sanitizeTutorialHtml.js
// Shared allowlist for admin-authored tutorial prose. Applied at save-time
// (so nothing unsafe is ever stored) and again at read-time (cheap insurance
// against a future write path that bypasses save-time sanitization).
import sanitizeHtml from 'sanitize-html'
import { SECTION_KEYS } from '@/utils/tutorialSections'

const OPTIONS = {
  allowedTags: ['p', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'br', 'a', 'blockquote'],
  allowedAttributes: {
    a: ['href', 'target', 'rel']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // No inline styles/classes — this is plain prose, not a place for arbitrary CSS.
  allowedStyles: {},
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs }
      // Force safe rel whenever a link opens a new tab, regardless of what
      // the editor produced — closes the reverse-tabnabbing gap even if a
      // future editor config starts emitting target=_blank.
      if (out.target === '_blank') {
        out.rel = 'noopener noreferrer'
      } else {
        delete out.rel
      }
      return { tagName, attribs: out }
    }
  }
}

export function sanitizeSectionHtml(html) {
  if (typeof html !== 'string' || !html) return ''
  return sanitizeHtml(html, OPTIONS)
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
