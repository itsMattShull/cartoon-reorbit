// server/utils/notificationPreferences.js
//
// The boolean User columns that /api/user/notifications reads and writes.
//
// This list exists so the PUT can be an allowlist *patch*. It used to coerce a
// single hard-coded field, which meant any request that didn't mention
// allowAuctionNotifications set it to false — so adding a second toggle to the
// settings page would have silently switched off outbid DMs for everyone who
// touched it.
export const NOTIFICATION_PREFERENCE_FIELDS = Object.freeze([
  'allowAuctionNotifications',
  'allowCzoneMailNotifications',
  'czoneMailWallEnabled'
])
