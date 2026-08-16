<template>
  <!-- The layout comes from definePageMeta below; wrapping in <NuxtLayout> as well would
       render newsite-template inside itself, duplicating the whole header and nav. -->
  <div class="bj" ref="wrapper" :style="rootStyle">

    <!-- ── Loading ─────────────────────────────────────────────────────── -->
    <div v-if="loading" class="bj-center">
      <div class="bj-spinner" aria-label="Loading the table…"></div>
    </div>

    <!-- ── Mode select ─────────────────────────────────────────────────── -->
    <div v-else-if="screen === 'select'" class="bj-center">
      <div class="bj-card-panel">
        <p class="bj-eyebrow">Johnny Bravo deals</p>
        <h1 class="bj-title">ReOrbit<br />Blackjack</h1>

        <p class="bj-sub">
          Heads-up against the man himself. Dealer stands on all 17s, blackjack pays
          {{ rules.payoutNum }}:{{ rules.payoutDen }}.
        </p>

        <p v-if="autoCashedOut > 0" class="bj-notice">
          Your table was cashed out at the daily reset —
          <strong>{{ autoCashedOut.toLocaleString() }}</strong> points are back in your balance.
        </p>

        <!-- Two distinct buttons, never a toggle: a toggle is how people wager by accident. -->
        <button class="bj-btn bj-btn--go bj-btn--block" @click="startPractice" :disabled="busy">
          Practice
        </button>
        <p class="bj-btn-note">Free chips, no points at stake. Play as long as you like.</p>

        <button
          class="bj-btn bj-btn--gold bj-btn--block"
          @click="openBuyIn"
          :disabled="busy || buyInLeft < rules.minBet"
        >
          Play for Points
        </button>
        <p class="bj-btn-note">
          <template v-if="buyInLeft >= rules.minBet">
            Up to <strong>{{ buyInLeft.toLocaleString() }}</strong> more points today ·
            win limit {{ daily.winLimit.toLocaleString() }}
          </template>
          <template v-else>
            You've used today's buy-in. Resets {{ resetLabel }}.
          </template>
        </p>

        <button class="bj-link" @click="showRules = true">How to play</button>
      </div>
    </div>

    <!-- ── The table ───────────────────────────────────────────────────── -->
    <template v-else>
      <!-- HUD. Two live regions, not one: card draws are polite, money is assertive. -->
      <div class="bj-hud">
        <div class="bj-hud-item">
          <span class="bj-hud-label">Chips</span>
          <span class="bj-hud-value">{{ chips.toLocaleString() }}</span>
        </div>
        <div class="bj-hud-item">
          <span class="bj-hud-label">Bet</span>
          <span class="bj-hud-value">{{ (wagered || pendingBet).toLocaleString() }}</span>
        </div>
        <div class="bj-hud-item bj-hud-item--mode">
          <span class="bj-hud-label">Mode</span>
          <span class="bj-hud-value" :class="isGamble ? 'is-gamble' : 'is-practice'">
            {{ isGamble ? 'POINTS' : 'PRACTICE' }}
          </span>
        </div>
        <div v-if="isGamble" class="bj-hud-item">
          <span class="bj-hud-label">Today</span>
          <span class="bj-hud-value" :class="daily.netWinnings >= 0 ? 'is-up' : 'is-down'">
            {{ daily.netWinnings >= 0 ? '+' : '' }}{{ daily.netWinnings.toLocaleString() }}
          </span>
        </div>
      </div>

      <!-- The scene. Everything inside is positioned as a share of this box, so it
           shrinks to fit rather than overflowing or being clipped. -->
      <div
        class="bj-scene"
        :class="[isGamble ? 'is-gamble' : 'is-practice', { 'no-cast': !showSpectators }]"
        :style="sceneStyle"
        ref="scene"
      >
        <div class="bj-room" aria-hidden="true"></div>

        <!-- The table is a real drawing rather than a CSS ellipse. The characters sit behind
             it in the stacking order, so its far edge cuts them off at the waist instead of
             them bleeding through a translucent shape.

             The cast and the hands both live inside this box rather than beside it. The box
             is exactly the size of the drawing, so a percentage in here names a fixed spot ON
             the table however the table is scaled. Positioning them against the scene instead
             let them drift off the table as the scene changed shape. -->
        <div class="bj-tablearea">
          <!-- The cast, before the table in source order and below it in z-index, so the table
               paints over their legs and cuts them off at the waist. A cutout whose feet you
               can see reads as clip-art; one cut off by furniture reads as someone standing
               behind a table.
               `v-if` rather than `display:none` — a hidden <img> still downloads, and these are
               decoration a phone should never pay for. -->
          <template v-if="showSpectators">
            <img src="/blackjack/samurai-jack.png" alt="" aria-hidden="true"
                 class="bj-char bj-char--jack" decoding="async" />
            <img src="/blackjack/grim.png" alt="" aria-hidden="true"
                 class="bj-char bj-char--grim" decoding="async" />
            <img src="/blackjack/courage.png" alt="" aria-hidden="true"
                 class="bj-char bj-char--courage" decoding="async" />
            <img src="/blackjack/johnny-bravo.png" alt="Johnny Bravo, dealing"
                 class="bj-char bj-char--johnny" decoding="async" />
          </template>

          <img src="/blackjack/table.png" alt="" aria-hidden="true" class="bj-table" decoding="async" />

          <!-- Dealer -->
          <div class="bj-row bj-row--dealer">
            <div class="bj-row-head">
              <img v-if="!showSpectators" src="/blackjack/johnny-avatar.png" alt="Johnny Bravo"
                   class="bj-avatar" decoding="async" />
              <span class="bj-row-name">Johnny</span>
              <span v-if="hand && dealerCards.length" class="bj-total"
                    :class="{ 'is-bust': hand.dealer.busted && dealComplete }">
                {{ shownDealerTotal }}<template v-if="dealerBackShown"> +</template>
              </span>
            </div>
            <div class="bj-fan">
              <BjCard
                v-for="(card, i) in dealerCards" :key="'d' + i" :card="card" :index="i"
                :flipping="i === 1 && flippingHole"
              />
              <div v-if="dealerBackShown" class="bj-card bj-card--back" :style="fanStyle(dealerCards.length)"></div>
            </div>
          </div>

          <!-- Player. Split hands resolve one at a time, so the active hand is shown full
               size and the other collapses to a summary strip — smaller AND clearer than
               two half-size hands on a phone. -->
          <div class="bj-row bj-row--player">
            <div v-if="inactiveHand" class="bj-otherhand">
              Hand {{ inactiveHand.index + 1 }} · {{ inactiveHand.total }} ·
              bet {{ inactiveHand.bet }}
              <span v-if="inactiveHand.busted">· bust</span>
            </div>
            <div class="bj-row-head">
              <span class="bj-row-name">
                You<template v-if="hand && hand.hands.length > 1"> · hand {{ activeHand.index + 1 }}</template>
              </span>
              <span v-if="activeHand && playerCards.length" class="bj-total"
                    :class="{ 'is-bust': activeHand.busted && dealComplete }">
                {{ shownPlayerTotal }}<template v-if="activeHand.soft && !activeHand.busted && dealComplete"> soft</template>
              </span>
            </div>
            <div class="bj-fan">
              <BjCard v-for="(card, i) in playerCards" :key="'p' + i" :card="card" :index="i" />
            </div>
          </div>
        </div>

        <!-- Johnny's line. Absolutely positioned so it can never add layout height. -->
        <transition name="bj-pop">
          <div v-if="bark" class="bj-bubble bj-bubble--johnny">{{ bark }}</div>
        </transition>

        <!-- The rail's line, anchored to whoever said it. On a phone the cast is not on
             screen, so the speaker is named instead of pointed at. -->
        <transition name="bj-pop">
          <div
            v-if="spectatorBark"
            class="bj-bubble bj-bubble--spectator"
            :class="showSpectators ? `bj-bubble--${spectatorBark.who}` : 'bj-bubble--named'"
          >
            <span v-if="!showSpectators" class="bj-bubble-who">{{ spectatorBark.name }}:</span>
            {{ spectatorBark.text }}
          </div>
        </transition>

        <!-- Outcome stamp -->
        <transition name="bj-stamp">
          <div v-if="stamp" class="bj-stampword" :class="'is-' + stamp.tone">{{ stamp.text }}</div>
        </transition>
      </div>

      <!-- Controls. Fixed height and reserved slots: nothing ever reflows under a thumb
           that is already moving, which matters most when money is on the table. -->
      <div class="bj-controls">
        <p class="bj-sr" role="status" aria-live="polite">{{ politeMessage }}</p>
        <p class="bj-sr" role="alert" aria-live="assertive">{{ assertiveMessage }}</p>

        <!-- Betting -->
        <div v-if="phase === 'betting'" class="bj-betting">
          <div class="bj-chiprow">
            <button
              v-for="d in chipDenoms" :key="d"
              class="bj-chip" :class="'bj-chip--' + d"
              :disabled="busy || pendingBet + d > maxBet"
              @click="addChip(d)"
              :aria-label="`Add ${d} to your bet`"
            >{{ d }}</button>
            <button class="bj-chip bj-chip--clear" :disabled="busy || !pendingBet" @click="pendingBet = 0">
              Clear
            </button>
          </div>
          <div class="bj-betbar">
            <button class="bj-btn bj-btn--ghost" :disabled="busy || !lastBet || lastBet > maxBet"
                    @click="pendingBet = toIncrement(Math.min(lastBet, maxBet))">Repeat</button>
            <button class="bj-btn bj-btn--gold bj-btn--wide"
                    :disabled="busy || dealing || pendingBet < rules.minBet" @click="deal">
              {{ pendingBet >= rules.minBet ? `Deal · ${pendingBet}` : `Min bet ${rules.minBet}` }}
            </button>
            <button class="bj-btn bj-btn--ghost" :disabled="busy || maxBet < rules.minBet"
                    @click="pendingBet = toIncrement(maxBet)">Max</button>
          </div>
          <div class="bj-actionrow bj-actionrow--secondary">
            <button class="bj-btn bj-btn--ghost bj-btn--sm" :disabled="busy" @click="leaveTable">
              Main Menu
            </button>
            <button v-if="isGamble" class="bj-btn bj-btn--ghost bj-btn--sm" :disabled="busy || !chips"
                    @click="showCashOut = true">Cash Out</button>
            <button v-else class="bj-btn bj-btn--ghost bj-btn--sm" :disabled="busy" @click="resetPractice">
              Reset Chips
            </button>
          </div>
        </div>

        <!-- Insurance gets its own moment rather than a sixth button in the action row. -->
        <div v-else-if="phase === 'insurance'" class="bj-insurance">
          <p class="bj-insurance-q">Dealer shows an Ace. Insurance for {{ Math.floor(hand.bet / 2) }}?</p>
          <div class="bj-actionrow">
            <button class="bj-btn bj-btn--go" :disabled="busy" @click="act('insurance')">Yes</button>
            <button class="bj-btn bj-btn--stop" :disabled="busy" @click="act('declineInsurance')">No thanks</button>
          </div>
        </div>

        <!-- Playing. Hit and Stand never move; the secondary row keeps its height whether
             or not its buttons are legal. -->
        <div v-else-if="phase === 'playing'" class="bj-playing">
          <div class="bj-actionrow">
            <button class="bj-btn bj-btn--go" :disabled="busy || !can('hit')" @click="act('hit')">Hit</button>
            <button class="bj-btn bj-btn--stop" :disabled="busy || !can('stand')" @click="act('stand')">Stand</button>
          </div>
          <div class="bj-actionrow bj-actionrow--secondary">
            <button class="bj-btn bj-btn--blue bj-btn--sm" :class="{ 'is-hidden': !can('double') }"
                    :disabled="busy || !can('double')" @click="act('double')">Double</button>
            <button class="bj-btn bj-btn--purple bj-btn--sm" :class="{ 'is-hidden': !can('split') }"
                    :disabled="busy || !can('split')" @click="act('split')">Split</button>
          </div>
        </div>

        <!-- Between hands -->
        <div v-else class="bj-playing">
          <div class="bj-actionrow">
            <button class="bj-btn bj-btn--gold bj-btn--wide" :disabled="busy" @click="nextHand">
              Next Hand
            </button>
          </div>
          <div class="bj-actionrow bj-actionrow--secondary">
            <button v-if="isGamble" class="bj-btn bj-btn--ghost bj-btn--sm" :disabled="busy"
                    @click="showCashOut = true">Cash Out</button>
            <button v-else class="bj-btn bj-btn--ghost bj-btn--sm" :disabled="busy" @click="resetPractice">
              Reset Chips
            </button>
            <button class="bj-btn bj-btn--ghost bj-btn--sm" :disabled="busy" @click="leaveTable">
              Main Menu
            </button>
          </div>
        </div>

        <!-- Out of chips -->
        <!-- "Below the minimum bet" is not the same as "out of chips": a player sitting on a
             few chips they cannot bet still has points to collect, and telling them they are
             out is both wrong and points them away from the one thing left to do. -->
        <div v-if="outOfChips" class="bj-broke">
          <template v-if="isGamble">
            <span v-if="chips > 0">
              {{ chips.toLocaleString() }} chips left — under the {{ rules.minBet }} minimum bet.
            </span>
            <span v-else>Out of chips.</span>
            <button v-if="chips > 0" class="bj-link" @click="showCashOut = true">
              Cash out {{ chips.toLocaleString() }}
            </button>
            <button v-else class="bj-link" :disabled="buyInLeft < rules.minBet" @click="openBuyIn">
              {{ buyInLeft >= rules.minBet ? `Buy in again (${buyInLeft} left today)` : 'Done for today' }}
            </button>
          </template>
          <template v-else>
            <span>Out of chips.</span>
            <button class="bj-link" @click="resetPractice">Reset the stack</button>
          </template>
        </div>
      </div>
    </template>

    <!-- ── Buy-in sheet ────────────────────────────────────────────────── -->
    <!-- Teleported to <body>: on a short phone the table box can be only ~300px tall, and a
         confirmation whose buttons are below the fold is worse than useless. As a fixed
         full-viewport layer the sheet always has room. Teleport (rather than position:fixed in
         place) is required because the layout puts a transform on an ancestor on wide screens,
         which would otherwise become the containing block for a fixed element. -->
    <Teleport to="body">
    <div v-if="showBuyIn" class="bj-modal" role="dialog" aria-modal="true" aria-label="Buy in">
      <div class="bj-sheet" ref="buyInSheet">
        <h2 class="bj-sheet-title">Buy In</h2>
        <p class="bj-sheet-line">
          Your balance: <strong>{{ points.toLocaleString() }}</strong> points
        </p>
        <p class="bj-sheet-line">
          You can move up to <strong>{{ buyInMax.toLocaleString() }}</strong> more points into
          chips today.
        </p>

        <div class="bj-chiprow bj-chiprow--sheet">
          <button v-for="a in buyInPresets" :key="a" class="bj-chip bj-chip--buyin"
                  :class="{ 'is-on': buyInAmount === a }" @click="buyInAmount = a">{{ a }}</button>
        </div>

        <!-- The arithmetic spelled out. A confirm button whose label doesn't name the
             consequence is not a confirmation. -->
        <p class="bj-sheet-math">
          You'll move <strong>{{ buyInAmount.toLocaleString() }}</strong> points into chips.<br />
          Balance: {{ points.toLocaleString() }} → {{ (points - buyInAmount).toLocaleString() }}
        </p>

        <label v-if="needsFirstTimeAck" class="bj-ack">
          <input type="checkbox" v-model="ackRisk" />
          <span>I understand these are real points and I can lose them.</span>
        </label>

        <div class="bj-sheet-actions">
          <button class="bj-btn bj-btn--ghost" @click="showBuyIn = false">Cancel</button>
          <button
            class="bj-btn bj-btn--gold"
            :disabled="busy || buyInAmount < rules.minBet || (needsFirstTimeAck && !ackRisk)"
            @click="confirmBuyIn"
          >Move {{ buyInAmount.toLocaleString() }} Points</button>
        </div>
      </div>
    </div>

    </Teleport>

    <!-- ── Cash-out sheet ──────────────────────────────────────────────── -->
    <Teleport to="body">
    <div v-if="showCashOut" class="bj-modal" role="dialog" aria-modal="true" aria-label="Cash out">
      <div class="bj-sheet">
        <h2 class="bj-sheet-title">Cash Out</h2>
        <p class="bj-sheet-math">
          Cash out <strong>{{ chips.toLocaleString() }}</strong> chips →
          <strong>{{ chips.toLocaleString() }}</strong> points?
        </p>
        <div class="bj-sheet-actions">
          <button class="bj-btn bj-btn--ghost" @click="showCashOut = false">Keep Playing</button>
          <button class="bj-btn bj-btn--gold" :disabled="busy" @click="confirmCashOut">
            Cash Out {{ chips.toLocaleString() }}
          </button>
        </div>
      </div>
    </div>

    </Teleport>

    <!-- ── Rules ───────────────────────────────────────────────────────── -->
    <Teleport to="body">
    <div v-if="showRules" class="bj-modal" role="dialog" aria-modal="true" aria-label="How to play">
      <div class="bj-sheet">
        <h2 class="bj-sheet-title">How to Play</h2>
        <ul class="bj-rules">
          <li>Get closer to 21 than Johnny without going over.</li>
          <li>Face cards are 10. An ace is 11, or 1 if that would bust you.</li>
          <li>Blackjack (an ace and a ten on the deal) pays {{ rules.payoutNum }}:{{ rules.payoutDen }}.</li>
          <li>Dealer {{ rules.dealerHitsSoft17 ? 'hits' : 'stands on' }} soft 17.</li>
          <li v-if="rules.allowDouble">Double your bet for exactly one more card.</li>
          <li v-if="rules.allowSplit">Split a pair into two hands, once per hand.</li>
          <li>The shoe is {{ rules.deckCount }} decks, reshuffled before every hand.</li>
        </ul>
        <p class="bj-sheet-note">
          In Practice the chips are free. In Points mode you can buy in for up to
          {{ daily.buyInLimit.toLocaleString() }} points a day, and the table closes out once
          you're {{ daily.winLimit.toLocaleString() }} ahead.
        </p>
        <div class="bj-sheet-actions">
          <button class="bj-btn bj-btn--gold" @click="showRules = false">Got It</button>
        </div>
      </div>
    </div>

    </Teleport>

    <div v-if="error" class="bj-error" role="alert">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, h } from 'vue'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  // The table has to fit its box without cropping on a 360x640 phone, and the layout's
  // sidebar and footer are ~77px of that budget. These are read from route meta — the props
  // some other game pages pass to <NuxtLayout> are ignored, since the layout declares none.
  showSidebar: false,
  showFooter: false,
  // Required, not cosmetic: measure() below shrinks the table by however much the
  // document overflows. On a page that is allowed to scroll, that correction never
  // converges and drives the table straight to its 300px floor.
  fitHeight: true,
  ssr: false,
  title: 'ReOrbit Blackjack',
  description: 'Play heads-up blackjack against Johnny Bravo in the Cartoon ReOrbit casino. Practice for free or wager points.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

