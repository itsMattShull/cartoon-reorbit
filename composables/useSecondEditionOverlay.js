// Fetches the global Second Edition overlay icon (path + natural size) once per
// app load and exposes a helper to compute its render position/size for a given cToon.
export function useSecondEditionOverlay() {
  const overlay = useState('secondEditionOverlayConfig', () => ({
    path: null,
    width: null,
    height: null,
    loaded: false
  }))

  async function ensureLoaded() {
    if (overlay.value.loaded) return
    try {
      const cfg = await $fetch('/api/global-config')
      overlay.value = {
        path: cfg?.secondEditionOverlayPath || null,
        width: cfg?.secondEditionOverlayWidth || 32,
        height: cfg?.secondEditionOverlayHeight || 32,
        loaded: true
      }
    } catch {
      overlay.value = { path: null, width: null, height: null, loaded: true }
    }
  }

  // Renders the overlay centered at (overlayX%, overlayY%) of its container,
  // sized to a percentage of its own natural pixel dimensions (not the container),
  // so it stays a consistent, legible size across thumbnails and detail views.
  function styleFor(ctoon) {
    const x = ctoon?.secondEditionOverlayX ?? 85
    const y = ctoon?.secondEditionOverlayY ?? 85
    const size = ctoon?.secondEditionOverlaySize ?? 100
    const w = overlay.value.width || 32
    const h = overlay.value.height || 32
    return {
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      width: `${w * (size / 100)}px`,
      height: `${h * (size / 100)}px`,
      maxWidth: '45%',
      maxHeight: '45%',
      pointerEvents: 'none',
      objectFit: 'contain'
    }
  }

  return { overlay, ensureLoaded, styleFor }
}
