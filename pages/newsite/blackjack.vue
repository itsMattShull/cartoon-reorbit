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
        ref="scene"
      >
        <div class="bj-room" aria-hidden="true"></div>

        <!-- Spectators. `v-if` rather than `display:none` — a hidden <img> still downloads,
             and these are pure decoration that a phone should never pay for. -->
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

        <div class="bj-felt" aria-hidden="true"></div>
        <!-- Painted over the character bottoms: a cutout whose feet you can see reads as
             clip-art, one cut off by furniture reads as someone standing behind a table. -->
        <div class="bj-rail" aria-hidden="true"></div>

        <!-- Dealer -->
        <div class="bj-row bj-row--dealer">
          <div class="bj-row-head">
            <img v-if="!showSpectators" src="/blackjack/johnny-avatar.png" alt="Johnny Bravo"
                 class="bj-avatar" decoding="async" />
            <span class="bj-row-name">Johnny</span>
            <span v-if="hand" class="bj-total" :class="{ 'is-bust': hand.dealer.busted }">
              {{ hand.dealer.hidden ? hand.dealer.total + ' +' : hand.dealer.total }}
            </span>
          </div>
          <div class="bj-fan">
            <BjCard v-for="(card, i) in dealerCards" :key="'d' + i" :card="card" :index="i" />
            <div v-if="hand && hand.dealer.hidden" class="bj-card bj-card--back" :style="fanStyle(1)"></div>
          </div>
        </div>

        <!-- Johnny's line. Absolutely positioned so it can never add layout height. -->
        <transition name="bj-pop">
          <div v-if="bark" class="bj-bubble">{{ bark }}</div>
        </transition>

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
            <span v-if="activeHand" class="bj-total" :class="{ 'is-bust': activeHand.busted }">
              {{ activeHand.total }}<template v-if="activeHand.soft && !activeHand.busted"> soft</template>
            </span>
          </div>
          <div class="bj-fan">
            <BjCard v-for="(card, i) in playerCards" :key="'p' + i" :card="card" :index="i" />
          </div>
        </div>

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
                    :disabled="busy || pendingBet < rules.minBet" @click="deal">
              {{ pendingBet >= rules.minBet ? `Deal · ${pendingBet}` : `Min bet ${rules.minBet}` }}
            </button>
            <button class="bj-btn bj-btn--ghost" :disabled="busy || maxBet < rules.minBet"
                    @click="pendingBet = toIncrement(maxBet)">Max</button>
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
              Leave
            </button>
          </div>
        </div>

        <!-- Out of chips -->
        <div v-if="outOfChips" class="bj-broke">
          <template v-if="isGamble">
            <span>Out of chips.</span>
            <button class="bj-link" :disabled="buyInLeft < rules.minBet" @click="openBuyIn">
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

    <!-- ── Cash-out sheet ──────────────────────────────────────────────── -->
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

    <!-- ── Rules ───────────────────────────────────────────────────────── -->
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

    <div v-if="error" class="bj-error" role="alert">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, h } from 'vue'

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
  class: ['bj-card', (props.card.suit === 'H' || props.card.suit === 'D') ? 'is-red' : 'is-black'],
  style: { '--i': props.index }
}, [
  h('span', { class: 'bj-card-rank' }, props.card.rank),
  h('span', { class: 'bj-card-suit' }, SUIT_GLYPH[props.card.suit] || '')
])
BjCard.props = ['card', 'index']

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
  minBet: 10, maxBet: 500, deckCount: 6, dealerHitsSoft17: false,
  payoutNum: 3, payoutDen: 2, allowDouble: true, allowSplit: true,
  allowInsurance: true, practiceStack: 1000
})
const daily = ref({
  buyInUsed: 0, buyInLimit: 1000, buyInLeft: 1000,
  netWinnings: 0, winLimit: 3000, resetsAt: null
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
const showSpectators = computed(() =>
  viewportWidth.value >= 700 && viewportHeight.value >= 640
)

const phase = computed(() => {
  if (!hand.value) return 'betting'
  if (hand.value.phase === 'insurance') return 'insurance'
  if (hand.value.phase === 'settled') return 'settled'
  return 'playing'
})

const activeHand = computed(() => {
  if (!hand.value) return null
  return hand.value.hands[Math.min(hand.value.active, hand.value.hands.length - 1)]
})
const inactiveHand = computed(() => {
  if (!hand.value || hand.value.hands.length < 2) return null
  return hand.value.hands.find(h2 => h2.index !== activeHand.value?.index) ?? null
})
const dealerCards = computed(() => hand.value?.dealer.cards ?? [])
const playerCards = computed(() => activeHand.value?.cards ?? [])

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

function can (action) {
  return hand.value?.actions?.includes(action) ?? false
}

// ── barks ─────────────────────────────────────────────────────────────────────
// Johnny hits on everything, but never at the player — the vanity points at himself and at the
// spectators, which is funnier and keeps it safe for a site with kids on it.
const BARKS = {
  blackjack: ['Whoa, mama! Twenty-one!', 'Blackjack! I dealt that, you know.', "Hoo-ah! Nice hand. Mine's prettier."],
  win: ['Yeah, yeah. You got lucky.', 'Fine. Take the chips. I got the hair.', "Huh. Didn't see that coming."],
  bust: ['Ooooh. Too many. Hoo-ah!', "That's a lotta card, pal.", 'Yikes. Want a mirror? It helps.'],
  dealerBust: ["What?! That's not my best angle.", 'I busted. Still gorgeous, though.', 'Aw, man. I blame the lighting.'],
  push: ['A tie. Nobody looks good in a tie.', "Push. We're both winners. Mostly me.", 'Same total. Spooky.'],
  lose: ['Read â€™em and weep.', 'The house looks good today.', 'Better luck next deal, pal.'],
  cashOut: ['Leavin\'? More mirror time for me.', "Cashed out. Tell 'em Johnny sent ya.", 'Later, champ. I\'ll be here. Flexing.'],
  capped: ["Whoa! You broke the bank!", "That's the house limit, pal. I gotta eat."],
  idle: ['Bets down. Let\'s do this.', 'Money on the felt, pal.', "Grim, quit lookin' at my cards.", 'Courage, stop shakin\' the table.', 'Nice sword, Jack. Nice hair, me.']
}

function say (key) {
  const lines = BARKS[key]
  if (!lines?.length) return
  bark.value = lines[Math.floor(Math.random() * lines.length)]
  clearTimeout(barkTimer)
  barkTimer = setTimeout(() => { bark.value = '' }, 2600)
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

async function call (url, body) {
  busy.value = true
  error.value = ''
  try {
    return await $fetch(url, body ? { method: 'POST', body } : {})
  } catch (e) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Something went wrong. Try again.'
    setTimeout(() => { error.value = '' }, 4000)
    return null
  } finally {
    busy.value = false
  }
}

async function refresh () {
  const view = await call('/api/game/blackjack/status')
  if (!view) return
  applyView(view)
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
  applyView(view)
  politeMessage.value = describeHand()
  if (view.hand?.phase === 'settled') settleUi(view)
}

async function act (action) {
  const view = await call('/api/game/blackjack/action', { mode: mode.value, action })
  if (!view) return
  applyView(view)
  politeMessage.value = describeHand()
  if (view.hand?.phase === 'settled') settleUi(view)
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

  if (anyBlackjack) { showStamp('BLACKJACK!', 'gold'); say('blackjack') }
  else if (allBust) { showStamp('BUST', 'bad'); say('bust') }
  else if (net > 0) { showStamp(dealerBusted ? 'DEALER BUSTS' : 'YOU WIN', 'good'); say(dealerBusted ? 'dealerBust' : 'win') }
  else if (net === 0) { showStamp('PUSH', 'neutral'); say('push') }
  else { showStamp('DEALER WINS', 'bad'); say('lose') }

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
  hand.value = null
  stamp.value = null
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

function leaveTable () {
  if (isGamble.value) { showCashOut.value = true; return }
  screen.value = 'select'
  mode.value = null
  hand.value = null
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
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  clearTimeout(barkTimer)
  clearTimeout(stampTimer)
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
  --felt: #1F7A3D;
  --felt-dk: #14612F;

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

/* Without the characters there is nothing to fill the room above the table, so the felt moves
   up to use the space rather than leaving a dead band across the top of a phone screen. */
.bj-scene.no-cast .bj-felt { top: 15%; }
.bj-scene.no-cast .bj-rail { top: 13%; }
.bj-scene.no-cast .bj-row--dealer { top: 19%; }

/* Practice runs on blue felt. The largest object on screen changing colour is a far stronger
   signal than any badge that you are or are not wagering real points. */
.bj-scene.is-practice { --felt: #1B5E9E; --felt-dk: #124470; }

/* ── loading / panels ───────────────────────────────────────────────────────── */
.bj-center {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

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

.bj-felt {
  position: absolute;
  left: 2%;
  right: 2%;
  top: 34%;
  bottom: -14%;
  border: var(--ink-w) solid var(--ink);
  border-radius: 50% 50% 46% 46% / 22% 22% 30% 30%;
  background: radial-gradient(110% 80% at 50% 30%, var(--felt), var(--felt-dk) 85%);
}

.bj-rail {
  position: absolute;
  left: 2%;
  right: 2%;
  top: 32%;
  height: 5%;
  border: var(--ink-w) solid var(--ink);
  border-radius: 50%;
  background: linear-gradient(180deg, #A8462C, var(--rail));
  z-index: 3;
}

/* One synthesized ink line and one contact shadow for all four cutouts, so they share a line
   weight with the cards and buttons and read as one drawing. It also swallows the JPEG
   fringe left over from cutting Johnny out of a white background. */
.bj-char {
  position: absolute;
  object-fit: contain;
  z-index: 2;
  pointer-events: none;
  filter:
    drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000)
    drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000)
    drop-shadow(6px 8px 0 rgba(0, 0, 0, 0.35));
}
.bj-char--johnny  { left: 50%; transform: translateX(-50%); bottom: 63%; height: 46%; }
.bj-char--jack    { left: 3%;  bottom: 60%; height: 34%; }
.bj-char--grim    { right: 2%; bottom: 60%; height: 33%; }
.bj-char--courage { right: 24%; bottom: 61%; height: 15%; }

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
.bj-row--dealer { top: 38%; }
.bj-row--player { bottom: 4%; }

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
     six-card hand still fits the narrowest phone. */
  margin-left: calc(var(--card-w) * -0.42);
  animation: bj-deal 180ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
.bj-card:first-child { margin-left: 0; }

@keyframes bj-deal {
  from { opacity: 0; transform: translateY(-18px) rotate(-12deg) scale(0.86); }
  to   { opacity: 1; transform: none; }
}

.bj-card-rank {
  position: absolute;
  top: 1px;
  left: 3px;
  font-family: "FuturaBdCnBT", "Nunito", sans-serif;
  font-size: calc(var(--card-w) * 0.44);
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
  top: 3%;
  right: 3%;
  max-width: 56%;
  z-index: 8;
  background: var(--card-face);
  color: #101010;
  border: var(--ink-w) solid var(--ink);
  border-radius: 18px;
  padding: 6px 11px;
  font-size: clamp(11px, 2.9vw, 14px);
  font-weight: 700;
  box-shadow: 3px 4px 0 rgba(0, 0, 0, 0.45);
}

.bj-stampword {
  position: absolute;
  top: 46%;
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
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  /* A flat scrim, not backdrop-filter: this appears many times a session, and a blur layer
     per appearance is exactly what makes a mid-range Android feel bad. */
  background: rgba(4, 2, 4, 0.82);
  overflow-y: auto;
}

.bj-sheet {
  width: min(100%, 400px);
  background: #14141A;
  border: var(--ink-w) solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 6px 0 var(--ink);
  padding: clamp(12px, 3vh, 20px);
  max-height: 100%;
  overflow-y: auto;
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
@media (max-height: 520px) {
  .bj-btn { min-height: 40px; font-size: 15px; }
  .bj-btn--sm { min-height: 34px; font-size: 13px; }
  .bj-chip { min-width: 34px; min-height: 34px; font-size: 12px; }
  .bj-row--dealer { top: 32%; }
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
  .bj-center { grid-area: scene / scene / controls / controls; }
}

@media (prefers-reduced-motion: reduce) {
  .bj-card { animation: none; }
  .bj-pop-enter-active, .bj-stamp-enter-active,
  .bj-pop-leave-active, .bj-stamp-leave-active { transition: opacity 120ms; }
  .bj-stamp-enter-from { transform: translate(-50%, -50%) rotate(-6deg); }
  .bj-spinner { animation-duration: 2s; }
}
</style>
