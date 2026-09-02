// Global singleton for the "you got something from your cMoon" reveal modal — mirrors
// useCtoonModal/useAuctionModal's useState()-backed pattern. The actual component
// (CMoonRewardModal.vue) is mounted once in layouts/newsite-template.vue; any page/component
// calls open() with an already-resolved API response, never anything reconstructed from route
// state, so a stale/crafted payload can't make this show a reward that wasn't actually granted.
export function useCMoonRewardModal() {
  const isOpen = useState('cmoon-reward-modal-open', () => false)
  const data = useState('cmoon-reward-modal-data', () => null)

  // payload: { kind: 'affinity'|'rank'|'offer'|'prize', eyebrow, title, subtitle, items, pointsAwarded, note }
  function open(payload) {
    data.value = payload
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, data, open, close }
}
