<template>
    <Nav />

  <!-- ──────────── MAIN PAGE ──────────── -->
  <div class="mt-20 md:pt-10 px-4 py-6 max-w-7xl mx-auto" style="margin-top: 70px">
    <!-- SKELETON STATE -->
    <template v-if="loading">
      <!-- Title -->
      <div class="h-8 w-96 bg-gray-200 rounded mb-6 animate-pulse"></div>

      <!-- TABS + POINTS (same layout as real tabs row) -->
      <div class="mb-6 flex items-center border-b border-gray-300">
        <div class="flex gap-2">
          <div class="h-9 w-24 bg-gray-200 rounded-t-md animate-pulse"></div>
          <div class="h-9 w-24 bg-gray-200 rounded-t-md animate-pulse"></div>
          <div class="h-9 w-24 bg-gray-200 rounded-t-md animate-pulse"></div>
        </div>
      </div>

      <!-- LAYOUT: SIDEBAR + CTOON GRID (matches flex layout) -->
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- FILTER / SORT PANEL skeleton (left) -->
        <aside class="w-full lg:w-1/4 bg-white rounded-lg shadow p-6">
          <div class="space-y-6 animate-pulse">
            <!-- Search -->
            <div>
              <div class="h-4 w-32 bg-gray-200 rounded mb-2"></div>
              <div class="h-9 w-full bg-gray-200 rounded"></div>
            </div>

            <!-- Filter by Set -->
            <div>
              <div class="h-4 w-28 bg-gray-200 rounded mb-2"></div>
              <div class="space-y-2">
                <div v-for="i in 4" :key="'set-'+i" class="flex items-center gap-2">
                  <div class="h-4 w-4 bg-gray-200 rounded"></div>
                  <div class="h-3 w-24 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>

            <!-- Filter by Series -->
            <div>
              <div class="h-4 w-32 bg-gray-200 rounded mb-2"></div>
              <div class="space-y-2">
                <div v-for="i in 4" :key="'series-'+i" class="flex items-center gap-2">
                  <div class="h-4 w-4 bg-gray-200 rounded"></div>
                  <div class="h-3 w-24 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>

            <!-- Filter by Rarity -->
            <div>
              <div class="h-4 w-32 bg-gray-200 rounded mb-2"></div>
              <div class="space-y-2">
                <div v-for="i in 4" :key="'rarity-'+i" class="flex items-center gap-2">
                  <div class="h-4 w-4 bg-gray-200 rounded"></div>
                  <div class="h-3 w-28 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>

            <!-- Owned / Unowned -->
            <div>
              <div class="h-4 w-36 bg-gray-200 rounded mb-2"></div>
              <div class="space-y-2">
                <div v-for="i in 3" :key="'own-'+i" class="flex items-center gap-2">
                  <div class="h-4 w-4 bg-gray-200 rounded-full"></div>
                  <div class="h-3 w-20 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>

            <!-- Other Filters -->
            <div>
              <div class="h-4 w-28 bg-gray-200 rounded mb-2"></div>
              <div class="flex items-center gap-2">
                <div class="h-4 w-4 bg-gray-200 rounded"></div>
                <div class="h-3 w-28 bg-gray-200 rounded"></div>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <div class="h-4 w-4 bg-gray-200 rounded"></div>
                <div class="h-3 w-24 bg-gray-200 rounded"></div>
              </div>
            </div>

            <!-- Sort Select -->
            <div>
              <div class="h-4 w-20 bg-gray-200 rounded mb-2"></div>
              <div class="h-9 w-full bg-gray-200 rounded"></div>
            </div>
          </div>
        </aside>

        <!-- CTOON GRID skeleton (right) -->
        <div class="w-full lg:w-3/4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              v-for="i in 6"
              :key="'card-'+i"
              class="relative bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
            >
              <!-- badge -->
              <span class="absolute top-2 right-2 h-5 w-16 bg-gray-200 rounded-full"></span>

              <!-- title -->
              <div class="h-5 w-3/4 bg-gray-200 rounded mb-4 mt-6"></div>

              <!-- image -->
              <div class="flex-grow flex items-center justify-center w-full mb-4">
                <div class="w-full h-32 bg-gray-200 rounded"></div>
              </div>

              <!-- meta text -->
              <div class="mt-auto w-full space-y-2 text-sm text-center">
                <div class="h-4 w-5/6 bg-gray-200 rounded mx-auto"></div>
                <div class="h-4 w-2/3 bg-gray-200 rounded mx-auto"></div>
              </div>

              <!-- buttons -->
              <div class="mt-6 flex w-full space-x-2">
                <div class="h-8 w-20 bg-gray-200 rounded"></div>
                <div class="h-8 flex-1 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>

          <!-- PAGINATION skeleton -->
          <div class="mt-8 flex justify-center gap-4 animate-pulse">
            <div class="h-8 w-24 bg-gray-200 rounded"></div>
            <div class="h-8 w-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>

      <!-- PACKS GRID skeleton (roughly matches Packs tab layout below) -->
      <div class="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="i in 3"
          :key="'pack-'+i"
          class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
        >
          <div class="h-6 w-3/4 bg-gray-200 rounded mb-4"></div>
          <div class="flex-grow flex items-center justify-center w-full mb-4">
            <div class="w-full h-32 bg-gray-200 rounded"></div>
          </div>
          <div class="w-full space-y-2 mb-4">
            <div v-for="j in 3" :key="'pack-line-'+i+'-'+j" class="h-4 w-4/5 bg-gray-200 rounded"></div>
          </div>
          <div class="mt-auto w-full h-9 bg-gray-200 rounded"></div>
        </div>
      </div>
    </template>

    <!-- REAL CONTENT -->
    <template v-else>
      <h1 class="text-3xl font-bold mb-6">cMart — gotta collect ’em&nbsp;all</h1>

      <!-- TABS + POINTS -->
      <div class="mb-6 flex items-center border-b border-gray-300">
        <div class="flex">
          <button
            v-for="tab in tabs"
            :key="tab"
            @click="activeTab = tab"
            class="px-4 py-2 -mb-px text-sm font-medium border-b-2"
            :class=" activeTab === tab
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700' "
          >
            {{ tab }}
          </button>
        </div>
      </div>

      <!-- ──────── LAYOUT: SIDEBAR + CONTENT ──────── -->
      <button
        class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
        @click="showFilters = !showFilters"
        v-if="activeTab === 'cToons'"
      >
        {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
      </button>

      <!-- ─── cToons Tab ──────────────────────────── -->
      <div v-if="activeTab === 'cToons'" class="flex flex-col lg:flex-row gap-6">
        <!-- FILTER / SORT PANEL (left) -->
        <aside
          :class="[showFilters ? 'block' : 'hidden', 'lg:block', 'w-full lg:w-1/4', 'bg-white rounded-lg shadow p-6']"
        >
          <!-- Search -->
          <div class="mb-10">
            <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search cToons</label>
            <input
              id="search"
              type="text"
              v-model="searchQuery"
              placeholder="Type a name or character…"
              class="block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              class="mt-3 w-full rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              @click="resetFilters"
            >
              Reset Filters
            </button>
          </div>

          <!-- Filter by Set -->
          <div class="mb-10">
            <p class="text-sm font-medium text-gray-700 mb-2">Filter by Set</p>
            <div class="space-y-1 max-h-32 overflow-y-auto pr-2">
              <label
                v-for="s in uniqueSets"
                :key="s"
                class="flex items-center text-sm"
              >
                <input
                  type="checkbox"
                  :value="s"
                  v-model="selectedSets"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2 capitalize">{{ s }}</span>
              </label>
            </div>
          </div>

          <!-- Filter by Series -->
          <div class="mb-10">
            <p class="text-sm font-medium text-gray-700 mb-2">Filter by Series</p>
            <div class="space-y-1 max-h-32 overflow-y-auto pr-2">
              <label
                v-for="ser in uniqueSeries"
                :key="ser"
                class="flex items-center text-sm"
              >
                <input
                  type="checkbox"
                  :value="ser"
                  v-model="selectedSeries"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2 capitalize">{{ ser }}</span>
              </label>
            </div>
          </div>

          <!-- Filter by Rarity -->
          <div class="mb-10">
            <p class="text-sm font-medium text-gray-700 mb-2">Filter by Rarity</p>
            <div class="space-y-1 max-h-32 overflow-y-auto pr-2">
              <label
                v-for="r in uniqueRarities"
                :key="r"
                class="flex items-center text-sm"
              >
                <input
                  type="checkbox"
                  :value="r"
                  v-model="selectedRarities"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2 capitalize">{{ r }}</span>
              </label>
            </div>
          </div>

          <!-- Filter by Owned / Unowned -->
          <div class="mb-10">
            <p class="text-sm font-medium text-gray-700 mb-2">Owned / Unowned</p>
            <div class="space-y-1">
              <label class="flex items-center text-sm">
                <input
                  type="radio"
                  value="all"
                  v-model="ownedFilter"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">All</span>
              </label>
              <label class="flex items-center text-sm">
                <input
                  type="radio"
                  value="owned"
                  v-model="ownedFilter"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">Owned</span>
              </label>
              <label class="flex items-center text-sm">
                <input
                  type="radio"
                  value="unowned"
                  v-model="ownedFilter"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">Un‐owned</span>
              </label>
            </div>
          </div>

          <!-- Other Filters -->
          <div class="mb-10">
            <p class="text-sm font-medium text-gray-700 mb-2">Other Filters</p>
            <div class="space-y-1">
              <label class="flex items-center text-sm">
                <input
                  type="checkbox"
                  v-model="hideOutOfStock"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">Hide Out Of Stock</span>
              </label>
              <label class="flex items-center text-sm">
                <input
                  type="checkbox"
                  v-model="gtoonsOnly"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">gToons Only</span>
              </label>
            </div>
          </div>

          <!-- Sort Select -->
          <div class="mt-10">
            <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              id="sort"
              v-model="sortBy"
              class="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="releaseDateDesc">Release Date – Descending</option>
              <option value="releaseDateAsc">Release Date – Ascending</option>
              <option value="priceDesc">Price – Descending</option>
              <option value="priceAsc">Price – Ascending</option>
              <option value="series">Series (A→Z)</option>
            </select>
          </div>
        </aside>

        <!-- CTOON GRID (right) -->
        <div class="w-full lg:w-3/4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              v-for="ctoon in pagedCtoons"
              :key="ctoon.id"
              class="relative bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
            >
              <!-- badge -->
              <span
                v-if="ctoon.owned"
                class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
              >
                Owned
              </span>
              <span
                v-else
                class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
              >
                Un-owned
              </span>
              <h2 class="text-xl font-semibold mb-2 mt-6">{{ ctoon.name }}</h2>
              <div class="flex-grow flex items-center justify-center w-full mb-4">
                <CtoonAsset
                  :src="ctoon.assetPath"
                  :alt="ctoon.name"
                  :name="ctoon.name"
                  :ctoon-id="ctoon.id"
                  :is-gtoon="ctoon.isGtoon"
                  :power="ctoon.power"
                  :cost="ctoon.cost"
                  image-class="max-w-full h-auto"
                />
              </div>
              <div class="mt-auto text-sm text-center">
                <p>
                  <span class="capitalize">{{ ctoon.series }}</span> • 
                  <span class="capitalize">{{ ctoon.rarity }}</span> • 
                  <span class="capitalize">{{ ctoon.set }}</span>
                </p>
                <p>
                  Minted: {{ ctoon.minted }} / 
                  {{ ctoon.quantity === null ? 'Unlimited' : ctoon.quantity }}
                </p>
              </div>
              <div class="mt-6 flex w-full space-x-2">
                <!-- left: wishlist -->
                <AddToWishlist
                  :ctoon-id="ctoon.id"
                  class="text-xs"
                />

                <!-- right: buy -->
                <button
                  v-if="!isReleased(ctoon)"
                  disabled
                  class="bg-gray-300 text-gray-700 px-4 py-2 rounded disabled:opacity-80 text-xs"
                  :aria-label="`Releases in ${formatCountdown(ctoon.releaseDate)}`"
                  title="Not yet released"
                >
                  Releases in {{ formatCountdown(ctoon.releaseDate) }}
                </button>

                <!-- Between windows: initial sold out, more coming -->
                <button
                  v-else-if="shouldShowFinalCountdown(ctoon)"
                  disabled
                  class="bg-gray-300 text-gray-700 px-4 py-2 rounded disabled:opacity-80 text-xs"
                  :aria-label="`Releases in ${formatCountdown(getFinalReleaseAt(ctoon))}`"
                  title="Final release pending"
                >
                  Releases in {{ formatCountdown(getFinalReleaseAt(ctoon)) }}
                </button>

                <button
                  v-else
                  @click="buyCtoon(ctoon)"
                  :disabled="(ctoon.quantity !== null && ctoon.minted >= currentAllowedCap(ctoon)) || buyingCtoons.has(ctoon.id)"
                  class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 text-xs"
                >
                  <span v-if="ctoon.quantity !== null && ctoon.minted >= currentAllowedCap(ctoon)">Sold Out</span>
                  <span v-else-if="buyingCtoons.has(ctoon.id)">Purchasing…</span>
                  <span v-else>Buy for {{ ctoon.price }} Pts</span>
                </button>
              </div>
            </div>
          </div>

          <!-- PAGINATION -->
          <div class="mt-8 flex justify-center gap-4">
            <button
              @click="prevPage()"
              :disabled="currentPage === 1"
              class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              @click="nextPage()"
              :disabled="(currentPage * itemsPerPage) >= filteredAndSortedCtoons.length"
              class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <!-- ─── HOLIDAY EVENT TAB ───────────────────── -->
      <div v-if="activeHoliday && activeTab === activeHoliday.name" class="w-full">
        <div v-if="holidayShopItems.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="ctoon in holidayShopItems"
            :key="ctoon.id"
            class="relative bg.white rounded-lg shadow p-4 flex flex-col items-center h-full"
          >
            <span
              v-if="ctoon.owned"
              class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
            >Owned</span>
            <span
              v-else
              class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
            >Un-owned</span>

            <h2 class="text-xl font-semibold mb-2 mt-6">{{ ctoon.name }}</h2>
            <div class="flex-grow flex items-center justify-center w-full mb-4">
              <CtoonAsset
                :src="ctoon.assetPath"
                :alt="ctoon.name"
                :name="ctoon.name"
                :ctoon-id="ctoon.id"
                :is-gtoon="ctoon.isGtoon"
                :power="ctoon.power"
                :cost="ctoon.cost"
                image-class="max-w-full h-auto"
              />
            </div>
            <div class="mt-auto text-sm text-center">
              <p>
                <span class="capitalize">{{ ctoon.series }}</span> •
                <span class="capitalize">{{ ctoon.rarity }}</span> •
                <span class="capitalize">{{ ctoon.set }}</span>
              </p>
              <p>
                Minted: {{ ctoon.minted }} /
                {{ ctoon.quantity === null ? 'Unlimited' : ctoon.quantity }}
              </p>
            </div>
            <div class="mt-6 flex w-full space-x-2">
              <button
                @click="buyCtoon(ctoon)"
                :disabled="(ctoon.quantity && ctoon.minted >= ctoon.quantity) || buyingCtoons.has(ctoon.id)"
                class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 text-xs"
              >
                <span v-if="ctoon.quantity && ctoon.minted >= ctoon.quantity">Sold Out</span>
                <span v-else-if="buyingCtoons.has(ctoon.id)">Purchasing…</span>
                <span v-else>Buy for {{ ctoon.price }} Pts</span>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="text-gray-500">
          No Holiday Items available to mint right now.
        </div>
      </div>

      <!-- ─── PACKS TAB ─────────────────────────────── -->
      <div v-if="activeTab === 'Packs'">
        <div v-if="packs.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="pack in packs"
            :key="pack.id"
            class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full cursor-pointer hover:ring-2 hover:ring-indigo-300"
            @click="openPackModal(pack)"
          >
            <h2 class="text-xl font-semibold mb-2 text-center break-words">
              {{ pack.name }}
            </h2>
            <div class="flex-grow flex items-center justify-center w-full mb-4">
              <img :src="pack.imagePath" class="max-w-full h-auto" />
            </div>
            <ul class="text-sm text-gray-700 mb-2 space-y-0.5">
              <li
                v-for="r in pack.rarityConfigs"
                :key="r.rarity"
                class="mt-2"
              >
                <strong>{{ r.rarity }}:</strong>
                {{ r.probabilityPercent }}% chance to receive {{ r.count }} cToon(s)
              </li>
            </ul>
            <button
              @click.stop="buyPack(pack)"
              :disabled="buyingPacks.has(pack.id)"
              class="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
            <span v-if="buyingPacks.has(pack.id)">
              Purchasing…
            </span>
            <span v-else>
              Buy Pack for {{ pack.price }} Pts
            </span>
            </button>
          </div>
        </div>
        <div v-else class="text-gray-500">
          No packs available right now.
        </div>
      </div>

      <!-- PACK OVERLAY & MODAL -->
      <!-- ... existing overlay, glow, Toast ... -->
      <div
        v-if="overlayVisible"
        class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/70 overflow-y-auto p-4"
      >
        <div
          class="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 flex flex-col items-center"
        >
          <button
            v-if="openingStep === 'preview' || revealComplete"
            class="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            @click="closeOverlay"
          >
            ✕
          </button>

          <!-- PREVIEW MODE -->
          <template v-if="openingStep === 'preview'">
            <h2 class="text-2xl font-semibold mb-6 text-center">
              {{ packDetails?.name }}
            </h2>
            <div
              v-for="(list, rarity) in groupedByRarity"
              :key="rarity"
              class="mb-6 w-full"
            >
              <h3 class="font-medium">{{ rarity }}</h3>
              <p class="text-xs text-gray-600 mb-2">
                {{ (rarityProbMap[rarity] !== undefined ? rarityProbMap[rarity] : 0) }}% chance to receive
                {{ rarityCountMap[rarity] || 0 }} cToon(s)
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div
                  v-for="item in list"
                  :key="item.ctoonId"
                  class="relative bg-white rounded-lg shadow p-3 flex flex-col items-center"
                >
                  <!-- Owned / Un-owned badge -->
                  <span
                    v-if="originalOwnedSet.has(item.ctoonId)"
                    class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
                  >
                    Owned
                  </span>
                  <span
                    v-else
                    class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
                  >
                    Un-owned
                  </span>

                  <!-- cToon image -->
                  <div class="w-full flex items-center justify-center mb-2 mt-6">
                    <CtoonAsset
                      :src="item.assetPath"
                      :alt="item.name"
                      :name="item.name"
                      :ctoon-id="item.ctoonId"
                      :is-gtoon="item.isGtoon"
                      :power="item.power"
                      :cost="item.cost"
                      image-class="max-w-full h-24 object-contain"
                    />
                  </div>

                  <!-- cToon name -->
                  <p class="text-sm font-medium text-center">{{ item.name }}</p>
                  <p class="text-xs text-gray-600 text-center">{{ item.weight }}% chance</p>
                </div>
              </div>
            </div>
            <button
              class="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded"
              @click.stop="buyPack(packDetails)"
            >
              Buy Pack for {{ packDetails?.price }} Pts
            </button>
          </template>

          <!-- PACK IMAGE BEFORE GLOW -->
          <img
            v-if="openingStep === 'pack'"
            :src="packDetails?.imagePath"
            class="max-w-full max-h-[70vh] object-contain"
          />

          <!-- REVEAL MODE -->
          <div
            v-if="openingStep === 'reveal'"
            class="grid grid-cols-2 sm:grid-cols-3 gap-6"
          >
            <div
              v-for="item in packContents"
              :key="item.id"
              class="relative flex flex-col items-center p-4 border rounded-lg bg-white"
              :class="{ 'card-glow': !item.inCmart }"
            >
              <!-- New! badge -->
              <span
                v-if="!originalOwnedSet.has(item.id)"
                class="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full"
              >
                New!
              </span>

              <!-- Image -->
              <CtoonAsset
                :src="item.assetPath"
                :alt="item.name"
                :name="item.name"
                :ctoon-id="item.id"
                :is-gtoon="item.isGtoon"
                :power="item.power"
                :cost="item.cost"
                image-class="w-24 h-24 object-contain mb-2 mt-8"
              />

              <!-- Name -->
              <p class="font-semibold text-sm text-center">{{ item.name }}</p>

              <!-- Rarity -->
              <p class="text-xs text-gray-600 capitalize">{{ item.rarity }}</p>

              <!-- Mint # -->
              <p class="text-xs text-gray-500">Mint #{{ item.mintNumber }}</p>
            </div>
          </div>

          <!-- CLOSE BUTTON AFTER REVEAL -->
          <button
            v-if="revealComplete"
            class="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded"
            @click="closeOverlay"
          >
            Close
          </button>
        </div>
      </div>

      <div v-if="showGlow" :class="['glow', glowStage]" />

      <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
    </template>
  </div>
</template>


<script setup>
// ────────── Nuxt Meta ──────────────────────────
definePageMeta({
  title: 'cMart',
  middleware: 'auth',
  layout: 'default'
})

// ────────── Imports ─────────────────────────────
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Toast from '@/components/Toast.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import CtoonAsset from '@/components/CtoonAsset.vue'
import Nav from '@/components/Nav.vue'
import * as Sentry from '@sentry/nuxt'

const showFilters = ref(false)
const buyingCtoons = ref(new Set())
const buyingPacks  = ref(new Set())

const loading = ref(true)

// ────────── Auth & User ────────────────────────
const { setPoints, user, fetchSelf } = useAuth()

// Track what they owned _before_ opening this pack
const originalOwnedSet = computed(() =>
  new Set((user.value.ctoons || []).map(ct => ct.ctoonId))
)

// ────────── Holiday Event Tab ──────────────────
const activeHoliday = ref(null)
const tabs = computed(() => {
  const base = ['cToons', 'Packs']
  if (activeHoliday.value?.name) base.push(activeHoliday.value.name)
  return base
})
const activeTab = ref('cToons')
const holidayIdSet = computed(() =>
  new Set((activeHoliday.value?.items || []).map(i => i.ctoonId))
)

const nowTs = ref(Date.now())
let _tick = null

function isReleased(ctoon) {
  if (!ctoon.releaseDate) return true
  return new Date(ctoon.releaseDate).getTime() <= nowTs.value
}

function getFinalReleaseAt(ctoon) {
  return ctoon.finalReleaseAt || ctoon.nextReleaseAt || null
}

function shouldShowFinalCountdown(ctoon) {
  if (ctoon.quantity === null) return false
  if (!ctoon.releaseDate) return false
  const finalAt = getFinalReleaseAt(ctoon)
  if (!finalAt) return false
  const finalTs = new Date(finalAt).getTime()
  if (!Number.isFinite(finalTs)) return false
  const qty = Number(ctoon.quantity)
  const initialCap = Number(ctoon.initialCap ?? 0)
  if (!Number.isFinite(qty) || qty <= 0) return false
  if (!Number.isFinite(initialCap) || initialCap <= 0) return false
  return ctoon.minted >= initialCap && ctoon.minted < qty && nowTs.value < finalTs
}

function currentAllowedCap(ctoon) {
  if (ctoon.quantity === null) return Infinity
  const finalAt = ctoon.finalReleaseAt ? new Date(ctoon.finalReleaseAt).getTime() : null
  const beforeFinal = finalAt ? nowTs.value < finalAt : false
  const initCap = Number(ctoon.initialCap ?? 0)
  return beforeFinal ? (initCap || 0) : Number(ctoon.quantity)
}

function formatCountdown(dateLike) {
  const ms = new Date(dateLike).getTime() - nowTs.value
  if (ms <= 0) return '0s'

  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  const parts = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  parts.push(`${s}s`) // always show seconds

  return parts.join(' ')
}

// ────────── Shop Data ──────────────────────────
const ctoons = ref([])
const packs  = ref([])

// Holiday list built from cMart list (by id) + only still mintable
const holidayShopItems = computed(() => {
  const list = activeHoliday.value?.shopCtoons || []
  const ownedIds = new Set((user.value.ctoons || []).map(ct => ct.ctoonId))
  return list
    .filter(c => c.quantity === null || c.minted < c.quantity) // still mintable
    .map(c => ({ ...c, owned: ownedIds.has(c.id) }))
})

// ────────── Toast Helper ───────────────────────
const toastMessage = ref('')
const toastType    = ref('error')
function showToast(msg, type = 'error') {
  toastType.value    = type
  toastMessage.value = msg
  setTimeout(() => {
    toastMessage.value = ''
  }, 5000)
}

// ────────── FILTER / SORT STATE ───────────────
const searchQuery      = ref('')
const selectedSets     = ref([])
const selectedSeries   = ref([])
const selectedRarities = ref([])
const ownedFilter      = ref('all')   // 'all' | 'owned' | 'unowned'
const hideOutOfStock   = ref(false)
const gtoonsOnly       = ref(false)
const sortBy           = ref('releaseDateDesc')
const currentPage      = ref(1)
const itemsPerPage     = 50

// ────────── ROUTE QUERY SYNC ───────────────
const route  = useRoute()
const router = useRouter()

function normalizeListParam(v) {
  if (Array.isArray(v)) return v.filter(Boolean)
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function updateUrlQueryFromFilters() {
  const newQuery = { ...route.query }

  const q = String(searchQuery.value || '').trim()
  if (q) newQuery.q = q; else delete newQuery.q

  if (selectedSets.value.length) newQuery.set = selectedSets.value
  else delete newQuery.set

  if (selectedSeries.value.length) newQuery.series = selectedSeries.value
  else delete newQuery.series

  if (selectedRarities.value.length) newQuery.rarity = selectedRarities.value
  else delete newQuery.rarity

  if (ownedFilter.value && ownedFilter.value !== 'all') newQuery.owned = ownedFilter.value
  else delete newQuery.owned

  if (hideOutOfStock.value) newQuery.available = 'true';
  else delete newQuery.available

  if (gtoonsOnly.value) newQuery.gtoon = 'true';
  else delete newQuery.gtoon

  if (sortBy.value && sortBy.value !== 'releaseDateDesc') newQuery.sort = sortBy.value
  else delete newQuery.sort

  const current = JSON.stringify(route.query)
  const next    = JSON.stringify(newQuery)
  if (current !== next) router.replace({ path: route.path, query: newQuery })
}

function resetFilters() {
  searchQuery.value = ''
  selectedSets.value = []
  selectedSeries.value = []
  selectedRarities.value = []
  ownedFilter.value = 'all'
  hideOutOfStock.value = false
  gtoonsOnly.value = false
  sortBy.value = 'releaseDateDesc'
  currentPage.value = 1
  updateUrlQueryFromFilters()
}

// ────────── DERIVE UNIQUE FILTER OPTIONS ──────
const uniqueSets = computed(() => {
  const sets = new Set()
  ctoons.value.forEach(c => {
    if (c.set) sets.add(c.set)
  })
  return Array.from(sets).sort((a, b) => a.localeCompare(b))
})
const uniqueSeries = computed(() => {
  const sers = new Set()
  ctoons.value.forEach(c => {
    if (c.series) sers.add(c.series)
  })
  return Array.from(sers).sort((a, b) => a.localeCompare(b))
})
const uniqueRarities = computed(() => {
  const rars = new Set()
  ctoons.value.forEach(c => {
    if (c.rarity) rars.add(c.rarity)
  })
  // desired order:
  const order = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
  return order.filter(r => rars.has(r))
})

// ────────── FILTERED LIST ──────────────────────
const filteredCtoons = computed(() => {
  return ctoons.value.filter(c => {
    // 1) Search by name OR characters (case-insensitive)
    const term = (searchQuery.value || '').toLowerCase().trim()
    const nameMatch = term ? (c.name || '').toLowerCase().includes(term) : true
    const charMatch = term
      ? (Array.isArray(c.characters) && c.characters.some(ch => (ch || '').toLowerCase().includes(term)))
      : true
    const nameOrCharMatch = nameMatch || charMatch

    // 2) Filter by Set
    const setMatch = selectedSets.value.length === 0
      ? true
      : selectedSets.value.includes(c.set)

    // 3) Filter by Series
    const seriesMatch = selectedSeries.value.length === 0
      ? true
      : selectedSeries.value.includes(c.series)

    // 4) Filter by Rarity
    const rarityMatch = selectedRarities.value.length === 0
      ? true
      : selectedRarities.value.includes(c.rarity)

    // 5) Filter by Owned/Unowned
    let ownedMatch = true
    if (ownedFilter.value === 'owned') {
      ownedMatch = c.owned
    } else if (ownedFilter.value === 'unowned') {
      ownedMatch = !c.owned
    }

    // 6) Filter by availability
    let availabilityMatch = true
    if (hideOutOfStock.value) {
      const released = isReleased(c)
      const inStock = c.quantity === null || c.minted < c.quantity
      availabilityMatch = released && inStock
    }

    // 7) Filter by gToons only
    const gtoonMatch = !gtoonsOnly.value || c.isGtoon

    return nameOrCharMatch && setMatch && seriesMatch && rarityMatch && ownedMatch && availabilityMatch && gtoonMatch
  })
})

// ────────── SORTED (AND FILTERED) ─────────────
const filteredAndSortedCtoons = computed(() => {
  const list = filteredCtoons.value.slice()

  switch (sortBy.value) {
    case 'releaseDateAsc':
      return list.sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))

    case 'releaseDateDesc':
      return list.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))

    case 'priceAsc':
      return list.sort((a, b) => a.price - b.price)

    case 'priceDesc':
      return list.sort((a, b) => b.price - a.price)

    case 'series':
      return list.sort((a, b) => a.series.localeCompare(b.series))

    default:
      return list.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
  }
})

