import { defineNitroPlugin } from '#imports'
import { startDiagnostics } from '../diagnostics/telemetry.mjs'

export default defineNitroPlugin(async (nitroApp) => {
  try {
    const controller = await startDiagnostics()
    if (controller?.stop) {
      nitroApp.hooks.hook('close', () => {
        try {
          controller.stop()
        } catch {}
      })
    }
  } catch (err) {
    console.error('[Diagnostics] failed to start:', err)
  }
})
