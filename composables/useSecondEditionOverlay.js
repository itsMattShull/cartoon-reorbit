// Fetches the global Second Edition overlay icon (path + natural size) once per
// app load and exposes a helper to compute its render position/size for a given cToon.

// Reference size (px) of the admin's live preview box in SecondEditionFields.vue,
// where 100% "Size" means the overlay renders at its natural pixel dimensions.
// All overlay sizing elsewhere is expressed as a % of the containing cToon image
// box, scaled relative to this reference, so the icon resizes proportionally
// with the cToon image wherever it's displayed (thumbnail, detail view, etc.)
// instead of staying a fixed pixel size.
export const SECOND_EDITION_PREVIEW_SIZE = 220

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

  // Renders the overlay centered at (overlayX%, overlayY%) of its container, with
  // its width expressed as a % of the container's own width (not a fixed px size)
  // so it scales up/down together with the cToon image whenever that image is
  // rendered larger or smaller. Height is left to the browser's natural
  // width/height ratio for the image so the icon's own aspect ratio is preserved.
  function styleFor(ctoon) {
    const x = ctoon?.secondEditionOverlayX ?? 85
    const y = ctoon?.secondEditionOverlayY ?? 85
    const size = ctoon?.secondEditionOverlaySize ?? 100
    const naturalWidth = overlay.value.width || 32
    const widthPercent = (naturalWidth / SECOND_EDITION_PREVIEW_SIZE) * (size / 100) * 100
    return {
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      width: `${widthPercent}%`,
      height: 'auto',
      maxWidth: '60%',
      pointerEvents: 'none',
      objectFit: 'contain'
    }
  }

  return { overlay, ensureLoaded, styleFor }
}
