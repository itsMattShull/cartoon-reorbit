<!-- components/oggtoons/OgGtoonMatchIntro.vue -->
<!-- The pre-match screen of an Original gToons match, shown to both players for the first 10 seconds in the
     main content area: each player's goal card on either side (you on the left), how this game will be
     decided in the middle, and a countdown to the first round. On mobile it stacks into one column. -->
<template>
  <section class="og-intro" aria-live="polite" aria-label="Match starting">
    <div class="og-intro-stage">
      <!-- You (left on desktop) -->
      <article class="og-ic og-ic-you" :aria-label="`Your goal card: ${you.card?.name || 'none'}`">
        <div class="og-ic-frame">
          <div class="og-ic-panel">
            <div class="og-ic-art" :style="{ '--ring': colorHex(you.color) }">
              <GtoonCard
                v-if="you.card?.assetPath"
                :key="'you-' + (you.card.ctoonId || you.card.name)"
                :image-url="you.card.assetPath"
                :value="you.card.value"
                :color="you.card.color"
                :card-style="you.card.cardStyle"
                :seed="String(you.card.ctoonId || you.card.name)"
                :alt="you.card.name"
                effects="static"
              />
              <span v-else class="og-ic-none">—</span>
            </div>
            <div class="og-ic-text">
              <p class="og-ic-glyphs" :aria-label="typeLabel(you.card)">
                <span v-for="t in typeList(you.card)" :key="t" :title="ogTitleCase(t)">{{ typeGlyph(t) }}</span>
              </p>
              <h3 class="og-ic-name">{{ you.card?.name || 'No goal card' }}</h3>
              <p class="og-ic-power">{{ you.card ? (you.card.power || 'No power') : 'This deck has no target color.' }}</p>
            </div>
          </div>
        </div>
        <footer class="og-ic-foot">
          <div class="og-ic-deck" :title="`${deckSize} gToons in the deck`" aria-hidden="true">
            <i class="og-ic-letter">A</i>
            <span class="og-ic-bars"><b v-for="n in deckSize" :key="n"></b></span>
            <i class="og-ic-count">{{ deckSize }}</i>
          </div>
          <div class="og-ic-who">
            <svg class="og-ic-avatar" viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true">
              <rect width="5" height="5" fill="#e6edf3" />
              <rect v-for="(c, i) in avatarCells(you.name)" :key="i" :x="c.x" :y="c.y" width="1" height="1" :fill="avatarColor(you.name)" />
            </svg>
            <span class="og-ic-user">{{ you.name }}</span>
          </div>
        </footer>
      </article>

      <!-- How this game is decided + countdown -->
      <div class="og-mid">
        <div class="og-mid-frame">
          <div class="og-mid-panel">
            <h2 class="og-mid-title">{{ scenario.title }}</h2>
            <div v-if="scenario.colors.length" class="og-mid-colors" :aria-label="scenario.colors.map(ogTitleCase).join(' and ')">
              <span v-for="c in scenario.colors" :key="c" class="og-mid-chip"><i :style="{ background: colorHex(c) }"></i>{{ ogTitleCase(c) }}</span>
            </div>
            <p v-for="(line, i) in scenario.lines" :key="i" class="og-mid-text">{{ line }}</p>
          </div>
        </div>
        <div class="og-pill" role="timer">
          <template v-if="seconds > 0">Match starts in <strong>{{ seconds }}</strong></template>
          <template v-else>Let's play!</template>
        </div>
      </div>

      <!-- Opponent (right on desktop) -->
      <article class="og-ic og-ic-opp" :aria-label="`${opponent.name}'s goal card: ${opponent.card?.name || 'none'}`">
        <div class="og-ic-frame">
          <div class="og-ic-panel">
            <div class="og-ic-art" :style="{ '--ring': colorHex(opponent.color) }">
              <GtoonCard
                v-if="opponent.card?.assetPath"
                :key="'opp-' + (opponent.card.ctoonId || opponent.card.name)"
                :image-url="opponent.card.assetPath"
                :value="opponent.card.value"
                :color="opponent.card.color"
                :card-style="opponent.card.cardStyle"
                :seed="String(opponent.card.ctoonId || opponent.card.name)"
                :alt="opponent.card.name"
                effects="static"
              />
              <span v-else class="og-ic-none">—</span>
            </div>
            <div class="og-ic-text">
              <p class="og-ic-glyphs" :aria-label="typeLabel(opponent.card)">
                <span v-for="t in typeList(opponent.card)" :key="t" :title="ogTitleCase(t)">{{ typeGlyph(t) }}</span>
              </p>
              <h3 class="og-ic-name">{{ opponent.card?.name || 'No goal card' }}</h3>
              <p class="og-ic-power">{{ opponent.card ? (opponent.card.power || 'No power') : 'This deck has no target color.' }}</p>
            </div>
          </div>
        </div>
        <footer class="og-ic-foot">
          <div class="og-ic-deck" :title="`${deckSize} gToons in the deck`" aria-hidden="true">
            <i class="og-ic-letter">A</i>
            <span class="og-ic-bars"><b v-for="n in deckSize" :key="n"></b></span>
            <i class="og-ic-count">{{ deckSize }}</i>
          </div>
          <div class="og-ic-who">
            <svg class="og-ic-avatar" viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true">
              <rect width="5" height="5" fill="#e6edf3" />
              <rect v-for="(c, i) in avatarCells(opponent.name)" :key="i" :x="c.x" :y="c.y" width="1" height="1" :fill="avatarColor(opponent.name)" />
            </svg>
            <span class="og-ic-user">{{ opponent.name }}</span>
          </div>
        </footer>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import GtoonCard from '@/components/GtoonCard.vue'
