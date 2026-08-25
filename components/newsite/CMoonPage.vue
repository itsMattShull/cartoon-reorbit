<template>
  <div class="cmp-wrap" :style="paletteStyle">
    <div v-if="loading" class="cmp-status">Loading…</div>
    <div v-else-if="error" class="cmp-status cmp-status--error">{{ error }}</div>
    <template v-else-if="cmoon">
      <div class="cmp-banner">
        <h1 class="cmp-title">{{ cmoon.name }}</h1>
        <p class="cmp-member-count">{{ cmoon.memberCount.toLocaleString() }} member{{ cmoon.memberCount === 1 ? '' : 's' }}</p>
      </div>

      <div class="cmp-body">
        <div class="cmp-stats">
          <div class="cmp-stat">
            <span class="cmp-stat-label">Team Rank</span>
            <span class="cmp-stat-value">#{{ cmoon.rank }}</span>
          </div>
          <div class="cmp-stat">
            <span class="cmp-stat-label">Team Score</span>
            <span class="cmp-stat-value">{{ cmoon.teamScore.toLocaleString() }}</span>
          </div>
        </div>

        <template v-if="offers.length">
          <h2 class="cmp-section-title">cToon Offers</h2>
          <div v-for="o in offers" :key="o.id" class="cmp-offer">
            <p class="cmp-offer-meta">
              <span v-if="o.myClaim">You claimed this offer.</span>
              <span v-else-if="o.status !== 'OPEN'">This offer has closed.</span>
              <span v-else-if="!eligible">Join this cMoon to claim a reward here.</span>
              <span v-else>Pick one — you'll get {{ o.quantityPerMember }} cop{{ o.quantityPerMember === 1 ? 'y' : 'ies' }}.</span>
            </p>
            <div class="cmp-grid">
              <button
                v-for="opt in o.options" :key="opt.id"
                type="button"
                class="cmp-card cmp-offer-option"
                :class="{
                  'cmp-offer-option--picked': o.myClaim && o.myClaim.optionId === opt.id,
                  'cmp-offer-option--selected': !o.myClaim && offerSelections[o.id] === opt.id,
                }"
                :disabled="!!o.myClaim || o.status !== 'OPEN' || !eligible || offerClaiming[o.id]"
                @click="offerSelections[o.id] = opt.id"
              >
                <img :src="opt.assetPath" :alt="opt.name" class="cmp-card-img" loading="lazy" />
                <span class="cmp-card-name">{{ opt.name }}</span>
                <span v-if="o.myClaim && o.myClaim.optionId === opt.id" class="cmp-offer-picked-badge">Your pick</span>
              </button>
            </div>
            <button
              v-if="!o.myClaim && o.status === 'OPEN' && eligible"
              type="button"
              class="cmp-offer-claim-btn"
              :disabled="!offerSelections[o.id] || offerClaiming[o.id]"
              @click="claimOffer(o)"
            >{{ offerClaiming[o.id] ? 'Claiming…' : 'Claim' }}</button>
            <p v-if="offerErrors[o.id]" class="cmp-offer-error">{{ offerErrors[o.id] }}</p>
          </div>
        </template>

        <div class="cmp-image-wrap">
          <img
            v-if="cmoon.pageImagePath"
            :src="cmoon.pageImagePath"
            :alt="`${cmoon.name} cMoon`"
            class="cmp-image"
          />
          <div v-else class="cmp-image-placeholder">No image uploaded yet</div>
        </div>

        <p v-if="cmoon.pageDescription" class="cmp-description">{{ cmoon.pageDescription }}</p>

        <h2 class="cmp-section-title">cToons ({{ cmoon.ctoonCount.toLocaleString() }})</h2>
        <div v-if="!cmoon.ctoons.length" class="cmp-empty">No cToons are displayed under this cMoon yet.</div>
        <div v-else class="cmp-grid">
          <button
            v-for="c in cmoon.ctoons"
            :key="c.id"
            type="button"
            class="cmp-card"
            @click="openInfo(c)"
          >
            <img :src="c.assetPath" :alt="c.name" class="cmp-card-img" loading="lazy" />
            <span class="cmp-card-name">{{ c.name }}</span>
          </button>
        </div>
        <p v-if="cmoon.ctoonsTruncated" class="cmp-truncated-note">
          Showing the first {{ cmoon.ctoons.length.toLocaleString() }} of {{ cmoon.ctoonCount.toLocaleString() }} cToons.
        </p>

        <template v-if="cmoon.captains.length">
          <h2 class="cmp-section-title">Captains</h2>
          <div class="cmp-captains">
            <NuxtLink
              v-for="name in cmoon.captains" :key="name"
              :to="`/newsite/czone/${name}`"
              class="cmp-captain-link"
            >{{ name }}</NuxtLink>
          </div>
        </template>

        <template v-if="cmoon.prizeCtoons.length">
          <h2 class="cmp-section-title">Prize cToons</h2>
          <div class="cmp-grid">
            <div v-for="(p, i) in cmoon.prizeCtoons" :key="i" class="cmp-card cmp-card--static">
              <img v-if="p.assetPath" :src="p.assetPath" :alt="p.name" class="cmp-card-img" loading="lazy" />
              <span class="cmp-card-name">{{ p.name }} × {{ p.quantity }}</span>
            </div>
          </div>
        </template>

        <h2 class="cmp-section-title">Top Members</h2>
        <div v-if="!cmoon.topMembers.length" class="cmp-empty">No members yet.</div>
        <div v-else class="cmp-members">
          <NuxtLink
            v-for="m in cmoon.topMembers" :key="m.username"
            :to="`/newsite/czone/${m.username}`"
            class="cmp-member"
          >
            <img :src="`/avatars/${m.avatar || 'default.png'}`" class="cmp-member-avatar" alt="" />
            <span class="cmp-member-name">{{ m.username }}</span>
            <span class="cmp-member-points">{{ m.points.toLocaleString() }} pts</span>
          </NuxtLink>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { cMoonPaletteStyle } from '@/utils/cmoonPalette'
