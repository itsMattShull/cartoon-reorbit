// Validates admin-supplied "link to" URLs (homepage hero/sidebar images, etc.) before they're
// persisted. These values are echoed back on public, unauthenticated pages as real `<a href>`
// targets, so a `javascript:`/`data:`/etc. scheme here would be stored XSS served to every
// anonymous visitor. Only same-site relative paths and http(s) absolute URLs are allowed.
export function sanitizeLink(raw) {
  const val = (raw ?? '').toString().trim()
  if (!val) return null

  // Relative/site-root path, e.g. "/newsite/cmart" — safe, no scheme to abuse.
  if (val.startsWith('/')) return val

  try {
    const parsed = new URL(val)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return val
  } catch {
    // not a valid absolute URL
  }

  return null
}
