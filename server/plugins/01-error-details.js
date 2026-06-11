// Exposes full error details (message, data, stack) on the error page in
// production. Nitro normally redacts unhandled/fatal errors to a generic
// "Server Error" message; this hook runs before the error handler and clears
// those flags so the real error reaches error.vue, smuggling the stack
// through error.data since Nitro never includes stacks in production bodies.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    if (!error.unhandled && !error.fatal) return

    // Keep the server-side log the default handler would otherwise emit
    const event = context?.event
    console.error(
      `[request error] [unhandled] [${event?.method ?? '-'}] ${event?.path ?? '-'}\n`,
      error
    )

    error.unhandled = false
    error.fatal = false
    if (error.stack) {
      error.data = (error.data && typeof error.data === 'object')
        ? { ...error.data, stack: error.stack }
        : { stack: error.stack }
    }
  })
})