// ────────── PAGINATION ─────────────────────────
const pagedCtoons = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredAndSortedCtoons.value.slice(start, start + itemsPerPage)
})

// Reset to page 1 whenever filters/sort change
watch(
  [searchQuery, selectedSets, selectedSeries, selectedRarities, ownedFilter, hideOutOfStock, gtoonsOnly, sortBy],
  () => {
    currentPage.value = 1
    updateUrlQueryFromFilters()
  },
  { deep: true }
)

// Pagination helpers: scroll to top on page change
function scrollToTop () {
  if (typeof window === 'undefined') return
  nextTick().then(() => {
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { window.scrollTo(0, 0) }
      window.dispatchEvent(new Event('scroll'))
    })
  })
}
function prevPage () {
  if (currentPage.value > 1) {
    currentPage.value--
    scrollToTop()
  }
}
function nextPage () {
  if ((currentPage.value * itemsPerPage) < filteredAndSortedCtoons.value.length) {
    currentPage.value++
    scrollToTop()
  }
}

// ────────── Overlay / Glow State ───────────────
const overlayVisible  = ref(false)
const showGlow        = ref(false)
const openingStep     = ref('preview')
const glowStage       = ref('hidden')
const revealComplete  = ref(false)

const packDetails  = ref(null)
const packContents = ref([])

