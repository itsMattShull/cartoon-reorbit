<!-- components/newsite/AdminOgGtoonTournaments.vue -->
<!-- Admin console for OG gToons tournaments: create and edit them, set the prizes, watch the pairings,
     decide any unfinished pairing by hand, and approve prize payouts. -->
<template>
  <div class="admin-og-tournaments bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-3 max-w-6xl mx-auto">
      <div class="bg-white rounded border shadow p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-base font-semibold">OG gToons Tournaments</h1>
          <p class="text-gray-500">Every match is a best of 3 (first to 2 game wins), played on locked decks at zero stake. The Tournaments tab is shown to players only while it is switched on in Manage Games → OG gToons.</p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1 border rounded-md hover:bg-gray-50" @click="refreshAll">Refresh</button>
          <button class="px-3 py-1.5 font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="openForm()">Create tournament</button>
        </div>
      </div>

      <p v-if="pageError" class="text-red-600" role="alert">{{ pageError }}</p>
      <p v-if="notice" class="text-green-700" role="status">{{ notice }}</p>

      <!-- Things that need a person -->
      <div v-if="attention.length" class="bg-amber-50 border border-amber-300 rounded p-3" role="alert">
        <p class="font-semibold text-amber-800 mb-1">Needs your attention</p>
        <ul class="list-disc ml-5 text-amber-900 space-y-0.5">
          <li v-for="a in attention" :key="a.key">{{ a.text }} <button class="underline ml-1" @click="open(a.id)">Open</button></li>
        </ul>
      </div>

      <!-- List -->
      <div v-if="!selectedId" class="bg-white rounded border shadow">
        <div class="px-3 py-2 border-b flex items-center justify-between">
          <h2 class="font-semibold">Tournaments</h2><span class="text-[10px] text-gray-500">Total: {{ list.length }}</span>
        </div>
        <p v-if="loading" class="p-3 text-gray-500">Loading…</p>
        <p v-else-if="!list.length" class="p-3 text-gray-500">No tournaments yet. Create one to get started.</p>
        <div v-else class="divide-y">
          <div v-for="t in list" :key="t.id" class="p-3 flex flex-col md:flex-row md:items-start md:justify-between gap-2">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-sm">{{ t.name }}</span>
                <span class="px-1.5 rounded border text-[10px] font-medium" :class="statusClass(t.status)">{{ statusLabel(t.status) }}</span>
                <span v-if="t.needsAdminCount" class="px-1.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">{{ t.needsAdminCount }} need you</span>
                <span v-if="t.overdueCount" class="px-1.5 rounded bg-red-100 text-red-800 border border-red-300 text-[10px]">{{ t.overdueCount }} overdue</span>
              </div>
              <p class="text-gray-600 mt-1">Opt-in: {{ fmt(t.optInStartAt) }} → {{ fmt(t.optInEndAt) }} · {{ t.optInCount }} entrants · {{ t.roundWindowHours }}h rounds</p>
              <p v-if="t.status === 'COMPLETE'" class="text-gray-600">Winner: {{ t.winnerUsername || '—' }} · prizes: {{ prizeSummary(t.prizeCounts) }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="px-3 py-1 border rounded-md hover:bg-gray-50" @click="open(t.id)">Manage</button>
              <button class="px-3 py-1 border rounded-md hover:bg-gray-50" @click="openForm(t.id)">Edit</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Detail -->
      <div v-else class="space-y-3">
        <button class="text-blue-700 underline" @click="close">← All tournaments</button>
        <p v-if="detailLoading" class="text-gray-500">Loading…</p>
        <template v-else-if="detail">
          <div class="bg-white rounded border shadow p-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-sm font-semibold">{{ detail.tournament.name }}
                  <span class="ml-2 px-1.5 rounded border text-[10px] font-medium" :class="statusClass(detail.tournament.status)">{{ statusLabel(detail.tournament.status) }}</span>
                </h2>
                <p class="text-gray-600 mt-1">Opt-in (your time): {{ fmt(detail.tournament.optInStartAt) }} → {{ fmt(detail.tournament.optInEndAt) }} · Central: {{ central(detail.tournament.optInStartAt) }} → {{ central(detail.tournament.optInEndAt) }}</p>
                <p class="text-gray-600">{{ detail.entrants.filter(e => e.isActive).length }} entrants · {{ detail.tournament.format === 'SWISS_THEN_TOP8' ? `Swiss (${detail.tournament.swissRoundsPlanned} rounds) → Top 8` : detail.tournament.format === 'BRACKET_8_OR_LESS' ? 'Single elimination' : 'Format is chosen when opt-in closes' }} · {{ detail.tournament.roundWindowHours }}h per round
                  <template v-if="detail.tournament.seedValue"> · bracket seed <code>{{ detail.tournament.seedValue }}</code></template></p>
              </div>
              <div class="flex flex-wrap gap-2">
                <a class="px-3 py-1 border rounded-md hover:bg-gray-50" :href="`/newsite/gtoons-classic?tab=tournaments&t=${detail.tournament.id}`" target="_blank" rel="noopener">View as player</a>
                <button class="px-3 py-1 border rounded-md hover:bg-gray-50" :disabled="busy" @click="recompute">Recompute / advance</button>
                <button class="px-3 py-1 border rounded-md hover:bg-gray-50" @click="openForm(detail.tournament.id)">Edit</button>
                <button v-if="!['COMPLETE', 'CANCELLED'].includes(detail.tournament.status)" class="px-3 py-1 border rounded-md text-red-700 border-red-200 hover:bg-red-50" :disabled="busy" @click="cancelT">Cancel tournament</button>
              </div>
            </div>
          </div>

          <div class="flex gap-1" role="tablist" aria-label="Tournament sections">
            <button v-for="tb in TABS" :key="tb.id" role="tab" :aria-selected="tab === tb.id" class="px-3 py-1.5 rounded-t border border-b-0"
              :class="tab === tb.id ? 'bg-white font-semibold' : 'bg-gray-100 text-gray-600'" @click="tab = tb.id">
              {{ tb.label }}<span v-if="tb.id === 'matches' && needsCount" class="ml-1 px-1 rounded bg-amber-200 text-amber-900">{{ needsCount }}</span>
              <span v-if="tb.id === 'prizes' && heldCount" class="ml-1 px-1 rounded bg-amber-200 text-amber-900">{{ heldCount }}</span>
            </button>
          </div>

          <!-- Matches -->
          <div v-show="tab === 'matches'" class="bg-white rounded border shadow p-3 space-y-3">
            <p v-if="!detail.rounds.length" class="text-gray-500">No pairings yet. They are created when opt-in closes.</p>
            <div v-for="r in detail.rounds" :key="r.id" class="border rounded">
              <div class="px-2 py-1 bg-gray-50 border-b flex justify-between">
                <span class="font-semibold">{{ r.stage === 'SWISS' ? `Swiss round ${r.roundNumber}` : `Bracket round ${r.roundNumber}` }}</span>
                <span class="text-gray-500">Due {{ fmt(r.dueAt) }}</span>
              </div>
              <div v-for="m in matchesOf(r.id)" :key="m.id" class="px-2 py-1.5 border-b last:border-b-0" :class="m.needsAdmin ? 'bg-amber-50' : ''">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span class="font-medium" :class="m.winnerUserId === m.playerAUserId ? 'text-green-700' : ''">{{ m.playerAName }}</span>
                    <span class="text-gray-400"> vs </span>
                    <span class="font-medium" :class="m.winnerUserId === m.playerBUserId ? 'text-green-700' : ''">{{ m.playerBName }}</span>
                    <span class="ml-2 text-gray-600">{{ scoreText(m) }}</span>
                    <span v-if="m.live" class="ml-2 px-1 rounded bg-indigo-100 text-indigo-800">live game</span>
                    <span v-if="m.readyA || m.readyB" class="ml-2 px-1 rounded bg-blue-100 text-blue-800">{{ m.readyA && m.readyB ? 'both ready' : (m.readyA ? m.playerAName : m.playerBName) + ' ready' }}</span>
                    <span v-if="m.overdue" class="ml-2 px-1 rounded bg-red-100 text-red-800">overdue</span>
                    <span v-if="m.resolution && m.resolution !== 'PLAYED'" class="ml-2 px-1 rounded bg-gray-200 text-gray-700">{{ m.resolution.toLowerCase() }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <template v-if="m.status !== 'BYE'">
                      <button v-if="!m.lockedAt" class="px-2 py-0.5 border rounded bg-amber-500 text-white hover:bg-amber-600" @click="openResult(m)">Set winner</button>
                      <button v-if="!m.lockedAt" class="px-2 py-0.5 border rounded hover:bg-gray-50" @click="openExtend(m)">Extend</button>
                      <button v-if="m.lockedAt" class="px-2 py-0.5 border rounded hover:bg-gray-50" @click="reopen(m)">Reopen</button>
                      <button v-if="m.games.length" class="px-2 py-0.5 border rounded hover:bg-gray-50" @click="toggleGames(m.id)">{{ expanded[m.id] ? 'Hide' : 'Games' }} ({{ m.games.length }})</button>
                    </template>
                  </div>
                </div>
                <p v-if="m.needsAdmin" class="text-amber-800 mt-0.5">⚠ Needs an admin: {{ m.needsAdminReason }}</p>
                <p v-if="m.adminNotes" class="text-gray-500 mt-0.5">Note: {{ m.adminNotes }}</p>
                <ul v-if="expanded[m.id]" class="mt-1 ml-3 space-y-0.5">
                  <li v-for="(g, gi) in m.games" :key="g.id" class="flex items-center gap-2">
                    <span>Game {{ gi + 1 }}:
                      {{ g.outcome === 'INCOMPLETE' ? 'voided' : g.outcome === 'TIE' ? 'tie' : (g.winnerUserId === m.playerAUserId ? m.playerAName : m.playerBName) + ' won' }}
                      <span v-if="g.outcome !== 'INCOMPLETE'" class="text-gray-500">({{ g.scoreA }}–{{ g.scoreB }})</span>
                    </span>
                    <button v-if="!m.lockedAt && g.outcome !== 'INCOMPLETE'" class="px-1.5 border rounded hover:bg-gray-50" @click="voidGame(m, g)">Void game</button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Entrants -->
          <div v-show="tab === 'entrants'" class="bg-white rounded border shadow overflow-x-auto">
            <table class="min-w-full">
              <thead><tr class="text-left text-gray-500 border-b"><th class="p-2">Player</th><th class="p-2">Entered</th><th class="p-2">Deck</th><th class="p-2">Status</th><th class="p-2"></th></tr></thead>
              <tbody>
                <tr v-for="e in detail.entrants" :key="e.userId" class="border-b last:border-b-0">
                  <td class="p-2 font-medium">{{ e.username }}<span v-if="e.banned" class="ml-1 text-red-600">(banned)</span></td>
                  <td class="p-2">{{ fmt(e.optedInAt) }}</td>
                  <td class="p-2">12 cards locked<span v-if="e.repairCount" class="ml-1 text-amber-700">· repaired {{ e.repairCount }}×</span></td>
                  <td class="p-2">{{ !e.isActive ? 'Left' : e.disqualified ? `Disqualified — ${e.disqualifiedNote || ''}` : 'In' }}</td>
                  <td class="p-2 text-right">
                    <button v-if="e.isActive && !e.disqualified && !['COMPLETE', 'CANCELLED'].includes(detail.tournament.status)" class="px-2 py-0.5 border rounded text-red-700 border-red-200 hover:bg-red-50" @click="openDq(e)">Disqualify</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Prizes -->
          <div v-show="tab === 'prizes'" class="bg-white rounded border shadow p-3 space-y-3">
            <div class="grid md:grid-cols-2 gap-3">
              <div v-for="p in [{ k: 'first', t: '🥇 1st place', v: detail.firstPrizeView }, { k: 'top8', t: '🏅 Top 8 (places 2–8)', v: detail.top8PrizeView }]" :key="p.k" class="border rounded p-2">
                <p class="font-semibold">{{ p.t }}</p>
                <p v-if="!p.v" class="text-gray-500">No prize set.</p>
                <ul v-else class="mt-1 space-y-0.5">
                  <li v-if="p.v.points">⭐ {{ p.v.points.toLocaleString() }} points</li>
                  <li v-for="c in p.v.ctoons" :key="c.ctoonId">{{ c.quantity }}× {{ c.name }}</li>
                  <li v-for="b in p.v.backgrounds" :key="b.backgroundId">Background {{ b.name }}</li>
                </ul>
              </div>
            </div>
            <p class="text-gray-500">
              Top 8 prize is paid only if {{ detail.tournament.minEntrantsTop8Prize }}+ players entered. Payout needs a real game played and is
              {{ detail.tournament.requirePrizeApproval ? 'held until you approve it below' : 'automatic' }}.
            </p>
            <div v-if="detail.prizeGrants.length">
              <div class="flex items-center justify-between mb-1">
                <p class="font-semibold">Payout ledger</p>
                <button v-if="heldCount || failedCount" class="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700" :disabled="busy" @click="approvePrizes">
                  {{ heldCount ? `Approve ${heldCount} prize(s)` : `Retry ${failedCount} failed` }}
                </button>
              </div>
              <table class="min-w-full">
                <thead><tr class="text-left text-gray-500 border-b"><th class="p-1">Place</th><th class="p-1">Player</th><th class="p-1">Tier</th><th class="p-1">Status</th><th class="p-1">Detail</th></tr></thead>
                <tbody>
                  <tr v-for="g in detail.prizeGrants" :key="g.id" class="border-b last:border-b-0">
                    <td class="p-1">{{ g.place }}</td><td class="p-1">{{ g.username }}</td><td class="p-1">{{ g.tier }}</td>
                    <td class="p-1"><span :class="grantClass(g.status)" class="px-1 rounded">{{ g.status.replace('_', ' ').toLowerCase() }}</span></td>
                    <td class="p-1 text-gray-600">
                      <span v-if="g.errorMessage" class="text-red-700">{{ g.errorMessage }}</span>
                      <span v-else-if="g.summary">{{ grantSummary(g.summary) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-gray-500">Nothing has been queued yet. Prizes are queued when the tournament completes.</p>
          </div>
        </template>
      </div>
    </div>

    <!-- Create / edit -->
    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-labelledby="ogt-form-h">
      <div class="absolute inset-0 bg-black/50" @click="formOpen = false"></div>
      <div class="relative bg-white w-full max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <h2 id="ogt-form-h" class="text-sm font-semibold">{{ form.id ? 'Edit tournament' : 'Create tournament' }}</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close" @click="formOpen = false">✕</button>
        </div>
        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          <p v-if="form.locked" class="p-2 rounded bg-amber-50 border border-amber-300 text-amber-900">Opt-in has closed, so only the name and description can change. Rules and prizes are locked because players entered on them. Use Extend on a pairing to give it more time.</p>
          <div><label class="block font-medium mb-1" for="f-name">Name</label><input id="f-name" v-model="form.name" class="w-full border rounded px-2 py-1.5" maxlength="120" /></div>
          <div><label class="block font-medium mb-1" for="f-desc">Description (shown to players)</label><textarea id="f-desc" v-model="form.description" rows="2" class="w-full border rounded px-2 py-1.5" maxlength="2000"></textarea></div>
          <fieldset :disabled="form.locked" class="space-y-3">
            <div class="grid sm:grid-cols-2 gap-3">
              <div><label class="block font-medium mb-1" for="f-start">Opt-in opens</label><input id="f-start" v-model="form.optInStartAt" type="datetime-local" class="w-full border rounded px-2 py-1.5" /></div>
              <div><label class="block font-medium mb-1" for="f-end">Opt-in closes</label><input id="f-end" v-model="form.optInEndAt" type="datetime-local" class="w-full border rounded px-2 py-1.5" /></div>
            </div>
            <p class="text-gray-500 -mt-1">Times are in your browser's time zone ({{ tz }}). Discord messages show Central time.</p>
            <div class="grid sm:grid-cols-3 gap-3">
              <div>
                <label class="block font-medium mb-1" for="f-win">Time per round</label>
                <select id="f-win" v-model.number="form.roundWindowHours" class="w-full border rounded px-2 py-1.5">
                  <option v-for="h in [24, 48, 72, 96, 120, 168]" :key="h" :value="h">{{ h }} hours{{ h === 72 ? ' (standard)' : '' }}</option>
                </select>
              </div>
              <div><label class="block font-medium mb-1" for="f-sw">Swiss rounds</label><input id="f-sw" v-model="form.swissRoundsOverride" type="number" min="1" max="10" placeholder="Auto" class="w-full border rounded px-2 py-1.5" /></div>
              <div><label class="block font-medium mb-1" for="f-min">Top 8 prize needs</label><input id="f-min" v-model.number="form.minEntrantsTop8Prize" type="number" min="2" class="w-full border rounded px-2 py-1.5" /></div>
            </div>
            <label class="flex items-start gap-2"><input v-model="form.requirePrizeApproval" type="checkbox" class="mt-0.5" /><span>Hold prizes until an admin approves them <span class="text-gray-500">(recommended)</span></span></label>

            <div v-for="tier in TIERS" :key="tier.k" class="border rounded p-2 space-y-2">
              <p class="font-semibold">{{ tier.title }}</p>
              <div class="w-40"><label class="block mb-1">Points</label><input v-model.number="form[tier.k].points" type="number" min="0" class="w-full border rounded px-2 py-1" /></div>
              <div>
                <label class="block mb-1">Add a cToon</label>
                <input v-model="search[tier.k]" class="w-full border rounded px-2 py-1" placeholder="Type 3+ letters of a name" @input="searchCtoons(tier.k)" />
                <ul v-if="results[tier.k]?.length" class="border rounded mt-1 max-h-32 overflow-y-auto bg-white">
                  <li v-for="c in results[tier.k]" :key="c.id"><button type="button" class="w-full text-left px-2 py-1 hover:bg-gray-100 flex items-center gap-2" @click="addCtoon(tier.k, c)">
                    <img :src="c.assetPath" alt="" class="h-6 w-6 object-contain" />{{ c.name }} <span class="text-gray-400">{{ c.rarity }}<template v-if="c.quantity != null"> · cap {{ c.quantity }}</template></span></button></li>
                </ul>
                <ul class="mt-1 space-y-1">
                  <li v-for="(c, i) in form[tier.k].ctoons" :key="c.ctoonId" class="flex items-center gap-2">
                    <img v-if="c.assetPath" :src="c.assetPath" alt="" class="h-6 w-6 object-contain" /><span class="flex-1">{{ c.name }}</span>
                    <label class="flex items-center gap-1">Qty <input v-model.number="c.quantity" type="number" min="1" class="w-14 border rounded px-1 py-0.5" /></label>
                    <button type="button" class="text-red-600 px-1" :aria-label="`Remove ${c.name}`" @click="form[tier.k].ctoons.splice(i, 1)">✕</button>
                  </li>
                </ul>
              </div>
              <div>
                <label class="block mb-1">Backgrounds</label>
                <div class="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-32 overflow-y-auto border rounded p-1">
                  <label v-for="b in backgrounds" :key="b.id" class="relative cursor-pointer" :title="b.label || b.filename">
                    <input v-model="form[tier.k].backgrounds" type="checkbox" :value="b.id" class="absolute top-0.5 left-0.5 z-10" />
                    <img :src="b.imagePath" :alt="b.label || b.filename" class="h-12 w-full object-cover rounded" :class="form[tier.k].backgrounds.includes(b.id) ? 'ring-2 ring-blue-500' : ''" loading="lazy" />
                  </label>
                  <p v-if="!backgrounds.length" class="col-span-full text-gray-500">No backgrounds found.</p>
                </div>
              </div>
              <p class="text-gray-600"><strong>Winner{{ tier.k === 'top8' ? 's each' : '' }} receive{{ tier.k === 'top8' ? '' : 's' }}:</strong> {{ previewText(form[tier.k]) }}</p>
            </div>
          </fieldset>
          <p v-if="formError" class="text-red-600" role="alert">{{ formError }}</p>
          <ul v-if="formWarnings.length" class="text-amber-800 list-disc ml-5" role="status"><li v-for="w in formWarnings" :key="w">{{ w }}</li></ul>
        </div>
        <div class="px-4 py-3 border-t flex justify-end gap-2">
          <button class="px-3 py-1.5 border rounded-md" @click="formOpen = false">Close</button>
          <button class="px-3 py-1.5 font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="busy" @click="saveForm">{{ form.id ? 'Save changes' : 'Create' }}</button>
        </div>
      </div>
    </div>

    <!-- Set winner -->
    <div v-if="resultM" class="fixed inset-0 z-50 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-labelledby="ogt-res-h">
      <div class="absolute inset-0 bg-black/50" @click="resultM = null"></div>
      <div class="relative bg-white w-full max-w-md rounded-lg shadow-lg p-4 space-y-3">
        <h2 id="ogt-res-h" class="text-sm font-semibold">Set the result</h2>
        <p>{{ resultM.playerAName }} vs {{ resultM.playerBName }} · {{ resultM.stage === 'SWISS' ? 'Swiss' : 'Bracket' }} round {{ resultM.roundNumber }}<span v-if="resultM.gamesCounted"> · {{ scoreText(resultM) }} so far</span></p>
        <fieldset class="space-y-1">
          <legend class="font-medium mb-1">Who wins?</legend>
          <label class="flex items-center gap-2"><input v-model="res.outcome" type="radio" value="A_WIN" /> {{ resultM.playerAName }}</label>
          <label class="flex items-center gap-2"><input v-model="res.outcome" type="radio" value="B_WIN" /> {{ resultM.playerBName }}</label>
          <label v-if="resultM.stage === 'SWISS'" class="flex items-center gap-2"><input v-model="res.outcome" type="radio" value="TIE" /> Draw (1 point each)</label>
        </fieldset>
        <div class="flex items-center gap-2">
          <span>Final game score</span>
          <select v-model.number="res.winsA" class="border rounded px-1 py-0.5"><option v-for="n in [0, 1, 2]" :key="n" :value="n">{{ n }}</option></select>
          <span>–</span>
          <select v-model.number="res.winsB" class="border rounded px-1 py-0.5"><option v-for="n in [0, 1, 2]" :key="n" :value="n">{{ n }}</option></select>
        </div>
        <div><label class="block font-medium mb-1" for="res-note">Reason (required, saved in the admin log)</label><textarea id="res-note" v-model="res.note" rows="2" class="w-full border rounded px-2 py-1.5"></textarea></div>
        <p class="p-2 rounded bg-gray-50 border text-gray-700">{{ resultSummary }}</p>
        <p v-if="resultM.live" class="text-amber-800">A game is being played right now. It will be ended within a minute and will not count.</p>
        <p v-if="modalError" class="text-red-600" role="alert">{{ modalError }}</p>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-1.5 border rounded-md" @click="resultM = null">Cancel</button>
          <button class="px-3 py-1.5 font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50" :disabled="busy || !res.outcome || !res.note.trim()" @click="submitResult">Set result</button>
        </div>
      </div>
    </div>

    <!-- Extend -->
    <div v-if="extendM" class="fixed inset-0 z-50 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-labelledby="ogt-ext-h">
      <div class="absolute inset-0 bg-black/50" @click="extendM = null"></div>
      <div class="relative bg-white w-full max-w-sm rounded-lg shadow-lg p-4 space-y-3">
        <h2 id="ogt-ext-h" class="text-sm font-semibold">Give more time</h2>
        <p>{{ extendM.playerAName }} vs {{ extendM.playerBName }} — currently due {{ fmt(extendM.dueAt) }}.</p>
        <label class="block"><span class="font-medium">Add hours</span>
          <select v-model.number="extendHours" class="ml-2 border rounded px-2 py-1"><option v-for="h in [6, 12, 24, 48, 72]" :key="h" :value="h">{{ h }}</option></select></label>
        <p v-if="modalError" class="text-red-600" role="alert">{{ modalError }}</p>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-1.5 border rounded-md" @click="extendM = null">Cancel</button>
          <button class="px-3 py-1.5 font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" :disabled="busy" @click="submitExtend">Extend</button>
        </div>
      </div>
    </div>

    <!-- Disqualify -->
    <div v-if="dqE" class="fixed inset-0 z-50 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-labelledby="ogt-dq-h">
      <div class="absolute inset-0 bg-black/50" @click="dqE = null"></div>
      <div class="relative bg-white w-full max-w-sm rounded-lg shadow-lg p-4 space-y-3">
        <h2 id="ogt-dq-h" class="text-sm font-semibold">Disqualify {{ dqE.username }}?</h2>
        <p>Their open pairings are awarded to their opponents and they are excluded from prizes. Their opponents are messaged.</p>
        <div><label class="block font-medium mb-1" for="dq-note">Reason (required)</label><textarea id="dq-note" v-model="dqNote" rows="2" class="w-full border rounded px-2 py-1.5"></textarea></div>
        <p v-if="modalError" class="text-red-600" role="alert">{{ modalError }}</p>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-1.5 border rounded-md" @click="dqE = null">Cancel</button>
          <button class="px-3 py-1.5 font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" :disabled="busy || !dqNote.trim()" @click="submitDq">Disqualify</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'

const TABS = [{ id: 'matches', label: 'Matches' }, { id: 'entrants', label: 'Entrants' }, { id: 'prizes', label: 'Prizes' }]
const TIERS = [{ k: 'first', title: '🥇 1st place prize' }, { k: 'top8', title: '🏅 Top 8 prize (places 2–8, not the winner)' }]
const API = '/api/admin/og-tournaments'
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'

const list = ref([]); const loading = ref(true)
const pageError = ref(''); const notice = ref(''); const busy = ref(false)
const selectedId = ref(null); const detail = ref(null); const detailLoading = ref(false)
const tab = ref('matches'); const expanded = reactive({})

const errMsg = (e) => e?.data?.statusMessage || e?.statusMessage || e?.message || 'Something went wrong.'
function flash(msg) { notice.value = msg; setTimeout(() => { if (notice.value === msg) notice.value = '' }, 5000) }

/* ── Formatting ──────────────────────────────────────────────────────────────────────────── */
const fmt = (v) => (v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const central = (v) => (v ? new Date(v).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—')
const STATUS = {
  DRAFT: ['Draft', 'bg-yellow-50 text-yellow-700 border-yellow-200'], OPT_IN_OPEN: ['Opt-in open', 'bg-green-50 text-green-700 border-green-200'],
  OPT_IN_CLOSED: ['Opt-in closed', 'bg-yellow-50 text-yellow-700 border-yellow-200'], SWISS_ACTIVE: ['Swiss active', 'bg-blue-50 text-blue-700 border-blue-200'],
  BRACKET_ACTIVE: ['Bracket active', 'bg-blue-50 text-blue-700 border-blue-200'], COMPLETE: ['Complete', 'bg-gray-100 text-gray-700 border-gray-300'],
  CANCELLED: ['Cancelled', 'bg-red-50 text-red-700 border-red-200']
}
const statusLabel = (s) => STATUS[s]?.[0] || s
const statusClass = (s) => STATUS[s]?.[1] || ''
const grantClass = (s) => ({ PAID: 'bg-green-100 text-green-800', FAILED: 'bg-red-100 text-red-800', PENDING_APPROVAL: 'bg-amber-100 text-amber-800', PENDING: 'bg-blue-100 text-blue-800', SKIPPED: 'bg-gray-100 text-gray-700' })[s] || ''
const prizeSummary = (c) => (Object.keys(c || {}).length ? Object.entries(c).map(([k, v]) => `${v} ${k.replace('_', ' ').toLowerCase()}`).join(', ') : 'none')
const grantSummary = (s) => [s.points && `${s.points} pts`, s.backgrounds && `${s.backgrounds} background(s)`, s.ctoonJobs?.length && `${s.ctoonJobs.reduce((n, j) => n + j.quantity, 0)} cToon(s)${s.mintsPending ? ' (minting)' : ''}`].filter(Boolean).join(', ') || 'paid'
const scoreText = (m) => (m.status === 'BYE' ? 'bye' : m.status === 'COMPLETE' || m.gamesCounted ? `${m.winsA}–${m.winsB}${m.ties ? ` (${m.ties} tied)` : ''}${m.status === 'COMPLETE' && m.outcome === 'TIE' ? ' draw' : ''}` : 'not started')

/* ── Loading ─────────────────────────────────────────────────────────────────────────────── */
async function loadList() {
  loading.value = true; pageError.value = ''
  try { list.value = await $fetch(API) } catch (e) { pageError.value = errMsg(e) } finally { loading.value = false }
}
async function loadDetail() {
  if (!selectedId.value) return
  detailLoading.value = !detail.value
  try { detail.value = await $fetch(`${API}/${selectedId.value}`) } catch (e) { pageError.value = errMsg(e) } finally { detailLoading.value = false }
}
const refreshAll = async () => { await loadList(); await loadDetail() }
function open(id) { selectedId.value = id; detail.value = null; tab.value = 'matches'; loadDetail() }
function close() { selectedId.value = null; detail.value = null; loadList() }

const attention = computed(() => {
  const out = []
  for (const t of list.value) {
    if (t.needsAdminCount) out.push({ key: `n${t.id}`, id: t.id, text: `${t.name}: ${t.needsAdminCount} pairing(s) need an admin decision` })
    if (t.overdueCount) out.push({ key: `o${t.id}`, id: t.id, text: `${t.name}: ${t.overdueCount} pairing(s) are past their deadline (the next cron run will settle them)` })
    if (t.prizeCounts?.PENDING_APPROVAL) out.push({ key: `p${t.id}`, id: t.id, text: `${t.name}: ${t.prizeCounts.PENDING_APPROVAL} prize(s) waiting for your approval` })
    if (t.prizeCounts?.FAILED) out.push({ key: `f${t.id}`, id: t.id, text: `${t.name}: ${t.prizeCounts.FAILED} prize payout(s) failed` })
  }
  return out
})
const matchesOf = (roundId) => (detail.value?.matches || []).filter(m => m.roundId === roundId)
const needsCount = computed(() => (detail.value?.matches || []).filter(m => m.needsAdmin && !m.lockedAt).length)
const heldCount = computed(() => (detail.value?.prizeGrants || []).filter(g => g.status === 'PENDING_APPROVAL').length)
const failedCount = computed(() => (detail.value?.prizeGrants || []).filter(g => g.status === 'FAILED').length)
const toggleGames = (id) => { expanded[id] = !expanded[id] }

/* ── Actions on a tournament / pairing ───────────────────────────────────────────────────── */
async function act(fn, okMsg) {
  busy.value = true; pageError.value = ''
  try { await fn(); if (okMsg) flash(okMsg); await refreshAll(); return true }
  catch (e) { pageError.value = errMsg(e); return false }
  finally { busy.value = false }
}
const recompute = () => act(() => $fetch(`${API}/${selectedId.value}/recompute`, { method: 'POST' }), 'Recomputed.')
const cancelT = () => { if (window.confirm('Cancel this tournament? Pairings stay as they are, live games are ended, and no further rounds are made. This cannot be undone.')) act(() => $fetch(`${API}/${selectedId.value}/cancel`, { method: 'POST' }), 'Tournament cancelled.') }
const reopen = (m) => { if (window.confirm(`Reopen ${m.playerAName} vs ${m.playerBName}? Its result is cleared and the players can play it again. This only works while the next round has not been built.`)) act(() => $fetch(`${API}/${selectedId.value}/matches/${m.id}/reopen`, { method: 'POST' }), 'Match reopened.') }
const voidGame = (m, g) => { if (window.confirm('Void this game? It stops counting and the players replay it.')) act(() => $fetch(`${API}/${selectedId.value}/matches/${m.id}/void-game`, { method: 'POST', body: { gameId: g.id } }), 'Game voided.') }
const approvePrizes = () => act(() => $fetch(`${API}/${selectedId.value}/prizes/approve`, { method: 'POST' }), 'Prizes released — they are paid within a few minutes.')

/* ── Modals: set result / extend / disqualify ────────────────────────────────────────────── */
const modalError = ref('')
const resultM = ref(null); const res = reactive({ outcome: '', winsA: 2, winsB: 0, note: '' })
function openResult(m) { modalError.value = ''; resultM.value = m; Object.assign(res, { outcome: '', winsA: 2, winsB: 0, note: '' }) }
// Pre-fill a sensible score when the winner is chosen.
watch(() => res.outcome, (o) => { if (o === 'A_WIN') Object.assign(res, { winsA: 2, winsB: Math.min(res.winsB, 1) }); if (o === 'B_WIN') Object.assign(res, { winsA: Math.min(res.winsA, 1), winsB: 2 }); if (o === 'TIE') Object.assign(res, { winsA: 1, winsB: 1 }) })
const resultSummary = computed(() => {
  const m = resultM.value; if (!m || !res.outcome) return 'Choose a result to see what it does.'
  const who = res.outcome === 'A_WIN' ? m.playerAName : res.outcome === 'B_WIN' ? m.playerBName : null
  const next = m.stage === 'BRACKET' && who ? `${who} advances` : who ? `${who} gets 3 points` : 'Both players get 1 point'
  return `${who ? `${who} wins` : 'The match is a draw'} ${res.winsA}–${res.winsB}. ${next}. Both players are messaged, and the next round is made as soon as every match in this round is done.`
})
async function submitResult() {
  busy.value = true; modalError.value = ''
  try {
    await $fetch(`${API}/${selectedId.value}/matches/${resultM.value.id}/set-result`, { method: 'POST', body: { outcome: res.outcome, winsA: res.winsA, winsB: res.winsB, note: res.note } })
    resultM.value = null; flash('Result set.'); await refreshAll()
  } catch (e) { modalError.value = errMsg(e) } finally { busy.value = false }
}
const extendM = ref(null); const extendHours = ref(24)
function openExtend(m) { modalError.value = ''; extendM.value = m }
async function submitExtend() {
  busy.value = true; modalError.value = ''
  try { await $fetch(`${API}/${selectedId.value}/matches/${extendM.value.id}/extend`, { method: 'POST', body: { hours: extendHours.value } }); extendM.value = null; flash('Deadline extended.'); await refreshAll() }
  catch (e) { modalError.value = errMsg(e) } finally { busy.value = false }
}
const dqE = ref(null); const dqNote = ref('')
function openDq(e) { modalError.value = ''; dqNote.value = ''; dqE.value = e }
async function submitDq() {
  busy.value = true; modalError.value = ''
  try { await $fetch(`${API}/${selectedId.value}/players/${dqE.value.userId}/disqualify`, { method: 'POST', body: { note: dqNote.value } }); dqE.value = null; flash('Player disqualified.'); await refreshAll() }
  catch (e) { modalError.value = errMsg(e) } finally { busy.value = false }
}

/* ── Create / edit form ──────────────────────────────────────────────────────────────────── */
const blankPrize = () => ({ points: 0, ctoons: [], backgrounds: [] })
const formOpen = ref(false); const formError = ref(''); const formWarnings = ref([])
const form = reactive({ id: null, locked: false, name: '', description: '', optInStartAt: '', optInEndAt: '', roundWindowHours: 72, swissRoundsOverride: '', minEntrantsTop8Prize: 9, requirePrizeApproval: true, first: blankPrize(), top8: blankPrize() })
const search = reactive({ first: '', top8: '' }); const results = reactive({ first: [], top8: [] })
const backgrounds = ref([])
const toLocalInput = (v) => { if (!v) return ''; const d = new Date(v); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

async function openForm(id = null) {
  formError.value = ''; formWarnings.value = []
  if (!backgrounds.value.length) { try { backgrounds.value = await $fetch(`${API}/backgrounds`) } catch { backgrounds.value = [] } }
  if (!id) {
    const start = new Date(Date.now() + 3600 * 1000); const end = new Date(Date.now() + 7 * 86400 * 1000)
    Object.assign(form, { id: null, locked: false, name: '', description: '', optInStartAt: toLocalInput(start), optInEndAt: toLocalInput(end), roundWindowHours: 72, swissRoundsOverride: '', minEntrantsTop8Prize: 9, requirePrizeApproval: true, first: blankPrize(), top8: blankPrize() })
  } else {
    try {
      const d = await $fetch(`${API}/${id}`); const t = d.tournament
      const toForm = (view) => ({ points: view?.points || 0, ctoons: (view?.ctoons || []).map(c => ({ ctoonId: c.ctoonId, name: c.name, assetPath: c.assetPath, quantity: c.quantity })), backgrounds: (view?.backgrounds || []).map(b => b.backgroundId) })
      Object.assign(form, {
        id: t.id, locked: !['DRAFT', 'OPT_IN_OPEN'].includes(t.status), name: t.name, description: t.description || '',
        optInStartAt: toLocalInput(t.optInStartAt), optInEndAt: toLocalInput(t.optInEndAt), roundWindowHours: t.roundWindowHours,
        swissRoundsOverride: t.swissRoundsOverride ?? '', minEntrantsTop8Prize: t.minEntrantsTop8Prize, requirePrizeApproval: t.requirePrizeApproval,
        first: toForm(d.firstPrizeView), top8: toForm(d.top8PrizeView)
      })
    } catch (e) { pageError.value = errMsg(e); return }
  }
  search.first = search.top8 = ''; results.first = results.top8 = []
  formOpen.value = true
}
let searchTimer = null
function searchCtoons(k) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if ((search[k] || '').trim().length < 3) { results[k] = []; return }
    try { results[k] = await $fetch(`${API}/search-ctoons`, { query: { q: search[k].trim() } }) } catch { results[k] = [] }
  }, 300)
}
function addCtoon(k, c) {
  if (!form[k].ctoons.some(x => x.ctoonId === c.id)) form[k].ctoons.push({ ctoonId: c.id, name: c.name, assetPath: c.assetPath, quantity: 1 })
  search[k] = ''; results[k] = []
}
function previewText(b) {
  const parts = []
  if (b.points) parts.push(`${Number(b.points).toLocaleString()} points`)
  for (const c of b.ctoons) parts.push(`${c.quantity}× ${c.name}`)
  if (b.backgrounds.length) parts.push(`${b.backgrounds.length} background${b.backgrounds.length > 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : 'nothing (no prize)'
}
const bundleBody = (b) => ({ points: Number(b.points) || 0, ctoons: b.ctoons.map(c => ({ ctoonId: c.ctoonId, quantity: Math.max(1, Number(c.quantity) || 1) })), backgrounds: b.backgrounds.map(id => ({ backgroundId: id })) })
async function saveForm() {
  busy.value = true; formError.value = ''; formWarnings.value = []
  try {
    const body = {
      name: form.name, description: form.description,
      optInStartAt: form.optInStartAt ? new Date(form.optInStartAt).toISOString() : '', optInEndAt: form.optInEndAt ? new Date(form.optInEndAt).toISOString() : '',
      roundWindowHours: form.roundWindowHours, swissRoundsOverride: form.swissRoundsOverride === '' ? null : Number(form.swissRoundsOverride),
      minEntrantsTop8Prize: form.minEntrantsTop8Prize, requirePrizeApproval: form.requirePrizeApproval,
      firstPrize: bundleBody(form.first), top8Prize: bundleBody(form.top8)
    }
    const r = form.id ? await $fetch(`${API}/${form.id}`, { method: 'PUT', body }) : await $fetch(API, { method: 'POST', body })
    if (r.warnings?.length) { formWarnings.value = r.warnings; flash('Saved — but see the supply warnings.') } else { formOpen.value = false; flash(form.id ? 'Saved.' : 'Tournament created.') }
    await refreshAll()
  } catch (e) { formError.value = errMsg(e) } finally { busy.value = false }
}

onMounted(loadList)
</script>
