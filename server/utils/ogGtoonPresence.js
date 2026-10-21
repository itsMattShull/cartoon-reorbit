// server/utils/ogGtoonPresence.js
//
// Tiny shared registry that lets PvP (ogGtoonsSocket.js) and Practice (ogGtoonsPractice.js)
// enforce one-live-match-per-user from both sides WITHOUT importing each other (which would be
// circular, and would drag PvP's Redis/Prisma imports into practice). PvP registers a
// "is this user in a live PvP match or the queue" probe here; practice marks its own users.
const practicing = new Set()

// PvP listens here so the matchmaking lobby's "available players" list reflects practice / tutorial matches too.
let changeListener = () => {}
export const onPresenceChange = (fn) => { changeListener = fn }

export const markPracticing = (userId) => { practicing.add(userId); changeListener() }
export const clearPracticing = (userId) => { const had = practicing.delete(userId); if (had) changeListener(); return had }
export const isPracticing = (userId) => practicing.has(userId)

let pvpProbe = () => false
export const registerPvpProbe = (fn) => { pvpProbe = fn }
export const isInPvp = (userId) => pvpProbe(userId)
