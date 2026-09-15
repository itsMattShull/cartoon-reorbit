// The cMoon list for the cToon "Suggest Updates" dropdown, cached module-wide
// via useState. CtoonInfoCard.vue is mounted/unmounted with a plain `v-if`
// every time the info modal opens (layouts/newsite-template.vue), so a
// component-local ref would refetch on every single open — this survives
// that and is shared across every open info card instance.
export function useSuggestibleCMoons() {
  const state = useState('suggestibleCMoons', () => ({
    loaded: false,
    loading: false,
    enabled: false,
    items: [],
  }))

  async function ensureLoaded() {
    if (state.value.loaded || state.value.loading) return
    state.value.loading = true
    try {
      const res = await $fetch('/api/cmoons', { query: { view: 'suggestable' } })
      state.value.items = Array.isArray(res?.cmoons) ? res.cmoons : []
      state.value.enabled = !!res?.cMoonEnabled
      state.value.loaded = true
    } catch {
      state.value.items = []
      state.value.enabled = false
    } finally {
      state.value.loading = false
    }
  }

  return {
    cmoons: computed(() => state.value.items),
    enabled: computed(() => state.value.enabled),
    ensureLoaded,
  }
}
