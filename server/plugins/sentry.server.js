// server/plugins/sentry.server.js
import * as Sentry from '@sentry/node'
import { defineNitroPlugin } from '#imports'

export default defineNitroPlugin((nitroApp) => {
  // Init Sentry
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })

  // Capture unhandled errors
  process.on('uncaughtException',  err => Sentry.captureException(err))
  process.on('unhandledRejection', err => Sentry.captureException(err))

  // Hook into Nitro’s render-error
  nitroApp.hooks.hook('render:error', err => {
    Sentry.captureException(err)
  })
})