// Pinch-zoom is deliberately NOT disabled here. The other arcade pages suppress it because a
// stray gesture ruins a reflex game; blackjack is turn-based, and someone zooming in to read a
// card corner is a legitimate thing to do.

// ── card component ────────────────────────────────────────────────────────────
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' }

function fanStyle (index) {
  return { '--i': index }
}

// Rendered inline rather than as a separate file: it is a dozen lines and only this page
// will ever use it.
const BjCard = (props) => h('div', {
  class: [
    'bj-card',
    (props.card.suit === 'H' || props.card.suit === 'D') ? 'is-red' : 'is-black',
    props.flipping ? 'is-flipping' : ''
  ],
  style: { '--i': props.index }
}, [
  h('span', { class: 'bj-card-rank' }, props.card.rank),
  h('span', { class: 'bj-card-suit' }, SUIT_GLYPH[props.card.suit] || '')
])
BjCard.props = ['card', 'index', 'flipping']

// ── state ─────────────────────────────────────────────────────────────────────
const wrapper = ref(null)
const scene = ref(null)
const buyInSheet = ref(null)

const loading = ref(true)
const busy = ref(false)
const error = ref('')

const screen = ref('select')      // select | table
const mode = ref(null)            // practice | gamble
const chips = ref(0)
const wagered = ref(0)
const points = ref(0)
const hand = ref(null)
const maxBet = ref(0)
const autoCashedOut = ref(0)

