export default defineEventHandler((event) => {
  // Clear user session
  delete event.context.userId

  // Clear cookies or token if you're using any
  setCookie(event, 'session', '', {
    maxAge: 0,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  })

  return { success: true }
})