const groupedByRarity = computed(() => {
  if (!packDetails.value || !packDetails.value.ctoonOptions) return {}
  return packDetails.value.ctoonOptions.reduce((acc, o) => {
    ;(acc[o.rarity] = (acc[o.rarity] || [])).push(o)
    return acc
  }, {})
})

const rarityCountMap = computed(() => {
  const map = {}
  const details = packDetails.value
  if (!details || !Array.isArray(details.rarityConfigs)) return map
  for (const rc of details.rarityConfigs) {
    map[rc.rarity] = rc.count
  }
  return map
})

const rarityProbMap = computed(() => {
  const map = {}
  const details = packDetails.value
  if (!details || !Array.isArray(details.rarityConfigs)) return map
  for (const rc of details.rarityConfigs) {
    map[rc.rarity] = rc.probabilityPercent
  }
  return map
})

function resetSequence() {
  openingStep.value    = 'preview'
  glowStage.value      = 'hidden'
  revealComplete.value = false
  showGlow.value       = false
  packContents.value   = []
}

// ────────── ON MOUNT: FETCH DATA ──────────────
onMounted(async () => {
  await fetchSelf({ force: true })

  // Initialize filters from URL query
  const qParam      = typeof route.query.q === 'string' ? route.query.q : ''
  const setParam    = route.query.set
  const seriesParam = route.query.series
  const rarityParam = route.query.rarity
  const ownedParam  = typeof route.query.owned === 'string' ? route.query.owned : ''
  const availableParam = route.query.available
  const gtoonParam = route.query.gtoon
  const sortParam   = typeof route.query.sort === 'string' ? route.query.sort : ''

  if (qParam.trim()) searchQuery.value = qParam.trim()
  const initSets     = normalizeListParam(setParam)
  const initSeries   = normalizeListParam(seriesParam)
  const initRarities = normalizeListParam(rarityParam)
  if (initSets.length)     selectedSets.value = initSets
  if (initSeries.length)   selectedSeries.value = initSeries
  if (initRarities.length) selectedRarities.value = initRarities
  if (['all','owned','unowned'].includes(ownedParam)) ownedFilter.value = ownedParam
  if (availableParam === 'true') hideOutOfStock.value = true
  if (gtoonParam === 'true') gtoonsOnly.value = true

  const validSorts = ['releaseDateDesc','releaseDateAsc','priceDesc','priceAsc','series']
  if (validSorts.includes(sortParam)) sortBy.value = sortParam

  // LOAD cToons
  try {
    const ownedIds = new Set((user.value.ctoons || []).map(ct => ct.ctoonId))
    const ctoonRes = await $fetch('/api/cmart')
    ctoons.value = ctoonRes.map(c => ({
      id:          c.id,
      name:        c.name,
      set:         c.set,
      series:      c.series,
      rarity:      c.rarity,
      assetPath:   c.assetPath,
      price:       c.price,
      releaseDate: c.releaseDate,
      quantity:    c.quantity,
      isGtoon:     c.isGtoon,
      cost:        c.cost,
      power:       c.power,
      owners:      c.owners,
      characters:  c.characters,
      minted:      c.totalMinted ?? 0,
      // staged release helpers
      initialCap:  c.initialCap ?? null,
      finalReleaseAt: c.finalReleaseAt ?? null,
      nextReleaseAt:  c.nextReleaseAt ?? null,
      owned:       ownedIds.has(c.id)
    }))
  } catch (err) {
    console.error('Failed to fetch cToons:', err)
    showToast('Failed to load cToons')
  }

  // LOAD PACKS
  try {
    packs.value = await $fetch('/api/cmart/packs')
  } catch (err) {
    console.error(err)
    showToast('Failed to load packs')
  }

  // LOAD ACTIVE HOLIDAY EVENT (optional)
  try {
    activeHoliday.value = await $fetch('/api/holiday/active', { credentials: 'include' })
  } catch (_) {
    activeHoliday.value = null
  }

  _tick = setInterval(() => { nowTs.value = Date.now() }, 1000)

  loading.value = false

  // Normalize URL to reflect any initialized values without adding history entries
  updateUrlQueryFromFilters()
})