const rules = ref({
  minBet: 10, maxBet: 100, deckCount: 6, dealerHitsSoft17: false,
  payoutNum: 3, payoutDen: 2, allowDouble: true, allowSplit: true,
  allowInsurance: true, practiceStack: 1000
})
const daily = ref({
  buyInUsed: 0, buyInLimit: 300, buyInLeft: 300,
  netWinnings: 0, winLimit: 900, resetsAt: null
})

const pendingBet = ref(0)
const lastBet = ref(0)
const showBuyIn = ref(false)
const showCashOut = ref(false)
const showRules = ref(false)
const buyInAmount = ref(0)
const ackRisk = ref(false)
const needsFirstTimeAck = ref(false)

const bark = ref('')
// One rail line at a time: { who, name, text }. Three characters all talking at once would be
// noise, and the bubbles would collide.
const spectatorBark = ref(null)
let spectatorTimer = null
const stamp = ref(null)
const politeMessage = ref('')
const assertiveMessage = ref('')

// Matches the layout's own JS breakpoint, and the media query below.
const MOBILE_BREAKPOINT = 768
const BOTTOM_GAP = 8
// Below this the table stops shrinking and the page is allowed to scroll instead. Scrolling
// keeps every control reachable; shrinking further would start cutting content off.
//
// A short landscape phone gets a much lower floor because it switches to the side-by-side
// layout below, where the controls sit next to the table rather than under it — the vertical
// budget then only has to cover the taller of the two, not their sum.
const MIN_TABLE_H_DEFAULT = 300
const MIN_TABLE_H_SHORT = 148
const SHORT_VIEWPORT_H = 520

const availableHeight = ref(0)
// Accumulated correction for layout chrome that sits below the table; reset on every resize.
const overshoot = ref(0)
const viewportWidth = ref(1024)
const viewportHeight = ref(768)
let barkTimer = null
let stampTimer = null

// ── derived ───────────────────────────────────────────────────────────────────
const isGamble = computed(() => mode.value === 'gamble')
const buyInLeft = computed(() => daily.value.buyInLeft ?? 0)

// Below 700px in either axis the spectators are cut. Width alone isn't enough — a phone in
// landscape is wide and very short, which is exactly where they'd crowd out the cards.
// Gated on the felt's own measured size, NOT window.innerHeight. Keying off the window meant
// a 1366x768 laptop — whose innerHeight lands around 640 once browser chrome is subtracted —
// fell on the wrong side of the threshold and lost the whole cast, which is most desktops.
// The scene box is what the characters actually have to fit into, so measure that.
const sceneWidth = ref(0)
const sceneHeight = ref(0)
const showSpectators = computed(() =>
  sceneWidth.value >= 560 && sceneHeight.value >= 240
)

const phase = computed(() => {
  if (!hand.value) return 'betting'
  if (hand.value.phase === 'insurance') return 'insurance'
  if (hand.value.phase === 'settled') return 'settled'
  return 'playing'
})

// Moving to the second split hand re-deals it from its own first card, so the switch is
// visible rather than the totals silently changing.
watch(() => hand.value?.active, (now, before) => {
  if (now === undefined || before === undefined || now === before) return
  shownPlayer.value = 0
  runDeal()
})

const activeHand = computed(() => {
  if (!hand.value) return null
  return hand.value.hands[Math.min(hand.value.active, hand.value.hands.length - 1)]
})
const inactiveHand = computed(() => {
  if (!hand.value || hand.value.hands.length < 2) return null
  return hand.value.hands.find(h2 => h2.index !== activeHand.value?.index) ?? null
})
// ── dealing pace ──────────────────────────────────────────────────────────────
// The server hands over the whole hand at once, so without this every card would appear in
// the same frame. These counters walk the table forward one card at a time.
//
// `shownDealer` counts SLOTS, not cards: while the hole card is face down the dealer occupies
// two slots but `dealer.cards` holds only the up card, so counting cards would make the second
// slot pop in a beat late.
const shownDealer = ref(0)
const shownPlayer = ref(0)
const dealing = ref(false)
const flippingHole = ref(false)
let dealTimer = null
let afterDeal = null

// Reduced motion means no animation, so the pauses between cards would just be dead waiting —
// the sequence collapses to something near-instant instead of theatre nobody can see.
const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const pace = (ms) => (reducedMotion() ? 40 : ms)
const DEAL_GAP_MS = 430    // between cards on the opening deal
const HIT_GAP_MS = 380     // a single card sliding in
const FLIP_MS = 780        // the hole card turning over — the best beat in the game, so it gets room
const DRAW_GAP_MS = 620    // the dealer drawing on himself afterwards

const dealerSlots = computed(() => {
  const h = hand.value
  if (!h) return 0
  return h.dealer.cards.length + (h.dealer.hidden ? 1 : 0)
})

/** Dealer cards actually on the table right now, with a face-down slot if one is still hidden. */
const dealerCards = computed(() => (hand.value?.dealer.cards ?? []).slice(0, shownDealer.value))
const dealerBackShown = computed(() =>
  Boolean(hand.value?.dealer.hidden) && shownDealer.value >= dealerSlots.value
)
const playerCards = computed(() => (activeHand.value?.cards ?? []).slice(0, shownPlayer.value))

const shownDealerTotal = computed(() => valueOfShown(dealerCards.value))
const shownPlayerTotal = computed(() => valueOfShown(playerCards.value))

/**
 * Walks the table forward one card at a time.
 *
 * The opening deal alternates player, dealer, player, dealer, exactly as at a real table; a hit
 * is a single card; and once the hole card turns over the dealer's own draws follow one by one.
 * Each of those gets its own tempo below, because they are different moments — a card sliding
 * across the felt should not take as long as the reveal that decides the hand.
 */
function runDeal () {
  clearTimeout(dealTimer)

  const targetP = activeHand.value?.cards.length ?? 0
  const targetD = dealerSlots.value
  const hidden = Boolean(hand.value?.dealer.hidden)

  if (shownPlayer.value >= targetP && shownDealer.value >= targetD) {
    dealing.value = false
    const done = afterDeal
    afterDeal = null
    if (done) done()
    return
  }

  dealing.value = true

  // The hole card turning over is its own beat: hold, flip, then carry on with any draws.
  const holeJustRevealed =
    !hidden && shownDealer.value === 1 && targetD >= 2 && !flippingHole.value
  if (holeJustRevealed) {
    flippingHole.value = true
    dealTimer = setTimeout(() => {
      shownDealer.value = 2
      flippingHole.value = false
      dealTimer = setTimeout(runDeal, pace(DRAW_GAP_MS))
    }, pace(FLIP_MS))
    return
  }

  const openingDeal = targetP <= 2 && targetD <= 2 && (shownPlayer.value + shownDealer.value) < 4
  // Player first when both are behind, which is the real dealing order.
  const playerNext = shownPlayer.value < targetP &&
    (shownPlayer.value <= shownDealer.value || shownDealer.value >= targetD)

  if (playerNext) shownPlayer.value++
  else shownDealer.value++

  const gap = openingDeal ? DEAL_GAP_MS : (shownDealer.value > 2 ? DRAW_GAP_MS : HIT_GAP_MS)
  dealTimer = setTimeout(runDeal, pace(gap))
}

/** Queues work to run once the table has finished dealing. */
function whenDealt (fn) {
  if (dealComplete.value && !dealing.value) { fn(); return }
  afterDeal = fn
}

/** Wipes the table between hands. */
function resetDeal () {
  clearTimeout(dealTimer)
  dealing.value = false
  flippingHole.value = false
  afterDeal = null
  shownDealer.value = 0
  shownPlayer.value = 0
}

/**
 * Blackjack value of the cards currently visible.
 *
 * The server sends the finished total, but showing it while cards are still being dealt would
 * give away the hand a beat early — so during the deal the total counts only what has landed.
 */
function valueOfShown (cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    if (c.rank === 'A') { aces++; total += 11 }
    else if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K' || c.rank === '10') total += 10
    else total += Number(c.rank)
  }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

/** True once every card the server sent is on the table. */
const dealComplete = computed(() =>
  shownDealer.value >= dealerSlots.value &&
  shownPlayer.value >= (activeHand.value?.cards.length ?? 0)
)

const outOfChips = computed(() =>
  screen.value === 'table' && chips.value < rules.value.minBet && phase.value !== 'playing' && !wagered.value
)

const chipDenoms = computed(() => [10, 20, 50, 100, 500].filter(d => d <= rules.value.maxBet))

