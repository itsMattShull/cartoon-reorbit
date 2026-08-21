// Shared state for the full-screen cMoon join effect, mirroring
// useAuctionModal.js/useCtoonModal.js: mounted once (CMoonJoinEffect.vue, in
// layouts/newsite-template.vue) and triggered from anywhere a join can
// happen — CMoonSelectModal.vue's live confirm(), and its own checkStatus()
// poll for cron-auto-assigned users on their next visit.
export function useCMoonJoinEffect() {
  const isOpen = useState('cmoon-join-effect-open', () => false)
  const effect = useState('cmoon-join-effect-data', () => null)

  function show(nextEffect) {
    if (!nextEffect) return
    effect.value = nextEffect
    isOpen.value = true
  }

  function hide() {
    isOpen.value = false
    effect.value = null
  }

  return { isOpen, effect, show, hide }
}
