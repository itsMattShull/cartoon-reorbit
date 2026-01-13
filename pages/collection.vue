<template>
  <Nav />

  <div class="mt-20 md:pt-10 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">My Collections</h1>

    <!-- ─────────────────── TABS ─────────────────── -->
    <div class="mb-6 flex items-center border-b border-gray-300 overflow-x-auto overflow-y-hidden no-scrollbar">
      <div class="flex flex-nowrap space-x-4 whitespace-nowrap">
        <button
          @click="switchTab('MyCollection')"
          :class="activeTab === 'MyCollection'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          My Collection
        </button>
        <button
         @click="switchTab('MyWishlist')"
         :disabled="isLoadingWishlist"
         :class="[
           activeTab === 'MyWishlist'
             ? 'border-b-2 border-indigo-600 text-indigo-600'
             : 'border-transparent text-gray-500 hover:text-gray-700',
           isLoadingWishlist && 'cursor-not-allowed opacity-50'
         ]"
         class="px-4 py-2 -mb-px text-sm font-medium"
       >
         My Wishlist
       </button>
        <button
         @click="switchTab('MyTradeList')"
         :disabled="isLoadingTradeList"
         :class="[
           activeTab === 'MyTradeList'
             ? 'border-b-2 border-indigo-600 text-indigo-600'
             : 'border-transparent text-gray-500 hover:text-gray-700',
           isLoadingTradeList && 'cursor-not-allowed opacity-50'
         ]"
         class="px-4 py-2 -mb-px text-sm font-medium"
       >
         My Trade List
       </button>
        <button
          @click="switchTab('AllSets')"
          :class="activeTab === 'AllSets'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          All Sets
        </button>
        <button
          @click="switchTab('AllSeries')"
          :class="activeTab === 'AllSeries'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          All Series
        </button>
      </div>
    </div>

    <div class="lg:flex lg:gap-6">
      <!-- Toggle Filters on Mobile -->
      <button
        class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
        @click="showFilters = !showFilters"
      >
        {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
      </button>

      <!-- Sidebar Filters -->
      <aside
        :class="[
          showFilters ? 'block' : 'hidden',
          'lg:block w-full lg:w-1/4 bg-white rounded-lg shadow p-6'
        ]"
      >
        <!-- Search -->
        <div class="mb-4">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
            Search cToons
          </label>
          <input
            id="search"
            type="text"
            v-model="searchQuery"
            placeholder="Type a name…"
            class="block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <!-- Filter by Set -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Set</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label
              v-for="s in filterMeta.sets"
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
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Series</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label
              v-for="ser in filterMeta.series"
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
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Rarity</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label
              v-for="r in filterMeta.rarities"
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

        <!-- Filter by Ownership -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Ownership</p>
          <div class="space-y-1">
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="all"
                v-model="selectedOwned"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">All</span>
            </label>
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="owned"
                v-model="selectedOwned"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">Owned Only</span>
            </label>
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="unowned"
                v-model="selectedOwned"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">Un-owned Only</span>
            </label>
          </div>
        </div>

        <!-- Duplicates Only (applies to My Collection) -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Duplicates</p>
          <label class="flex items-center text-sm">
            <input
              type="checkbox"
              v-model="duplicatesOnly"
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span class="ml-2">Show duplicates only</span>
          </label>
        </div>

        <!-- Sort -->
        <div class="mt-6">
          <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">
            Sort By
          </label>
          <select
            id="sort"
            v-model="sortBy"
            class="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="acquiredDateDesc">Acquired Date – Descending</option>
            <option value="acquiredDateAsc">Acquired Date – Ascending</option>
            <option value="releaseDateDesc">Release Date – Descending</option>
            <option value="releaseDateAsc">Release Date – Ascending</option>
            <option value="priceDesc">Price – Descending</option>
            <option value="priceAsc">Price – Ascending</option>
            <option value="rarity">Rarity (A→Z)</option>
            <option value="series">Series (A→Z)</option>
            <option value="set">Set (A→Z)</option>
            <option value="name">Name (A→Z, then Mint #)</option>
          </select>
        </div>

        <!-- Unique Toggle -->
        <div class="mt-4">
          <button
            @click="showUnique = !showUnique"
            class="w-full px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium"
          >
            {{ showUnique ? 'Show All cToons' : 'Show Unique cToons' }}
          </button>
        </div>
      </aside>

      <!-- TAB CONTENTS -->
      <div class="w-full lg:w-3/4">
        <!-- My Collection -->
        <div v-if="activeTab === 'MyCollection'">
          <p class="mb-4 text-sm font-medium text-gray-600">
            {{ collectionCountText }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoadingUserCtoons && pagedUser.length === 0">
              <div
                v-for="n in 6"
                :key="n"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
              >
                <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4"></div>
              </div>
            </template>

            <template v-else>
              <div
                v-for="uc in pagedUser"
                :key="uc.id"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <h2 class="text-xl font-semibold mb-2">{{ uc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <CtoonAsset
                    :src="uc.assetPath"
                    :alt="uc.name"
                    :name="uc.name"
                    :ctoon-id="uc.ctoonId"
                    :user-ctoon-id="uc.id"
                    image-class="max-w-full h-auto"
                    placeholder-height="8rem"
                    progressive
                  />
                </div>
                <div class="text-sm text-center mb-2">
                  <p>
                    <span class="capitalize">{{ uc.series }}</span> •
                    <span class="capitalize">{{ uc.rarity }}</span> •
                    <span class="capitalize">{{ uc.set }}</span>
                  </p>
                </div>
                <div class="mt-auto text-sm text-center">
                  <p v-if="!uc.isHolidayItem">Mint #{{ uc.mintNumber ?? 'N/A' }}</p>
                  <p v-if="uc.isFirstEdition" class="text-indigo-600 font-semibold">
                    First Edition
                  </p>
                </div>
                <div class="mt-auto flex flex-wrap gap-2 whitespace-nowrap">
                  <AddToAuction
                    class="flex-1 min-w-[12rem]"
                    :userCtoon="uc"
                    :isOwner="uc.userId === user.id"
                    :hasActiveAuction="uc.auctions.length > 0"
                    @auctionCreated="loadMoreUser"
                  />
                  <AddToTradeList
                    class="flex-1 min-w-[12rem]"
                    :user-ctoon-id="uc.id"
                    :isOwner="uc.userId === user.id"
                  />
                </div>
              </div>
            </template>
          </div>

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageUser === 1"
              @click="prevUserPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageUser }} of {{ totalPagesUser }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageUser === totalPagesUser"
              @click="nextUserPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- My Wishlist -->
        <div v-if="activeTab === 'MyWishlist'">
          <p class="mb-4 text-sm font-medium text-gray-600">
            {{ wishlistCountText }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoadingWishlist && pagedWishlist.length === 0">
              <div
                v-for="n in 6"
                :key="n"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
              >
                <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4"></div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="wc in pagedWishlist"
                :key="wc.id"
                class="relative bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <!-- Owned / Un-owned badge -->
                <span
                  v-if="wc.isOwned"
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
                <h2 class="text-xl font-semibold mb-2 mt-6">{{ wc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <CtoonAsset
                    :src="wc.assetPath"
                    :alt="wc.name"
                    :name="wc.name"
                    :ctoon-id="wc.id"
                    image-class="max-w-full h-auto"
                    placeholder-height="8rem"
                    progressive
                  />
                </div>
                <div class="text-sm text-center mb-2">
                  <p>
                    <span class="capitalize">{{ wc.series }}</span> •
                    <span class="capitalize">{{ wc.rarity }}</span> •
                    <span class="capitalize">{{ wc.set }}</span>
                  </p>
                </div>
                <AddToWishlist :ctoon-id="wc.id" class="mt-auto" />
              </div>
            </template>
          </div>

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageWishlist === 1"
              @click="prevWishlistPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageWishlist }} of {{ totalPagesWishlist }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageWishlist === totalPagesWishlist"
              @click="nextWishlistPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- My Trade List -->
        <div v-if="activeTab === 'MyTradeList'">
          <p class="mb-4 text-sm font-medium text-gray-600">
            {{ tradeListCountText }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoadingTradeList && pagedTradeList.length === 0">
              <div
                v-for="n in 6"
                :key="n"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
              >
                <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4"></div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="tc in pagedTradeList"
                :key="tc.userCtoonId"
                class="relative bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <h2 class="text-xl font-semibold mb-2 mt-6">{{ tc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <CtoonAsset
                    :src="tc.assetPath"
                    :alt="tc.name"
                    :name="tc.name"
                    :ctoon-id="tc.ctoonId"
                    :user-ctoon-id="tc.userCtoonId"
                    image-class="max-w-full h-auto"
                    placeholder-height="8rem"
                    progressive
                  />
                </div>
                <div class="text-sm text-center mb-2">
                  <p>
                    <span class="capitalize">{{ tc.series }}</span> •
                    <span class="capitalize">{{ tc.rarity }}</span> •
                    <span class="capitalize">{{ tc.set }}</span>
                  </p>
                  <p class="text-xs text-gray-600 mt-1">Mint #{{ tc.mintNumber ?? 'N/A' }}</p>
                </div>
                <AddToTradeList :user-ctoon-id="tc.userCtoonId" :isOwner="true" class="mt-auto" />
              </div>
            </template>
          </div>

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageTradeList === 1"
              @click="prevTradeListPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageTradeList }} of {{ totalPagesTradeList }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageTradeList === totalPagesTradeList"
              @click="nextTradeListPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- All Sets -->
        <div v-if="activeTab === 'AllSets'">
          <p class="mb-4 text-sm font-medium text-gray-600">
            {{ setsCountText }}
          </p>
          <div
            v-for="setName in pageSetsWithItems"
            :key="setName"
            class="mb-8"
          >
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ setName }}</h2>
              <p class="text-gray-700">
                {{ ownedCountBySet(setName) }} /
                {{ totalCountBySet(setName) }} owned
                ({{ percentageOwnedBySet(setName) }}%)
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <template v-if="isLoadingAllCtoons && pagedAll.length === 0">
                <div
                  v-for="n in 6"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
              <template v-else>
                <div
                  v-for="c in itemsInSetSorted(setName)"
                  :key="c.id"
                  class="relative bg-white rounded-lg shadow p-4 flex flex-col h-full"
                >
                  <span
                    v-if="c.isOwned"
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
                  <h3 class="text-lg font-semibold mb-2 mt-6">{{ c.name }}</h3>
                  <div class="flex-grow flex items-center justify-center">
                    <CtoonAsset
                      :src="c.assetPath"
                      :alt="c.name"
                      :name="c.name"
                      :ctoon-id="c.id"
                      image-class="max-h-48 object-contain"
                      placeholder-height="8rem"
                      progressive
                    />
                  </div>
                  <p class="text-sm mt-2 text-center">
                    {{ c.series }} • {{ c.rarity }}
                    <span class="block">
                      Highest Mint #: {{ c.highestMint }}
                    </span>
                  </p>
                  <div class="mt-2 flex justify-between items-center">
                    <AddToWishlist :ctoon-id="c.id" />
                    <button
                      class="bg-white border border-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-50"
                      @click="openOwners(c)"
                    >
                      View Owners
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === 1"
              @click="prevAllPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageAll }} of {{ totalPagesAll }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === totalPagesAll"
              @click="nextAllPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- All Series -->
        <div v-if="activeTab === 'AllSeries'">
          <p class="mb-4 text-sm font-medium text-gray-600">
            {{ seriesCountText }}
          </p>
          <div
            v-for="seriesName in pageSeriesWithItems"
            :key="seriesName"
            class="mb-8"
          >
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ seriesName }}</h2>
              <p class="text-gray-700">
                {{ ownedCountBySeries(seriesName) }} /
                {{ totalCountBySeries(seriesName) }} owned
                ({{ percentageOwnedBySeries(seriesName) }}%)
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <template v-if="isLoadingAllCtoons && pagedAll.length === 0">
                <div
                  v-for="n in 6"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
              <template v-else>
                <div
                  v-for="c in itemsInSeriesSorted(seriesName)"
                  :key="c.id"
                  class="relative bg-white rounded-lg shadow p-4 flex flex-col h-full"
                >
                  <span
                    v-if="c.isOwned"
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
                  <h3 class="text-lg font-semibold mb-2 mt-6">{{ c.name }}</h3>
                  <div class="flex-grow flex items-center justify-center">
                    <CtoonAsset
                      :src="c.assetPath"
                      :alt="c.name"
                      :name="c.name"
                      :ctoon-id="c.id"
                      image-class="max-h-48 object-contain"
                      placeholder-height="8rem"
                      progressive
                    />
                  </div>
                  <p class="text-sm mt-2 text-center">
                    {{ c.set }} • {{ c.rarity }}
                    <span class="block">
                      Highest Mint #: {{ c.highestMint }}
                    </span>
                  </p>
                  <div class="mt-2 flex justify-between items-center">
                    <AddToWishlist :ctoon-id="c.id" />
                    <button
                      class="bg-white border border-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-50"
                      @click="openOwners(c)"
                    >
                      View Owners
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === 1"
              @click="prevAllPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageAll }} of {{ totalPagesAll }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === totalPagesAll"
              @click="nextAllPage()"
            >
              Next Page
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Owners Side-Panel -->
   <transition name="fade">
    <div
      v-if="ownersPanelVisible"
      class="fixed inset-0 bg-black bg-opacity-50 z-40"
      @click="closeOwners"
    />
  </transition>
  
  <transition name="slide-panel">
    <div
      v-if="ownersPanelVisible"
      class="fixed top-0 right-0 h-full w-full max-w-full bg-white shadow-xl z-50 p-12 overflow-y-auto sm:w-auto sm:min-w-[560px] sm:max-w-[92%]"
    >
      <button
        class="absolute top-3 right-3 text-gray-500 hover:text-black"
        @click="closeOwners"
      >✕</button>
      <h2 class="text-xl font-bold mb-4">
        Owners of {{ currentOwnersCtoon?.name }}
      </h2>
      <div v-if="ownersLoading" class="text-center py-6">Loading…</div>
      <ul v-else class="space-y-3">
        <li
          v-for="owner in sortedOwners"
          :key="owner.userId + '-' + owner.mintNumber"
          class="w-full max-w-[420px] mx-auto"
        >
          <!-- mobile: stacked rows -->
          <div class="flex flex-col gap-2 sm:hidden">
            <div
              v-if="!owner.isHolidayItem || owner.isTradeListItem"
              class="flex items-center justify-between text-sm text-gray-600"
            >
              <span v-if="!owner.isHolidayItem">Mint #{{ owner.mintNumber }}</span>
              <span v-else>&nbsp;</span>
              <NuxtLink
                v-if="owner.isTradeListItem"
                :to="{ path: `/create-trade/${owner.username}`, query: { userCtoonId: owner.userCtoonId } }"
                class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:underline"
              >
                Tradeable
              </NuxtLink>
            </div>
            <NuxtLink
              :to="`/czone/${owner.username}`"
              class="text-indigo-600 hover:underline text-sm font-semibold"
            >
              <span>{{ owner.username }}</span>
            </NuxtLink>
            <div
              v-if="!owner.isHolidayItem || owner.isTradeListItem"
              class="h-px w-full bg-gray-200"
            ></div>
          </div>

          <!-- desktop: single row columns -->
          <div class="hidden sm:grid sm:grid-cols-[auto,1fr,auto] sm:items-center sm:gap-4">
            <span
              v-if="!owner.isHolidayItem"
              class="text-sm text-gray-600 whitespace-nowrap"
            >
              Mint #{{ owner.mintNumber }}
            </span>
            <span v-else class="text-sm text-gray-600">&nbsp;</span>
            <NuxtLink
              :to="`/czone/${owner.username}`"
              class="text-indigo-600 hover:underline truncate"
            >
              <span>{{ owner.username }}</span>
            </NuxtLink>
            <NuxtLink
              v-if="owner.isTradeListItem"
              :to="{ path: `/create-trade/${owner.username}`, query: { userCtoonId: owner.userCtoonId } }"
              class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap hover:underline"
            >
              Tradeable
            </NuxtLink>
            <span v-else>&nbsp;</span>
          </div>
        </li>
      </ul>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Nav from '@/components/Nav.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import AddToAuction from '@/components/AddToAuction.vue'
import AddToTradeList from '@/components/AddToTradeList.vue'
import CtoonAsset from '@/components/CtoonAsset.vue'

definePageMeta({ title: 'Collection', middleware: 'auth', layout: 'default' })

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const { user, fetchSelf } = useAuth()

// ─── STATE ────────────────────────────────────────────────────────────────────
const activeTab      = ref('MyCollection')
const showFilters    = ref(false)
const searchQuery    = ref('')
const showUnique     = ref(false)
const selectedSets   = ref([])
const selectedSeries = ref([])
const selectedRarities = ref([])
const selectedOwned  = ref('all')
const sortBy         = ref(defaultSortForTab(activeTab.value))
const duplicatesOnly = ref(false)  // My Collection: only show duplicate holdings

const filterMeta       = ref({ sets: [], series: [], rarities: [] })

const allCtoons        = ref([])
const isLoadingAllCtoons = ref(false)
const hasLoadedAll       = ref(false)

const userCtoons       = ref([])
const isLoadingUserCtoons = ref(false)
const userCtoonsAll      = ref([])
const isLoadingUserCtoonsAll = ref(false)
const hasLoadedUserAll   = ref(false)

const wishlistCtoons   = ref([])
const isLoadingWishlist = ref(false)
const hasLoadedWishlist = ref(false)
const tradeListCtoons   = ref([])
const isLoadingTradeList = ref(false)
const hasLoadedTradeList = ref(false)

// Pagination
const PAGE_SIZE   = 100
const pageUser    = ref(1)
const pageAll     = ref(1)
const pageWishlist= ref(1)
const pageTradeList= ref(1)

// Owners panel
const ownersPanelVisible   = ref(false)
const ownersList           = ref([])
const ownersLoading        = ref(false)
const currentOwnersCtoon   = ref(null)

function defaultSortForTab(tab) {
  return tab === 'MyCollection' ? 'acquiredDateDesc' : 'name'
}

// ─── ROUTE QUERY SYNC ─────────────────────────────────────────────────────────
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

  if (selectedOwned.value && selectedOwned.value !== 'all') newQuery.owned = selectedOwned.value
  else delete newQuery.owned

  const defaultSort = defaultSortForTab(activeTab.value)
  if (sortBy.value && sortBy.value !== defaultSort) newQuery.sort = sortBy.value
  else delete newQuery.sort

  // My Collection: duplicates-only toggle
  if (duplicatesOnly.value) newQuery.dupes = '1'; else delete newQuery.dupes

  const current = JSON.stringify(route.query)
  const next    = JSON.stringify(newQuery)
  if (current !== next) router.replace({ path: route.path, query: newQuery })
}

// collections.vue <script setup> — add helpers near top of sort code
function sortCmp(a, b, { useMintTie = false } = {}) {
  const getTimeAsc  = v => v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER
  const getTimeDesc = v => v ? new Date(v).getTime() : -Number.MAX_SAFE_INTEGER
  const numAsc  = (x,y) => (x ?? Number.POSITIVE_INFINITY) - (y ?? Number.POSITIVE_INFINITY)
  const numDesc = (x,y) => (y ?? Number.NEGATIVE_INFINITY) - (x ?? Number.NEGATIVE_INFINITY)
  const nameTie = () => {
    const cmp = (a.name || '').localeCompare(b.name || '')
    if (!cmp && useMintTie) return (a.mintNumber ?? 0) - (b.mintNumber ?? 0)
    return cmp
  }

  switch (sortBy.value) {
    case 'acquiredDateAsc':
      return getTimeAsc(a.acquiredAt) - getTimeAsc(b.acquiredAt)
    case 'acquiredDateDesc':
      return getTimeDesc(b.acquiredAt) - getTimeDesc(a.acquiredAt)
    case 'releaseDateAsc': {
      const primary = getTimeAsc(a.releaseDate) - getTimeAsc(b.releaseDate)
      return primary || nameTie()
    }
    case 'releaseDateDesc': {
      const primary = getTimeDesc(b.releaseDate) - getTimeDesc(a.releaseDate)
      return primary || nameTie()
    }
    case 'priceAsc': {
      const primary = numAsc(a.price, b.price)
      return primary || nameTie()
    }
    case 'priceDesc': {
      const primary = numDesc(a.price, b.price)
      return primary || nameTie()
    }
    case 'rarity': {
      const cmp = (a.rarity || '').localeCompare(b.rarity || '')
      return cmp || nameTie()
    }
    case 'series': {
      const cmp = (a.series || '').localeCompare(b.series || '')
      return cmp || nameTie()
    }
    case 'set': {
      const cmp = (a.set || '').localeCompare(b.set || '')
      return cmp || nameTie()
    }
    case 'name':
    default: {
      return nameTie()
    }
  }
}

const sortedOwners = computed(() =>
  ownersList.value.slice().sort((a, b) => a.mintNumber - b.mintNumber)
)

async function openOwners(ctoon) {
  currentOwnersCtoon.value = ctoon
  ownersLoading.value      = true
  ownersPanelVisible.value = true
  try {
    const res = await $fetch(`/api/collections/owners?cToonId=${ctoon.id}`)
    ownersList.value = res
  } catch (err) {
    console.error('Failed to load owners', err)
    ownersList.value = []
  } finally {
    ownersLoading.value = false
  }
}

function closeOwners() {
  ownersPanelVisible.value = false
  ownersList.value         = []
  currentOwnersCtoon.value = null
}

// ─── COMPUTED: All cToons ─────────────────────────────────────────────────────
const filteredAllCtoons = computed(() => {
  return allCtoons.value.filter(c => {
    const nm = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(c.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(c.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(c.rarity)
    const o  = selectedOwned.value === 'all'
      ? true
      : selectedOwned.value === 'owned'
        ? c.isOwned
        : !c.isOwned
    return nm && sm && se && r && o
  })
})
const sortedAll = computed(() =>
  filteredAllCtoons.value.slice().sort((a, b) => sortCmp(a, b))
)
const totalPagesAll = computed(() =>
  Math.max(1, Math.ceil(sortedAll.value.length / PAGE_SIZE))
)
const pagedAll = computed(() => {
  const start = (pageAll.value - 1) * PAGE_SIZE
  return sortedAll.value.slice(start, start + PAGE_SIZE)
})

// Sets/Series present on the current page only
const pageSetsWithItems = computed(() =>
  Array.from(new Set(pagedAll.value.map(c => c.set))).filter(Boolean)
)
const pageSeriesWithItems = computed(() =>
  Array.from(new Set(pagedAll.value.map(c => c.series))).filter(Boolean)
)

// ─── SORTED GROUP HELPERS FOR ALL TABS ────────────────────────────────────────
function itemsInSetSorted(setName) {
  return pagedAll.value.filter(x => x.set === setName).slice().sort((a,b) => sortCmp(a,b))
}
function itemsInSeriesSorted(seriesName) {
  return pagedAll.value.filter(x => x.series === seriesName).slice().sort((a,b) => sortCmp(a,b))
}

// ─── COMPUTED: My Collection ──────────────────────────────────────────────────
const filteredUserCtoons = computed(() =>
  userCtoons.value.filter(uc => {
    const nm = uc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(uc.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(uc.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(uc.rarity)
    return nm && sm && se && r
  })
)
const sortedUserAll = computed(() =>
  filteredUserCtoons.value.slice().sort((a, b) => sortCmp(a, b, { useMintTie: true }))
)
const totalPagesUser = computed(() =>
  Math.max(1, Math.ceil(sortedUserAll.value.length / PAGE_SIZE))
)
const pagedUser = computed(() => {
  const start = (pageUser.value - 1) * PAGE_SIZE
  return sortedUserAll.value.slice(start, start + PAGE_SIZE)
})

// ─── COMPUTED: Wishlist ───────────────────────────────────────────────────────
const filteredWishlistCtoons = computed(() =>
  wishlistCtoons.value.filter(wc => {
    const nm = wc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(wc.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(wc.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(wc.rarity)
    return nm && sm && se && r
  })
)
const filteredAndSortedWishlistCtoons = computed(() =>
  filteredWishlistCtoons.value.slice().sort((a, b) => sortCmp(a, b))
)
const filteredTradeListCtoons = computed(() =>
  tradeListCtoons.value.filter(tc => {
    const nm = (tc.name || '').toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(tc.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(tc.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(tc.rarity)
    return nm && sm && se && r
  })
)
const filteredAndSortedTradeListCtoons = computed(() =>
  filteredTradeListCtoons.value.slice().sort((a, b) => sortCmp(a, b, { useMintTie: true }))
)
const totalPagesWishlist = computed(() =>
  Math.max(1, Math.ceil(filteredAndSortedWishlistCtoons.value.length / PAGE_SIZE))
)
const pagedWishlist = computed(() => {
  const start = (pageWishlist.value - 1) * PAGE_SIZE
  return filteredAndSortedWishlistCtoons.value.slice(start, start + PAGE_SIZE)
})
const totalPagesTradeList = computed(() =>
  Math.max(1, Math.ceil(filteredAndSortedTradeListCtoons.value.length / PAGE_SIZE))
)
const pagedTradeList = computed(() => {
  const start = (pageTradeList.value - 1) * PAGE_SIZE
  return filteredAndSortedTradeListCtoons.value.slice(start, start + PAGE_SIZE)
})

// ─── HELPERS: ownership stats ────────────────────────────────────────────────
const setStats = computed(() => {
  const stats = new Map()
  for (const c of allCtoons.value) {
    if (!c.set) continue
    const entry = stats.get(c.set) || { total: 0, owned: 0 }
    entry.total += 1
    if (c.isOwned) entry.owned += 1
    stats.set(c.set, entry)
  }
  return stats
})
const seriesStats = computed(() => {
  const stats = new Map()
  for (const c of allCtoons.value) {
    if (!c.series) continue
    const entry = stats.get(c.series) || { total: 0, owned: 0 }
    entry.total += 1
    if (c.isOwned) entry.owned += 1
    stats.set(c.series, entry)
  }
  return stats
})

function totalCountBySet(setName) {
  return setStats.value.get(setName)?.total || 0
}
function ownedCountBySet(setName) {
  return setStats.value.get(setName)?.owned || 0
}
function percentageOwnedBySet(setName) {
  const t = totalCountBySet(setName)
  return t ? Math.round((ownedCountBySet(setName) / t) * 100) : 0
}
function totalCountBySeries(seriesName) {
  return seriesStats.value.get(seriesName)?.total || 0
}
function ownedCountBySeries(seriesName) {
  return seriesStats.value.get(seriesName)?.owned || 0
}
function percentageOwnedBySeries(seriesName) {
  const t = totalCountBySeries(seriesName)
  return t ? Math.round((ownedCountBySeries(seriesName) / t) * 100) : 0
}

const uniqueCollectedCtoonsCount = computed(() => {
  const ids = new Set(userCtoonsAll.value.map(uc => uc.ctoonId))
  return ids.size
})
const totalCtoonsCount = computed(() => allCtoons.value.length)
const completedSetsCount = computed(() => {
  let count = 0
  for (const { total, owned } of setStats.value.values()) {
    if (total && owned === total) count += 1
  }
  return count
})
const totalSetsCount = computed(() => setStats.value.size)
const completedSeriesCount = computed(() => {
  let count = 0
  for (const { total, owned } of seriesStats.value.values()) {
    if (total && owned === total) count += 1
  }
  return count
})
const totalSeriesCount = computed(() => seriesStats.value.size)

const collectionCountText = computed(() => {
  if (!hasLoadedUserAll.value) return 'Loading collection totals...'
  const owned = uniqueCollectedCtoonsCount.value
  if (!hasLoadedAll.value) return `${owned} cToons Collected`
  return `${owned} of ${totalCtoonsCount.value} cToons Collected`
})
const wishlistCountText = computed(() => {
  if (!hasLoadedWishlist.value) return 'Loading wishlist totals...'
  return `Total Wishlist cToons: ${wishlistCtoons.value.length}`
})
const tradeListCountText = computed(() => {
  if (!hasLoadedTradeList.value) return 'Loading trade list totals...'
  return `Total Trade List cToons: ${tradeListCtoons.value.length}`
})
const setsCountText = computed(() => {
  if (!hasLoadedAll.value) return 'Loading set totals...'
  return `${completedSetsCount.value} of ${totalSetsCount.value} Sets Collected`
})
const seriesCountText = computed(() => {
  if (!hasLoadedAll.value) return 'Loading series totals...'
  return `${completedSeriesCount.value} of ${totalSeriesCount.value} Series Collected`
})

// ─── TAB SWITCH & DATA LOADERS ────────────────────────────────────────────────
function switchTab(tab) {
  const prevTab = activeTab.value
  activeTab.value = tab
  const prevDefault = defaultSortForTab(prevTab)
  const nextDefault = defaultSortForTab(tab)
  if (sortBy.value === prevDefault) sortBy.value = nextDefault

  if (tab === 'MyCollection') {
    if (!userCtoons.value.length) loadUser()
    pageUser.value = 1
  } else if (tab === 'MyWishlist') {
    if (!wishlistCtoons.value.length && !isLoadingWishlist.value) loadWishlist()
    pageWishlist.value = 1
  } else if (tab === 'MyTradeList') {
    if (!tradeListCtoons.value.length && !isLoadingTradeList.value) loadTradeList()
    pageTradeList.value = 1
  } else if (tab === 'AllSets' || tab === 'AllSeries') {
    if (!allCtoons.value.length) loadAll()
    pageAll.value = 1
  }
}
function loadMoreUser() {
  loadUser()
}

async function loadAll() {
  isLoadingAllCtoons.value = true
  try {
    allCtoons.value = await $fetch('/api/collections/all')
    hasLoadedAll.value = true
  } finally {
    isLoadingAllCtoons.value = false
  }
}
async function loadUser() {
  isLoadingUserCtoons.value = true
  try {
    const qs = duplicatesOnly.value ? '?duplicatesOnly=1' : ''
    const res = await $fetch(`/api/collections${qs}`)
    userCtoons.value = res
    if (!duplicatesOnly.value) {
      userCtoonsAll.value = res
      hasLoadedUserAll.value = true
    }
  } finally {
    isLoadingUserCtoons.value = false
  }
  if (duplicatesOnly.value) loadUserAllIfNeeded()
}
async function loadUserAll() {
  if (isLoadingUserCtoonsAll.value) return
  isLoadingUserCtoonsAll.value = true
  try {
    userCtoonsAll.value = await $fetch('/api/collections')
    hasLoadedUserAll.value = true
  } finally {
    isLoadingUserCtoonsAll.value = false
  }
}
function loadUserAllIfNeeded() {
  if (!hasLoadedUserAll.value && !isLoadingUserCtoonsAll.value) loadUserAll()
}
async function loadWishlist() {
  if (isLoadingWishlist.value || hasLoadedWishlist.value) return
  isLoadingWishlist.value = true
  try {
    wishlistCtoons.value = await $fetch('/api/wishlist')
    hasLoadedWishlist.value = true
  } finally {
    isLoadingWishlist.value = false
  }
}
async function loadTradeList() {
  if (isLoadingTradeList.value || hasLoadedTradeList.value) return
  if (!user.value?.username) return
  isLoadingTradeList.value = true
  try {
    tradeListCtoons.value = await $fetch(`/api/trade-list/users/${user.value.username}`)
    hasLoadedTradeList.value = true
  } finally {
    isLoadingTradeList.value = false
  }
}

// Reset page when filters or sort change
watch([searchQuery, selectedSets, selectedSeries, selectedRarities, selectedOwned], () => {
  if (activeTab.value === 'MyCollection') pageUser.value = 1
  if (activeTab.value === 'MyWishlist') pageWishlist.value = 1
  if (activeTab.value === 'MyTradeList') pageTradeList.value = 1
  if (activeTab.value === 'AllSets' || activeTab.value === 'AllSeries') pageAll.value = 1
  updateUrlQueryFromFilters()
}, { deep: true })
watch(sortBy, () => {
  if (activeTab.value === 'MyCollection') pageUser.value = 1
  if (activeTab.value === 'MyWishlist') pageWishlist.value = 1
  if (activeTab.value === 'MyTradeList') pageTradeList.value = 1
  if (activeTab.value === 'AllSets' || activeTab.value === 'AllSeries') pageAll.value = 1
  updateUrlQueryFromFilters()
})

// Reload user items when duplicates-only changes
watch(duplicatesOnly, () => {
  if (activeTab.value === 'MyCollection') {
    pageUser.value = 1
    updateUrlQueryFromFilters()
    loadUser()
  } else {
    updateUrlQueryFromFilters()
  }
})

// ─── MOUNT ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await fetchSelf()
  filterMeta.value = await $fetch('/api/collections/meta')

  // Initialize from URL query (supports repeated params or comma-separated)
  const qParam      = typeof route.query.q === 'string' ? route.query.q : ''
  const setParam    = route.query.set ?? route.query.sets
  const seriesParam = route.query.series
  const rarityParam = route.query.rarity
  const ownedParam  = typeof route.query.owned === 'string' ? route.query.owned : ''
  const sortParam   = typeof route.query.sort === 'string' ? route.query.sort : ''
  const dupesParam  = typeof route.query.dupes === 'string' ? route.query.dupes : ''

  if (qParam.trim()) searchQuery.value = qParam.trim()

  const initSets     = normalizeListParam(setParam)
  const initSeries   = normalizeListParam(seriesParam)
  const initRarities = normalizeListParam(rarityParam)
  if (initSets.length)     selectedSets.value = initSets
  if (initSeries.length)   selectedSeries.value = initSeries
  if (initRarities.length) selectedRarities.value = initRarities

  if (['all','owned','unowned'].includes(ownedParam)) selectedOwned.value = ownedParam

  const validSorts = [
    'acquiredDateDesc',
    'acquiredDateAsc',
    'releaseDateDesc',
    'releaseDateAsc',
    'priceDesc',
    'priceAsc',
    'rarity',
    'series',
    'set',
    'name'
  ]
  if (validSorts.includes(sortParam)) sortBy.value = sortParam

  if (['1', 'true'].includes(dupesParam.toLowerCase ? dupesParam.toLowerCase() : dupesParam)) {
    duplicatesOnly.value = true
  }

  // Normalize URL now to reflect initialized values
  updateUrlQueryFromFilters()

  loadUser()
  loadAll()
})

// Scroll helpers for pagination
function scrollToTop () {
  if (typeof window === 'undefined') return
  // Wait for DOM update, then scroll immediately and fire a scroll event
  nextTick().then(() => {
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { window.scrollTo(0, 0) }
      window.dispatchEvent(new Event('scroll'))
    })
  })
}
function prevUserPage () {
  if (pageUser.value > 1) { pageUser.value--; scrollToTop() }
}
function nextUserPage () {
  if (pageUser.value < totalPagesUser.value) { pageUser.value++; scrollToTop() }
}
function prevWishlistPage () {
  if (pageWishlist.value > 1) { pageWishlist.value--; scrollToTop() }
}
function nextWishlistPage () {
  if (pageWishlist.value < totalPagesWishlist.value) { pageWishlist.value++; scrollToTop() }
}
function prevTradeListPage () {
  if (pageTradeList.value > 1) { pageTradeList.value--; scrollToTop() }
}
function nextTradeListPage () {
  if (pageTradeList.value < totalPagesTradeList.value) { pageTradeList.value++; scrollToTop() }
}
function prevAllPage () {
  if (pageAll.value > 1) { pageAll.value--; scrollToTop() }
}
function nextAllPage () {
  if (pageAll.value < totalPagesAll.value) { pageAll.value++; scrollToTop() }
}
</script>

<style scoped>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius: 3px; }

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
