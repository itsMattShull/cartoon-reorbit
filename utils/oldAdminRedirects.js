// Where the original /admin/* page URLs now live. The old pages were removed once the
// admin console covered them, and the console has since taken over /admin itself; these
// keep bookmarks and links in Discord working. Consumed by nuxt.config.js as routeRules,
// so they apply to full page loads — nothing inside the app links to the old names.
//
// The console owns /admin now, so an old name that is also a console section (e.g.
// /admin/packs) is left alone: the console's own page wins and no rule is emitted.
//
// A `/**` suffix on both sides carries the remainder through (an id or username);
// Nitro keeps the query string on any redirect (e.g. /admin/edit-code?code=ABC).
import { resolveAdminRoute } from './adminSections.js'

const STATIC = {
  'achievement-logs': 'achievementLogs',
  'achievements': 'achievements',
  'add-auction': 'auctions/new',
  'addCtoon': 'ctoons/new',
  'addHolidayEvent': 'holidayEvents/new',
  'admin-changes': 'adminChanges',
  'analytics': 'retention',
  'announcements': 'announcements',
  'auctions': 'auctionLogs',
  'auth-logs': 'authLogs',
  'backgrounds': 'backgrounds',
  'bulk-upload-ctoons': 'ctoonsBulkUpload',
  'cheating-tool': 'cheatingTool',
  'check-cheating': 'checkCheating',
  'codes': 'codes',
  'create-code': 'codes/new',
  'ctoon-suggestions': 'ctoonSuggestions',
  'ctoonOwnerLogs': 'ctoonOwnerLogs',
  'ctoons': 'ctoons',
  'czone-contest': 'czoneContest',
  'czone-search-logs': 'czoneSearchLogs',
  'dissolve-queue': 'dissolveQueue',
  'edit-code': 'codes/edit',
  'games': 'games',
  'global-settings': 'globalSettings',
  'gtoons-clash-tournaments': 'clashTournaments',
  'gtoons-logs': 'gtoonsClashLogs',
  'holidayevents': 'holidayEvents',
  'initiate-trade': 'initiateTrade',
  'lotto-logs': 'lottoLogs',
  'manage-ads': 'ads',
  'manage-auctions': 'auctions',
  'manage-czone-search': 'czoneSearch',
  'manage-dev': 'production',
  'manage-homepage': 'homepage',
  'manage-lotto': 'lotto',
  'new-pack': 'packs/new',
  'packanalytics': 'packAnalytics',
  'packs': 'packs',
  'points-log': 'pointLogs',
  'scavenger': 'scavenger',
  'scavenger-logs': 'scavengerLogs',
  'starter-sets': 'starterSets',
  'submitted-ctoons': 'submittedCtoons',
  'suspicious-activity': 'suspiciousActivity',
  'trades': 'tradeLogs',
  'userctoons': 'userCtoons',
  'users': 'manageUsers',
  'winwheellogs': 'winWheelLogs'
}

// Old routes that took a trailing record id / username.
const WITH_PARAM = {
  'editCtoon': 'ctoons/edit',
  'edit-pack': 'packs/edit',
  'edit-czone': 'czoneEdit',
  'edit-holidayevent': 'holidayEvents/edit'
}

const CONSOLE = '/admin'

// An old name the console itself now answers to must not redirect (it would shadow the
// section, or loop when old and new names match).
const isConsoleSection = (name) => Boolean(resolveAdminRoute([name]))

export const OLD_ADMIN_REDIRECTS = {
  ...Object.fromEntries(Object.entries(STATIC)
    .filter(([old]) => !isConsoleSection(old))
    .map(([old, key]) => [`/admin/${old}`, `${CONSOLE}/${key}`])),
  ...Object.fromEntries(Object.entries(WITH_PARAM)
    .filter(([old]) => !isConsoleSection(old))
    .map(([old, key]) => [`/admin/${old}/**`, `${CONSOLE}/${key}/**`]))
}

/** Nitro routeRules form: { '/admin/foo': { redirect: { to, statusCode } } } */
export const OLD_ADMIN_ROUTE_RULES = Object.fromEntries(
  Object.entries(OLD_ADMIN_REDIRECTS).map(([from, to]) => [from, { redirect: { to, statusCode: 302 } }])
)