const buyInMax = computed(() => Math.min(buyInLeft.value, points.value))
const buyInPresets = computed(() => {
  const max = buyInMax.value
  return [100, 250, 500, 1000]
    .filter(a => a <= max && a >= rules.value.minBet)
    .concat(max >= rules.value.minBet ? [max] : [])
    .filter((a, i, arr) => arr.indexOf(a) === i)
    .sort((a, b) => a - b)
})

const resetLabel = computed(() => {
  if (!daily.value.resetsAt) return 'at 8 PM CT'
  const d = new Date(daily.value.resetsAt)
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric' })
})

// The whole page is sized from one measured number, so the table always fits the box it is
// given instead of being cropped by it.
// Only set on mobile; on desktop the table fills its fixed box via CSS instead.
const rootStyle = computed(() => (
  availableHeight.value ? { '--bj-h': availableHeight.value + 'px' } : {}
))

// The table is sized from the scene's HEIGHT as well as its width, because the cast stands in
// the space above it. A table sized on width alone is fine on a 1920x1080 desktop and far too
// tall on a 1366x660 laptop, where it would leave no room for anyone's head — so the room
// above the table is reserved first, and the table takes what is left.
const sceneStyle = computed(() => (
  sceneHeight.value ? { '--scene-h': sceneHeight.value + 'px' } : {}
))

function can (action) {
  // Cards still landing: the hand on screen is not yet the hand the server is describing, so
  // acting on it would mean acting on incomplete information.
  if (dealing.value) return false
  return hand.value?.actions?.includes(action) ?? false
}

// ── barks ─────────────────────────────────────────────────────────────────────
// Johnny hits on everything, but never at the player — the vanity points at himself and at the
// spectators, which is funnier and keeps it safe for a site with kids on it.
// Johnny talks like Johnny: short, loud, and about himself. He never aims a line at the
// player — the vanity points at his own hair, his own reflection, and the crowd at the rail,
// which is both funnier and safe for a site with kids on it. Lines lean on the catchphrases
// he actually says ("Whoa, mama!", "Hoo-ah!", "Man, I'm pretty!") rather than generic
// wisecracks, and every one is short enough for a bubble on a phone.
const BARKS = {
  blackjack: [
    'Whoa, mama! Twenty-one!',
    "Blackjack. I dealt it, so that's basically my win.",
    'Hoo-ah! Beginner\u2019s luck.'
  ],
  win: [
    'Yeah, yeah. Take it.',
    'You win. I still got the hair.',
    "Lucky. That's all that was."
  ],
  bust: [
    'Ooooh! Too many!',
    "That's a lotta card there, buddy.",
    "Bust! And I didn't even flex."
  ],
  dealerBust: [
    "Whoa! That's not my best angle.",
    'I busted. Still pretty, though.',
    'Aw, man. Do over?'
  ],
  push: [
    'A tie? Nobody looks good in a tie.',
    'Push. We both win. Mostly me.',
    'Same total. Spooky.'
  ],
  lose: [
    "Read 'em and weep.",
    'House wins. House is also pretty.',
    'Better luck next deal.'
  ],
  cashOut: [
    "Leavin' already? More mirror time for me.",
    "Cashed out. Tell 'em Johnny sent ya.",
    "Later, champ. I'll be here. Flexin'."
  ],
  capped: [
    'Whoa! You broke the bank!',
    "That's the house limit, pal. I gotta eat."
  ],
  idle: [
    "Bets down. Let's do this.",
    'Money on the felt, pal.',
    "Man, I'm pretty.",
    'Hoo-ah!',
    "Grim, quit lookin' at my cards."
  ],
  playerDouble: ['Whoa! Big spender!'],
  playerSplit: ["Two hands? Show-off. That's my thing."]
}

// The rail talks too. Each one is written to their own voice rather than being interchangeable
// wisecracks — Courage panics, Grim is bored and morbid in his Jamaican lilt, and Jack is
// formal and never uses contractions. Only one of them speaks at a time.
const SPECTATORS = {
  courage: {
    name: 'Courage',
    blackjack: ['Oh my goodness gracious!', 'We did it! I mean... you did it!'],
    win: ['Whew! I need to lie down.', 'Oh thank goodness.'],
    bust: ["Oooooh, I can't look!", 'The things I do for love!', 'I told you! I told you!'],
    dealerBust: ['He lost! HE LOST!', 'Oh happy day!'],
    push: ['Nobody lost? Nobody lost!'],
    lose: ['Oh, the horror...', 'I think I need a nap.'],
    dealerAce: ["An ace?! That's bad. That's very bad."],
    bigTotal: ["Don't do it! Don't do it!"],
    split: ['Two hands?! Twice the worrying!']
  },
  grim: {
    name: 'Grim',
    blackjack: ['Twenty-one. Beginner\u2019s luck, I say.', 'Now dat is a hand, mon.'],
    win: ['De house lost one. Good.', 'Enjoy it while it last, mon.'],
    bust: ["Dat one belongs to me now, mon.", 'Ooooh. Dat had to hurt.'],
    dealerBust: ['Even de house got to lose sometime.', 'Ha! Serves him right, mon.'],
    push: ['A tie? How borin\u2019, mon.'],
    lose: ['Anoder one for de collection.', 'Dat is de way of tings, mon.'],
    dealerAce: ['An ace showin\u2019. Dis look grim. Like me.'],
    bigTotal: ['One more card and you is finished, mon.'],
    split: ['Two hands, two ways to lose. I like it.']
  },
  jack: {
    name: 'Samurai Jack',
    blackjack: ['A most honorable hand.', 'Perfection. Well struck.'],
    win: ['Your patience is rewarded.', 'You have chosen well.'],
    bust: ['You reached too far.', 'Greed is a poor teacher.'],
    dealerBust: ["The dealer's own greed undid him.", 'He fell by his own hand.'],
    push: ['Neither wins. Balance is preserved.'],
    lose: ['Fortune is a fickle ally.', 'There will be another hand.'],
    dealerAce: ['The dealer is strong. Be careful.'],
    bigTotal: ['Wisdom is knowing when to stop.'],
    split: ['Two paths. Choose both well.']
  }
}

function say (key) {
  const lines = BARKS[key]
  if (!lines?.length) return
  bark.value = lines[Math.floor(Math.random() * lines.length)]
  clearTimeout(barkTimer)
  barkTimer = setTimeout(() => { bark.value = '' }, BARK_MS)
}

/**
 * Puts a line in one spectator's mouth. `who` picks a character; omitting it chooses at random
 * from whoever actually has something to say about this event, so the rail doesn't fall silent
 * just because one character has no line for it.
 */
function spectatorSay (event, who) {
  const candidates = who
    ? [who].filter(k => SPECTATORS[k]?.[event]?.length)
    : Object.keys(SPECTATORS).filter(k => SPECTATORS[k][event]?.length)
  if (!candidates.length) return

  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  const lines = SPECTATORS[pick][event]
  spectatorBark.value = {
    who: pick,
    name: SPECTATORS[pick].name,
    text: lines[Math.floor(Math.random() * lines.length)]
  }
  clearTimeout(spectatorTimer)
  spectatorTimer = setTimeout(() => { spectatorBark.value = null }, 3200)
}

/**
 * Lets the dealer land his line first, then the rail answers.
 *
 * With the cast on screen the two bubbles sit beside their own speakers and can overlap in
 * time. Without it there is only one bubble slot — the felt above the player's cards is the
 * only free space — so the reply waits for the dealer's bubble to clear instead.
 */
const BARK_MS = 2600
function spectatorReply (event, delay = 1100) {
  clearTimeout(spectatorTimer)
  const wait = showSpectators.value ? delay : BARK_MS + 150
  spectatorTimer = setTimeout(() => spectatorSay(event), wait)
}

function showStamp (text, tone) {
  stamp.value = { text, tone }
  clearTimeout(stampTimer)
  stampTimer = setTimeout(() => { stamp.value = null }, 1800)
}

// ── server plumbing ───────────────────────────────────────────────────────────
function applyView (view) {
  mode.value = view.mode ?? mode.value
  chips.value = view.chips ?? 0
  wagered.value = view.wagered ?? 0
  points.value = view.points ?? points.value
  hand.value = view.hand ?? null
  maxBet.value = view.maxBet ?? 0
  if (view.rules) rules.value = view.rules
  if (view.daily) daily.value = view.daily
  if (typeof view.autoCashedOut === 'number') autoCashedOut.value = view.autoCashedOut
}

async function request (url, options) {
  busy.value = true
  error.value = ''
  try {
    return await $fetch(url, options)
  } catch (e) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Something went wrong. Try again.'
    setTimeout(() => { error.value = '' }, 4000)
    return null
  } finally {
    busy.value = false
  }
}

/**
 * Calls one of the game's mutating endpoints.
 *
 * Always POST, even with nothing to send. Deriving the method from whether a body happened to
 * be passed meant `call('/cashout')` and `call('/reset')` — which need no arguments — went out
 * as GETs and never matched their POST-only handlers, so Cash Out and Reset Chips failed for
 * everyone. A player left holding chips below the minimum bet could then neither cash out nor
 * leave, because leaving with chips routes through the cash-out sheet.
 */
function call (url, body) {
  return request(url, { method: 'POST', body: body ?? {} })
}

/** The one read-only endpoint. */
function fetchStatus () {
  return request('/api/game/blackjack/status', { method: 'GET' })
}

async function refresh () {
  const view = await fetchStatus()
  if (!view) return
  applyView(view)
  // A hand resumed from a previous visit is already in progress, so it is shown complete
  // rather than dealt out again from nothing.
  shownPlayer.value = activeHand.value?.cards.length ?? 0
  shownDealer.value = dealerSlots.value
  // A session left open from a previous visit drops the player straight back at the table.
  if (view.hasGamble || view.hasPractice) {
    mode.value = view.hasGamble ? 'gamble' : 'practice'
    screen.value = 'table'
  }
}

