// Singleton trigger to force-open the globally-mounted CMoonSelectModal.vue on demand — used by
// the "Join a cMoon" button on /newsite/cmoon-nav for a player who opted out (or otherwise has no
// cMoon) and wants back in. Mirrors the useState-backed singleton pattern in
// useFullscreenEffect.js: a plain counter the modal watches, incremented to signal "open now",
// rather than a boolean (a boolean can't signal a second open request while already open/closing).
export function useCMoonJoinModal() {
  const requested = useState('cmoon-join-modal-requested', () => 0)

  function requestOpen() {
    requested.value++
  }

  return { requested, requestOpen }
}
