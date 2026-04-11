import { defineEventHandler, createError } from 'h3'
import { getCZoneNavUsernames } from './next.get.js'

export default defineEventHandler(async (event) => {
  const { username } = event.context.params || {}
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' })
  }

  const usernames = await getCZoneNavUsernames()
  if (!usernames.length) {
    throw createError({ statusCode: 404, statusMessage: 'No users found' })
  }

  const idx = usernames.indexOf(username)
  const nextIndex = idx === -1 ? 0 : (idx + 10) % usernames.length
  return { username: usernames[nextIndex] }
})
