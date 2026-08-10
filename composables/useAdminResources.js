import { onScopeDispose } from 'vue'

/**
 * Centralised teardown for anything that outlives a component unless explicitly
 * released: Chart.js instances, timers, global event listeners, object URLs and
 * observers.
 *
 * The admin console swaps sections with `<component :is>` inside a single page,
 * so switching sections unmounts a component without a route change. Anything
 * the component forgot to release stays alive for the whole session — an admin
 * who visits ten log views has ten orphaned charts, each pinning its canvas
 * backing store and a ResizeObserver.
 *
 * `onScopeDispose` (rather than `onBeforeUnmount`) is used deliberately: it
 * fires for the component's effect scope, which covers async components resolved
 * by `defineAsyncComponent` and components torn down via `<component :is>`,
 * and it also works when these helpers are called from a nested composable
 * rather than directly in `setup`.
 *
 * Usage:
 *   const rs = useAdminResources()
 *   rs.chart(new Chart(ctx, cfg))          // destroyed on unmount
 *   rs.interval(() => poll(), 10_000)      // cleared on unmount
 *   rs.listen(window, 'click', onClick)    // removed on unmount
 *   const url = rs.objectUrl(file)         // revoked on unmount
 */
export function useAdminResources () {
  const charts = new Set()
  const intervals = new Set()
  const timeouts = new Set()
  const rafs = new Set()
  const listeners = new Set()
  const observers = new Set()
  const objectUrls = new Set()
  let disposed = false

  /** Register a Chart.js instance (or anything with .destroy()). Returns it. */
  function chart (instance) {
    if (!instance) return instance
    // If the component was already torn down (e.g. an await resolved after
    // unmount), destroy immediately rather than leaking.
    if (disposed) { try { instance.destroy() } catch {} ; return instance }
    charts.add(instance)
    return instance
  }

  /** Destroy a previously registered chart now — for recreate-on-filter-change. */
  function destroyChart (instance) {
    if (!instance) return null
    charts.delete(instance)
    try { instance.destroy() } catch {}
    return null
  }

  function interval (fn, ms) {
    if (disposed) return null
    const id = setInterval(fn, ms)
    intervals.add(id)
    return id
  }

  function clearIntervalRef (id) {
    if (id == null) return null
    intervals.delete(id)
    clearInterval(id)
    return null
  }

  function timeout (fn, ms) {
    if (disposed) return null
    const id = setTimeout(() => { timeouts.delete(id); fn() }, ms)
    timeouts.add(id)
    return id
  }

  function raf (fn) {
    if (disposed || !import.meta.client) return null
    const id = requestAnimationFrame((t) => { rafs.delete(id); fn(t) })
    rafs.add(id)
    return id
  }

  function listen (target, type, handler, options) {
    if (!target || disposed) return () => {}
    target.addEventListener(type, handler, options)
    const entry = { target, type, handler, options }
    listeners.add(entry)
    return () => {
      listeners.delete(entry)
      target.removeEventListener(type, handler, options)
    }
  }

  /** Register an observer (Resize/Mutation/Intersection) for disconnect. */
  function observe (observer) {
    if (!observer) return observer
    if (disposed) { try { observer.disconnect() } catch {} ; return observer }
    observers.add(observer)
    return observer
  }

  /** Create an object URL that is revoked on unmount. */
  function objectUrl (blob) {
    if (!import.meta.client || !blob) return ''
    const url = URL.createObjectURL(blob)
    if (disposed) { URL.revokeObjectURL(url); return url }
    objectUrls.add(url)
    return url
  }

  /** Revoke one object URL early (e.g. replacing a preview image). */
  function revokeObjectUrl (url) {
    if (!url || !objectUrls.has(url)) return ''
    objectUrls.delete(url)
    URL.revokeObjectURL(url)
    return ''
  }

  function dispose () {
    if (disposed) return
    disposed = true
    for (const c of charts) { try { c.destroy() } catch {} }
    charts.clear()
    for (const id of intervals) clearInterval(id)
    intervals.clear()
    for (const id of timeouts) clearTimeout(id)
    timeouts.clear()
    if (import.meta.client) for (const id of rafs) cancelAnimationFrame(id)
    rafs.clear()
    for (const { target, type, handler, options } of listeners) {
      try { target.removeEventListener(type, handler, options) } catch {}
    }
    listeners.clear()
    for (const o of observers) { try { o.disconnect() } catch {} }
    observers.clear()
    if (import.meta.client) for (const url of objectUrls) URL.revokeObjectURL(url)
    objectUrls.clear()
  }

  onScopeDispose(dispose)

  return {
    chart,
    destroyChart,
    interval,
    clearInterval: clearIntervalRef,
    timeout,
    raf,
    listen,
    observe,
    objectUrl,
    revokeObjectUrl,
    dispose,
    /** True once the owning component has been torn down. */
    get disposed () { return disposed }
  }
}
