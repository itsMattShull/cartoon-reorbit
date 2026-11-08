<template>
  <!-- Same Teleport-to-body reason as CMoonAffinityLadderModal/CMoonRewardModal — .site-container's
       desktop transform:scale() makes it the containing block for position:fixed descendants. -->
  <Teleport to="body">
    <div class="brm-overlay" role="dialog" aria-modal="true" aria-labelledby="brm-title" @click.self="$emit('close')">
      <div class="brm-card">
        <div class="brm-header">
          <h2 id="brm-title" class="brm-title">Battle Report</h2>
          <button ref="closeBtn" type="button" class="brm-close" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <div class="brm-boss">
          <div class="brm-boss-art">
            <img v-if="enemyImagePath" :src="enemyImagePath" alt="" class="brm-boss-img" />
            <span v-else class="brm-boss-fallback">👾</span>
          </div>
          <div class="brm-boss-stats">
            <p class="brm-boss-name">{{ report.boss.name }}</p>
            <p class="brm-boss-hp">{{ report.boss.hpRemaining.toLocaleString() }}/{{ report.boss.maxHp.toLocaleString() }} HP · {{ report.rounds }} round{{ report.rounds === 1 ? '' : 's' }}</p>
            <div class="brm-boss-grid">
              <div><span class="brm-stat-label">Dealt to party</span><span class="brm-stat-value">{{ report.boss.damageDealt.toLocaleString() }}</span></div>
              <div><span class="brm-stat-label">Taken from party</span><span class="brm-stat-value">{{ report.boss.damageTaken.toLocaleString() }}</span></div>
              <div><span class="brm-stat-label">Hits landed</span><span class="brm-stat-value">{{ report.boss.hitsLanded }}{{ report.boss.critsLanded ? ` (${report.boss.critsLanded} crit)` : '' }}</span></div>
              <div><span class="brm-stat-label">Specials used</span><span class="brm-stat-value">{{ report.boss.specialsUsed }}</span></div>
            </div>
          </div>
        </div>

        <p class="brm-leaderboard-title">
          Leaderboard
          <span v-if="tableScrollable" class="brm-scroll-hint">swipe to see more →</span>
        </p>
        <div class="brm-table-wrap" :class="{ 'brm-table-wrap--scrollable': tableScrollable }" ref="tableWrap">
          <table class="brm-table">
            <thead>
              <tr>
                <th class="brm-col-rank">#</th>
                <th class="brm-col-name">Player</th>
                <th>Score</th>
                <th>Dealt</th>
                <th>Taken</th>
                <th>Ults</th>
                <th>Blocks</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in report.leaderboard" :key="row.userId"
                :class="{ 'brm-row-me': row.userId === myUserId, 'brm-row-ko': row.knockedOut }"
              >
                <td class="brm-col-rank">{{ i + 1 }}{{ medal(i) }}</td>
                <td class="brm-col-name">
                  {{ row.username || 'Unknown' }}
                  <span v-if="row.userId === myUserId" class="brm-you-tag">(you)</span>
                  <span v-if="row.knockedOut" class="brm-ko-tag" title="Knocked out">💀</span>
                </td>
                <td class="brm-num">{{ row.score.toLocaleString() }}</td>
                <td class="brm-num">{{ row.damageDealt.toLocaleString() }}</td>
                <td class="brm-num">{{ row.damageTaken.toLocaleString() }}</td>
                <td class="brm-num">{{ row.specialsUsed }}</td>
                <td class="brm-num">{{ row.hitsBlocked }}</td>
              </tr>
              <tr v-if="!report.leaderboard.length">
                <td colspan="7" class="brm-empty">No round data was recorded for this raid.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="brm-footnote">Score rewards damage dealt, with bonus credit for specials fired and attacks blocked.</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// "Click to view battle report" — opened from the RESOLVED block of pages/newsite/cmoon-raid/
// [id].vue. Purely a read-only view over raid.battleReport (see buildRaidBattleReport in
// server/utils/cmoonRaidBattleReport.js, attached server-side once a raid resolves) — no request
// of its own.
import { onMounted, onBeforeUnmount, nextTick, ref } from 'vue'

defineProps({
  report: { type: Object, required: true },
  enemyImagePath: { type: String, default: null },
  myUserId: { type: String, default: null },
})
const emit = defineEmits(['close'])