import { ogTitleCase, OG_TYPE_GLYPHS } from '@/utils/ogGtoonLabels'
import { introScenario, avatarCells, avatarColor } from '@/utils/ogGtoonIntro'

const props = defineProps({
  // { name, color, card } for each side: color = the goal colour, card = the goal card view (or null).
  you: { type: Object, required: true },
  opponent: { type: Object, required: true },
  // Whole seconds left on the countdown.
  seconds: { type: Number, default: 0 },
  deckSize: { type: Number, default: 12 }
})

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
const colorHex = (c) => COLOR_HEX[c] || '#9bb3cb'

const scenario = computed(() => introScenario([props.you.color, props.opponent.color]))

const typeList = (card) => [card?.type1, card?.type2, card?.type3].filter(t => t && OG_TYPE_GLYPHS[t])
const typeGlyph = (t) => OG_TYPE_GLYPHS[t]
const typeLabel = (card) => typeList(card).map(ogTitleCase).join(', ')
</script>

<style scoped>
/* ── Desktop: three columns in the main content area, like the match-start mock-up ── */
.og-intro {
  container-type: size; width: 100%; height: 100%; min-height: 0; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; padding: 12px; color: #a9f0ff;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
.og-intro-stage {
  /* Card height follows the space available; every other size is derived from it. */
  --h: min(86cqh, 560px);
  --w: calc(var(--h) * .42);
  display: flex; align-items: center; justify-content: center; gap: calc(var(--h) * .05); max-width: 100%;
}

/* Glass-silver frame shared by the goal cards and the middle box */
.og-ic-frame, .og-mid-frame {
  background: linear-gradient(90deg, #a3bccf 0%, #d6e5f0 45%, #a3bccf 100%);
  padding: calc(var(--h) * .028);
}
.og-ic-panel, .og-mid-panel {
  background: linear-gradient(180deg, #2c6aa6 0%, #20528e 55%, #173b70 100%);
  border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .25);
}

/* Goal cards: slope up toward the middle, mirrored for the opponent */
.og-ic { width: var(--w); height: var(--h); display: flex; flex-direction: column; flex: 0 0 auto; border-radius: 10px; overflow: hidden; background: #b9cddd; box-shadow: 0 6px 18px rgba(0, 0, 0, .35); }
.og-ic-you { clip-path: polygon(0 12%, 100% 0, 100% 100%, 0 100%); }
.og-ic-opp { clip-path: polygon(0 0, 100% 12%, 100% 100%, 0 100%); }
.og-ic-frame { flex: 1 1 auto; min-height: 0; display: flex; padding-top: calc(var(--h) * .1); }
.og-ic-panel { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: calc(var(--h) * .03); padding: calc(var(--h) * .04) calc(var(--w) * .06); min-width: 0; text-align: center; }
.og-ic-art { width: 74%; aspect-ratio: 1; flex: 0 0 auto; border-radius: 50%; padding: 3%; background: radial-gradient(circle, rgba(255, 255, 255, .2), rgba(255, 255, 255, 0) 70%); box-shadow: 0 0 0 3px var(--ring, #9bb3cb), 0 0 14px color-mix(in srgb, var(--ring, #9bb3cb) 55%, transparent); position: relative; }
.og-ic-none { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: #7fa5cc; }
.og-ic-text { display: flex; flex-direction: column; align-items: center; gap: calc(var(--h) * .02); min-width: 0; width: 100%; }
.og-ic-glyphs { margin: 0; display: flex; gap: .5rem; justify-content: center; min-height: 1.1em; font-size: calc(var(--h) * .04); line-height: 1; color: #eaffff; }
.og-ic-name { margin: calc(var(--h) * .015) 0 0; font-size: calc(var(--h) * .033); font-style: italic; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
.og-ic-power { margin: calc(var(--h) * .02) 0 0; font-size: calc(var(--h) * .029); font-style: italic; font-weight: 600; line-height: 1.25; color: #bff6ff; overflow-wrap: anywhere; }

/* Footer: deck meter + player */
.og-ic-foot { flex: 0 0 auto; display: flex; flex-direction: column; color: #6f8aa8; }
.og-ic-deck { display: flex; align-items: center; gap: 5px; padding: calc(var(--h) * .012) calc(var(--w) * .07); background: #7f9db9; color: #eaf3fa; }
.og-ic-letter, .og-ic-count { font-style: italic; font-weight: 800; font-size: calc(var(--h) * .03); line-height: 1; }
.og-ic-bars { flex: 1 1 auto; display: flex; gap: 2px; min-width: 0; }
.og-ic-bars b { flex: 1 1 0; height: calc(var(--h) * .035); border-radius: 3px; background: #edf3f8; }
.og-ic-who { display: flex; align-items: center; gap: 8px; padding: calc(var(--h) * .014) calc(var(--w) * .07); background: linear-gradient(90deg, #bfd1e0, #dbe8f2 50%, #bfd1e0); min-height: calc(var(--h) * .105); }
.og-ic-avatar { width: calc(var(--h) * .092); height: calc(var(--h) * .092); flex: 0 0 auto; display: block; }
.og-ic-user { min-width: 0; font-size: calc(var(--h) * .026); font-style: italic; font-weight: 700; line-height: 1.15; color: #7390b0; overflow-wrap: anywhere; }

/* Middle: how the game is decided + the countdown pill */
.og-mid { width: calc(var(--h) * .5); flex: 0 1 auto; display: flex; flex-direction: column; align-items: center; gap: calc(var(--h) * .05); min-width: 0; }
.og-mid-frame { width: 100%; border-radius: 10px; box-shadow: 0 6px 18px rgba(0, 0, 0, .35); }
.og-mid-panel { padding: calc(var(--h) * .05) calc(var(--h) * .035); text-align: center; display: flex; flex-direction: column; align-items: center; gap: calc(var(--h) * .025); }
.og-mid-title { margin: 0; font-size: calc(var(--h) * .046); font-style: italic; font-weight: 800; line-height: 1.12; text-transform: uppercase; color: #c9faff; }
.og-mid-colors { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.og-mid-chip { display: inline-flex; align-items: center; gap: 5px; font-size: calc(var(--h) * .024); font-weight: 800; font-style: italic; text-transform: uppercase; color: #eaffff; }
.og-mid-chip i { display: inline-block; width: calc(var(--h) * .03); height: calc(var(--h) * .03); border-radius: 50%; border: 2px solid rgba(255, 255, 255, .85); }
.og-mid-text { margin: 0; font-size: calc(var(--h) * .0225); font-style: italic; font-weight: 800; line-height: 1.3; text-transform: uppercase; color: #bff6ff; }
.og-pill {
  padding: calc(var(--h) * .018) calc(var(--h) * .06); border-radius: 999px; border: 3px solid #e8f1f8;
  background: linear-gradient(180deg, #2f6eab, #17457f); font-size: calc(var(--h) * .036); font-weight: 800; color: #fff; white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .35);
}
.og-pill strong { display: inline-block; min-width: 1.4ch; text-align: center; font-variant-numeric: tabular-nums; }

/* ── Mobile: one column — how it is decided and the countdown first, then both goal cards ── */
@media (max-width: 767px) {
  .og-intro { container-type: inline-size; height: auto; min-height: 0; padding: 12px 16px 16px; align-items: flex-start; }
  .og-intro-stage { --h: 100cqw; display: flex; flex-direction: column; align-items: stretch; gap: 12px; width: 100%; }
  .og-mid { order: 1; width: 100%; gap: 10px; }
  .og-ic-you { order: 2; }
  .og-ic-opp { order: 3; }
  .og-mid-panel { gap: 8px; padding: 14px 14px; }
  .og-mid-frame, .og-ic-frame { padding: 8px; }
  .og-mid-title { font-size: 1.15rem; }
  .og-mid-chip { font-size: .7rem; }
  .og-mid-chip i { width: 12px; height: 12px; }
  .og-mid-text { font-size: .68rem; }
  .og-pill { font-size: 1rem; padding: 6px 22px; }

  /* Goal cards become compact rows: art on the left, details on the right */
  .og-ic { width: 100%; height: auto; clip-path: none; }
  .og-ic-frame { padding-top: 8px; }
  .og-ic-panel { flex-direction: row; align-items: center; justify-content: flex-start; text-align: left; gap: 12px; padding: 10px 12px; }
  .og-ic-art { width: 28cqw; max-width: 120px; flex: 0 0 auto; }
  .og-ic-text { align-items: flex-start; flex: 1 1 auto; gap: 2px; }
  .og-ic-glyphs { justify-content: flex-start; font-size: 1rem; }
  .og-ic-name { margin: 0; font-size: 1rem; }
  .og-ic-power { margin: 2px 0 0; font-size: .8rem; }
  .og-ic-foot { flex-direction: row; }
  .og-ic-deck { flex: 1 1 50%; padding: 6px 10px; min-width: 0; }
  .og-ic-letter, .og-ic-count { font-size: .8rem; }
  .og-ic-bars b { height: 10px; }
  .og-ic-who { flex: 1 1 50%; padding: 6px 10px; min-height: 0; min-width: 0; }
  .og-ic-avatar { width: 26px; height: 26px; }
  .og-ic-user { font-size: .8rem; }
}
</style>
