import { ref } from 'vue'

// Shared "should the Join a cMoon CTA show, and if not why" logic — used by both
// components/newsite/CMoonNav.vue and pages/newsite/settings.vue so the eligibility rule
// (cMoons enabled + no current cMoon + not in an opt-out rejoin cooldown) lives in exactly one
// place rather than drifting between two copies.
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Pure function over a GET /api/cmoon/status response — call this directly when a caller has
// already fetched status for another reason (e.g. settings.vue already fetches it for the Request
// Team Change button) to avoid firing a second request for the same data.
export function computeCMoonJoinEligibility(status) {
  const hasNoCMoon = !!status?.cMoonEnabled && !status.cMoon
  const rejoinAt = status?.cMoonRejoinAvailableAt ? new Date(status.cMoonRejoinAvailableAt) : null
  const inCooldown = !!(rejoinAt && rejoinAt > new Date())
  return {
    showJoinCta: hasNoCMoon && !inCooldown,
    cooldownText: (hasNoCMoon && inCooldown) ? `You can rejoin a cMoon on ${dateFormatter.format(rejoinAt)}.` : '',
  }
}

// Stateful wrapper for a caller with no status response of its own to reuse — fetches
// /api/cmoon/status itself and exposes the computed eligibility as refs.
export function useCMoonJoinEligibility() {
  const showJoinCta = ref(false)
  const cooldownText = ref('')
  const loading = ref(false)

  async function refresh() {
    loading.value = true
    try {
      const status = await $fetch('/api/cmoon/status', { credentials: 'include' })
      const result = computeCMoonJoinEligibility(status)
      showJoinCta.value = result.showJoinCta
      cooldownText.value = result.cooldownText
    } catch {
      showJoinCta.value = false
      cooldownText.value = ''
    } finally {
      loading.value = false
    }
  }

  return { showJoinCta, cooldownText, loading, refresh }
}