onUnmounted(() => {
  if (_tick) clearInterval(_tick)
})

// ────────── BUY SINGLE cToon ────────────────────
async function buyCtoon(ctoon) {
  if (user.value.points < ctoon.price) {
    return showToast("You don't have enough points")
  }
  buyingCtoons.value.add(ctoon.id)
  try {
    await $fetch('/api/cmart/buy', {
      method: 'POST',
      body: { ctoonId: ctoon.id }
    })
    ctoon.minted++
    ctoon.owned = true
    showToast('Purchase successful', 'success')
    // await fetchSelf({ force: true })
  } catch (err) {
    Sentry.captureException(err)
    const msg =
      err?.data?.message ||
      err?.statusMessage ||
      err?.message ||
      'Failed to buy cToon'
    showToast(msg, 'error')
  } finally {
    buyingCtoons.value.delete(ctoon.id)
    await fetchSelf({ force: true })
  }
}

// ────────── Open Pack Preview Modal ─────────────
async function openPackModal(pack) {
  try {
    packDetails.value    = await $fetch('/api/cmart/packs/' + pack.id)
    resetSequence()
    overlayVisible.value = true
  } catch (err) {
    console.error(err)
    showToast('Failed to load pack details')
  }
}

// ────────── Buy Pack & Start Animation ──────────
async function buyPack(pack) {
  if (user.value.points < pack.price) {
    return showToast("You don't have enough points")
  }
  buyingPacks.value.add(pack.id)
  try {
    const res = await $fetch('/api/cmart/packs/buy', {
      method: 'POST',
      body: { packId: pack.id }
    })
    // await fetchSelf({ force: true })
    // user.value.points -= pack.price

    // Show overlay with pack image
    if (!overlayVisible.value) {
      packDetails.value    = pack
      resetSequence()
      overlayVisible.value = true
    }
    openingStep.value = 'pack'
    glowStage.value   = 'hidden'
    showGlow.value    = true

    // 1) Expand glow after 2s
    setTimeout(() => {
      glowStage.value = 'expand'
    }, 2000)

    // 2) Reveal contents after 3s
    setTimeout(async () => {
      try {
        packContents.value = await $fetch('/api/cmart/open-pack', {
          query: { id: res.userPackId }
        })
      } catch (e) {
        console.error(e)
        showToast('Failed to open pack')
      }
      openingStep.value    = 'reveal'
      revealComplete.value = true
      glowStage.value      = 'fade'
    }, 3000)

    // 3) Hide glow after 5s
    setTimeout(() => {
      showGlow.value  = false
      glowStage.value = 'hidden'
    }, 5000)

  } catch (err) {
    Sentry.captureException(err)
    showToast('Failed to buy pack')
  } finally {
    buyingPacks.value.delete(pack.id)
    await fetchSelf({ force: true })
  }
}