async function startPractice () {
  const view = await call('/api/game/blackjack/start', { mode: 'practice' })
  if (!view) return
  applyView(view)
  mode.value = 'practice'
  screen.value = 'table'
  say('idle')
}

function openBuyIn () {
  buyInAmount.value = Math.min(buyInMax.value, 250) >= rules.value.minBet
    ? Math.min(buyInMax.value, 250)
    : buyInMax.value
  ackRisk.value = false
  needsFirstTimeAck.value = !localStorage.getItem('bj-ack')
  showBuyIn.value = true
  nextTick(() => buyInSheet.value?.querySelector('.bj-btn--gold')?.focus())
}

async function confirmBuyIn () {
  const view = await call('/api/game/blackjack/start', { mode: 'gamble', amount: buyInAmount.value })
  if (!view) return
  localStorage.setItem('bj-ack', '1')
  applyView(view)
  mode.value = 'gamble'
  screen.value = 'table'
  showBuyIn.value = false
  say('idle')
}

// Every bet the UI can produce has to be a whole multiple of the increment, so the server
// never has to reject one the player was allowed to build.
function toIncrement (n) {
  const step = 10
  return Math.max(0, Math.floor(n / step) * step)
}

function addChip (d) {
  pendingBet.value = toIncrement(Math.min(maxBet.value, pendingBet.value + d))
}

async function deal () {
  const bet = pendingBet.value
  const view = await call('/api/game/blackjack/bet', { mode: mode.value, bet })
  if (!view) return
  lastBet.value = bet
  pendingBet.value = 0
  resetDeal()
  applyView(view)
  politeMessage.value = describeHand()
  runDeal()
  // A hand that settles on the deal (a natural, or the dealer's peek) still gets dealt out
  // before the stamp lands — announcing the result over an empty felt reads as a glitch.
  if (view.hand?.phase === 'settled') whenDealt(() => settleUi(view))
  else whenDealt(() => reactToTable(view))
}

async function act (action) {
  const view = await call('/api/game/blackjack/action', { mode: mode.value, action })
  if (!view) return
  applyView(view)
  politeMessage.value = describeHand()

  if (action === 'double') say('playerDouble')
  if (action === 'split') { say('playerSplit'); spectatorReply('split', 900) }

  runDeal()
  if (view.hand?.phase === 'settled') whenDealt(() => settleUi(view))
  else whenDealt(() => reactToTable(view))
}

/**
 * Occasional colour commentary while the hand is live. Rate-limited and skipped whenever the
 * dealer is already talking — three characters piling on every card would wear out fast.
 */
function reactToTable (view) {
  if (!view.hand || bark.value || spectatorBark.value) return
  const you = view.hand.hands[view.hand.active]
  if (!you) return

  if (you.total >= 15 && you.total <= 16 && Math.random() < 0.5) {
    spectatorReply('bigTotal', 500)
  } else if (view.hand.dealer.cards[0]?.rank === 'A' && Math.random() < 0.6) {
    spectatorReply('dealerAce', 500)
  }
}

function describeHand () {
  if (!hand.value || !activeHand.value) return ''
  const you = activeHand.value
  const dealer = hand.value.dealer
  return `Your total ${you.total}. Dealer showing ${dealer.total}${dealer.hidden ? ' plus a face-down card' : ''}.`
}

function settleUi (view) {
  const net = view.hand.netPayout
  const results = view.hand.results || []
  const dealerBusted = view.hand.dealer.busted
  const anyBlackjack = results.some(r => r.outcome === 'blackjack')
  const allBust = results.every(r => r.outcome === 'bust')

  if (anyBlackjack) { showStamp('BLACKJACK!', 'gold'); say('blackjack'); spectatorReply('blackjack') }
  else if (allBust) { showStamp('BUST', 'bad'); say('bust'); spectatorReply('bust') }
  else if (net > 0) {
    showStamp(dealerBusted ? 'DEALER BUSTS' : 'YOU WIN', 'good')
    say(dealerBusted ? 'dealerBust' : 'win')
    spectatorReply(dealerBusted ? 'dealerBust' : 'win')
  }
  else if (net === 0) { showStamp('PUSH', 'neutral'); say('push'); spectatorReply('push') }
  else { showStamp('DEALER WINS', 'bad'); say('lose'); spectatorReply('lose') }

  assertiveMessage.value = `${net > 0 ? 'You win' : net < 0 ? 'You lose' : 'Push'}${net !== 0 ? ' ' + Math.abs(net) + ' chips' : ''}. Chips remaining, ${view.chips}.`

  // The daily win cap fires as a moment, not a silent state change.
  if (isGamble.value && view.maxBet === 0 && view.chips > 0) {
    say('capped')
  }

  // Focus has to be handed somewhere deliberate: disabling the focused Hit button would
  // otherwise drop focus to <body> and strand a keyboard user mid-game.
  nextTick(() => {
    document.querySelector('.bj-controls .bj-btn--gold')?.focus?.({ preventScroll: true })
  })
}

function nextHand () {
  resetDeal()
  hand.value = null
  stamp.value = null
  spectatorBark.value = null
  pendingBet.value = toIncrement(Math.min(lastBet.value || rules.value.minBet, maxBet.value))
  if (Math.random() < 0.25) say('idle')
}

async function resetPractice () {
  const view = await call('/api/game/blackjack/reset')
  if (!view) return
  applyView(view)
  hand.value = null
  pendingBet.value = 0
}

async function confirmCashOut () {
  const view = await call('/api/game/blackjack/cashout')
  if (!view) return
  applyView(view)
  showCashOut.value = false
  say('cashOut')
  screen.value = 'select'
  mode.value = null
  hand.value = null
  await refresh()
}

/**
 * Back to the mode-select screen.
 *
 * Chips still on a gamble table are real points, so the only way off one is a deliberate
 * cash-out — the sheet is opened instead of quietly abandoning them. Practice chips are free,
 * so that session is simply closed, which is what makes the menu stick across a reload rather
 * than dropping the player straight back onto the table.
 */
async function leaveTable () {
  if (isGamble.value && chips.value > 0) { showCashOut.value = true; return }

  const view = await call('/api/game/blackjack/leave', { mode: mode.value || 'practice' })
  if (view) applyView(view)

  resetDeal()
  screen.value = 'select'
  mode.value = null
  hand.value = null
  stamp.value = null
  bark.value = ''
  spectatorBark.value = null
  pendingBet.value = 0
  await refresh()
}

// ── sizing ────────────────────────────────────────────────────────────────────
// One measured number drives every dimension on the page. visualViewport is what makes this
// immune to the iOS toolbar sliding in and out — it reports the height actually visible, and
// fires resize when that changes.
function measure (pass = 0) {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
  if (!wrapper.value) return

  const top = wrapper.value.getBoundingClientRect().top
  const mobile = window.innerWidth < MOBILE_BREAKPOINT
  let base

  if (!mobile) {
    // Desktop and tablet: .main-content is a fixed box, but the layout gives it its size with
    // min-height rather than height. `height: 100%` on a child therefore resolves to auto, the
    // table grows to its content, and the controls end up clipped below the box — so the
    // height has to be measured and set explicitly.
    const parent = wrapper.value.parentElement
    if (!parent) return
    const cs = getComputedStyle(parent)
    base = Math.round(parent.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0) - top)
  } else {
    // Mobile: .main-content is height:auto, so the viewport is the only real ceiling.
    const vh = window.visualViewport?.height || window.innerHeight
    base = Math.round(vh - top - BOTTOM_GAP)
  }

  const floor = window.innerHeight < SHORT_VIEWPORT_H ? MIN_TABLE_H_SHORT : MIN_TABLE_H_DEFAULT
  availableHeight.value = Math.max(floor, base - overshoot.value)

  // The layout puts its own padding, borders and row gaps below this element, and how much
  // varies with how many rows the nav has wrapped to — so it cannot be hard-coded. Instead,
  // take back whatever the page actually ends up overflowing by. Each pass measures the
  // result of the last, and the counter stops it looping.
  if (pass < 3) {
    nextTick(() => {
      const de = document.documentElement
      const over = de.scrollHeight - de.clientHeight
      if (over > 1 && availableHeight.value > floor) {
        overshoot.value += over
        measure(pass + 1)
      } else if (pass === 0) {
        // Measuring the parent is mildly circular on desktop — an oversized table inflates the
        // box it is measured against. Setting a definite height collapses it back, so one
        // confirming pass settles it.
        measure(pass + 1)
      }
    })
  }
}

// The scene resizes for reasons the window never sees (the layout's scale transform, the
// controls row changing height), so it is observed directly.
let sceneObserver = null
function observeScene () {
  if (sceneObserver || !scene.value || typeof ResizeObserver === 'undefined') return
  sceneObserver = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect
    if (!r) return
    sceneWidth.value = Math.round(r.width)
    sceneHeight.value = Math.round(r.height)
  })
  sceneObserver.observe(scene.value)
}

let resizeTimer = null
function onResize () {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    // The chrome's height changes with orientation and width, so the old correction is stale.
    overshoot.value = 0
    measure(0)
  }, 100)
}

onMounted(async () => {
  measure(0)
  window.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  await refresh()
  loading.value = false
  await nextTick()
  measure(0)
  observeScene()
})

// The scene only exists on the table screen, so the observer is attached when it appears
// rather than once on mount.
watch(() => screen.value, async (v) => {
  if (v !== 'table') return
  await nextTick()
  observeScene()
}, { immediate: true })

onBeforeUnmount(() => {
  sceneObserver?.disconnect()
  sceneObserver = null
  clearTimeout(resizeTimer)
  clearTimeout(barkTimer)
  clearTimeout(stampTimer)
  clearTimeout(spectatorTimer)
  clearTimeout(dealTimer)
  window.removeEventListener('resize', onResize)
  window.visualViewport?.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onResize)
})
</script>

