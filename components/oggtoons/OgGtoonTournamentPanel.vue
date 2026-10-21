<!-- components/oggtoons/OgGtoonTournamentPanel.vue -->
<!-- One tournament, start to finish: what it is and pays, entering with a locked deck, your own
     pairing (Play / waiting / forfeit), your deck, standings, rounds and the final result. -->
<template>
  <div class="ogt-panel text-white px-3 py-3 max-w-5xl mx-auto">
    <Toast v-if="toast.visible" :message="toast.message" :type="toast.type" />

    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="h-28 bg-white/10 rounded animate-pulse"></div>
      <div class="h-40 bg-white/10 rounded animate-pulse"></div>
    </div>
    <div v-else-if="loadError" class="p-4 rounded bg-red-500/20 border border-red-400 text-sm" role="alert">
      {{ loadError }} <button class="underline ml-1" @click="load()">Try again</button>
    </div>

    <template v-else-if="t">
      <!-- ── What it is ─────────────────────────────────────────────────────────────── -->
      <section class="ogt-card" aria-labelledby="ogt-title">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h2 id="ogt-title" class="text-xl font-bold">{{ t.name }}</h2>
          <span class="ogt-badge" :class="statusInfo.cls"><span aria-hidden="true">{{ statusInfo.icon }}</span> {{ statusInfo.label }}</span>
        </div>
        <p v-if="t.description" class="text-sm text-gray-300 mt-1 whitespace-pre-line">{{ t.description }}</p>

        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mt-3">
          <div><dt class="inline text-gray-400">Format: </dt><dd class="inline">{{ formatText }}</dd></div>
          <div><dt class="inline text-gray-400">Every match: </dt><dd class="inline">Best of 3 — first to 2 game wins</dd></div>
          <div><dt class="inline text-gray-400">Entrants: </dt><dd class="inline">{{ t.optInCount }}</dd></div>
          <div><dt class="inline text-gray-400">Time per round: </dt><dd class="inline">{{ t.roundWindowHours }} hours</dd></div>
          <div class="sm:col-span-2"><dt class="inline text-gray-400">Opt-in: </dt><dd class="inline">{{ fmt(t.optInStartAt) }} → {{ fmt(t.optInEndAt) }}</dd></div>
        </dl>
        <p v-if="countdownText" class="text-sm text-indigo-300 mt-2">{{ countdownText }}</p>

        <div v-if="t.prizes?.first || t.prizes?.top8" class="grid sm:grid-cols-2 gap-3 mt-4">
          <div v-for="p in prizeBlocks" :key="p.key" class="rounded border border-amber-300/30 bg-amber-300/5 p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-amber-200">{{ p.title }}</p>
            <p v-if="p.note" class="text-[11px] text-gray-400">{{ p.note }}</p>
            <ul class="mt-1 text-sm space-y-1">
              <li v-if="p.prize.points">⭐ {{ Number(p.prize.points).toLocaleString() }} points</li>
              <li v-for="c in p.prize.ctoons" :key="c.ctoonId" class="flex items-center gap-2">
                <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="h-8 w-8 object-contain" loading="lazy" />
                <span>{{ c.quantity > 1 ? c.quantity + '× ' : '' }}{{ c.name }}</span>
              </li>
              <li v-for="b in p.prize.backgrounds" :key="b.backgroundId" class="flex items-center gap-2">
                <img v-if="b.imagePath" :src="b.imagePath" :alt="b.name" class="h-8 w-14 object-cover rounded" loading="lazy" />
                <span>Background</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ── You ────────────────────────────────────────────────────────────────────── -->
      <section class="ogt-card ogt-primary" aria-labelledby="ogt-you" aria-live="polite">
        <h3 id="ogt-you" class="text-base font-semibold mb-2">{{ youTitle }}</h3>
        <p v-if="actionError" class="mb-2 text-sm text-red-300 bg-red-500/10 border border-red-400/40 rounded px-2 py-1.5" role="alert">{{ actionError }}</p>

        <!-- Not entered, opt-in open -->
        <template v-if="canEnter">
          <p v-if="!decksLoaded" class="text-sm text-gray-400">Loading your decks…</p>
          <div v-else-if="!validDecks.length" class="text-sm p-3 rounded bg-red-500/20 border border-red-400">
            You need a valid 12-card deck of 12 <em>different</em> gToons to enter.
            <button class="underline ml-1" @click="$emit('switch-tab', 'decks')">Build one on the Manage Deck tab</button>
          </div>
          <div v-else>
            <p class="text-sm text-gray-300 mb-2">
              Pick the deck you will play every game with. It is <strong>locked</strong> when you enter: you play these exact
              cards for the whole tournament, so don't sell or trade them.
            </p>
            <label for="ogt-deck" class="block text-xs text-gray-400 mb-1">Deck</label>
            <select id="ogt-deck" v-model="selectedDeckId" class="w-full max-w-sm border rounded px-3 py-2 text-gray-800 text-sm">
              <option v-for="d in validDecks" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
            <DeckStrip :cards="selectedDeck?.cards || []" class="mt-2" />
            <button class="mt-3 px-4 py-2 rounded bg-green-500 hover:bg-green-600 text-sm font-semibold disabled:opacity-50" :disabled="busy || !selectedDeckId" @click="optIn">
              {{ myEntry.isOptedIn ? 'Lock in this deck instead' : 'Lock in deck & enter' }}
            </button>
          </div>
        </template>

        <!-- Entered, opt-in still open -->
        <template v-if="t.status === 'OPT_IN_OPEN' && myEntry.isOptedIn">
          <p class="text-sm text-green-300 mb-2">✅ You're entered. Opt-in closes {{ fmt(t.optInEndAt) }}.</p>
          <button class="px-3 py-1.5 rounded bg-gray-600 hover:bg-gray-500 text-sm" :disabled="busy" @click="optOut">Leave tournament</button>
        </template>

        <!-- Waiting for the start -->
        <p v-else-if="my.phase === 'REGISTERED'" class="text-sm text-gray-200">
          ✅ You're in. {{ t.status === 'DRAFT' ? 'Opt-in opens soon.' : 'Pairings are made as soon as opt-in closes — you will get a Discord message.' }}
        </p>
        <p v-else-if="my.phase === 'NOT_ENTERED' && !canEnter" class="text-sm text-gray-300">
          {{ t.status === 'DRAFT' ? 'Opt-in has not opened yet.' : 'You are not in this tournament.' }}
        </p>
        <p v-else-if="my.phase === 'DISQUALIFIED'" class="text-sm text-red-300">You were removed from this tournament{{ my.note ? `: ${my.note}` : '.' }}</p>
        <p v-else-if="my.phase === 'CANCELLED'" class="text-sm text-gray-300">This tournament was cancelled.</p>
        <p v-else-if="my.phase === 'FINISHED'" class="text-sm">
          🏁 The tournament is over.
          <strong v-if="my.place">You finished <span class="text-amber-300">{{ ordinal(my.place) }}</span>.</strong>
        </p>
        <p v-else-if="my.phase === 'ELIMINATED'" class="text-sm text-gray-200">You've been knocked out of the bracket. Thanks for playing — you can still follow the rest below.</p>
        <p v-else-if="my.phase === 'BYE'" class="text-sm text-gray-200">You have a bye this round (counts as a win). Your next pairing appears when the round is done.</p>
        <p v-else-if="my.phase === 'WAITING'" class="text-sm text-gray-200">
          Your match is decided. Waiting for the other matches in this round to finish — the next round starts automatically and you will be messaged.
          <span v-if="my.lastResult" class="block text-gray-400 mt-1">Last result: {{ resultText(my.lastResult) }}</span>
        </p>
        <div v-else-if="my.phase === 'NEEDS_ADMIN'" class="text-sm p-3 rounded bg-amber-500/10 border border-amber-400/50">
          ⏳ This match is waiting for an admin decision{{ my.needsAdminReason ? ` (${my.needsAdminReason})` : '' }}. You don't need to do anything.
        </div>

        <!-- Your open pairing -->
        <div v-else-if="my.phase === 'OPEN' && my.match">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="text-sm"><span class="text-gray-400">{{ my.match.label }} · </span>vs <strong class="text-base">{{ my.match.opponent?.username }}</strong></p>
            <p class="text-xs" :class="overdueSoon ? 'text-amber-300' : 'text-gray-400'">Due {{ fmt(my.match.dueAt) }} · {{ dueRelative }}</p>
          </div>

          <!-- Series -->
          <div class="flex items-center gap-4 my-3">
            <div class="text-center"><div class="text-3xl font-bold leading-none">{{ my.match.you.wins }}</div><div class="text-[11px] text-gray-400">You</div></div>
            <div class="text-gray-500" aria-hidden="true">–</div>
            <div class="text-center"><div class="text-3xl font-bold leading-none">{{ my.match.opponentWins }}</div><div class="text-[11px] text-gray-400 max-w-[8rem] truncate">{{ my.match.opponent?.username }}</div></div>
            <div class="text-xs text-gray-400 ml-2">
              First to 2 wins.
              <span v-if="my.match.nextGameNumber">Next: game {{ my.match.nextGameNumber }}.</span>
              <span v-if="my.match.voided"> {{ my.match.voided }} game(s) voided and replayed.</span>
            </div>
          </div>

          <!-- Play -->
          <div v-if="my.match.live" class="text-sm p-2 rounded bg-indigo-500/20 border border-indigo-400/50">
            🎮 A game of this match is being played right now.
            <button v-if="currentMatchId" class="underline ml-1" @click="$emit('open-match', currentMatchId)">Go to the board</button>
          </div>
          <div v-else>
            <div class="flex flex-wrap items-center gap-2">
              <button v-if="!liveReady.my" class="px-5 py-2 rounded bg-green-500 hover:bg-green-600 text-sm font-semibold disabled:opacity-50" :disabled="busy || !!deckProblem" @click="play">
                {{ liveReady.opponent ? `Play now — ${my.match.opponent?.username} is ready` : 'Play' }}
              </button>
              <template v-else>
                <span class="text-sm text-indigo-300" aria-live="polite">⏳ You're ready — waiting for {{ my.match.opponent?.username }}…</span>
                <button class="px-3 py-1.5 rounded bg-gray-600 hover:bg-gray-500 text-sm" @click="unready">Cancel</button>
              </template>
              <button class="px-3 py-1.5 rounded bg-red-700/70 hover:bg-red-700 text-xs ml-auto" :disabled="busy" @click="forfeit">Forfeit match</button>
            </div>
            <p class="text-xs mt-2" :class="liveReady.opponentOnline ? 'text-green-300' : 'text-gray-400'">
              {{ liveReady.opponentOnline ? `● ${my.match.opponent?.username} is on gToons right now.` : `○ ${my.match.opponent?.username} isn't on gToons right now — if you press Play they'll be sent a Discord message.` }}
            </p>
            <p class="text-xs text-gray-500 mt-1">Both of you need to press Play within 30 minutes of each other. Leaving a game forfeits that game; a dropped connection gets 90 seconds to come back.</p>
          </div>
        </div>
      </section>

      <!-- ── Your locked deck ───────────────────────────────────────────────────────── -->
      <section v-if="myEntry.isOptedIn && deck" class="ogt-card" aria-labelledby="ogt-deck-h">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ogt-deck-h" class="text-base font-semibold">Your locked deck</h3>
          <button v-if="deck.flaggedPositions.length && canRepair" class="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-sm font-semibold" @click="openRepair">Fix problems ({{ deck.flaggedPositions.length }})</button>
        </div>
        <p v-if="deck.flaggedPositions.length" class="text-sm text-amber-200 mt-1" role="alert">
          ⚠ {{ deck.flaggedPositions.length }} card(s) in your locked deck can't be used any more (sold, traded, or handed to someone and back).
          You can't start a game until they're replaced<span v-if="!canRepair"> — replacements open once opt-in has closed and between series</span>.
        </p>
        <DeckStrip :cards="deck.cards" show-problems class="mt-2" />
      </section>

      <!-- ── Final result ───────────────────────────────────────────────────────────── -->
      <section v-if="t.status === 'COMPLETE' && placements.length" class="ogt-card" aria-labelledby="ogt-final">
        <h3 id="ogt-final" class="text-base font-semibold mb-2">Final placings</h3>
        <ol class="text-sm space-y-0.5">
          <li v-for="p in placements" :key="p.userId" :class="p.userId === meId ? 'text-amber-200 font-semibold' : ''">
            <span class="inline-block w-8 text-gray-400">{{ p.place }}.</span>{{ p.username }}
            <span v-if="p.place === 1" aria-label="winner">🏆</span>
            <span v-if="prizeTierFor(p.place)" class="ml-2 text-[11px] text-amber-300">{{ prizeTierFor(p.place) }}</span>
          </li>
        </ol>
      </section>

      <!-- ── Standings ──────────────────────────────────────────────────────────────── -->
      <section v-if="standings.length" class="ogt-card" aria-labelledby="ogt-stand">
        <h3 id="ogt-stand" class="text-base font-semibold mb-2">Standings</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs">
            <caption class="sr-only">Standings, best first</caption>
            <thead>
              <tr class="text-left text-gray-400">
                <th scope="col" class="py-1 pr-2">#</th><th scope="col" class="py-1 pr-2">Player</th>
                <th v-if="showSwiss" scope="col" class="py-1 pr-2">Pts</th>
                <th v-if="showSwiss" scope="col" class="py-1 pr-2">W-L-D</th>
                <th v-if="showSwiss" scope="col" class="py-1 pr-2" title="How well your opponents did">OMW%</th>
                <th v-if="showSwiss" scope="col" class="py-1 pr-2" title="Share of games you won">GW%</th>
                <th v-if="showBracket" scope="col" class="py-1">Bracket</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in standings" :key="r.userId" class="border-t border-white/10" :class="r.userId === meId ? 'bg-indigo-500/20' : ''">
                <td class="py-1 pr-2 text-gray-400">{{ i + 1 }}</td>
                <td class="py-1 pr-2">{{ r.username }}<span v-if="r.disqualified" class="text-red-300 ml-1">(out)</span><span v-if="r.userId === meId" class="text-indigo-300 ml-1">(you)</span></td>
                <td v-if="showSwiss" class="py-1 pr-2">{{ r.points }}</td>
                <td v-if="showSwiss" class="py-1 pr-2">{{ r.swissWins }}-{{ r.swissLosses }}-{{ r.swissTies }}</td>
                <td v-if="showSwiss" class="py-1 pr-2">{{ pct(r.opponentMatchWinPct) }}</td>
                <td v-if="showSwiss" class="py-1 pr-2">{{ pct(r.gameWinPct) }}</td>
                <td v-if="showBracket" class="py-1">{{ r.bracketWins }}-{{ r.bracketLosses }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="showSwiss" class="text-[11px] text-gray-500 mt-2">
          Swiss points: 3 for a win, 1 for a draw. Ties are broken by OMW% (how well your opponents did) then GW% (share of games won). Byes don't count toward tiebreaks.
        </p>
      </section>

      <!-- ── Rounds ─────────────────────────────────────────────────────────────────── -->
      <section v-if="rounds.length" class="ogt-card" aria-labelledby="ogt-rounds">
        <h3 id="ogt-rounds" class="text-base font-semibold mb-2">Rounds</h3>
        <div class="space-y-3">
          <div v-for="r in rounds" :key="r.id" class="border border-white/10 rounded p-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <p class="text-sm font-semibold">{{ r.label }}</p>
              <p v-if="r.dueAt && isRoundOpen(r)" class="text-[11px] text-gray-400">Due {{ fmt(r.dueAt) }}</p>
            </div>
            <ul class="space-y-1">
              <li v-for="m in r.matches" :key="m.id" class="flex flex-wrap items-center justify-between gap-2 text-sm rounded px-1.5 py-0.5"
                :class="isMine(m) ? 'bg-indigo-500/20' : ''">
                <span>
                  <span :class="m.winnerUserId && m.winnerUserId === m.playerAUserId ? 'font-semibold text-green-300' : ''">{{ m.playerAName }}</span>
                  <span class="text-gray-500"> vs </span>
                  <span :class="m.winnerUserId && m.winnerUserId === m.playerBUserId ? 'font-semibold text-green-300' : ''">{{ m.playerBName }}</span>
                </span>
                <span class="text-xs text-gray-400">{{ matchStatusText(m) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>

    <!-- Repair modal -->
    <div v-if="repairOpen" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3" role="dialog" aria-modal="true" aria-labelledby="ogt-repair-h">
      <div class="bg-gray-900 border border-white/20 rounded-xl p-5 w-[34rem] max-w-full max-h-[90vh] overflow-y-auto">
        <h3 id="ogt-repair-h" class="text-lg font-bold mb-1">Replace cards in your locked deck</h3>
        <p class="text-xs text-gray-400 mb-3">Each flagged slot needs a different gToon that you own right now (not a copy that was lent out). Your deck can't change in the middle of a series.</p>
        <div v-for="pos in deck?.flaggedPositions || []" :key="pos" class="mb-3">
          <label :for="'rep-' + pos" class="block text-sm mb-1">
            Slot {{ pos + 1 }}: replace <strong>{{ deck.cards.find(c => c.position === pos)?.name }}</strong>
          </label>
          <select :id="'rep-' + pos" v-model="repairPick[pos]" class="w-full border rounded px-2 py-1.5 text-gray-800 text-sm">
            <option value="">Choose a gToon…</option>
            <option v-for="g in repairChoices(pos)" :key="g.ctoonId" :value="g.ctoonId">{{ g.name }} ({{ g.gtoonValue }})</option>
          </select>
        </div>
        <p v-if="repairError" class="text-sm text-red-300 mb-2" role="alert">{{ repairError }}</p>
        <div class="flex justify-end gap-2">
          <button class="px-4 py-2 bg-gray-700 rounded text-sm" @click="repairOpen = false">Cancel</button>
          <button class="px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded text-sm font-semibold disabled:opacity-50" :disabled="busy || !repairReady" @click="submitRepair">Replace cards</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, h } from 'vue'
import Toast from '@/components/Toast.vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

const props = defineProps({ tournamentId: { type: String, required: true } })
defineEmits(['switch-tab', 'open-match'])

/* A strip of 12 card thumbnails (functional, so no extra file). */
const DeckStrip = (p) => h('div', { class: 'grid grid-cols-6 sm:grid-cols-12 gap-1', role: 'list', 'aria-label': 'Deck cards' },
  (p.cards || []).map((c, i) => h('div', {
    key: c.position ?? c.id ?? i, role: 'listitem', title: c.name,
    class: ['relative rounded border text-center bg-white/5', p.showProblems && c.problem ? 'border-red-400' : 'border-white/15']
  }, [
    h('img', { src: c.assetPath, alt: c.name, loading: 'lazy', class: 'h-12 w-full object-contain p-0.5' }),
    h('div', { class: 'text-[9px] truncate px-0.5 text-gray-300' }, c.name),
    p.showProblems && c.problem
      ? h('div', { class: 'absolute inset-x-0 top-0 text-[9px] bg-red-600/90 rounded-t' }, c.problem === 'MOVED' ? 'moved' : 'missing')
      : null
  ])))
DeckStrip.props = ['cards', 'showProblems']

const { lastError, currentMatchId, tournamentStates, tournamentReady, tournamentUnready, tournamentSync } = useOgGtoonsSocket()

const t = ref(null)
const meId = computed(() => t.value?.meId || null)
const my = ref({ phase: 'NOT_ENTERED' })
const standings = ref([])
const rounds = ref([])
const deck = ref(null)
const decks = ref([])
const decksLoaded = ref(false)
const selectedDeckId = ref('')
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const actionError = ref('')
const toast = ref({ visible: false, message: '', type: 'error' })
const now = ref(Date.now())
let tick = null
let refresh = null

function showToast(message, type = 'error') {
  toast.value = { visible: true, message, type }
  setTimeout(() => { toast.value.visible = false }, 3500)
}
const errMsg = (e) => e?.data?.statusMessage || e?.statusMessage || e?.message || 'Something went wrong.'

/* ── Formatting ──────────────────────────────────────────────────────────────────────────── */
function fmt(v) {
  if (!v) return 'TBD'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? 'TBD' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
function duration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(mins / 1440); const hr = Math.floor((mins % 1440) / 60); const m = mins % 60
  return [d && `${d}d`, (d || hr) && `${hr}h`, `${m}m`].filter(Boolean).join(' ')
}
const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

const STATUS = {
  DRAFT: { label: 'Coming soon', icon: '◔', cls: 'bg-yellow-200/20 text-yellow-200' },
  OPT_IN_OPEN: { label: 'Opt-in open', icon: '●', cls: 'bg-green-300/20 text-green-200' },
  OPT_IN_CLOSED: { label: 'Starting soon', icon: '◐', cls: 'bg-yellow-200/20 text-yellow-200' },
  SWISS_ACTIVE: { label: 'Swiss rounds', icon: '▶', cls: 'bg-blue-300/20 text-blue-200' },
  BRACKET_ACTIVE: { label: 'Bracket', icon: '▶', cls: 'bg-blue-300/20 text-blue-200' },
  COMPLETE: { label: 'Complete', icon: '🏁', cls: 'bg-gray-300/20 text-gray-200' },
  CANCELLED: { label: 'Cancelled', icon: '✕', cls: 'bg-red-300/20 text-red-200' }
}
const statusInfo = computed(() => STATUS[t.value?.status] || STATUS.DRAFT)
const formatText = computed(() => t.value?.format === 'SWISS_THEN_TOP8'
  ? `Swiss (${t.value.swissRoundsPlanned || 'several'} rounds) → Top 8 single elimination`
  : t.value?.format === 'BRACKET_8_OR_LESS' ? 'Single elimination' : 'Chosen when opt-in closes: single elimination for 8 or fewer entrants, otherwise Swiss into a Top 8')
const countdownText = computed(() => {
  if (!t.value) return ''
  const s = new Date(t.value.optInStartAt).getTime(); const e = new Date(t.value.optInEndAt).getTime()
  if (t.value.status === 'DRAFT' && s > now.value) return `Opt-in opens in ${duration(s - now.value)}`
  if (t.value.status === 'OPT_IN_OPEN' && e > now.value) return `Opt-in closes in ${duration(e - now.value)}`
  return ''
})
const prizeBlocks = computed(() => {
  const out = []
  if (t.value?.prizes?.first) out.push({ key: 'first', title: '🥇 1st place', prize: t.value.prizes.first })
  if (t.value?.prizes?.top8) out.push({ key: 'top8', title: '🏅 Top 8 (places 2–8)', prize: t.value.prizes.top8, note: `Paid when ${t.value.minEntrantsTop8Prize}+ players enter.` })
  return out
})
const prizeTierFor = (place) => {
  if (place === 1 && t.value?.prizes?.first) return 'Won the 1st-place prize'
  if (place >= 2 && place <= 8 && t.value?.prizes?.top8 && t.value.optInCount >= t.value.minEntrantsTop8Prize) return 'Top 8 prize'
  return ''
}

/* ── Derived state ───────────────────────────────────────────────────────────────────────── */
const myEntry = computed(() => ({ isOptedIn: !!t.value?.isOptedIn }))
const canEnter = computed(() => t.value?.status === 'OPT_IN_OPEN' && !t.value?.disqualified)
const validDecks = computed(() => decks.value.filter(d => d.valid && new Set(d.cards.map(c => c.id)).size === 12))
const selectedDeck = computed(() => validDecks.value.find(d => d.id === selectedDeckId.value))
const showSwiss = computed(() => t.value?.format !== 'BRACKET_8_OR_LESS')
const showBracket = computed(() => t.value?.format === 'BRACKET_8_OR_LESS' || ['BRACKET_ACTIVE', 'COMPLETE'].includes(t.value?.status))
const placements = computed(() => (Array.isArray(t.value?.finalPlacementsJson) ? t.value.finalPlacementsJson : []))
const youTitle = computed(() => (t.value?.status === 'OPT_IN_OPEN' ? 'Your entry' : 'Your tournament'))
const canRepair = computed(() => ['OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE'].includes(t.value?.status) &&
  !(my.value.phase === 'OPEN' && (my.value.match?.live || my.value.match?.gamesCounted > 0)))
const deckProblem = computed(() => !!deck.value?.flaggedPositions?.length)
const dueMs = computed(() => (my.value.match?.dueAt ? new Date(my.value.match.dueAt).getTime() - now.value : null))
const overdueSoon = computed(() => dueMs.value !== null && dueMs.value < 6 * 3600 * 1000)
const dueRelative = computed(() => (dueMs.value === null ? '' : dueMs.value <= 0 ? 'overdue' : `${duration(dueMs.value)} left`))

// Live readiness from the socket wins over the last REST read.
const liveReady = computed(() => {
  const m = my.value.match
  const s = m ? tournamentStates.value[m.id] : null
  return {
    my: s ? s.myReady : !!m?.myReady,
    opponent: s ? s.opponentReady : !!m?.opponentReady,
    opponentOnline: !!s?.opponentOnline
  }
})

const isMine = (m) => !!meId.value && (m.playerAUserId === meId.value || m.playerBUserId === meId.value)
const isRoundOpen = (r) => r.matches.some(m => ['PENDING', 'IN_PROGRESS'].includes(m.status))
function matchStatusText(m) {
  if (m.status === 'BYE') return 'Bye'
  if (m.needsAdmin) return 'Waiting for an admin'
  if (m.status === 'COMPLETE') {
    const score = `${m.winsA}–${m.winsB}${m.ties ? ` (${m.ties} tied)` : ''}`
    const how = m.resolution && m.resolution !== 'PLAYED' ? ` · ${({ FORFEIT: 'forfeit', WALKOVER: 'walkover', DEADLINE: 'deadline', ADMIN: 'admin decision' })[m.resolution]}` : ''
    return m.outcome === 'TIE' ? `Draw ${score}${how}` : m.outcome ? `${score}${how}` : `No result${how}`
  }
  if (m.live) return `Playing now · ${m.winsA}–${m.winsB}`
  return m.gamesCounted ? `In progress · ${m.winsA}–${m.winsB}` : 'Not started'
}
const resultText = (r) => `${r.result === 'WIN' ? 'Won' : r.result === 'DRAW' ? 'Drew' : 'Lost'} ${r.you}–${r.opponentWins} vs ${r.opponentName}`

/* ── Loading ─────────────────────────────────────────────────────────────────────────────── */
const base = () => `/api/game/oggtoons/tournaments/${props.tournamentId}`

async function loadDeck() {
  if (!t.value?.isOptedIn) { deck.value = null; return }
  try { deck.value = await $fetch(`${base()}/my-deck`) } catch { deck.value = null }
}
async function loadDecks() {
  if (decksLoaded.value) return
  try { decks.value = await $fetch('/api/game/oggtoons/decks') } catch { decks.value = [] }
  decksLoaded.value = true
  if (!selectedDeckId.value && validDecks.value.length) selectedDeckId.value = validDecks.value[0].id
}
async function load({ quiet = false, sync = true } = {}) {
  if (!quiet) loading.value = true
  loadError.value = ''
  try {
    const [tt, mm, st, rr] = await Promise.all([
      $fetch(base()), $fetch(`${base()}/my-match`), $fetch(`${base()}/standings`), $fetch(`${base()}/matches`)
    ])
    t.value = tt; my.value = mm; standings.value = Array.isArray(st) ? st : []; rounds.value = Array.isArray(rr) ? rr : []
    await loadDeck()
    if (canEnter.value) await loadDecks()
    // Only on a real (re)load: a sync answer is itself a state push, which would otherwise reload us again.
    if (sync && my.value.match?.id) tournamentSync(my.value.match.id)
  } catch (e) {
    if (!quiet) loadError.value = errMsg(e)
  } finally {
    loading.value = false
  }
}

/* ── Actions ─────────────────────────────────────────────────────────────────────────────── */
async function run(fn, okMsg) {
  busy.value = true; actionError.value = ''
  try { await fn(); if (okMsg) showToast(okMsg, 'success'); await load({ quiet: true, sync: false }) }
  catch (e) { actionError.value = errMsg(e) }
  finally { busy.value = false }
}
const optIn = () => run(() => $fetch(`${base()}/opt-in`, { method: 'POST', body: { deckId: selectedDeckId.value } }), "You're in! Your deck is locked.")
const optOut = () => { if (window.confirm('Leave this tournament?')) run(() => $fetch(`${base()}/opt-out`, { method: 'POST' }), 'You left the tournament.') }
const forfeit = () => {
  if (!window.confirm('Forfeit this match? Your opponent wins the series and you are out of this round.')) return
  run(() => $fetch(`${base()}/forfeit`, { method: 'POST', body: { matchId: my.value.match.id } }), 'Match forfeited.')
}
function play() { actionError.value = ''; tournamentReady(my.value.match.id) }
function unready() { tournamentUnready(my.value.match.id) }

watch(lastError, (e) => { if (e?.message) actionError.value = e.message })
// A state push (opponent readied, a game ended...) means the REST picture is stale.
watch(() => (my.value.match ? tournamentStates.value[my.value.match.id] : null), () => load({ quiet: true, sync: false }))

/* ── Deck repair ─────────────────────────────────────────────────────────────────────────── */
const repairOpen = ref(false)
const repairError = ref('')
const repairPick = ref({})
const owned = ref([])
async function openRepair() {
  repairError.value = ''; repairPick.value = {}; repairOpen.value = true
  try { owned.value = await $fetch('/api/user/ctoons?isOgGtoon=true') } catch { owned.value = [] }
}
function repairChoices(pos) {
  const keep = new Set((deck.value?.cards || []).filter(c => !deck.value.flaggedPositions.includes(c.position)).map(c => c.ctoonId))
  const chosenElsewhere = new Set(Object.entries(repairPick.value).filter(([p, v]) => Number(p) !== pos && v).map(([, v]) => v))
  const seen = new Set()
  return owned.value.filter(g => {
    if (keep.has(g.ctoonId) || chosenElsewhere.has(g.ctoonId) || seen.has(g.ctoonId)) return false
    seen.add(g.ctoonId); return true
  })
}
const repairReady = computed(() => (deck.value?.flaggedPositions || []).every(p => repairPick.value[p]))
async function submitRepair() {
  busy.value = true; repairError.value = ''
  try {
    await $fetch(`${base()}/repair-deck`, {
      method: 'POST',
      body: { replacements: deck.value.flaggedPositions.map(p => ({ position: p, ctoonId: repairPick.value[p] })) }
    })
    repairOpen.value = false
    showToast('Your deck was repaired.', 'success')
    await load({ quiet: true, sync: false })
  } catch (e) { repairError.value = errMsg(e) }
  finally { busy.value = false }
}

onMounted(() => {
  load()
  tick = setInterval(() => { now.value = Date.now() }, 30000)
  // Fallback poll (the socket pushes the live bits); jittered so viewers don't all hit at once, and skipped while hidden.
  const schedule = () => {
    refresh = setTimeout(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load({ quiet: true, sync: false })
      schedule()
    }, 60000 + Math.floor(Math.random() * 15000))
  }
  schedule()
})
onBeforeUnmount(() => { clearInterval(tick); clearTimeout(refresh) })
</script>

<style scoped>
.ogt-card {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.5rem;
  padding: 0.9rem 1rem;
  margin-bottom: 0.9rem;
}
.ogt-primary { border-color: rgba(129, 140, 248, 0.55); }
.ogt-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  white-space: nowrap;
}
</style>
