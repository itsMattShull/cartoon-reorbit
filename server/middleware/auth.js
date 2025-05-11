import jwt from 'jsonwebtoken'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'session')
  if (!token) return // No session cookie = not logged in

  try {
    const jwtSecret = useRuntimeConfig(event).jwtSecret
    const payload = jwt.verify(token, jwtSecret)

    // Attach the user ID to context so other middleware and routes can use it
    event.context.userId = payload.sub
  } catch {
    // Invalid or expired JWT – treat as unauthenticated
    event.context.userId = null
  }
})