<style>
/* Self-hosted alongside the Winball page. Futura Bold Condensed is the early-2000s Cartoon
   Network display face; using it instead of the layout's Nunito is most of what makes this
   read as a 2003 Flash game rather than a modern casino app. */
@font-face {
  font-family: "FuturaBdCnBT";
  src: url("/newwinball/fonts/84_Futura BdCn BT.ttf") format("truetype");
  font-weight: 700;
  font-display: swap;
}

/* Unscoped: reaches into the layout's .main-content, whose body class comes from the route
   name. On mobile that box is height:auto, so a percentage height inside it would collapse. */
/* No min-height here on purpose. Forcing one taller than the space actually left makes the
   document scroll, and .main-content is height:auto on mobile so the measured .bj height
   below is what gives it its size. */

html:has(body.page-newsite-blackjack) {
  background: linear-gradient(to bottom, #000 0, #000 65px, #1E0810 115px, #1E0810 100%) no-repeat fixed !important;
}
</style>

<style scoped>
/* ── tokens ─────────────────────────────────────────────────────────────────── */
.bj {
  --ink: #000;
  --ink-w: clamp(2px, 0.9vw, 4px);
  --go: #66CC00;
  --gold: #FFCC33;
  --stop: #E8342A;
  --deep: #0A47A1;
  --purple: #7C5CBF;
  --card-face: #FFF8E7;   /* warm cream; pure white reads as a modern app */
  --room-far: #4A1522;
  --room-near: #1E0810;
  --rail: #7A2B1A;

  /* Every size below is derived from these two, so the table scales to fit its box on any
     device rather than overflowing and being cropped. */
  --bj-h: 560px;
  --card-w: clamp(26px, min(12vw, calc(var(--bj-h) * 0.115)), 58px);

  /* Always an explicit measured height — see measure(). A percentage cannot be used because
     the layout sizes .main-content with min-height, against which a percentage resolves to
     auto. */
  height: var(--bj-h);
  max-height: var(--bj-h);
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 1vh, 10px);
  padding: clamp(4px, 1vh, 10px);
  box-sizing: border-box;
  overflow: hidden;          /* the layout is sized to fit; this is the backstop */
  overscroll-behavior-y: contain;  /* an upward swipe must not pull-to-refresh mid-hand */
  font-family: "Nunito", system-ui, sans-serif;
  color: #FFF8E7;
  position: relative;
}

/* The box IS the table: the artwork is 438x219, and the box carries that ratio, so a
   percentage inside it names a fixed spot on the drawing however the table is scaled.
   Positioning the hands against the scene instead let them drift off the table as the scene
   changed shape.

   The measurements the rules below are built on, all taken from the PNG rather than eyeballed
   (fractions of the box, origin top-left):
     · the tabletop's far edge — the dealer's side — sits at y≈0.00 across the middle and only
       rises at the very ends (0.05 at x=0.08, 0.105 at x=0.03). Everyone behind the table is
       therefore cut off at the same line, and how much of them shows is decided by height
       alone rather than by where their feet are
     · the felt runs y 0.08–0.58, and across x 0.25–0.75 it is 0.445 deep — deep enough for
       two rows of cards to sit inside it, which the previous artwork was not
     · the tabletop's near edge is at y≈0.68 in the middle; below that is leg

   Width is capped so the drawing is never blown up far past its native 438px; spanning a
   1000px scene would be a 2.3x upscale and visibly soft. */
.bj-tablearea {
  position: absolute;
  left: 50%;
  bottom: 2%;
  transform: translateX(-50%);
  /* 1.35 * scene height => the table occupies the bottom ~67% of the scene and the cast has
     the top third for their heads. See sceneStyle() for why height comes into it at all. */
  width: min(100%, 860px, calc(var(--scene-h, 400px) * 1.35));
  z-index: 4;
  container-type: inline-size;
  /* Cards sized from the TABLE, not the viewport, so they always sit on the felt in scale. */
  --card-w: clamp(20px, 7.5cqw, 58px);
}

/* The image, in flow, is what gives the box its height. Doing it the other way round —
   aspect-ratio on the box and height:100% on the image — collapsed to zero height, because
   every other child is absolutely positioned and contributes nothing to size. */
.bj-table {
  display: block;
  position: relative;
  width: 100%;
  height: auto;
  z-index: 1;                 /* above the cast, so the table cuts them off at the waist */
  pointer-events: none;
  filter: drop-shadow(0 -3px 0 rgba(0, 0, 0, 0.3));
}

/* Practice still reads differently at a glance, but by draining the table rather than turning
   it another colour. Rotating the hue took the felt to blue, the rail to gold and the red
   payout legend to orange — it repainted a drawing that is meant to look like one specific
   table. Desaturating keeps every shape and every word reading correctly and still says
   "play money" the moment you see it next to the gamble table. */
.bj-scene.is-practice .bj-table { filter: drop-shadow(0 -3px 0 rgba(0, 0, 0, 0.3)) saturate(0.5) brightness(0.94); }
/* Without the cast there is nothing standing behind the table, so it can run wider than the
   scene and sit lower — a phone has no room to spend on the empty floor around it. The hands
   are positioned against the table itself, so they need no adjustment here. */
/* A phone's scene is tall and narrow; the table is a 2:1 drawing that can only be as tall as
   it is wide, so it can never fill that height. Pinned to the bottom, the leftover room piles
   up above it and reads as a mistake — centred, the same room reads as a dark casino the
   table sits in. With nobody standing behind it the cards get the whole table and grow. */
.bj-scene.no-cast .bj-tablearea {
  /* 112%, not 100%: a phone's scene is tall and narrow, the drawing is 2:1, and every pixel
     of table width is what buys card size. The outer 6% at each end is bare rail — measured,
     no felt and no betting box lives there — so letting it run past the frame costs nothing
     and makes the cards a third bigger. */
  width: min(112%, 620px);
  top: 50%;
  bottom: auto;
  transform: translate(-50%, -50%);
  --card-w: clamp(16px, 8cqw, 60px);
}
.bj-scene.no-cast .bj-stampword { top: 52%; }

/* ── loading / panels ───────────────────────────────────────────────────────── */
.bj-center {
  flex: 1;
  min-height: 0;
  display: flex;
  /* See the note on .bj-modal — centring an overflowing child hides its top irrecoverably. */
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.bj-center > * { margin: auto; }

.bj-spinner {
  width: 42px; height: 42px;
  border: 4px solid rgba(255, 248, 231, 0.25);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: bj-spin 0.8s linear infinite;
}
@keyframes bj-spin { to { transform: rotate(360deg); } }

.bj-card-panel {
  width: min(100%, 440px);
  background: rgba(10, 4, 8, 0.72);
  border: var(--ink-w) solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 6px 0 var(--ink);
  padding: clamp(14px, 3vh, 26px);
  text-align: center;
}

.bj-eyebrow {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 13px;
  color: var(--gold);
  margin: 0 0 4px;
}

.bj-title {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(30px, 8vw, 52px);
  line-height: 0.94;
  text-transform: uppercase;
  color: var(--gold);
  margin: 0 0 10px;
  transform: rotate(-1.5deg);
  text-shadow:
    2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000,
    2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000;
}

.bj-sub { font-size: 14px; opacity: 0.85; margin: 0 0 14px; }
.bj-notice {
  font-size: 13px;
  background: rgba(102, 204, 0, 0.16);
  border: 2px solid var(--go);
  border-radius: 10px;
  padding: 8px 10px;
  margin: 0 0 12px;
}
.bj-btn-note { font-size: 12px; opacity: 0.7; margin: 6px 0 14px; }

.bj-link {
  background: none; border: none;
  color: var(--gold);
  text-decoration: underline;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 8px;
  min-height: 44px;
}
.bj-link:disabled { opacity: 0.5; cursor: default; }

/* ── buttons ────────────────────────────────────────────────────────────────── */
.bj-btn {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(17px, 4.5vw, 24px);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  min-height: 52px;
  padding: 0 clamp(10px, 3vw, 20px);
  border: var(--ink-w) solid var(--ink);
  border-radius: 12px;
  box-shadow: 0 5px 0 var(--ink);   /* one direction, zero blur — never a soft modern shadow */
  background: var(--go);
  color: #06240A;
  cursor: pointer;
  transition: filter 90ms linear, box-shadow 90ms linear, transform 90ms linear;
  touch-action: manipulation;
  flex: 1;
  min-width: 0;
}
.bj-btn:hover { filter: brightness(1.1); }
.bj-btn:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 1px 0 var(--ink); }
.bj-btn:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
/* Desaturated rather than faded: a chunky button at opacity .5 looks broken, a grey one
   looks unavailable. */
.bj-btn:disabled { filter: grayscale(0.65) brightness(0.72); cursor: default; }
.bj-btn.is-hidden { visibility: hidden; }
@media (hover: none) { .bj-btn:hover { filter: none; } }

