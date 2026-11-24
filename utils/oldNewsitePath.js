// The site's pages used to live under /newsite. Returns the current path for an old
// /newsite URL, or null when the path is not an old one.
//   /newsite            -> /home
//   /newsite/           -> /home
//   /newsite/cmart      -> /cmart
//   /newsite/czone/Bob  -> /czone/Bob
//   /newsitemap         -> null (not the prefix, just a path that starts the same way)
export function stripNewsitePrefix (path) {
  if (typeof path !== 'string') return null
  if (path === '/newsite' || path === '/newsite/') return '/home'
  if (!path.startsWith('/newsite/')) return null
  // Collapse any further slashes so the result can never be a protocol-relative "//host".
  return '/' + path.slice('/newsite/'.length).replace(/^\/+/, '')
}
