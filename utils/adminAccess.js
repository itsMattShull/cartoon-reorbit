// What a sub-admin (User.isSubAdmin) may NOT do.
//
// A sub-admin is a normal admin (isAdmin = true, so the ~260 hand-copied `isAdmin` gates in
// server/api/admin/** still let them in) minus the high-risk tools below. Plain ESM with no Nuxt
// auto-imports so the server middleware, the client router/nav and the node:test contract tests
// can all import the one list.
//
// This is a DENY list on purpose: the allowed surface is ~200 routes and almost all of it is
// ordinary content/log tooling. The cost is that a brand-new admin route is open to sub-admins
// until it is added here, which is what tests/subAdminAccess.test.js exists to catch for the
// routes that matter.

const READ_METHODS = new Set(['GET', 'HEAD'])

const API = '/api/admin'

// `path` is an exact path, `prefix` matches the path itself and anything below it (boundary-aware,
// so `/api/admin/codes` does NOT swallow `/api/admin/codes-redeemed`), `re` is a full RegExp.
// `writesOnly` leaves GET/HEAD open. `allow` carves exceptions out of a denied subtree.
export const SUB_ADMIN_DENIED_API = [
  // ── Manage Users (incl. account transfer, ban/dissolve/rename, promote/demote) ──────────────
  // Three reads/writes are carved out because allowed pages need them: the user list (Auth Logs,
  // Admin Changes), user search (cMoon award picker) and assigning a member to a cMoon (cMoons).
  {
    prefix: `${API}/users`,
    allow: [
      { method: 'GET', path: `${API}/users` },
      { method: 'GET', path: `${API}/users/search` },
      { method: 'POST', re: /^\/api\/admin\/users\/[^/]+\/update-cmoon$/ }
    ]
  },
  { prefix: `${API}/locked-points` },

  // ── Initiate Trade ──────────────────────────────────────────────────────────────────────────
  { prefix: `${API}/trade-offers` },

  // ── Production Instance (powers off / resizes the droplet) ──────────────────────────────────
  { prefix: `${API}/dev` },

  // ── Cheating Tool / Check Cheating: the endpoints that seize cToons and points. The read-only
  //    report endpoints (check-cheating, cheating-tool-report) stay open — Auth Logs uses them. ──
  { path: `${API}/cheating-tool-apply` },
  { path: `${API}/cheating-tool-apply-stream` },
  { path: `${API}/remove-cheating` },

  // ── Manage Codes (mints arbitrary points / cToons / backgrounds) ────────────────────────────
  { prefix: `${API}/codes` },

  // ── Global Settings ─────────────────────────────────────────────────────────────────────────
  // Reads stay open: Manage Games / Packs / Certificate read the config. Note that Manage Games'
  // "daily point limit" box saves through this same POST, so sub-admins can't save that one box.
  { path: `${API}/global-config`, writesOnly: true },
  { path: `${API}/global-config/second-edition-overlay`, writesOnly: true },
  { path: `${API}/rarity-defaults`, writesOnly: true },
  { path: '/api/discord/register-commands' },

  // ── Minting / destroying owned cToons ───────────────────────────────────────────────────────
  { re: /^\/api\/admin\/ctoons\/[^/]+\/give-to-official$/ },
  { prefix: `${API}/user-ctoons` },

  // ── Auction Only ────────────────────────────────────────────────────────────────────────────
  { prefix: `${API}/auction-only` },
  { prefix: `${API}/auction-creators` },

  // ── Dissolve misfire resolver: restores items AND pays compensation, in bulk. Scanning,
  //    previewing and marking a misfire reviewed stay open. ────────────────────────────────────
  { path: `${API}/dissolve-misfires/resolve` },

  // ── Deleting logs / job history (evidence tampering) ────────────────────────────────────────
  { path: `${API}/cron-run-logs/delete` },
  { re: /^\/api\/admin\/queues\/[^/]+\/clean$/ },
  { path: `${API}/dissolve-queue/errors`, writesOnly: true }
]

// Console sections (utils/adminSections.js keys) hidden from and refused to a sub-admin.
export const SUB_ADMIN_DENIED_SECTIONS = new Set([
  'manageUsers',
  'initiateTrade',
  'production',
  'cheatingTool',
  'checkCheating',
  'codes',
  'codes/new',
  'codes/edit',
  'auctions',          // "Auction Only" (Auction Logs is a different section: auctionLogs)
  'auctions/new',
  'globalSettings'
])

// The original /admin/* pages, matched boundary-aware like the API prefixes.
export const SUB_ADMIN_DENIED_PAGE_PREFIXES = [
  '/admin/users',
  '/admin/initiate-trade',
  '/admin/manage-dev',
  '/admin/cheating-tool',
  '/admin/check-cheating',
  '/admin/codes',
  '/admin/create-code',
  '/admin/edit-code',
  '/admin/manage-auctions',
  '/admin/add-auction',
  '/admin/global-settings'
]

const onPrefix = (path, prefix) => path === prefix || path.startsWith(prefix + '/')

// `/a//b/`, `/a/./b`, `/a/x/../b` → `/a/b`, so a sloppy path can't dodge a prefix match.
function normalizePath (raw) {
  const noQuery = String(raw || '').split('?')[0].split('#')[0]
  const out = []
  for (const seg of noQuery.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') { out.pop(); continue }
    out.push(seg)
  }
  return '/' + out.join('/')
}

function matches (rule, method, path) {
  if (rule.writesOnly && READ_METHODS.has(method)) return false
  const hit =
    (rule.path && path === rule.path) ||
    (rule.prefix && onPrefix(path, rule.prefix)) ||
    (rule.re && rule.re.test(path))
  if (!hit) return false
  return !(rule.allow || []).some(a =>
    (!a.method || a.method === method) &&
    ((a.path && path === a.path) || (a.re && a.re.test(path)))
  )
}

/**
 * True when a sub-admin must be refused `method path`. The raw and the percent-decoded forms are
 * both checked — the router may match either — so an encoded segment can't slip past.
 */
export function isApiDeniedForSubAdmin (method, rawPath) {
  const m = String(method || 'GET').toUpperCase()
  const forms = new Set([normalizePath(rawPath)])
  try { forms.add(normalizePath(decodeURIComponent(String(rawPath || '').split('?')[0]))) } catch {
    return true // undecodable path: refuse rather than guess
  }
  for (const path of forms) {
    if (SUB_ADMIN_DENIED_API.some(rule => matches(rule, m, path))) return true
  }
  return false
}

export function isSectionDeniedForSubAdmin (key) {
  return SUB_ADMIN_DENIED_SECTIONS.has(key)
}

export function isPageDeniedForSubAdmin (rawPath) {
  const path = normalizePath(rawPath)
  return SUB_ADMIN_DENIED_PAGE_PREFIXES.some(p => onPrefix(path, p))
}
