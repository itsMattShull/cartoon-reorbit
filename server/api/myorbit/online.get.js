// Who's online in MyOrbit right now, and which room — powers the "Online now" panel in the
// room-list view. Unfiltered (everyone currently present, not a friends-only list): this
// codebase's existing `Friend` model is one-directional with no accept flow and no list/remove
// endpoints (see server/api/friends/add.post.js), so a real mutual friends list is out of scope
// here — "online in MyOrbit" needs only the presence mirror, not that model at all.
import { defineEventHandler, createError } from 'h3'
import { listOnlinePresence } from '@/server/utils/myOrbitPresence'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const users = await listOnlinePresence()
  return { users: users.map(u => ({ userId: u.userId, username: u.username, roomId: u.roomId })) }
})