async function refreshPacks () {
  try {
    packs.value = await $fetch('/api/cmart/packs')
  } catch (err) {
    console.error('Failed to refresh packs', err)
    showToast('Could not refresh packs')
  }
}

// ────────── Close Overlay ──────────────────────
async function closeOverlay() {
  overlayVisible.value = false
  await refreshPacks() 
}
</script>


<style scoped>
/* ─── WHITE GLOW KEYFRAME ANIMATION ───────────── */
.glow {
  position: fixed;
  top: 50%;
  left: 50%;
  /* start as a tiny dot */
  width: 1vw;
  height: 1vh;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1000;

  /* run two animations in sequence:
     1) expand for 2s, forwards (leave end state)
     2) fade for 1s, starting at 2s, forwards */
  animation:
    expandGlow 2s ease-out forwards,
    fadeGlow   1s ease-in 2s forwards;
}

@keyframes expandGlow {
  from {
    width: 1vw;
    height: 1vh;
  }
  to {
    width: 200vw;
    height: 200vh;
  }
}

@keyframes fadeGlow {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* highlight cToons that went out of stock (inCmart=false) */
@keyframes cardGlow {
  0%   { box-shadow: 0 0 0px   rgba(255,215,0,0.5); }
  50%  { box-shadow: 0 0 10px  rgba(255,215,0,1);   }
  100% { box-shadow: 0 0 0px   rgba(255,215,0,0.5); }
}
.card-glow {
  animation: cardGlow 2s infinite ease-in-out;
}
</style>