import { useCtoonModal } from '@/composables/useCtoonModal'

const route = useRoute()
const { open: openCtoonModal } = useCtoonModal()

const loading = ref(true)
const error = ref('')
const cmoon = ref(null)

const offers = ref([])
const eligible = ref(false)
const offerSelections = reactive({})
const offerClaiming = reactive({})
const offerErrors = reactive({})

const paletteStyle = computed(() => cmoon.value ? cMoonPaletteStyle(cmoon.value.color) : {})

useHead({
  title: computed(() => cmoon.value ? `${cmoon.value.name} · cMoon` : 'cMoon')
})

function openInfo(c) {
  openCtoonModal({ ctoonId: c.id, assetPath: c.assetPath, name: c.name })
}

async function loadOffers(id) {
  try {
    const res = await $fetch(`/api/cmoon/${encodeURIComponent(id)}/dispersal-offers`)
    offers.value = res.offers || []
    eligible.value = !!res.eligible
  } catch {
    offers.value = []
    eligible.value = false
  }
}

async function claimOffer(offer) {
  const optionId = offerSelections[offer.id]
  if (!optionId || offerClaiming[offer.id]) return
  const opt = offer.options.find(o => o.id === optionId)
  if (!confirm(`Claim ${opt?.name || 'this cToon'}? This can't be changed once claimed.`)) return
  offerClaiming[offer.id] = true
  offerErrors[offer.id] = ''
  try {
    const res = await $fetch(`/api/cmoon/${encodeURIComponent(cmoon.value.id)}/dispersal-offers/${offer.id}/claim`, {
      method: 'POST',
      body: { optionId },
    })
    offer.myClaim = { optionId: res.optionId, status: 'QUEUED', quantityMinted: 0, quantity: res.quantity }
  } catch (err) {
    offerErrors[offer.id] = err?.data?.statusMessage || 'Failed to claim'
  } finally {
    offerClaiming[offer.id] = false
  }
}

