// server/utils/realtimeNotify.js
// Live push companion to server/utils/notifications.js's DB writer. Deliberately NOT merged into
// that file: notifications.js is imported from both the Nuxt API runtime and the plain
// `node server/socket-server.js` process and takes `db` as a parameter specifically so it never
// imports anything Nuxt-only (see its own header comment) — `io` is a Socket.IO server instance
// that only ever exists inside socket-server.js, so threading it through notifications.js would
// break that contract. Call this from wherever `io` is already in scope, right after (or instead
// of awaiting) the matching notifications.js write.
//
// This is a bare "something changed, go refetch" ping, not a payload carrying the notification's
// own title/body/contextId — the client already knows how to fetch those (GET /api/notifications),
// and duplicating that shape here would just be a second place for it to drift out of sync with
// whatever notifications.js actually wrote. Every connected socket for this user (one per open
// tab, see socket-server.js's `user:{id}` room join at connection time) receives it; a user with
// no open tab right now simply never gets one — the next ordinary poll still covers that case.
export function pushUserNotification(io, userId) {
  if (!io || !userId) return
  try {
    io.local.to(`user:${userId}`).emit('notification:new')
  } catch (err) {
    console.error('[realtimeNotify] pushUserNotification failed:', err?.message || err)
  }
}

// Same ping as pushUserNotification, for many recipients at once (the raid lobby broadcast can
// reach every cMoon member). One emit per chunk of rooms instead of one per user; rooms with no
// connected socket cost nothing.
export function pushUserNotifications(io, userIds, chunkSize = 500) {
  if (!io || !Array.isArray(userIds) || !userIds.length) return
  try {
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const rooms = userIds.slice(i, i + chunkSize).filter(Boolean).map(id => `user:${id}`)
      if (rooms.length) io.local.to(rooms).emit('notification:new')
    }
  } catch (err) {
    console.error('[realtimeNotify] pushUserNotifications failed:', err?.message || err)
  }
}
