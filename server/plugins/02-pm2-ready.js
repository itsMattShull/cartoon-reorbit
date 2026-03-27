// Signals PM2 that this Nitro worker is ready to receive traffic.
// Required when ecosystem.config.cjs uses wait_ready: true — without this,
// PM2 cluster mode never adds the worker to the pool and every request 502s.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hookOnce('listen', () => {
    if (process.send) {
      process.send('ready')
    }
  })
})