.bj-btn--block { display: block; width: 100%; margin: 0; }
.bj-btn--wide { flex: 2; }
.bj-btn--sm { min-height: 44px; font-size: clamp(14px, 3.4vw, 18px); }
.bj-btn--gold { background: var(--gold); color: #241A00; }
.bj-btn--stop { background: var(--stop); color: #FFF8E7; }
.bj-btn--blue { background: var(--deep); color: #FFF8E7; }
.bj-btn--purple { background: var(--purple); color: #FFF8E7; }
.bj-btn--ghost { background: #2A2A30; color: #FFF8E7; }

/* ── HUD ────────────────────────────────────────────────────────────────────── */
.bj-hud {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}
.bj-hud-item {
  flex: 1;
  min-width: 0;
  background: rgba(10, 4, 8, 0.66);
  border: 2px solid var(--ink);
  border-radius: 8px;
  padding: 3px 6px;
  text-align: center;
}
.bj-hud-label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.65;
}
.bj-hud-value {
  display: block;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(14px, 3.6vw, 19px);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bj-hud-value.is-gamble { color: var(--gold); }
.bj-hud-value.is-practice { color: var(--purple); }
.bj-hud-value.is-up { color: var(--go); }
.bj-hud-value.is-down { color: var(--stop); }

/* ── scene ──────────────────────────────────────────────────────────────────── */
.bj-scene {
  flex: 1 1 auto;
  min-height: 0;              /* lets the scene shrink instead of pushing the controls off */
  position: relative;
  border: var(--ink-w) solid var(--ink);
  border-radius: 14px;
  overflow: hidden;
}

.bj-room {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 1.5px 1.5px, rgba(255, 255, 255, 0.10) 1.2px, transparent 1.3px) 0 0 / 7px 7px,
    radial-gradient(120% 90% at 50% 22%, var(--room-far), var(--room-near) 78%);
}

/* One synthesized ink line and one contact shadow for all four cutouts, so they share a line
   weight with the cards and buttons and read as one drawing. It also swallows the JPEG
   fringe left over from cutting Johnny out of a white background. */
.bj-char {
  position: absolute;
  object-fit: contain;
  z-index: 0;                 /* under the table image, which is what cuts them off */
  pointer-events: none;
  filter:
    drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000)
    drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000)
    drop-shadow(6px 8px 0 rgba(0, 0, 0, 0.35));
}
/* Percentages of the TABLE box, not the scene, so the cast keeps its footing on the table at
   any size. Two numbers matter for each one:
     · `bottom` puts their feet ON THE FELT, i.e. below the far edge at that x — that is what
       makes the table paint over their legs instead of them standing on top of it
     · `height` then decides how much shows above the edge; anything over ~(1 - bottom + 0.2)
       of the box rises above the artwork and into the room, which is where their heads belong
   The far edge sits at y≈0.10 of the box on the left and y≈0.27 on the right, so the right of
   the rail needs its feet lower to be cut off by the same amount.

   Widths are not guessed either: each cutout's aspect is known (Jack 0.27, Johnny 0.56,
   Courage 0.90, Grim 1.08), and the box is 2:1, so a height of h% occupies h%*0.5*aspect of
   the box's width. That is how the four of them are fitted around the hands without anyone
   overlapping the cards. Grim's own image is half scythe — his body sits in its left 55% —
   so he hangs off the right end of the table to bring his body onto it. */
/* Jack is cut off at 58% of his own art rather than 63%: below that his gi tapers into a
   narrow strip of hakama, and a strip that thin reads as a stick rather than a leg. */
.bj-char--jack    { left: 14%;  bottom: 67%; height: 78%; }   /* ~10% wide -> 14-24%  */
.bj-char--johnny  { left: 32%;  bottom: 58%; height: 88%; }   /* ~24% wide -> 32-56%  */
.bj-char--courage { left: 58%;  bottom: 88%; height: 34%; }   /* ~15% wide -> 58-73%  */
.bj-char--grim    { right: -15%; bottom: 64%; height: 78%; }  /* body      -> 74-97%  */

.bj-avatar {
  width: clamp(24px, 7vw, 34px);
  height: clamp(24px, 7vw, 34px);
  border-radius: 50%;
  border: 2px solid var(--ink);
  background: var(--gold);
  object-fit: cover;
  flex: 0 0 auto;
}

/* ── hands ──────────────────────────────────────────────────────────────────── */
.bj-row {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  box-sizing: border-box;
}
/* Percentages of the table box. The felt is 44.5% of the box deep across the middle, so both
   rows sit inside it: the dealer's hand up by the chip tray, the player's down on the betting
   boxes, the way they fall on a real layout. The cast never competes for this space — they
   stand beyond the far edge, which is the top of the artwork, so everything of them that is
   inside this box is behind the table. */
/* On the table the name and total sit BESIDE the cards rather than above them. Stacked, each
   row costs ~9% of the box in label before a single card is drawn, and two rows then need
   more depth than the table has — which is what pushed the player's hand off the near edge
   and jammed the two hands together. Sideways they cost nothing vertically. */
.bj-tablearea .bj-row {
  position: absolute;
  left: 19%;
  right: 35%;
  z-index: 3;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.bj-row--dealer { top: 11%; }
.bj-row--player { top: 35%; }

/* Below this the cards hit their 16px floor, and two rows at that size are taller than the
   felt is deep — so on a table this small they spread onto the rail, which is still tabletop.
   Queried against the table box itself, which is the thing that ran out of room. */
@container (max-width: 320px) {
  .bj-row--dealer { top: 3%; }
  .bj-row--player { top: 36%; }
}

/* Without the cast the hands get the whole table instead of the gap between the characters,
   so they sit centrally and the cards grow — the felt is the same depth either way, so the
   extra room buys card size rather than a third row. */
.bj-scene.no-cast .bj-tablearea .bj-row {
  /* Label on the right so the CARDS sit over the middle of the layout rather than off to one
     side — the table is symmetrical, so there is no deeper end to prefer. */
  flex-direction: row-reverse;
  left: 33%;
  right: 9%;
}

.bj-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bj-row-name {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  text-transform: uppercase;
  font-size: clamp(11px, 3vw, 15px);
  letter-spacing: 0.06em;
  text-shadow: 1px 1px 0 #000;
}
/* Totals sit on a solid badge, never straight on the felt — saturated yellow on green is
   about 1.8:1. */
.bj-total {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(13px, 3.4vw, 17px);
  background: #101014;
  color: var(--gold);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 1px 8px;
  line-height: 1.3;
}
.bj-total.is-bust { background: var(--stop); color: #FFF8E7; }

/* On the table these are sized from the TABLE, not the viewport. A phone held sideways gets a
   two-column layout whose scene is only ~195px wide, and a label frozen at 15/17px there is
   taller than the cards it labels — which is what made the two hands collide. */
.bj-tablearea .bj-row-name { font-size: clamp(8px, 2.8cqw, 15px); }
.bj-tablearea .bj-total { font-size: clamp(9px, 3.4cqw, 17px); padding: 0 6px; }
.bj-tablearea .bj-otherhand { font-size: clamp(8px, 2.6cqw, 12px); padding: 0 7px; }
/* Same reason, and this one was the actual culprit: Johnny's avatar stands in for him when
   the cast is hidden, and at a viewport-derived 34px it was taller than a 24px card, so the
   dealer's row was avatar-height and ran into the player's. */
.bj-tablearea .bj-avatar { width: clamp(14px, 5cqw, 30px); height: clamp(14px, 5cqw, 30px); }

.bj-otherhand {
  font-size: clamp(10px, 2.6vw, 12px);
  background: rgba(10, 4, 8, 0.7);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 1px 10px;
  margin-bottom: 2px;
}

.bj-fan { display: flex; align-items: flex-end; }

/* ── cards ──────────────────────────────────────────────────────────────────── */
.bj-card {
  width: var(--card-w);
  aspect-ratio: 5 / 7;      /* a real playing card, not the site's 3:4 cToon frame */
  flex: 0 0 auto;
  background: var(--card-face);
  border: 3px solid var(--ink);
  border-radius: 6px;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.4);
  position: relative;
  /* Overlap so the exposed strip is always a share of the card, never a fixed pixel amount:
     the rank glyph is sized from the card width too, so a fixed strip slices "10" in half as
     soon as the cards shrink. 58% exposed keeps the rank and suit fully readable, and even a
     six-card hand still fits the narrowest phone. 64% rather than a tighter overlap because
     "10" is two glyphs and needs noticeably more room than a single-character rank. */
  margin-left: calc(var(--card-w) * -0.36);
  animation: bj-deal 340ms cubic-bezier(0.18, 0.85, 0.28, 1) both;
}
.bj-card:first-child { margin-left: 0; }

/* A card comes in from the dealer's side rather than dropping straight down, and travels far
   enough to read as being dealt. */
@keyframes bj-deal {
  from { opacity: 0; transform: translate(-46px, -34px) rotate(-16deg) scale(0.82); }
  60%  { opacity: 1; }
  to   { opacity: 1; transform: none; }
}

/* The hole card turning over. Half the animation squashes it to nothing, which is the moment
   the face swaps in underneath, and the second half opens it back out. */
.bj-card.is-flipping { animation: bj-flip 780ms cubic-bezier(0.4, 0, 0.25, 1) both; }

@keyframes bj-flip {
  0%   { transform: rotateY(0deg) scale(1); }
  45%  { transform: rotateY(90deg) scale(1.06); }
  55%  { transform: rotateY(90deg) scale(1.06); }
  100% { transform: rotateY(0deg) scale(1); }
}

.bj-card-rank {
  position: absolute;
  top: 1px;
  left: 3px;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: calc(var(--card-w) * 0.4);
  line-height: 1;
}
.bj-card-suit {
  position: absolute;
  bottom: 2px;
  right: 3px;
  font-size: calc(var(--card-w) * 0.36);
  line-height: 1;
}
.bj-card.is-red { color: #E8342A; }
.bj-card.is-black { color: #101010; }

.bj-card--back {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.09) 0 6px, transparent 6px 12px),
    #0A47A1;
}

/* ── bubble & stamp: absolutely positioned so they never add layout height ───── */
.bj-bubble {
  position: absolute;
  z-index: 8;
  max-width: 56%;
  background: var(--card-face);
  color: #101010;
  border: var(--ink-w) solid var(--ink);
  border-radius: 18px;
  padding: 6px 11px;
  font-size: clamp(11px, 2.9vw, 14px);
  font-weight: 700;
  box-shadow: 3px 4px 0 rgba(0, 0, 0, 0.45);
}

/* Each bubble sits beside the character who owns it. These follow the cast: the table is
   centred and about three quarters of the scene wide, so a character standing at f of the
   table stands at roughly f*0.75 + 0.125 of the scene — which puts Jack and Johnny in the
   left third and Courage and Grim in the right. Only one spectator ever speaks at a time, so
   their slots may overlap each other without ever colliding in practice. */
.bj-bubble--johnny { top: 1%; left: 32%; max-width: 36%; }
.bj-bubble--jack { top: 12%; left: 0%; max-width: 27%; }
.bj-bubble--courage { top: 26%; left: 38%; max-width: 28%; }
.bj-bubble--grim { top: 4%; right: 1%; max-width: 28%; }

/* No cast on screen: reuses the dealer's slot (they are sequenced, never simultaneous) with
   the speaker named so the joke still lands. Anywhere lower would cover the cards. */
.bj-bubble--named { top: 2%; right: 3%; max-width: 80%; }
.bj-bubble-who { color: #0A47A1; font-weight: 800; }

.bj-stampword {
  position: absolute;
  /* Between the two hands, not over them — the dealer's final cards are the whole reason the
     outcome makes sense, so covering them defeats the point of showing it. */
  top: 66%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-6deg);
  z-index: 9;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(26px, 9vw, 54px);
  text-transform: uppercase;
  padding: 2px 14px;
  border: var(--ink-w) solid var(--ink);
  border-radius: 10px;
  background: #101014;
  box-shadow: 4px 5px 0 rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
}
.bj-stampword.is-gold { color: var(--gold); }
.bj-stampword.is-good { color: var(--go); }
.bj-stampword.is-bad { color: var(--stop); }
.bj-stampword.is-neutral { color: #B9C2CC; }

.bj-pop-enter-active, .bj-stamp-enter-active { transition: transform 240ms cubic-bezier(0.2, 1.6, 0.4, 1), opacity 240ms; }
.bj-pop-leave-active, .bj-stamp-leave-active { transition: opacity 160ms; }
.bj-pop-enter-from { opacity: 0; transform: scale(0.7); }
.bj-pop-leave-to, .bj-stamp-leave-to { opacity: 0; }
.bj-stamp-enter-from { opacity: 0; transform: translate(-50%, -50%) rotate(-6deg) scale(0.6); }

/* ── controls ───────────────────────────────────────────────────────────────── */
.bj-controls {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bj-actionrow { display: flex; gap: 6px; }
/* Reserved permanently: buttons that appear and vanish between states would reflow the row
   under a thumb that is already moving. */
.bj-actionrow--secondary { min-height: 44px; }

.bj-chiprow {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}
.bj-chip {
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  border: 3px solid var(--ink);
  background: #2A2A30;
  color: #FFF8E7;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 2px 3px 0 rgba(0, 0, 0, 0.4);
  touch-action: manipulation;
}
.bj-chip:disabled { filter: grayscale(0.7) brightness(0.7); cursor: default; }
.bj-chip:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.bj-chip--10 { background: #E8342A; }
.bj-chip--20 { background: #66CC00; color: #06240A; }
.bj-chip--50 { background: #0A47A1; }
.bj-chip--100 { background: #101010; color: var(--gold); }
.bj-chip--500 { background: #7C5CBF; }
.bj-chip--clear, .bj-chip--buyin { border-radius: 12px; padding: 0 12px; }
.bj-chip--buyin.is-on { background: var(--gold); color: #241A00; }

.bj-betting, .bj-playing, .bj-insurance { display: flex; flex-direction: column; gap: 6px; }
.bj-betbar { display: flex; gap: 6px; }
.bj-insurance-q { margin: 0; text-align: center; font-size: 14px; }

.bj-broke {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

.bj-sr {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ── modals ─────────────────────────────────────────────────────────────────── */
.bj-modal {
  /* Teleported to <body>, so the tokens defined on .bj are out of scope and are restated. */
  --ink: #000;
  --ink-w: clamp(2px, 0.9vw, 4px);
  --go: #66CC00;
  --gold: #FFCC33;
  --stop: #E8342A;

  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  /* NOT align-items:center. When the sheet is taller than the screen, centring pushes its top
     out of the scroll range where it can never be reached — margin:auto on the child centres
     when there is room and simply starts at the top when there is not. */
  align-items: flex-start;
  justify-content: center;
  padding: 12px;
  font-family: "Nunito", system-ui, sans-serif;
  color: #FFF8E7;
  /* A flat scrim, not backdrop-filter: this appears many times a session, and a blur layer
     per appearance is exactly what makes a mid-range Android feel bad. */
  background: rgba(4, 2, 4, 0.82);
  overflow-y: auto;
}

.bj-sheet {
  margin: auto;
  width: min(100%, 400px);
  background: #14141A;
  border: var(--ink-w) solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 6px 0 var(--ink);
  padding: clamp(12px, 3vh, 20px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
}
.bj-sheet-title {
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: clamp(22px, 6vw, 30px);
  text-transform: uppercase;
  color: var(--gold);
  margin: 0 0 10px;
}
.bj-sheet-line { font-size: 14px; margin: 0 0 6px; }
.bj-sheet-math {
  font-size: 14px;
  background: rgba(255, 204, 51, 0.12);
  border: 2px solid var(--gold);
  border-radius: 10px;
  padding: 8px 10px;
  margin: 12px 0;
  line-height: 1.5;
}
.bj-sheet-note { font-size: 12px; opacity: 0.75; }
.bj-sheet-actions { display: flex; gap: 8px; margin-top: 12px; }

.bj-ack {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  margin: 10px 0;
  cursor: pointer;
}
.bj-ack input { margin-top: 3px; width: 18px; height: 18px; flex: 0 0 auto; }

.bj-rules { margin: 0 0 12px; padding-left: 18px; font-size: 13px; line-height: 1.6; }

.bj-error {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  z-index: 30;
  background: var(--stop);
  color: #FFF8E7;
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  max-width: 90%;
  text-align: center;
}

/* ── short viewports: phone landscape, small laptops ────────────────────────── */
/* Degraded rather than blocked. The other arcade pages refuse to run in landscape because a
   twitch game genuinely breaks; blackjack is turn-based, and refusing to draw would just be
   hostile to anyone with orientation lock on. */
/* Short screens: the site header can leave the table only a couple of hundred pixels, so the
   mode-select panel tightens up rather than relying on a scrollbar to reach its own title. */
@media (max-height: 700px) {
  .bj-title { font-size: clamp(24px, 6.5vw, 34px); margin-bottom: 6px; }
  .bj-card-panel { padding: 10px 12px; }
  .bj-sub { font-size: 12px; margin-bottom: 8px; }
  .bj-btn-note { font-size: 11px; margin: 4px 0 8px; }
  .bj-eyebrow { font-size: 11px; }
  .bj-link { min-height: 36px; padding: 4px; }
}

@media (max-height: 520px) {
  .bj-btn { min-height: 40px; font-size: 15px; }
  .bj-btn--sm { min-height: 34px; font-size: 13px; }
  .bj-chip { min-width: 34px; min-height: 34px; font-size: 12px; }
  .bj-hud-label { display: none; }
  .bj-hud-item { padding: 1px 4px; }
}

/* Landscape phone: stacking HUD + table + controls needs more vertical space than the device
   has once the site header is accounted for, so the controls move alongside the table. The
   page keeps working rather than demanding the player rotate — this is a turn-based card game,
   not a reflex game, so a rotate-to-portrait blocker would just be hostile. */
@media (max-height: 520px) and (min-width: 560px) {
  .bj {
    display: grid;
    grid-template-columns: 1fr clamp(150px, 26vw, 230px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "hud hud"
      "scene controls";
    gap: 5px;
  }
  .bj-hud { grid-area: hud; }
  .bj-scene { grid-area: scene; min-height: 0; }
  .bj-controls {
    grid-area: controls;
    justify-content: center;
    min-height: 0;
  }
  .bj-chiprow { gap: 4px; }
  .bj-center { grid-area: scene / scene / controls / controls; min-height: 0; }

  /* The mode-select panel goes side-by-side too. Stacked, its title and two full-width buttons
     need roughly 400px, and a landscape phone leaves under 200 once the site header has taken
     its share.

     The title is given an explicit multi-row span rather than being left to auto-placement:
     with one item per row the two columns would still stack sequentially and save nothing.
     `span 5` (not `1 / -1`) because -1 resolves against the *explicit* grid, which is one row
     here, so it would span nothing. */
  .bj-card-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 14px;
    text-align: left;
    padding: 8px 12px;
    width: min(100%, 620px);
  }
  .bj-eyebrow, .bj-sub { display: none; }
  .bj-title {
    grid-column: 1;
    grid-row: 1 / span 5;
    align-self: center;
    font-size: clamp(20px, 5vw, 32px);
    margin: 0;
  }
  .bj-notice { grid-column: 2; margin: 0 0 4px; font-size: 11px; }
  .bj-btn--block, .bj-btn-note, .bj-link { grid-column: 2; }
  .bj-btn--block { min-height: 40px; font-size: 16px; }
  .bj-btn-note { margin: 0 0 2px; font-size: 10px; }
  .bj-link { min-height: 30px; padding: 0; justify-self: start; }
}

@media (prefers-reduced-motion: reduce) {
  .bj-card, .bj-card.is-flipping { animation: none; }
  .bj-pop-enter-active, .bj-stamp-enter-active,
  .bj-pop-leave-active, .bj-stamp-leave-active { transition: opacity 120ms; }
  .bj-stamp-enter-from { transform: translate(-50%, -50%) rotate(-6deg); }
  .bj-spinner { animation-duration: 2s; }
}
</style>
