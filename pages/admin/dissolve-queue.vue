<template>
  <div class="min-h-screen bg-gray-50 p-3 sm:p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto mt-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">Dissolve Queue</h1>
        <div class="flex items-center gap-4">
          <button @click="openErrorsModal" class="text-sm text-red-600 underline">Errors</button>
          <button @click="openFeaturedModal" class="text-sm text-blue-600 underline">Edit Featured</button>
          <button @click="loadData" class="text-sm text-blue-600 underline">Refresh</button>
        </div>
      </div>

      <!-- Summary cards -->
      <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div v-for="cat in categories" :key="cat.key"
             class="bg-white rounded-lg shadow p-4">
          <div class="text-sm font-semibold text-gray-500 mb-1">{{ cat.label }}</div>
          <div class="text-2xl font-bold">{{ stats.byCategory[cat.key]?.total ?? 0 }}</div>
          <div class="text-xs text-gray-500 mt-1">
            <span class="text-emerald-600">{{ stats.byCategory[cat.key]?.scheduled ?? 0 }} scheduled</span>
            <span class="mx-1">·</span>
            <span class="text-orange-500">{{ stats.byCategory[cat.key]?.unscheduled ?? 0 }} unscheduled</span>
          </div>
        </div>
      </div>

      <!-- Upcoming scheduled auctions -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-4 border-b">
          <h2 class="font-semibold">Upcoming Scheduled Auctions</h2>
          <p class="text-xs text-gray-500 mt-0.5">Next 20 entries, times in CST</p>
        </div>
        <div v-if="upcoming.length" class="divide-y">
          <div v-for="entry in upcoming" :key="entry.id"
               class="px-4 py-3 text-sm">
            <div class="flex items-start gap-3">
              <div class="shrink-0 w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img v-if="entry.ctoonImage" :src="entry.ctoonImage" :alt="entry.ctoonName"
                     class="w-full h-full object-contain" loading="lazy" />
                <span v-else class="text-gray-300 text-lg">?</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" :title="entry.ctoonName">{{ entry.ctoonName || '—' }}</div>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ entry.rarity }}
                  <span v-if="entry.series"> · {{ entry.series }}</span>
                  <span v-if="entry.set"> · {{ entry.set }}</span>
                  <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-1 mt-1">
                  <span class="px-1.5 py-0.5 rounded text-xs font-medium"
                        :class="categoryChip(entry.category)">{{ entry.category }}</span>
                  <span v-if="entry.isFeatured" class="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Featured</span>
                  <span v-if="entry.fromInactive" class="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">From Inactive</span>
                  <span v-if="entry.pinned" class="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">📌 Pinned</span>
                </div>
                <div v-if="entry.sourceUsername" class="text-xs text-gray-400 mt-0.5">From: {{ entry.sourceUsername }}</div>
                <div class="text-xs text-gray-500 mt-1 sm:hidden">{{ fmtCST(entry.scheduledFor) }}</div>
              </div>
              <div class="flex flex-col sm:flex-row items-end sm:items-center gap-1 shrink-0">
                <div class="hidden sm:block text-xs text-gray-600 mr-1">{{ fmtCST(entry.scheduledFor) }}</div>
                <button
                  @click="openReschedule(entry)"
                  class="px-2 py-1.5 text-xs rounded text-blue-600 hover:bg-blue-50"
                >Reschedule</button>
                <button
                  v-if="entry.pinned"
                  @click="unpinEntry(entry.id)"
                  class="px-2 py-1.5 text-xs rounded text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                  :disabled="unpinningId === entry.id"
                >{{ unpinningId === entry.id ? '…' : 'Unpin' }}</button>
                <button
                  @click="cancelEntry(entry.id)"
                  class="px-2 py-1.5 text-xs rounded text-red-500 hover:bg-red-50 disabled:opacity-50"
                  :disabled="cancellingId === entry.id"
                >{{ cancellingId === entry.id ? '…' : 'Unschedule' }}</button>
              </div>
            </div>
            <div v-if="reschedulingId === entry.id" class="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-[52px]">
              <input v-model="rescheduleLocal" type="datetime-local"
                     class="text-xs border rounded px-2 py-1.5" />
              <button
                @click="saveReschedule(entry.id)"
                :disabled="reschedulingSaving"
                class="px-3 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
              >{{ reschedulingSaving ? 'Saving…' : 'Save' }}</button>
              <button @click="cancelReschedule" class="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
              <div v-if="rescheduleError" class="text-xs text-red-600 w-full">{{ rescheduleError }}</div>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-sm text-gray-400">No upcoming scheduled auctions</div>
      </div>

      <!-- All Queue Entries (search + pagination) -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-4 border-b">
          <h2 class="font-semibold">All Queue Entries</h2>
          <p class="text-xs text-gray-500 mt-0.5">
            <template v-if="hasActiveFilters">
              {{ filteredEntries.length }} of {{ allEntries.length }} entries match
            </template>
            <template v-else>
              {{ allEntries.length }} total entries
            </template>
          </p>
        </div>

        <!-- Filters: category + search -->
        <div class="p-4 border-b" ref="searchContainer">
          <div class="flex flex-wrap items-center gap-3 mb-3">
            <select
              v-model="categoryFilter"
              class="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Categories</option>
              <option value="FEATURED">Featured</option>
              <option value="UNSCHEDULED">Unscheduled</option>
            </select>
            <select
              v-model="rarityFilter"
              class="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Rarities</option>
              <option v-for="r in rarityOptions" :key="r" :value="r">{{ r }}</option>
            </select>
            <select
              v-model="seriesFilter"
              class="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="ALL">All Series</option>
              <option v-for="s in seriesOptions" :key="s" :value="s">{{ s }}</option>
            </select>
            <select
              v-model="setFilter"
              class="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
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
              class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-300"
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
              class="absolute z-20 top-full mt-1 left-0 w-full sm:w-96 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto"
            >
              <button
                v-for="suggestion in searchSuggestions"
                :key="suggestion.id"
                @mousedown.prevent="selectSuggestion(suggestion)"
                class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
              >
                <div class="shrink-0 w-9 h-9 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                  <img v-if="suggestion.ctoonImage" :src="suggestion.ctoonImage" :alt="suggestion.ctoonName"
                       class="w-full h-full object-contain" loading="lazy" />
                  <span v-else class="text-gray-300 text-sm">?</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium truncate">{{ suggestion.ctoonName || '—' }}</div>
                  <div class="text-xs text-gray-500">Mint #{{ suggestion.mintNumber ?? '?' }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Entries list -->
        <div v-if="paginatedEntries.length" class="divide-y">
          <div v-for="entry in paginatedEntries" :key="entry.id" class="px-4 py-3 text-sm">
            <div class="flex items-start gap-3">
              <div class="shrink-0 w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img v-if="entry.ctoonImage" :src="entry.ctoonImage" :alt="entry.ctoonName"
                     class="w-full h-full object-contain" loading="lazy" />
                <span v-else class="text-gray-300 text-lg">?</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate" :title="entry.ctoonName">{{ entry.ctoonName || '—' }}</div>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ entry.rarity }}
                  <span v-if="entry.series"> · {{ entry.series }}</span>
                  <span v-if="entry.set"> · {{ entry.set }}</span>
                  <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-1 mt-1">
                  <span class="px-1.5 py-0.5 rounded text-xs font-medium"
                        :class="categoryChip(entry.category)">{{ entry.category }}</span>
                  <span v-if="entry.isFeatured" class="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Featured</span>
                  <span v-if="entry.fromInactive" class="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">From Inactive</span>
                  <span v-if="entry.pinned" class="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">📌 Pinned</span>
                </div>
                <div v-if="entry.sourceUsername" class="text-xs text-gray-400 mt-0.5">From: {{ entry.sourceUsername }}</div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ entry.scheduledFor ? fmtCST(entry.scheduledFor) : 'Not scheduled' }}
                </div>
              </div>
              <div class="shrink-0 flex flex-col items-end gap-1">
                <button
                  @click="openReschedule(entry)"
                  class="px-2 py-1.5 text-xs rounded text-blue-600 hover:bg-blue-50"
                >Reschedule</button>
                <button
                  v-if="entry.pinned"
                  @click="unpinEntry(entry.id)"
                  class="px-2 py-1.5 text-xs rounded text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                  :disabled="unpinningId === entry.id"
                >{{ unpinningId === entry.id ? '…' : 'Unpin' }}</button>
                <button
                  @click="cancelEntry(entry.id)"
                  class="px-2 py-1.5 text-xs rounded text-red-500 hover:bg-red-50 disabled:opacity-50"
                  :disabled="cancellingId === entry.id"
                >{{ cancellingId === entry.id ? '…' : (entry.scheduledFor ? 'Unschedule' : 'Remove') }}</button>
              </div>
            </div>
            <div v-if="reschedulingId === entry.id" class="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-[52px]">
              <input v-model="rescheduleLocal" type="datetime-local"
                     class="text-xs border rounded px-2 py-1.5" />
              <button
                @click="saveReschedule(entry.id)"
                :disabled="reschedulingSaving"
                class="px-3 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
              >{{ reschedulingSaving ? 'Saving…' : 'Save' }}</button>
              <button @click="cancelReschedule" class="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
              <div v-if="rescheduleError" class="text-xs text-red-600 w-full">{{ rescheduleError }}</div>
            </div>
          </div>
        </div>
        <div v-else class="p-6 text-center text-sm text-gray-400">
          {{ hasActiveFilters ? 'No entries match your filters' : 'No entries in the dissolve queue' }}
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="p-4 border-t flex items-center justify-between">
          <div class="text-xs text-gray-500">
            Showing {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredEntries.length) }} of {{ filteredEntries.length }}
          </div>
          <div class="flex items-center gap-1">
            <button @click="goToPage(1)" :disabled="currentPage === 1"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">«</button>
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">‹</button>
            <span class="px-3 text-xs text-gray-600">{{ currentPage }} / {{ totalPages }}</span>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === totalPages"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">›</button>
            <button @click="goToPage(totalPages)" :disabled="currentPage === totalPages"
                    class="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed">»</button>
          </div>
        </div>
      </div>

      <!-- Reschedule All form -->
      <div class="bg-white rounded-lg shadow p-4 sm:p-5">
        <h2 class="font-semibold mb-1">Reschedule All</h2>
        <p class="text-xs text-gray-500 mb-4">
          Set a new schedule for all unscheduled entries. Toggle "Reschedule all" to also reset existing scheduled entries.
        </p>

        <div class="space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Start date (local)</label>
            <input v-model="form.startAtLocal" type="datetime-local"
                   class="w-full sm:flex-1 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Cadence (days)</label>
            <input v-model.number="form.cadenceDays" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Featured / cadence</label>
            <input v-model.number="form.featuredPerCadence" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <label class="sm:w-40 text-xs text-gray-600 sm:shrink-0">Other / cadence</label>
            <input v-model.number="form.otherPerCadence" type="number" min="1"
                   class="w-full sm:w-24 text-xs border rounded px-2 py-1.5" />
          </div>
          <div class="flex items-center gap-2">
            <input v-model="form.reschedule" type="checkbox" id="reschedule-all"
                   class="rounded border-gray-300" />
            <label for="reschedule-all" class="text-xs text-gray-600">
              Reschedule all (including already-scheduled entries)
            </label>
          </div>
        </div>

        <div v-if="scheduleError" class="mt-3 text-xs text-red-600">{{ scheduleError }}</div>
        <div v-if="scheduleSuccess" class="mt-3 text-xs text-emerald-600">{{ scheduleSuccess }}</div>

        <div class="mt-4">
          <button
            @click="applySchedule"
            :disabled="scheduling"
            class="w-full sm:w-auto px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
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
    <div v-if="showFeaturedModal" class="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-black/40" @click.self="closeFeaturedModal">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="p-4 sm:p-5 border-b">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-lg">Edit Featured</h2>
            <button @click="closeFeaturedModal" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <p class="text-xs text-gray-600 mt-2 leading-relaxed">
            When an account is dissolved, its cToons are transferred to the official account and queued
            for auction. Any cToon that matches a checked rarity, series, or set below is marked as a
            <span class="font-medium">featured</span> auction when it's queued. Checking a box here does
            not change anything already in the queue until you click Save — at that point every entry
            currently in the dissolve queue (scheduled or not) is re-evaluated against these rules too.
          </p>
        </div>

        <div class="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          <!-- Rarities -->
          <div>
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Rarities</h3>
            <div class="border rounded-lg divide-y max-h-40 overflow-y-auto">
              <label v-for="r in orderedRarityOptions" :key="r"
                     class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" :value="r" v-model="featuredForm.rarities" class="rounded border-gray-300" />
                {{ r }}
              </label>
            </div>
          </div>

          <!-- Series -->
          <div>
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Series</h3>
            <input
              v-model="seriesSearch"
              type="text"
              placeholder="Filter series… (3+ characters)"
              class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div class="border rounded-lg divide-y max-h-40 overflow-y-auto">
              <label v-for="s in orderedSeriesOptions" :key="s"
                     class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" :value="s" v-model="featuredForm.series" class="rounded border-gray-300" />
                {{ s }}
              </label>
              <div v-if="!orderedSeriesOptions.length" class="px-3 py-2 text-sm text-gray-400">No matches</div>
            </div>
          </div>

          <!-- Sets -->
          <div>
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Sets</h3>
            <input
              v-model="setSearch"
              type="text"
              placeholder="Filter sets… (3+ characters)"
              class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div class="border rounded-lg divide-y max-h-40 overflow-y-auto">
              <label v-for="s in orderedSetOptions" :key="s"
                     class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" :value="s" v-model="featuredForm.sets" class="rounded border-gray-300" />
                {{ s }}
              </label>
              <div v-if="!orderedSetOptions.length" class="px-3 py-2 text-sm text-gray-400">No matches</div>
            </div>
          </div>
        </div>

        <div class="p-4 sm:p-5 border-t">
          <div v-if="featuredError" class="mb-3 text-xs text-red-600">{{ featuredError }}</div>
          <div v-if="featuredSuccess" class="mb-3 text-xs text-emerald-600">{{ featuredSuccess }}</div>
          <div class="flex items-center justify-end gap-3">
            <button @click="closeFeaturedModal" class="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
            <button
              @click="saveFeaturedConfig"
              :disabled="savingFeatured"
              class="px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
            >{{ savingFeatured ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Errors modal: failures launching a queue entry into a live auction -->
    <div v-if="showErrorsModal" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" @click.self="closeErrorsModal">
      <div class="bg-white rounded-lg shadow-lg w-[calc(100%-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <div class="flex items-center justify-between mb-4 gap-2">
          <h2 class="text-xl font-semibold">Errors</h2>
          <div class="flex items-center gap-2">
            <button
              v-if="errorLog.length"
              type="button"
              class="px-3 py-1.5 text-sm rounded border border-red-600 text-red-700 hover:bg-red-50"
              @click="clearErrorLog"
            >Clear Log</button>
            <button class="text-gray-500 hover:text-gray-700 p-2 -m-2" @click="closeErrorsModal">X</button>
          </div>
        </div>

        <div v-if="errorLogLoading" class="text-gray-500 py-6 text-center">Loading…</div>
        <template v-else>
          <div v-if="errorLog.length" class="bg-gray-50 rounded-lg border divide-y">
            <div v-for="e in errorLog" :key="e.id" class="p-3 sm:p-4">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium">{{ e.ctoonName || 'Unknown cToon' }}</span>
                <span v-if="e.mintNumber != null" class="text-gray-500">Mint #{{ e.mintNumber }}</span>
                <span v-if="e.rarity" class="text-gray-500">· {{ e.rarity }}</span>
                <span v-if="e.series" class="text-gray-500">· {{ e.series }}</span>
                <span v-if="e.set" class="text-gray-500">· {{ e.set }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                <span>{{ fmtCST(e.createdAt) }}</span>
                <span v-if="e.sourceUsername">· From: {{ e.sourceUsername }}</span>
                <span v-if="e.userCtoonId">· userCtoonId: {{ e.userCtoonId }}</span>
                <span v-if="e.queueEntryId">· queueEntryId: {{ e.queueEntryId }}</span>
              </div>
              <pre class="text-xs text-red-700 mt-2 whitespace-pre-wrap break-words">{{ e.message }}</pre>
            </div>
          </div>
          <p v-else class="text-gray-500">No errors logged.</p>
        </template>
        <p v-if="errorLogError" class="text-red-600 mt-2 text-sm">{{ errorLogError }}</p>
      </div>
    </div>

    <!-- Reschedule error modal: surfaces details when a reschedule save fails -->
    <div v-if="showRescheduleErrorModal" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" @click.self="closeRescheduleErrorModal">
      <div class="bg-white rounded-lg shadow-lg w-[calc(100%-2rem)] max-w-xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <div class="flex items-center justify-between mb-4 gap-2">
          <h2 class="text-xl font-semibold text-red-700">Reschedule Failed</h2>
          <button class="text-gray-500 hover:text-gray-700 p-2 -m-2" @click="closeRescheduleErrorModal">X</button>
        </div>
        <div v-if="rescheduleErrorDetails" class="space-y-2 text-sm">
          <div><span class="font-medium">cToon:</span> {{ rescheduleErrorDetails.ctoonName || '—' }}
            <span v-if="rescheduleErrorDetails.mintNumber != null"> (Mint #{{ rescheduleErrorDetails.mintNumber }})</span>
          </div>
          <div><span class="font-medium">Queue entry ID:</span> {{ rescheduleErrorDetails.entryId }}</div>
          <div><span class="font-medium">Attempted date/time:</span> {{ rescheduleErrorDetails.attemptedLocal }} ({{ rescheduleErrorDetails.attemptedUtc }})</div>
          <div><span class="font-medium">HTTP status:</span> {{ rescheduleErrorDetails.statusCode ?? '—' }}</div>
          <div><span class="font-medium">Time of failure:</span> {{ rescheduleErrorDetails.occurredAt }}</div>
          <div>
            <div class="font-medium mb-1">Error details:</div>
            <pre class="text-xs text-red-700 bg-gray-50 border rounded p-2 whitespace-pre-wrap break-words">{{ rescheduleErrorDetails.message }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRequestHeaders } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({ title: 'Admin - Dissolve Queue', middleware: ['auth', 'admin'], layout: 'admin' })

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

async function loadData() {
  try {
    const data = await $fetch('/api/admin/dissolve-queue', { headers })
    stats.value      = data
    upcoming.value   = data.upcoming || []
    allEntries.value = data.entries  || []
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
</script>
