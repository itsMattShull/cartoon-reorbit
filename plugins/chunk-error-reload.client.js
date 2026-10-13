// After a deploy, tabs running the old build request hashed chunks that no
// longer exist ("Importing a module script failed"). Reload once to pick up
// the new build instead of showing an error page.
export default defineNuxtPlugin((nuxtApp) => {
  const KEY = 'chunk-error-reloaded-at'

  const reloadOnce = () => {
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0)
      if (Date.now() - last < 30000) return
      sessionStorage.setItem(KEY, String(Date.now()))
    } catch {}
    window.location.reload()
  }

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadOnce()
  })

  nuxtApp.hook('app:chunkError', reloadOnce)

  nuxtApp.hook('vue:error', (err) => {
    const msg = String(err?.message || err)
    if (/Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg)) {
      reloadOnce()
    }
  })
})