const closeBtn = ref(null)
// Seven columns is more than a narrow phone's card width can show at once (see this component's
// own .brm-table-wrap/overflow-x comment) — the table scrolls horizontally in that case, but a
// bare `overflow-x: auto` gives mouse/trackpad users on desktop (and some OSes' auto-hiding
// scrollbars) no visible cue that there's more to see. Measured once on mount/resize rather than
// assumed from viewport width, since the real trigger is "does this table's content actually
// exceed the wrapper," not a fixed breakpoint.
const tableWrap = ref(null)
const tableScrollable = ref(false)
function checkScrollable() {
  const el = tableWrap.value
  tableScrollable.value = !!el && el.scrollWidth > el.clientWidth + 1
}
let resizeObserver = null

function medal(i) {
  return i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : ''
}

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  closeBtn.value?.focus()
  await nextTick()
  checkScrollable()
  if (typeof ResizeObserver !== 'undefined' && tableWrap.value) {
    resizeObserver = new ResizeObserver(checkScrollable)
    resizeObserver.observe(tableWrap.value)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.brm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  background: rgba(10, 14, 22, 0.82);
  backdrop-filter: blur(2px);
  box-sizing: border-box;
}

.brm-card {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  max-height: 85dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: linear-gradient(160deg, #00111f 0%, #003466 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

.brm-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.brm-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
}

.brm-close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  font-size: 1rem;
  cursor: pointer;
}
.brm-close:hover,
.brm-close:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  outline: none;
}

.brm-boss {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  margin-bottom: 14px;
}

.brm-boss-art {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.brm-boss-img { width: 100%; height: 100%; object-fit: contain; }
.brm-boss-fallback { font-size: 1.6rem; }

.brm-boss-stats { flex: 1; min-width: 0; }
.brm-boss-name { margin: 0; font-weight: 800; font-size: 0.95rem; word-break: break-word; }
.brm-boss-hp { margin: 2px 0 6px; font-size: 0.75rem; color: rgba(255, 255, 255, 0.65); }

.brm-boss-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}
.brm-stat-label { display: block; font-size: 0.65rem; color: rgba(255, 255, 255, 0.55); text-transform: uppercase; letter-spacing: 0.02em; }
.brm-stat-value { display: block; font-size: 0.85rem; font-weight: 700; }

.brm-leaderboard-title {
  margin: 0 0 6px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.7);
}

.brm-scroll-hint {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
}

.brm-table-wrap {
  position: relative;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  /* Visible, non-overlay scrollbar — some OS/browser combos (notably macOS trackpad mode) hide
     overflow scrollbars until actively scrolled, which otherwise leaves a cut-off table with no
     cue there's more; a thin always-on bar plus the swipe hint above covers both cases. */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
}
.brm-table-wrap::-webkit-scrollbar { height: 6px; }
.brm-table-wrap::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 999px; }
.brm-table-wrap::-webkit-scrollbar-track { background: transparent; }
/* A soft right-edge fade while there's unscrolled content — a static, always-present reminder
   that the scrollbar styling above might still be missed at a glance. */
.brm-table-wrap--scrollable::after {
  content: '';
  position: sticky;
  float: right;
  top: 0;
  right: 0;
  width: 18px;
  height: 100%;
  margin-left: -18px;
  pointer-events: none;
  background: linear-gradient(to right, transparent, rgba(0, 17, 31, 0.55));
}

.brm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  white-space: nowrap;
}

.brm-table thead th {
  text-align: right;
  padding: 7px 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  font-weight: 700;
}
.brm-table thead th.brm-col-rank,
.brm-table thead th.brm-col-name { text-align: left; }

.brm-table tbody td {
  padding: 7px 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.brm-table tbody tr.brm-row-me { background: rgba(51, 153, 204, 0.16); }
.brm-table tbody tr.brm-row-ko { opacity: 0.7; }

.brm-col-rank { width: 30px; }
.brm-col-name { text-align: left; min-width: 88px; }
.brm-num { text-align: right; font-variant-numeric: tabular-nums; }

.brm-you-tag { font-size: 0.68rem; color: rgba(255, 255, 255, 0.55); margin-left: 3px; }
.brm-ko-tag { margin-left: 3px; }

.brm-empty { text-align: center; color: rgba(255, 255, 255, 0.55); padding: 14px 8px; }

.brm-footnote {
  margin: 10px 0 0;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.5);
}

@media (min-width: 640px) {
  .brm-card { padding: 24px; }
}
</style>
