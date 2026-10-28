<template>
  <div class="bg-gray-50 text-xs">

    <div class="px-2 py-2 max-w-5xl mx-auto space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Dissolve Queue</h1>
        <div class="flex items-center gap-3">
          <button @click="openErrorsModal" class="text-xs text-red-600 hover:underline">Errors</button>
          <button @click="openMisfiresModal" class="text-xs text-red-600 hover:underline">Misfires</button>
          <button @click="openFeaturedModal" class="text-xs text-blue-600 hover:underline">Edit Featured</button>
          <button @click="loadData" class="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
      </div>

      <!-- Summary cards -->
      <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div v-for="cat in categories" :key="cat.key"
             class="bg-white border rounded-lg shadow p-2">
          <div class="text-xs font-semibold text-gray-500 mb-1">{{ cat.label }}</div>
          <div class="text-lg font-bold">{{ stats.byCategory[cat.key]?.total ?? 0 }}</div>
          <div class="text-[10px] text-gray-500 mt-1">
            <span class="text-emerald-600">{{ stats.byCategory[cat.key]?.scheduled ?? 0 }} scheduled</span>
            <span class="mx-1">·</span>
            <span class="text-orange-500">{{ stats.byCategory[cat.key]?.unscheduled ?? 0 }} unscheduled</span>
            <template v-if="stats.byCategory[cat.key]?.held">
              <span class="mx-1">·</span>
              <span class="text-purple-700">{{ stats.byCategory[cat.key].held }} held</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Starting bids for rarities with no rarity floor. Without a bid, these entries are held:
           they stay in the queue but never take a schedule slot, so they can't block the rest. -->
      <div class="bg-white rounded-lg shadow border p-3">
        <h2 class="text-sm font-semibold">Starting bids for special rarities</h2>
        <p class="text-[11px] text-gray-500 mt-0.5 mb-2">
          These rarities have no price floor, so the queue only auctions them once you set a starting bid.
          Until then they're held: they stay in the queue but don't use up schedule slots.
          Leave a rarity blank to keep holding it. After saving, run Apply Schedule to schedule the newly listable ones.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label v-for="r in specialRarities" :key="r.field" class="flex items-center gap-2">
            <span class="w-28 shrink-0 text-xs text-gray-700">{{ r.label }}</span>
            <input
              v-model="startBidForm[r.field]" type="number" inputmode="numeric" :min="r.min" step="1"
              :placeholder="`Held (min ${r.min})`"
              class="w-full sm:w-32 border rounded-md px-2 py-1.5 text-sm"
            />
            <span v-if="heldCountFor(r.label)" class="text-[10px] text-purple-700 whitespace-nowrap">{{ heldCountFor(r.label) }} held</span>
          </label>
        </div>
        <div v-if="startBidError" class="mt-2 text-xs text-red-600">{{ startBidError }}</div>
        <div v-if="startBidSuccess" class="mt-2 text-xs text-emerald-600">{{ startBidSuccess }}</div>
        <button
          @click="saveStartBids" :disabled="savingStartBids"
          class="mt-2 w-full sm:w-auto px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
        >{{ savingStartBids ? 'Saving…' : 'Save starting bids' }}</button>
      </div>

      <!-- Upcoming scheduled auctions -->
      <div class="bg-white rounded-lg shadow border">
        <div class="px-3 py-2 border-b">
          <h2 class="text-sm font-semibold">Upcoming Scheduled Auctions</h2>
          <p class="text-[10px] text-gray-500 mt-0.5">Next 20 entries, times in CST</p>
        </div>
        <div v-if="upcoming.length" class="divide-y">
          <div v-for="entry in upcoming" :key="entry.id"
               class="px-3 py-2 text-xs">
            <div class="flex items-start gap-2">
              <div class="shrink-0 w-9 h-9 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img v-if="entry.ctoonImage" :src="entry.ctoonImage" :alt="entry.ctoonName"
                     class="w-full h-full object-contain" loading="lazy" />
                <span v-else class="text-gray-300 text-base">?</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" :title="entry.ctoonName">{{ entry.ctoonName || '—' }}</div>
                <div class="text-[10px] text-gray-500 mt-0.5">
                  {{ entry.rarity }}
                  <span v-if="entry.series"> · {{ entry.series }}</span>
                  <span v-if="entry.set"> · {{ entry.set }}</span>
                  <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                  <span class="ml-2 px-1.5 py-0 rounded text-[10px] font-medium"
                        :class="categoryChip(entry.category)">{{ entry.category }}</span>
                  <span v-if="entry.isFeatured" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">Featured</span>
                  <span v-if="entry.fromInactive" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700">From Inactive</span>
                  <span v-if="entry.pinned" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-blue-100 text-blue-700">📌 Pinned</span>
                  <span v-if="entry.held" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-purple-100 text-purple-700" title="Set a starting bid for this rarity above to auction it">Held, needs a starting bid</span>
                  <span v-else-if="entry.startingBid != null" class="ml-1 text-[10px] text-gray-500">Starts at {{ entry.startingBid.toLocaleString() }} pts</span>
                </div>
                <div v-if="entry.sourceUsername" class="text-[10px] text-gray-400 mt-0.5">From: {{ entry.sourceUsername }}</div>
                <div class="text-[10px] text-gray-500 mt-1 sm:hidden">{{ fmtCST(entry.scheduledFor) }}</div>
              </div>
              <div class="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                <div class="hidden sm:block text-[10px] text-gray-600">{{ fmtCST(entry.scheduledFor) }}</div>
                <button
                  @click="openReschedule(entry)"
                  class="text-[11px] text-blue-600 hover:text-blue-800"
                >Reschedule</button>
                <button
                  v-if="entry.pinned"
                  @click="unpinEntry(entry.id)"
                  class="text-[11px] text-amber-600 hover:text-amber-800 disabled:opacity-50"
                  :disabled="unpinningId === entry.id"
                >{{ unpinningId === entry.id ? '…' : 'Unpin' }}</button>
                <button
                  @click="cancelEntry(entry.id)"
                  class="text-[11px] text-red-500 hover:text-red-700"
                  :disabled="cancellingId === entry.id"
                >{{ cancellingId === entry.id ? '…' : 'Unschedule' }}</button>
              </div>
            </div>
            <div v-if="reschedulingId === entry.id" class="mt-2 flex flex-wrap items-center gap-2 pl-0 sm:pl-[44px]">
              <input v-model="rescheduleLocal" type="datetime-local"
                     class="text-xs border rounded-md px-2 py-1.5" />
              <button
                @click="saveReschedule(entry.id)"
                :disabled="reschedulingSaving"
                class="px-3 py-1 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
              >{{ reschedulingSaving ? 'Saving…' : 'Save' }}</button>
              <button @click="cancelReschedule" class="px-3 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
              <div v-if="rescheduleError" class="text-[11px] text-red-600 w-full">{{ rescheduleError }}</div>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-gray-400">No upcoming scheduled auctions</div>
      </div>

      <!-- All Queue Entries (search + pagination) -->
      <div class="bg-white rounded-lg shadow border">
        <div class="px-3 py-2 border-b">
          <h2 class="text-sm font-semibold">All Queue Entries</h2>
          <p class="text-[10px] text-gray-500 mt-0.5">
            <template v-if="hasActiveFilters">
              {{ filteredEntries.length }} of {{ allEntries.length }} entries match
            </template>
            <template v-else>
              {{ allEntries.length }} total entries
            </template>
          </p>
        </div>

        <!-- Filters: category + search -->
        <div class="px-3 py-2 border-b" ref="searchContainer">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <select
              v-model="categoryFilter"
              class="text-xs border rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Categories</option>
              <option value="FEATURED">Featured</option>
              <option value="UNSCHEDULED">Unscheduled</option>
            </select>
            <select
              v-model="rarityFilter"
              class="text-xs border rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Rarities</option>
              <option v-for="r in rarityOptions" :key="r" :value="r">{{ r }}</option>
            </select>
            <select
              v-model="seriesFilter"
              class="text-xs border rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Series</option>
              <option v-for="s in seriesOptions" :key="s" :value="s">{{ s }}</option>
            </select>
            <select
              v-model="setFilter"
              class="text-xs border rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Sets</option>
              <option v-for="s in setOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="relative w-full sm:w-80">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by cToon name…"
              class="w-full text-xs border rounded-md px-2 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-300"
              @focus="showSuggestions = searchQuery.trim().length >= 3"
              @keydown.escape="showSuggestions = false"
            />
            <button
              v-if="searchQuery"
              @click="clearSearch"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl leading-none"
            >×</button>

            <!-- Autocomplete dropdown -->
            <div
              v-if="showSuggestions && searchSuggestions.length"
              class="absolute z-20 top-full mt-1 left-0 w-full sm:w-96 bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto"
            >
              <button
                v-for="suggestion in searchSuggestions"
                :key="suggestion.id"
                @mousedown.prevent="selectSuggestion(suggestion)"
                class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 text-left"
              >
                <div class="shrink-0 w-8 h-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                  <img v-if="suggestion.ctoonImage" :src="suggestion.ctoonImage" :alt="suggestion.ctoonName"
                       class="w-full h-full object-contain" loading="lazy" />
                  <span v-else class="text-gray-300 text-xs">?</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-medium truncate">{{ suggestion.ctoonName || '—' }}</div>
                  <div class="text-[10px] text-gray-500">Mint #{{ suggestion.mintNumber ?? '?' }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Entries list -->
        <div v-if="paginatedEntries.length" class="divide-y">
          <div v-for="entry in paginatedEntries" :key="entry.id" class="px-3 py-2 text-xs">
            <div class="flex items-start gap-2">
              <div class="shrink-0 w-9 h-9 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img v-if="entry.ctoonImage" :src="entry.ctoonImage" :alt="entry.ctoonName"
                     class="w-full h-full object-contain" loading="lazy" />
                <span v-else class="text-gray-300 text-base">?</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" :title="entry.ctoonName">{{ entry.ctoonName || '—' }}</div>
                <div class="text-[10px] text-gray-500 mt-0.5">
                  {{ entry.rarity }}
                  <span v-if="entry.series"> · {{ entry.series }}</span>
                  <span v-if="entry.set"> · {{ entry.set }}</span>
                  <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                  <span class="ml-2 px-1.5 py-0 rounded text-[10px] font-medium"
                        :class="categoryChip(entry.category)">{{ entry.category }}</span>
                  <span v-if="entry.isFeatured" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">Featured</span>
                  <span v-if="entry.fromInactive" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700">From Inactive</span>
                  <span v-if="entry.pinned" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-blue-100 text-blue-700">📌 Pinned</span>
                  <span v-if="entry.held" class="ml-1 px-1.5 py-0 rounded text-[10px] font-medium bg-purple-100 text-purple-700" title="Set a starting bid for this rarity above to auction it">Held, needs a starting bid</span>
                  <span v-else-if="entry.startingBid != null" class="ml-1 text-[10px] text-gray-500">Starts at {{ entry.startingBid.toLocaleString() }} pts</span>
                </div>
                <div v-if="entry.sourceUsername" class="text-[10px] text-gray-400 mt-0.5">From: {{ entry.sourceUsername }}</div>
                <div class="text-[10px] text-gray-500 mt-1">
                  {{ entry.scheduledFor ? fmtCST(entry.scheduledFor) : (entry.held ? 'Held' : 'Not scheduled') }}
                </div>
              </div>
              <div class="shrink-0 flex flex-col items-end gap-1">
                <button
                  @click="openReschedule(entry)"
                  class="text-[11px] text-blue-600 hover:text-blue-800"
                >Reschedule</button>
                <button
                  v-if="entry.pinned"
                  @click="unpinEntry(entry.id)"
                  class="text-[11px] text-amber-600 hover:text-amber-800 disabled:opacity-50"
                  :disabled="unpinningId === entry.id"
                >{{ unpinningId === entry.id ? '…' : 'Unpin' }}</button>
                <button
                  @click="cancelEntry(entry.id)"
                  class="text-[11px] text-red-500 hover:text-red-700"
                  :disabled="cancellingId === entry.id"
                >{{ cancellingId === entry.id ? '…' : (entry.scheduledFor ? 'Unschedule' : 'Remove') }}</button>
              </div>
            </div>
            <div v-if="reschedulingId === entry.id" class="mt-2 flex flex-wrap items-center gap-2 pl-0 sm:pl-[44px]">
              <input v-model="rescheduleLocal" type="datetime-local"
                     class="text-xs border rounded-md px-2 py-1.5" />
              <button
                @click="saveReschedule(entry.id)"
                :disabled="reschedulingSaving"
                class="px-3 py-1 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
              >{{ reschedulingSaving ? 'Saving…' : 'Save' }}</button>
              <button @click="cancelReschedule" class="px-3 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
              <div v-if="rescheduleError" class="text-[11px] text-red-600 w-full">{{ rescheduleError }}</div>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-gray-400">
          {{ hasActiveFilters ? 'No entries match your filters' : 'No entries in the dissolve queue' }}
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="px-3 py-2 border-t flex items-center justify-between">
          <div class="text-[10px] text-gray-500">
            Showing {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredEntries.length) }} of {{ filteredEntries.length }}
          </div>
          <div class="flex items-center gap-1">
            <button @click="goToPage(1)" :disabled="currentPage === 1"
                    class="px-2 py-1 text-xs rounded-md border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1"
                    class="px-2 py-1 text-xs rounded-md border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
            <span class="px-2 text-xs text-gray-600">{{ currentPage }} / {{ totalPages }}</span>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === totalPages"
                    class="px-2 py-1 text-xs rounded-md border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">›</button>
            <button @click="goToPage(totalPages)" :disabled="currentPage === totalPages"
                    class="px-2 py-1 text-xs rounded-md border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
          </div>
        </div>
      </div>

      <!-- Reschedule All form -->
      <div class="bg-white rounded border p-3">
        <h2 class="text-sm font-semibold mb-1">Reschedule All</h2>
        <p class="text-[11px] text-gray-500 mb-3">
          Set a new schedule for all unscheduled entries. Toggle "Reschedule all" to also reset existing scheduled entries.
          Held entries are skipped. These values are saved and also used for inactive-account dissolves.
        </p>

        <div class="space-y-2">
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Start date (local)</label>
            <input v-model="form.startAtLocal" type="datetime-local"
                   class="w-full sm:flex-1 border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Cadence (days)</label>
            <input v-model.number="form.cadenceDays" type="number" min="1"
                   class="w-full sm:w-24 border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Featured / cadence</label>
            <input v-model.number="form.featuredPerCadence" type="number" min="1"
                   class="w-full sm:w-24 border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Other / cadence</label>
            <input v-model.number="form.otherPerCadence" type="number" min="1"
                   class="w-full sm:w-24 border rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div class="flex items-center gap-2">
            <input v-model="form.reschedule" type="checkbox" id="reschedule-all"
                   class="rounded border-gray-300" />
            <label for="reschedule-all" class="text-xs text-gray-600">
              Reschedule all (including already-scheduled entries)
            </label>
          </div>
        </div>

        <div v-if="scheduleError" class="mt-2 text-xs text-red-600">{{ scheduleError }}</div>
        <div v-if="scheduleSuccess" class="mt-2 text-xs text-emerald-600">{{ scheduleSuccess }}</div>

        <div class="mt-3">
          <button
            @click="applySchedule"
            :disabled="scheduling"
            class="w-full sm:w-auto px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
          >{{ scheduling ? 'Scheduling…' : 'Apply Schedule' }}</button>
        </div>
      </div>
    </div>

    <!-- Reschedule All: pinned-entry confirmation modal -->
    <div v-if="showRescheduleConfirm" class="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-black/40" @click.self="closeRescheduleConfirm">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div class="p-4 sm:p-5 border-b">
          <h2 class="font-semibold text-lg">Some auctions were manually rescheduled</h2>
        </div>

        <div class="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 text-sm text-gray-700 leading-relaxed">
          <p>
            <span class="font-semibold">{{ pinnedCount }}</span>
            {{ pinnedCount === 1 ? 'cToon currently has' : 'cToons currently have' }}
            a date/time that a mod manually picked for it. That's called being
            <span class="font-semibold">"pinned."</span>
          </p>
          <p>
            Normally, "Reschedule All" recalculates the date/time for every entry using the cadence
            settings above. Pinned entries are protected from that by default, so a mod's manual
            choice doesn't get silently undone by this form.
          </p>
          <p>What should this run do with the pinned {{ pinnedCount === 1 ? 'entry' : 'entries' }}?</p>
        </div>

        <div class="p-4 sm:p-5 border-t space-y-2">
          <button
            @click="doApplySchedule(false)"
            :disabled="scheduling"
            class="w-full px-4 py-2.5 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
          >Keep the {{ pinnedCount === 1 ? 'pinned entry' : `${pinnedCount} pinned entries` }} as-is (Recommended)</button>
          <button
            @click="doApplySchedule(true)"
            :disabled="scheduling"
            class="w-full px-4 py-2.5 text-sm rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >Reset the pinned {{ pinnedCount === 1 ? 'entry' : 'entries' }} too</button>
          <p class="text-xs text-gray-400 text-center px-2">
            Resetting will erase those manually-picked dates and reassign them like any other queue entry.
          </p>
          <button
            @click="closeRescheduleConfirm"
            :disabled="scheduling"
            class="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >Cancel</button>
        </div>
      </div>
    </div>

    <!-- Edit Featured modal -->
    <div v-if="showFeaturedModal" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50" @click.self="closeFeaturedModal">
      <div class="relative bg-white w-full max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="px-4 py-3 border-b flex-shrink-0">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">Edit Featured</h2>
            <button @click="closeFeaturedModal" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <p class="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
            When an account is dissolved, its cToons are transferred to the official account and queued
            for auction. Any cToon that matches a checked rarity, series, or set below is marked as a
            <span class="font-medium">featured</span> auction when it's queued. Checking a box here does
            not change anything already in the queue until you click Save — at that point every entry
            currently in the dissolve queue (scheduled or not) is re-evaluated against these rules too.
          </p>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          <!-- Rarities -->
          <div>
            <h3 class="text-xs font-semibold text-gray-700 mb-1.5">Rarities</h3>
            <div class="border rounded-md divide-y max-h-40 overflow-y-auto">
              <label v-for="r in orderedRarityOptions" :key="r"
                     class="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" :value="r" v-model="featuredForm.rarities" class="rounded border-gray-300" />
                {{ r }}
              </label>
            </div>
          </div>

          <!-- Series -->
          <div>
            <h3 class="text-xs font-semibold text-gray-700 mb-1.5">Series</h3>
            <input
              v-model="seriesSearch"
              type="text"
              placeholder="Filter series… (3+ characters)"
              class="w-full border rounded-md px-2 py-1.5 text-sm mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div class="border rounded-md divide-y max-h-40 overflow-y-auto">
              <label v-for="s in orderedSeriesOptions" :key="s"
                     class="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" :value="s" v-model="featuredForm.series" class="rounded border-gray-300" />
                {{ s }}
              </label>
              <div v-if="!orderedSeriesOptions.length" class="px-2 py-1.5 text-xs text-gray-400">No matches</div>
            </div>
          </div>

          <!-- Sets -->
          <div>
            <h3 class="text-xs font-semibold text-gray-700 mb-1.5">Sets</h3>
            <input
              v-model="setSearch"
              type="text"
              placeholder="Filter sets… (3+ characters)"
              class="w-full border rounded-md px-2 py-1.5 text-sm mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div class="border rounded-md divide-y max-h-40 overflow-y-auto">
              <label v-for="s in orderedSetOptions" :key="s"
                     class="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" :value="s" v-model="featuredForm.sets" class="rounded border-gray-300" />
                {{ s }}
              </label>
              <div v-if="!orderedSetOptions.length" class="px-2 py-1.5 text-xs text-gray-400">No matches</div>
            </div>
          </div>
        </div>

        <div class="px-4 py-3 border-t flex-shrink-0">
          <div v-if="featuredError" class="mb-2 text-xs text-red-600">{{ featuredError }}</div>
          <div v-if="featuredSuccess" class="mb-2 text-xs text-emerald-600">{{ featuredSuccess }}</div>
          <div class="flex items-center justify-end gap-2">
            <button @click="closeFeaturedModal" class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50">Cancel</button>
            <button
              @click="saveFeaturedConfig"
              :disabled="savingFeatured"
              class="px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
            >{{ savingFeatured ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Errors modal: failures launching a queue entry into a live auction -->
    <div v-if="showErrorsModal" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50" @click.self="closeErrorsModal">
      <div class="relative bg-white w-full max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="px-4 py-3 border-b flex-shrink-0 flex items-center justify-between">
          <h2 class="text-sm font-semibold">Errors</h2>
          <div class="flex items-center gap-2">
            <button
              v-if="errorLog.length"
              type="button"
              class="px-2 py-1 text-xs border border-red-600 text-red-700 rounded-md hover:bg-red-50"
              @click="clearErrorLog"
            >Clear Log</button>
            <button @click="closeErrorsModal" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>
        <div class="overflow-y-auto flex-1 px-4 py-3">
          <div v-if="errorLogLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <template v-else>
            <div v-if="errorLog.length" class="bg-gray-50 rounded-md border divide-y">
              <div v-for="e in errorLog" :key="e.id" class="p-2.5">
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-medium">{{ e.ctoonName || 'Unknown cToon' }}</span>
                  <span v-if="e.mintNumber != null" class="text-gray-500">Mint #{{ e.mintNumber }}</span>
                  <span v-if="e.rarity" class="text-gray-500">· {{ e.rarity }}</span>
                  <span v-if="e.series" class="text-gray-500">· {{ e.series }}</span>
                  <span v-if="e.set" class="text-gray-500">· {{ e.set }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 mt-1">
                  <span>{{ fmtCST(e.createdAt) }}</span>
                  <span v-if="e.sourceUsername">· From: {{ e.sourceUsername }}</span>
                  <span v-if="e.userCtoonId">· userCtoonId: {{ e.userCtoonId }}</span>
                  <span v-if="e.queueEntryId">· queueEntryId: {{ e.queueEntryId }}</span>
                </div>
                <pre class="text-[11px] text-red-700 mt-1.5 whitespace-pre-wrap break-words">{{ e.message }}</pre>
              </div>
            </div>
            <p v-else class="text-gray-500">No errors logged.</p>
          </template>
          <p v-if="errorLogError" class="text-red-600 mt-2 text-xs">{{ errorLogError }}</p>
        </div>
      </div>
    </div>

    <!-- Misfires modal: cToons a scheduled dissolve auction tried to (or did) auction off after
         the item had already legitimately changed hands — see DissolveMisfireLog's own schema
         comment for the full story. Teleported to <body>: the layout's `.site-container` is
         transform-scaled on desktop, which traps `fixed` descendants in its own stacking context
         (z-index only competes inside it) and sizes them to the container rather than the viewport. -->
    <Teleport to="body">
    <div v-if="showMisfiresModal" class="fixed inset-0 z-[10001] flex items-center justify-center p-2 bg-black/50" @click.self="closeMisfiresModal">
      <div class="relative bg-white w-full max-w-3xl rounded-lg shadow-lg flex flex-col max-h-[calc(100dvh-1rem)] overflow-hidden">
        <div class="px-4 py-3 border-b flex-shrink-0 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">Dissolve Auction Misfires</h2>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="px-2 py-1 text-xs border border-indigo-600 text-indigo-700 rounded-md hover:bg-indigo-50 disabled:opacity-50"
              :disabled="resolveRunning || !readyToResolveCount"
              @click="resolveAllReady"
            >{{ resolveRunning ? 'Resolving…' : `Resolve All Ready (${readyToResolveCount})` }}</button>
            <button
              type="button"
              class="px-2 py-1 text-xs border border-blue-600 text-blue-700 rounded-md hover:bg-blue-50 disabled:opacity-50"
              :disabled="misfireScanRunning || resolveRunning"
              @click="runMisfireScan"
            >{{ misfireScanRunning ? 'Scanning…' : 'Scan for Historical Misfires' }}</button>
            <button @click="closeMisfiresModal" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>
        <div class="overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 py-3">
          <p class="text-[11px] text-gray-500 mb-2">
            A cToon released from the official account (dissolved into it, or granted to it —
            AuctionOnly, give-to-official, admin correction) to a real player could get
            auctioned off a second time, out from under its real owner (e.g. via a stale
            dissolve-auction queue entry). The worker now checks
            ownership before launching one (PREVENTED rows below are cases it caught live);
            "Scan for Historical Misfires" looks for cases that already happened before that fix.
            "Resolve" restores the cToon to whoever ORIGINALLY won it at auction and credits
            points to everyone else who legitimately held it since.
          </p>
          <p v-if="misfireScanResult" class="text-[11px] mb-2" :class="misfireScanResult.found ? 'text-red-700 font-medium' : 'text-green-700'">
            Scanned {{ misfireScanResult.scanned }} official-account auction(s) — found {{ misfireScanResult.found }} new misfire(s).
            <span v-if="misfireScanResult.reopened">Re-opened {{ misfireScanResult.reopened }} row(s) that had been closed out while their auction was still live and has since sold the cToon. </span>
            <span v-if="misfireScanResult.prunedFalsePositives">Removed {{ misfireScanResult.prunedFalsePositives }} previously-flagged row(s) that turned out not to be real misfires.</span>
          </p>

          <div v-if="resolveRunning || resolveStatus === 'completed' || resolveStatus === 'failed'" class="border rounded-md p-2.5 space-y-2 mb-2">
            <div class="flex items-center justify-between text-[11px] text-gray-600">
              <span>{{ resolveProgressLabel }}</span>
              <span>{{ resolvePct }}%</span>
            </div>
            <div class="w-full h-2 bg-gray-100 rounded overflow-hidden">
              <div class="h-full bg-indigo-600 transition-all" :style="{ width: resolvePct + '%' }"></div>
            </div>
            <p v-if="resolveCurrent" class="text-[11px] text-gray-500 truncate">
              {{ resolveCurrent.status }}<span v-if="resolveCurrent.ctoonName"> — {{ resolveCurrent.ctoonName }}</span>
              <span v-if="resolveCurrent.originalWinner"> → {{ resolveCurrent.originalWinner }}</span>
              <span v-if="resolveCurrent.totalCompensationPoints != null"> ({{ resolveCurrent.totalCompensationPoints }} pts compensation)</span>
              <span v-if="resolveCurrent.reason"> — {{ resolveCurrent.reason }}</span>
            </p>
            <div v-if="resolveSummary" class="text-[11px] bg-gray-50 border rounded p-2">
              <p class="font-medium">{{ resolveStatus === 'failed' ? 'Run failed' : 'Resolve run complete' }}</p>
              <p class="text-gray-600">
                {{ resolveSummary.resolved }} resolved, {{ resolveSummary.alreadyCorrect }} already correct,
                {{ resolveSummary.blocked }} blocked, {{ resolveSummary.failed }} failed (of {{ resolveSummary.total }}).
              </p>
            </div>
          </div>

          <div v-if="misfireLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <template v-else-if="!resolveRunning">
            <div v-if="misfireLog.length" class="bg-gray-50 rounded-md border divide-y">
              <div v-for="m in misfireLog" :key="m.id" class="p-2.5">
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    :class="{
                      'bg-amber-100 text-amber-800': m.source === 'PREVENTED',
                      'bg-orange-100 text-orange-800': m.source === 'HISTORICAL_ACTIVE',
                      'bg-red-100 text-red-800': m.source === 'HISTORICAL_RESOLVED'
                    }"
                  >{{ misfireSourceLabel(m.source) }}</span>
                  <span class="font-medium">{{ m.ctoonName || 'Unknown cToon' }}</span>
                  <span v-if="m.mintNumber != null" class="text-gray-500">Mint #{{ m.mintNumber }}</span>
                  <span v-if="m.reviewedAt" class="text-green-700 text-[10px]">✓ Reviewed</span>
                  <span v-if="m.resolvedAt" class="text-indigo-700 text-[10px]">✓ Resolved</span>
                </div>
                <div class="text-[11px] mt-1.5">
                  <span class="font-medium">Rightful owner:</span>
                  {{ m.rightfulOwnerUsername || m.rightfulOwnerUserId || 'Unknown' }}
                  <span v-if="m.rightfulOwnerMethod" class="text-gray-500">
                    — acquired via {{ m.rightfulOwnerMethod }}{{ m.rightfulOwnerSince ? ' on ' + fmtCST(m.rightfulOwnerSince) : '' }}
                  </span>
                </div>
                <div v-if="m.releaseMethod" class="text-[11px] mt-1 text-gray-600">
                  <span class="font-medium">Entered official via:</span> {{ m.releaseMethod }}
                  <span v-if="m.releaseMethod !== 'DISSOLVE' && m.releaseMethod !== 'DISSOLVE_INACTIVE'" class="text-amber-700">(not a dissolve — verify this isn't an auction reassigned after its seller was dissolved)</span>
                </div>
                <div v-if="m.source === 'HISTORICAL_RESOLVED'" class="text-[11px] mt-1 text-red-700">
                  <span class="font-medium">Wrongly sold to:</span>
                  {{ m.wrongWinnerUsername || m.wrongWinnerUserId || 'Unknown' }}
                  <span v-if="m.wrongWinnerPaidPoints != null">for {{ m.wrongWinnerPaidPoints }} pts</span>
                </div>
                <div class="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 mt-1">
                  <span>Detected {{ fmtCST(m.detectedAt) }}</span>
                  <span v-if="m.bogusAuctionId">· Auction: {{ m.bogusAuctionId }}</span>
                  <span v-if="m.userCtoonId">· userCtoonId: {{ m.userCtoonId }}</span>
                </div>

                <!-- Ownership journey / automated resolution -->
                <div v-if="m.resolvedAt" class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded p-2 mt-1.5">
                  <p class="font-medium">Resolved on {{ fmtCST(m.resolvedAt) }} by {{ m.resolvedByUsername || m.resolvedByUserId }}</p>
                  <template v-if="m.resolutionSummary?.alreadyCorrect">
                    <p class="text-indigo-700/80">Current owner already matched the original winner — no changes were needed.</p>
                  </template>
                  <template v-else-if="m.resolutionSummary?.restoreItem === false">
                    <p>Cancelled the still-live bogus auction — <span class="font-medium">{{ m.resolutionSummary.originalWinner.username }}</span> already held the cToon, so no transfer was needed.</p>
                  </template>
                  <template v-else-if="m.resolutionSummary?.originalWinner">
                    <p>Restored to <span class="font-medium">{{ m.resolutionSummary.originalWinner.username }}</span>
                      (won via {{ m.resolutionSummary.originalWinner.method }}).</p>
                    <ul v-if="m.resolutionSummary.compensations?.length" class="list-disc ml-4 mt-1">
                      <li v-for="c in m.resolutionSummary.compensations" :key="c.userId">
                        {{ c.username || c.userId }}: +{{ c.points }} pts — {{ c.reason }}
                      </li>
                    </ul>
                  </template>
                </div>
                <div v-else-if="misfirePreviewLoading[m.id]" class="text-[10px] text-gray-500 mt-1.5">Checking ownership journey…</div>
                <div v-else-if="misfirePreviews[m.id]?.blocked" class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-1.5">
                  <span class="font-medium">Can't auto-resolve:</span> {{ misfirePreviews[m.id].blocked }}
                </div>
                <div v-else-if="misfirePreviews[m.id]?.alreadyCorrect" class="text-[11px] text-gray-600 bg-gray-50 border rounded p-2 mt-1.5 flex items-center justify-between gap-2">
                  <span>Current owner already matches the original winner — nothing to restore.</span>
                  <button
                    type="button"
                    class="px-2 py-1 text-[10px] border border-indigo-600 text-indigo-700 rounded-md hover:bg-indigo-50 whitespace-nowrap"
                    @click="confirmResolve(m.id)"
                  >Mark Resolved</button>
                </div>
                <div v-else-if="misfirePreviews[m.id]" class="text-[11px] bg-indigo-50 border border-indigo-200 rounded p-2 mt-1.5 space-y-1">
                  <p v-if="misfirePreviews[m.id].restoreItem === false">
                    <span class="font-medium">{{ misfirePreviews[m.id].originalWinner.username }}</span> still holds the cToon, but the bogus auction is still live and would hand it to the top bidder when it closes.
                  </p>
                  <p v-else>
                    Will restore to <span class="font-medium">{{ misfirePreviews[m.id].originalWinner.username }}</span>
                    (won via {{ misfirePreviews[m.id].originalWinner.method }} on {{ fmtCST(misfirePreviews[m.id].originalWinner.since) }}).
                  </p>
                  <ul v-if="misfirePreviews[m.id].compensations?.length" class="list-disc ml-4">
                    <li v-for="c in misfirePreviews[m.id].compensations" :key="c.userId">
                      {{ c.username || c.userId }}: +{{ c.points }} pts ({{ c.basis }}) — {{ c.reason }}
                    </li>
                  </ul>
                  <p v-if="misfirePreviews[m.id].cancelAuctions?.length" class="text-amber-800">
                    Will cancel {{ misfirePreviews[m.id].cancelAuctions.length }} active auction(s) (bidders' locked points released).
                  </p>
                  <p v-if="misfirePreviews[m.id].withdrawTradeOffers?.length" class="text-amber-800">
                    Will withdraw {{ misfirePreviews[m.id].withdrawTradeOffers.length }} pending trade offer(s).
                  </p>
                  <p class="text-[10px] text-gray-600">Total compensation: {{ misfirePreviews[m.id].totalCompensationPoints }} pts</p>
                  <button
                    type="button"
                    class="px-2 py-1 text-[10px] border border-indigo-600 text-indigo-700 rounded-md hover:bg-indigo-50"
                    @click="confirmResolve(m.id)"
                  >Resolve This Misfire</button>
                </div>

                <div v-if="m.reviewedAt" class="text-[11px] text-green-700 mt-1">
                  Reviewed by {{ m.reviewedByUsername || m.reviewedByUserId }} on {{ fmtCST(m.reviewedAt) }}
                  <span v-if="m.reviewNote">— "{{ m.reviewNote }}"</span>
                </div>
                <div v-else class="flex items-center gap-2 mt-1.5">
                  <input
                    v-model="misfireNoteDrafts[m.id]"
                    type="text"
                    placeholder="Note (optional) — e.g. 'item returned, winner refunded'"
                    class="flex-1 border rounded px-2 py-1 text-[11px]"
                  />
                  <button
                    type="button"
                    class="px-2 py-1 text-[11px] border border-green-600 text-green-700 rounded-md hover:bg-green-50 whitespace-nowrap"
                    @click="markMisfireReviewed(m.id)"
                  >Mark Reviewed</button>
                </div>
              </div>
            </div>
            <p v-else class="text-gray-500">No misfires logged.</p>
          </template>
          <p v-if="misfireError" class="text-red-600 mt-2 text-xs">{{ misfireError }}</p>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Reschedule error modal: surfaces details when a reschedule save fails -->
    <div v-if="showRescheduleErrorModal" class="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50" @click.self="closeRescheduleErrorModal">
      <div class="relative bg-white w-full max-w-xl rounded-lg shadow-lg flex flex-col max-h-[92vh]">
        <div class="px-4 py-3 border-b flex-shrink-0 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-red-700">Reschedule Failed</h2>
          <button @click="closeRescheduleErrorModal" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div v-if="rescheduleErrorDetails" class="overflow-y-auto flex-1 px-4 py-3 space-y-1.5 text-xs">
          <div><span class="font-medium">cToon:</span> {{ rescheduleErrorDetails.ctoonName || '—' }}
            <span v-if="rescheduleErrorDetails.mintNumber != null"> (Mint #{{ rescheduleErrorDetails.mintNumber }})</span>
          </div>
          <div><span class="font-medium">Queue entry ID:</span> {{ rescheduleErrorDetails.entryId }}</div>
          <div><span class="font-medium">Attempted date/time:</span> {{ rescheduleErrorDetails.attemptedLocal }} ({{ rescheduleErrorDetails.attemptedUtc }})</div>
          <div><span class="font-medium">HTTP status:</span> {{ rescheduleErrorDetails.statusCode ?? '—' }}</div>
          <div><span class="font-medium">Time of failure:</span> {{ rescheduleErrorDetails.occurredAt }}</div>
          <div>
            <div class="font-medium mb-1">Error details:</div>
            <pre class="text-[11px] text-red-700 bg-gray-50 border rounded p-2 whitespace-pre-wrap break-words">{{ rescheduleErrorDetails.message }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRequestHeaders } from '#app'

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const stats      = ref(null)
const upcoming   = ref([])
const allEntries = ref([])

// Search
const searchQuery     = ref('')
const showSuggestions = ref(false)
const searchContainer = ref(null)

// Category filter
const categoryFilter = ref('ALL')

// Rarity / series / set filters
const rarityFilter = ref('ALL')
const seriesFilter = ref('ALL')
const setFilter    = ref('ALL')

function uniqueSorted(values) {
  return [...new Set(values.filter(v => v != null && v !== ''))].sort((a, b) => a.localeCompare(b))
}

const rarityOptions = computed(() => uniqueSorted(allEntries.value.map(e => e.rarity)))
const seriesOptions = computed(() => uniqueSorted(allEntries.value.map(e => e.series)))
const setOptions    = computed(() => uniqueSorted(allEntries.value.map(e => e.set)))

const hasActiveFilters = computed(() =>
  searchQuery.value.length > 0 ||
  categoryFilter.value !== 'ALL' ||
  rarityFilter.value !== 'ALL' ||
  seriesFilter.value !== 'ALL' ||
  setFilter.value !== 'ALL'
)

// Pagination
const currentPage = ref(1)
const pageSize    = 50

const categories = [
  { key: 'FEATURED', label: 'Featured' },
  { key: 'OTHER',    label: 'Other' },
]

// Filter across all entries (not just current page)
const filteredEntries = computed(() => {
  let result = allEntries.value
  if (categoryFilter.value === 'UNSCHEDULED') {
    result = result.filter(e => !e.scheduledFor)
  } else if (categoryFilter.value !== 'ALL') {
    result = result.filter(e => e.category === categoryFilter.value)
  }
  if (rarityFilter.value !== 'ALL') {
    result = result.filter(e => e.rarity === rarityFilter.value)
  }
  if (seriesFilter.value !== 'ALL') {
    result = result.filter(e => e.series === seriesFilter.value)
  }
  if (setFilter.value !== 'ALL') {
    result = result.filter(e => e.set === setFilter.value)
  }
  if (!searchQuery.value.trim()) return result
  const q = searchQuery.value.trim().toLowerCase()
  return result.filter(e => (e.ctoonName || '').toLowerCase().includes(q))
})

// Autocomplete suggestions: up to 8 results, only shown at 3+ chars
const searchSuggestions = computed(() => {
  if (searchQuery.value.trim().length < 3) return []
  return filteredEntries.value.slice(0, 8)
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredEntries.value.length / pageSize)))

const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredEntries.value.slice(start, start + pageSize)
})

// Reset to page 1 and manage suggestion visibility when search changes
watch(searchQuery, (val) => {
  currentPage.value = 1
  showSuggestions.value = val.trim().length >= 3
})

// Reset to page 1 when any filter changes
watch([categoryFilter, rarityFilter, seriesFilter, setFilter], () => {
  currentPage.value = 1
})

function handleDocumentClick(e) {
  if (searchContainer.value && !searchContainer.value.contains(e.target)) {
    showSuggestions.value = false
  }
}

function clearSearch() {
  searchQuery.value     = ''
  showSuggestions.value = false
  currentPage.value     = 1
}

function selectSuggestion(suggestion) {
  searchQuery.value     = suggestion.ctoonName || ''
  showSuggestions.value = false
  currentPage.value     = 1
}

function goToPage(page) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

function defaultStartLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const form = ref({
  startAtLocal:       defaultStartLocal(),
  cadenceDays:        7,
  featuredPerCadence: 2,
  otherPerCadence:    10,
  reschedule:         false,
})

const scheduling      = ref(false)
const scheduleError   = ref('')
const scheduleSuccess = ref('')
const cancellingId    = ref(null)
const unpinningId     = ref(null)

const showRescheduleConfirm = ref(false)
const pinnedCount = computed(() => allEntries.value.filter(e => e.pinned).length)

// ── Special-rarity starting bids (see server/utils/dissolveListing.js) ──
const RARITY_MIN = { 'Auction Only': 50, 'Prize Only': 50, 'Code Only': 50, 'Crazy Rare': 312 }
const specialRarities = [
  { label: 'Auction Only', field: 'dissolveStartBidAuctionOnly' },
  { label: 'Prize Only',   field: 'dissolveStartBidPrizeOnly' },
  { label: 'Code Only',    field: 'dissolveStartBidCodeOnly' },
  { label: 'Crazy Rare',   field: 'dissolveStartBidCrazyRare' },
].map(r => ({ ...r, min: RARITY_MIN[r.label] }))
const startBidForm    = ref(Object.fromEntries(specialRarities.map(r => [r.field, ''])))
const savingStartBids = ref(false)
const startBidError   = ref('')
const startBidSuccess = ref('')
// Held counts arrive keyed by the cToon's stored rarity; match case-insensitively.
function heldCountFor(label) {
  const held = stats.value?.heldByRarity || {}
  return Object.entries(held).reduce((n, [r, c]) => n + (r.trim().toLowerCase() === label.toLowerCase() ? c : 0), 0)
}
function fillStartBidForm(startBids) {
  startBidForm.value = Object.fromEntries(specialRarities.map(r => [r.field, startBids?.[r.field] ?? '']))
}

async function saveStartBids() {
  savingStartBids.value = true
  startBidError.value = ''
  startBidSuccess.value = ''
  try {
    const body = { startBids: Object.fromEntries(specialRarities.map(r => {
      const v = startBidForm.value[r.field]
      return [r.field, v === '' || v === null ? null : Number(v)]
    })) }
    const res = await $fetch('/api/admin/dissolve-queue/start-bids', { method: 'POST', body })
    fillStartBidForm(res.startBids)
    startBidSuccess.value = 'Starting bids saved. Run Apply Schedule to schedule the newly listable entries.'
    await loadData()
  } catch (e) {
    startBidError.value = e?.data?.statusMessage || 'Failed to save starting bids.'
  } finally {
    savingStartBids.value = false
  }
}

// The form shows the SAVED cadence (what the inactivity sweep also uses) the first time data
// loads, instead of hardcoded defaults that looked like the real settings. Later refreshes don't
// overwrite what an admin is in the middle of editing.
let formSeededFromConfig = false
async function loadData() {
  try {
    const data = await $fetch('/api/admin/dissolve-queue', { headers })
    stats.value      = data
    upcoming.value   = data.upcoming || []
    allEntries.value = data.entries  || []
    if (data.config && !formSeededFromConfig) {
      formSeededFromConfig = true
      form.value.cadenceDays        = data.config.cadenceDays
      form.value.featuredPerCadence = data.config.featuredPerCadence
      form.value.otherPerCadence    = data.config.otherPerCadence
      fillStartBidForm(data.config.startBids)
    }
  } catch (e) {
    console.error('Failed to load dissolve queue', e)
  }
}

onMounted(() => {
  loadData()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

function applySchedule() {
  // Recompute-everything can silently overwrite dates mods hand-picked for
  // specific entries — make that an explicit choice instead of a surprise.
  if (form.value.reschedule && pinnedCount.value > 0) {
    showRescheduleConfirm.value = true
    return
  }
  doApplySchedule(false)
}

function closeRescheduleConfirm() {
  showRescheduleConfirm.value = false
}

async function doApplySchedule(includePinned) {
  showRescheduleConfirm.value = false
  scheduling.value    = true
  scheduleError.value = ''
  scheduleSuccess.value = ''
  try {
    const f = form.value
    const res = await $fetch('/api/admin/dissolve-queue/schedule', {
      method: 'POST',
      body: {
        startAtUtc:         new Date(f.startAtLocal).toISOString(),
        cadenceDays:        f.cadenceDays,
        featuredPerCadence: f.featuredPerCadence,
        otherPerCadence:    f.otherPerCadence,
        reschedule:         f.reschedule,
        includePinned,
      }
    })
    scheduleSuccess.value = `Scheduled ${res.scheduled} entries.`
    await loadData()
  } catch (e) {
    scheduleError.value = e?.data?.statusMessage || 'Failed to apply schedule.'
  } finally {
    scheduling.value = false
  }
}

// Per-entry reschedule
const reschedulingId      = ref(null)
const rescheduleLocal     = ref('')
const reschedulingSaving  = ref(false)
const rescheduleError     = ref('')

// Reschedule error modal
const showRescheduleErrorModal = ref(false)
const rescheduleErrorDetails   = ref(null)

function closeRescheduleErrorModal() {
  showRescheduleErrorModal.value = false
  rescheduleErrorDetails.value = null
}

function toDatetimeLocal(iso) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openReschedule(entry) {
  rescheduleError.value = ''
  reschedulingId.value  = entry.id
  rescheduleLocal.value = toDatetimeLocal(entry.scheduledFor)
}

function cancelReschedule() {
  reschedulingId.value  = null
  rescheduleLocal.value = ''
  rescheduleError.value = ''
}

function updateEntryInLists(id, patch) {
  const apply = (list) => {
    const idx = list.findIndex(e => e.id === id)
    if (idx !== -1) list[idx] = { ...list[idx], ...patch }
  }
  apply(upcoming.value)
  apply(allEntries.value)
}

// Matches the server-side floor in server/api/admin/dissolve-queue/[id].patch.js:
// the launch job fires with delay = max(0, scheduledFor - now), so anything not
// comfortably in the future would fire almost immediately instead of at the
// intended time.
const MIN_LEAD_MS = 60 * 1000

async function saveReschedule(id) {
  rescheduleError.value = ''
  if (!rescheduleLocal.value) {
    rescheduleError.value = 'Please choose a date/time.'
    return
  }
  const scheduledForDate = new Date(rescheduleLocal.value)
  if (isNaN(scheduledForDate.getTime())) {
    rescheduleError.value = 'Please choose a valid date/time.'
    return
  }
  if (scheduledForDate.getTime() < Date.now() + MIN_LEAD_MS) {
    rescheduleError.value = 'Please choose a date/time at least 1 minute in the future.'
    return
  }
  reschedulingSaving.value = true
  try {
    const scheduledForUtc = scheduledForDate.toISOString()
    await $fetch(`/api/admin/dissolve-queue/${id}`, {
      method: 'PATCH',
      body: { scheduledForUtc }
    })
    updateEntryInLists(id, { scheduledFor: scheduledForUtc, pinned: true })
    cancelReschedule()
    await loadData()
  } catch (e) {
    const entry = [...upcoming.value, ...allEntries.value].find(x => x.id === id)
    rescheduleError.value = e?.data?.statusMessage || 'Failed to reschedule entry.'
    rescheduleErrorDetails.value = {
      entryId: id,
      ctoonName: entry?.ctoonName || null,
      mintNumber: entry?.mintNumber ?? null,
      attemptedLocal: rescheduleLocal.value,
      attemptedUtc: (() => { try { return scheduledForDate.toISOString() } catch { return '—' } })(),
      statusCode: e?.statusCode ?? e?.data?.statusCode ?? e?.response?.status ?? null,
      occurredAt: new Date().toISOString(),
      message: e?.data?.statusMessage || e?.message || String(e),
    }
    showRescheduleErrorModal.value = true
  } finally {
    reschedulingSaving.value = false
  }
}

async function unpinEntry(id) {
  unpinningId.value = id
  try {
    await $fetch(`/api/admin/dissolve-queue/${id}`, {
      method: 'PATCH',
      body: { unpin: true }
    })
    updateEntryInLists(id, { pinned: false })
  } catch (e) {
    console.error('Failed to unpin entry', e)
  } finally {
    unpinningId.value = null
  }
}

async function cancelEntry(id) {
  cancellingId.value = id
  try {
    await $fetch(`/api/admin/dissolve-queue/${id}`, { method: 'DELETE' })
    upcoming.value = upcoming.value.filter(e => e.id !== id)
    await loadData()
  } catch (e) {
    console.error('Failed to unschedule entry', e)
  } finally {
    cancellingId.value = null
  }
}

function fmtCST(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    timeZone: 'America/Chicago',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' CST'
}

function categoryChip(cat) {
  if (cat === 'FEATURED') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}

// ── Edit Featured modal ────────────────────────────────────────────────────
const showFeaturedModal = ref(false)
const savingFeatured    = ref(false)
const featuredError     = ref('')
const featuredSuccess   = ref('')

const seriesSearch = ref('')
const setSearch    = ref('')

const featuredForm = ref({ rarities: [], series: [], sets: [] })
const featuredOptions = ref({ rarities: [], series: [], sets: [] })

// Checked items first (alphabetical within each group), then unchecked (alphabetical).
function orderChecked(options, checked) {
  const checkedSet = new Set(checked)
  const checkedItems   = options.filter(o => checkedSet.has(o)).sort((a, b) => a.localeCompare(b))
  const uncheckedItems = options.filter(o => !checkedSet.has(o)).sort((a, b) => a.localeCompare(b))
  return [...checkedItems, ...uncheckedItems]
}

// Checked items always stay visible even if they don't match the active filter,
// so a selection can't silently disappear while searching.
function filterOptions(options, checked, search) {
  const q = search.trim().toLowerCase()
  if (q.length < 3) return options
  const checkedSet = new Set(checked)
  return options.filter(o => checkedSet.has(o) || o.toLowerCase().includes(q))
}

const orderedRarityOptions = computed(() =>
  orderChecked(featuredOptions.value.rarities, featuredForm.value.rarities)
)
const orderedSeriesOptions = computed(() =>
  orderChecked(filterOptions(featuredOptions.value.series, featuredForm.value.series, seriesSearch.value), featuredForm.value.series)
)
const orderedSetOptions = computed(() =>
  orderChecked(filterOptions(featuredOptions.value.sets, featuredForm.value.sets, setSearch.value), featuredForm.value.sets)
)

async function openFeaturedModal() {
  featuredError.value   = ''
  featuredSuccess.value = ''
  seriesSearch.value    = ''
  setSearch.value       = ''
  showFeaturedModal.value = true
  try {
    const data = await $fetch('/api/admin/dissolve-featured-config', { headers })
    featuredForm.value = {
      rarities: [...(data.selected?.rarities || [])],
      series:   [...(data.selected?.series   || [])],
      sets:     [...(data.selected?.sets     || [])],
    }
    featuredOptions.value = {
      rarities: data.options?.rarities || [],
      series:   data.options?.series   || [],
      sets:     data.options?.sets     || [],
    }
  } catch (e) {
    featuredError.value = e?.data?.statusMessage || 'Failed to load featured config.'
  }
}

function closeFeaturedModal() {
  showFeaturedModal.value = false
}

async function saveFeaturedConfig() {
  savingFeatured.value = true
  featuredError.value   = ''
  featuredSuccess.value = ''
  try {
    const res = await $fetch('/api/admin/dissolve-featured-config', {
      method: 'POST',
      body: {
        rarities: featuredForm.value.rarities,
        series:   featuredForm.value.series,
        sets:     featuredForm.value.sets,
      }
    })
    featuredSuccess.value = `Saved. ${res.updated} queue ${res.updated === 1 ? 'entry' : 'entries'} updated.`
    await loadData()
  } catch (e) {
    featuredError.value = e?.data?.statusMessage || 'Failed to save featured config.'
  } finally {
    savingFeatured.value = false
  }
}

// ── Errors modal (dissolve-queue → live-auction launch failures) ──────────
const showErrorsModal = ref(false)
const errorLog        = ref([])
const errorLogLoading = ref(false)
const errorLogError   = ref('')

async function openErrorsModal() {
  showErrorsModal.value = true
  errorLogError.value   = ''
  errorLogLoading.value = true
  try {
    errorLog.value = await $fetch('/api/admin/dissolve-queue/errors', { headers })
  } catch (e) {
    errorLogError.value = e?.data?.statusMessage || 'Failed to load error log.'
  } finally {
    errorLogLoading.value = false
  }
}

function closeErrorsModal() {
  showErrorsModal.value = false
}

async function clearErrorLog() {
  try {
    await $fetch('/api/admin/dissolve-queue/errors', { method: 'DELETE' })
    errorLog.value = []
  } catch (e) {
    errorLogError.value = e?.data?.statusMessage || 'Failed to clear error log.'
  }
}

// ── Misfires modal (cToons auctioned off a second time after already changing hands) ──────
const showMisfiresModal  = ref(false)
const misfireLog         = ref([])
const misfireLoading     = ref(false)
const misfireError       = ref('')
const misfireScanRunning = ref(false)
const misfireScanResult  = ref(null)
const misfireNoteDrafts  = reactive({})

function misfireSourceLabel(source) {
  if (source === 'PREVENTED') return 'Prevented'
  if (source === 'HISTORICAL_ACTIVE') return 'Still Active'
  if (source === 'HISTORICAL_RESOLVED') return 'Already Sold'
  return source
}

async function loadMisfireLog() {
  misfireError.value   = ''
  misfireLoading.value = true
  try {
    misfireLog.value = await $fetch('/api/admin/dissolve-misfires', { headers })
    await loadAllPreviews()
  } catch (e) {
    misfireError.value = e?.data?.statusMessage || 'Failed to load misfire log.'
  } finally {
    misfireLoading.value = false
  }
}

async function openMisfiresModal() {
  showMisfiresModal.value = true
  misfireScanResult.value = null
  await loadMisfireLog()
  await checkResolveInFlight()
}

function closeMisfiresModal() {
  showMisfiresModal.value = false
  stopResolvePolling()
}

// Lock the page behind the modal so touch-scrolling moves the modal body, not the page.
watch(showMisfiresModal, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

async function runMisfireScan() {
  misfireScanRunning.value = true
  misfireError.value       = ''
  try {
    const result = await $fetch('/api/admin/dissolve-misfires/scan', { method: 'POST' })
    misfireScanResult.value = result
    await loadMisfireLog()
  } catch (e) {
    misfireError.value = e?.data?.statusMessage || 'Scan failed.'
  } finally {
    misfireScanRunning.value = false
  }
}

async function markMisfireReviewed(id) {
  try {
    const note = misfireNoteDrafts[id] || ''
    await $fetch(`/api/admin/dissolve-misfires/${id}`, { method: 'PATCH', body: { note } })
    await loadMisfireLog()
  } catch (e) {
    misfireError.value = e?.data?.statusMessage || 'Failed to save review.'
  }
}

// ── Misfire resolution (restore to original winner + compensate everyone else) ────────────
const misfirePreviews        = reactive({})
const misfirePreviewLoading  = reactive({})
const resolveStatus          = ref('idle') // idle | waiting | active | completed | failed
const resolvePct             = ref(0)
const resolveProcessed       = ref(0)
const resolveTotal           = ref(0)
const resolveRecent          = ref([])
const resolveCurrent         = ref(null)
const resolveSummary         = ref(null)
let resolveJobId             = null
let resolvePollTimer         = null

const resolveRunning = computed(() => resolveStatus.value === 'waiting' || resolveStatus.value === 'active')
const resolveProgressLabel = computed(() => {
  if (resolveStatus.value === 'completed') return `Done — ${resolveProcessed.value}/${resolveTotal.value}`
  if (resolveStatus.value === 'failed') return `Stopped — ${resolveProcessed.value}/${resolveTotal.value}`
  if (!resolveTotal.value) return 'Starting…'
  return `Resolving ${resolveProcessed.value}/${resolveTotal.value}`
})
const readyToResolveCount = computed(() => {
  return misfireLog.value.filter(m => {
    if (m.resolvedAt) return false
    const p = misfirePreviews[m.id]
    return p && !p.blocked
  }).length
})

async function fetchMisfirePreview(id) {
  misfirePreviewLoading[id] = true
  try {
    misfirePreviews[id] = await $fetch(`/api/admin/dissolve-misfires/${id}/preview`, { method: 'POST', headers })
  } catch (e) {
    misfirePreviews[id] = { blocked: e?.data?.statusMessage || 'Failed to compute remediation plan.' }
  } finally {
    misfirePreviewLoading[id] = false
  }
}

async function loadAllPreviews() {
  const unresolved = misfireLog.value.filter(m => !m.resolvedAt)
  await Promise.all(unresolved.map(m => fetchMisfirePreview(m.id)))
}

function applyResolveStatus(data) {
  resolveStatus.value    = data.status
  resolvePct.value       = data.pct ?? 0
  resolveProcessed.value = data.processed ?? 0
  resolveTotal.value     = data.total ?? 0
  resolveRecent.value    = data.recent ?? []
  resolveCurrent.value   = data.current ?? null
  if (data.status === 'completed') resolveSummary.value = data.summary || null
  if (data.status === 'failed') misfireError.value = data.error || 'Resolve run failed'
}

function stopResolvePolling() {
  if (resolvePollTimer) { clearInterval(resolvePollTimer); resolvePollTimer = null }
}

function pollResolveStatus() {
  stopResolvePolling()
  resolvePollTimer = setInterval(async () => {
    try {
      const data = await $fetch('/api/admin/dissolve-misfires/resolve-status', { params: { jobId: resolveJobId } })
      applyResolveStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        stopResolvePolling()
        await loadMisfireLog()
      }
    } catch (e) {
      misfireError.value = e?.data?.statusMessage || 'Lost connection to the resolve job'
      stopResolvePolling()
    }
  }, 1000)
}

async function checkResolveInFlight() {
  try {
    const data = await $fetch('/api/admin/dissolve-misfires/resolve-status')
    if (data.status === 'waiting' || data.status === 'active') {
      resolveJobId = data.jobId
      applyResolveStatus(data)
      pollResolveStatus()
    }
  } catch {
    // Transient lookup error — fall through to the idle list view.
  }
}

async function startResolve(misfireIds) {
  misfireError.value   = ''
  resolveSummary.value = null
  try {
    const res = await $fetch('/api/admin/dissolve-misfires/resolve', { method: 'POST', body: { misfireIds } })
    resolveJobId        = res.jobId
    resolveStatus.value = 'waiting'
    pollResolveStatus()
  } catch (e) {
    misfireError.value = e?.data?.statusMessage || 'Failed to start resolve run.'
  }
}

async function confirmResolve(id) {
  const plan = misfirePreviews[id]
  if (!plan) return
  const label = plan.alreadyCorrect
    ? 'Mark this misfire as resolved (no ownership change needed)?'
    : plan.restoreItem === false
      ? `Cancel the still-live bogus auction (${plan.originalWinner.username} already holds the cToon)?`
      : `Restore to ${plan.originalWinner.username} and credit ${plan.totalCompensationPoints} pts in compensation?`
  if (!window.confirm(label)) return
  await startResolve([id])
}

async function resolveAllReady() {
  const ids = misfireLog.value
    .filter(m => !m.resolvedAt && misfirePreviews[m.id] && !misfirePreviews[m.id].blocked)
    .map(m => m.id)
  if (!ids.length) return
  const totalPts = ids.reduce((sum, id) => sum + (misfirePreviews[id].totalCompensationPoints || 0), 0)
  if (!window.confirm(`Resolve ${ids.length} misfire(s)? Total compensation to be paid out: ${totalPts} pts.`)) return
  await startResolve(ids)
}

onBeforeUnmount(stopResolvePolling)
</script>