async function load(id) {
  if (!id) return
  loading.value = true
  error.value = ''
  try {
    cmoon.value = await $fetch(`/api/cmoon/${encodeURIComponent(id)}`)
    await loadOffers(id)
  } catch (err) {
    cmoon.value = null
    error.value = err?.data?.statusMessage || 'Failed to load this cMoon.'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, (id) => load(id), { immediate: true })
</script>

<style scoped>
.cmp-wrap {
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
}

.cmp-status {
  padding: 24px 16px;
  color: #ffffff;
  font-size: 0.95rem;
}
.cmp-status--error { color: #fca5a5; }

.cmp-banner {
  background: var(--cm-banner, var(--OrbitDarkBlue));
  color: var(--cm-banner-text, #ffffff);
  padding: 18px 16px;
}

.cmp-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.cmp-member-count {
  margin: 4px 0 0;
  font-size: 0.8rem;
  opacity: 0.85;
}

.cmp-body {
  padding: 16px;
  background: var(--cm-bg, transparent);
  color: var(--cm-text, #ffffff);
  box-sizing: border-box;
}

.cmp-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}
.cmp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cmp-stat-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}
.cmp-stat-value {
  font-size: 1.3rem;
  font-weight: 800;
}

/* 800x600 (4:3), same resolution as a cZone background. */
.cmp-image-wrap {
  width: 100%;
  max-width: 800px;
  aspect-ratio: 4 / 3;
  margin: 0 auto 16px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
}
@supports not (aspect-ratio: 4 / 3) {
  .cmp-image-wrap { height: 0; padding-bottom: 75%; position: relative; }
  .cmp-image-wrap .cmp-image,
  .cmp-image-wrap .cmp-image-placeholder { position: absolute; inset: 0; }
}

.cmp-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cmp-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
  font-size: 0.9rem;
}

.cmp-description {
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 20px;
}

.cmp-section-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 10px;
}

.cmp-empty {
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
  font-size: 0.9rem;
}

.cmp-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

@media (max-width: 768px) {
  .cmp-grid { grid-template-columns: repeat(2, 1fr); }
}

.cmp-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  border: none;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  color: var(--cm-text, #ffffff);
  font-family: inherit;
  /* Real touch target on top of whatever internal padding the image adds. */
  min-height: 44px;
  box-sizing: border-box;
}
.cmp-card:hover { opacity: 0.85; }
.cmp-card:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-card-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.cmp-card-name {
  font-size: 0.75rem;
  text-align: center;
  overflow-wrap: anywhere;
}

.cmp-truncated-note {
  margin-top: 12px;
  font-size: 0.8rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-card--static {
  cursor: default;
}
.cmp-card--static:hover { opacity: 1; }

.cmp-offer {
  margin-bottom: 24px;
}

.cmp-offer-meta {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: var(--cm-text-muted, rgba(255,255,255,0.6));
}

.cmp-offer-option {
  border: 2px solid transparent;
  position: relative;
}
.cmp-offer-option:disabled {
  cursor: default;
  opacity: 0.55;
}
.cmp-offer-option:disabled:hover { opacity: 0.55; }

.cmp-offer-option--selected {
  border-color: var(--cm-focus-ring, var(--OrbitLightBlue));
  opacity: 1;
}

.cmp-offer-option--picked {
  border-color: #22c55e;
  opacity: 1 !important;
}

.cmp-offer-picked-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: #22c55e;
}

.cmp-offer-claim-btn {
  margin-top: 10px;
  min-height: 44px;
  padding: 0 20px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: var(--cm-banner, var(--OrbitLightBlue));
  color: var(--cm-banner-text, #ffffff);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.cmp-offer-claim-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.cmp-offer-claim-btn:not(:disabled):hover { opacity: 0.9; }

.cmp-offer-error {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: #fca5a5;
}

.cmp-captains {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 20px;
}

.cmp-captain-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
  color: var(--cm-link-text, #ffffff);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 600;
}
.cmp-captain-link:hover { opacity: 0.85; }
.cmp-captain-link:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}

.cmp-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--cm-link-text, #ffffff);
  min-width: 0;
}
.cmp-member:hover { background: var(--cm-tile-bg, rgba(255,255,255,0.08)); }
.cmp-member:focus-visible { outline: 2px solid var(--cm-focus-ring, var(--OrbitLightBlue)); outline-offset: 1px; }

.cmp-member-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--cm-tile-bg, rgba(255,255,255,0.08));
}

.cmp-member-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  font-weight: 600;
}

.cmp-member-points {
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 700;
}

@media (max-width: 480px) {
  .cmp-stats { gap: 16px; }
}
</style>
