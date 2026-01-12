<!-- File: pages/auctions.vue -->
<template>
  <Nav />

  <div class="mt-20 md:pt-10 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">Auctions</h1>

    <!-- Tabs -->
    <div class="mb-6 flex border-b">
      <button
        :class="[
          'px-4 py-2 -mb-px font-semibold',
          activeTab === 'current'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'current'"
      >
        Current Auctions
      </button>

      <button
        :class="[
          'ml-6 px-4 py-2 -mb-px font-semibold',
          activeTab === 'mybids'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'mybids'"
      >
        My Bids
      </button>

      <button
        :class="[
          'ml-6 px-4 py-2 -mb-px font-semibold',
          activeTab === 'mine'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'mine'"
      >
        My Auctions
      </button>

      <button
        :class="[
          'ml-6 px-4 py-2 -mb-px font-semibold',
          activeTab === 'all'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'all'"
      >
        All Auctions
      </button>
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
          'lg:block',
          'w-full lg:w-1/4',
          'bg-white rounded-lg shadow p-6'
        ]"
      >
        <!-- Search -->
        <div class="mb-4">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
            Search Auctions
          </label>
          <input
            id="search"
            type="text"
            v-model="searchQuery"
            placeholder="Type a name or character…"
            class="block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <!-- Filter by Series -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Series</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label v-for="(ser, i) in uniqueSeries" :key="ser + i" class="flex items-center text-sm">
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
            <label v-for="(r, i) in uniqueRarities" :key="r + i" class="flex items-center text-sm">
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

        <!-- Filter by Featured -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Other Filters</p>
          <label class="flex items-center text-sm">
            <input
              type="checkbox"
              v-model="featuredOnly"
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span class="ml-2">Featured Only</span>
          </label>
          <label class="flex items-center text-sm mt-2">
            <input
              type="checkbox"
              v-model="wishlistOnly"
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span class="ml-2">On My Wishlist</span>
          </label>
          <p v-if="wishlistOnly && isLoadingWishlist" class="mt-2 text-xs text-gray-500">
            Loading wishlist...
          </p>
        </div>

        <!-- Sort Select -->
        <div class="mt-6">
          <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
          <select
            id="sort"
            v-model="sortBy"
            class="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="endAsc">Ending Soonest</option>
            <option value="nameAsc">Name (A→Z)</option>
            <option value="nameDesc">Name (Z→A)</option>
            <option value="mintAsc">Mint # (Asc)</option>
            <option value="mintDesc">Mint # (Desc)</option>
            <option value="rarity">Rarity (A→Z)</option>
          </select>
        </div>
      </aside>

      <div class="w-full lg:w-3/4">
        <!-- Current Auctions -->
        <template v-if="activeTab === 'current'">
          <div v-if="isLoadingTrending || filteredTrendingAuctions.length" class="mb-6">
            <div class="bg-blue-600 rounded-lg shadow p-4">
            <h2 class="text-xl font-semibold mb-3 bg-blue-200 text-blue-600 px-3 py-2 rounded">
              Trending Auctions
            </h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <template v-if="isLoadingTrending">
                  <div v-for="n in 3" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
                </template>
                <template v-else>
                  <div
                    v-for="auction in filteredTrendingAuctions"
                    :key="auction.id"
                    class="bg-white rounded-lg shadow p-4 flex flex-col justify-between h-full relative"
                  >
                    <span
                      v-if="auction.isFeatured"
                      class="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded"
                    >
                      Featured
                    </span>
                    <span
                      v-if="auction.isOwned"
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

                    <div class="flex-grow flex items-center justify-center">
                      <CtoonAsset
                        :src="auction.assetPath"
                        :alt="auction.name"
                        :name="auction.name"
                        :ctoon-id="auction.ctoonId"
                        :user-ctoon-id="auction.userCtoonId"
                        image-class="block max-w-full mx-auto rounded mb-4"
                      />
                    </div>

                    <div class="mt-4">
                      <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
                      <p class="text-sm text-gray-600 mb-1">Rarity: {{ auction.rarity }}</p>
                      <p v-if="!auction.isHolidayItem" class="text-sm text-gray-600 mb-1">
                        Mint #{{ auction.mintNumber ?? 'N/A' }}
                      </p>
                      <p class="text-sm text-gray-600 mb-1">
                        Highest Bid: {{ auction.highestBid != null ? auction.highestBid + ' points' : 'No bids' }}
                      </p>
                      <p class="text-sm text-gray-600 mb-1">
                        Bids: {{ auction.bidCount ?? 0 }}
                      </p>
                      <p class="text-sm text-red-600 mb-4">
                        Ending in {{ formatRemaining(auction.endAt) }}
                      </p>
                      <NuxtLink :to="`/auction/${auction.id}`" class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center">
                        View Auction
                      </NuxtLink>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoading">
              <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
            </template>
            <template v-else>
              <div
                v-for="auction in filteredAuctions"
                :key="auction.id"
                class="bg-white rounded-lg shadow p-4 flex flex-col justify-between h-full relative"
              >
                <span
                  v-if="auction.isFeatured"
                  class="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Featured
                </span>
                <span
                  v-if="auction.isOwned"
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

                <div class="flex-grow flex items-center justify-center">
                  <CtoonAsset
                    :src="auction.assetPath"
                    :alt="auction.name"
                    :name="auction.name"
                    :ctoon-id="auction.ctoonId"
                    :user-ctoon-id="auction.userCtoonId"
                    image-class="block max-w-full mx-auto rounded mb-4"
                  />
                </div>

                <div class="mt-4">
                  <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
                  <p class="text-sm text-gray-600 mb-1">Rarity: {{ auction.rarity }}</p>
                  <p v-if="!auction.isHolidayItem" class="text-sm text-gray-600 mb-1">
                    Mint #{{ auction.mintNumber ?? 'N/A' }}
                  </p>
                  <p class="text-sm text-gray-600 mb-1">
                    Highest Bid: {{ auction.highestBid != null ? auction.highestBid + ' points' : 'No bids' }}
                  </p>
                  <p class="text-sm text-gray-600 mb-1">
                    Bids: {{ auction.bidCount ?? 0 }}
                  </p>
                  <p class="text-sm text-red-600 mb-4">
                    Ending in {{ formatRemaining(auction.endAt) }}
                  </p>
                  <NuxtLink :to="`/auction/${auction.id}`" class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center">
                    View Auction
                  </NuxtLink>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- My Bids -->
        <template v-else-if="activeTab === 'mybids'">
      <div v-if="isLoadingMyBids" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
      </div>

      <div v-else>
        <div v-if="myBids.length === 0" class="text-gray-500">
          You haven't bid on any auctions yet.
        </div>

        <div v-else-if="sortedMyBids.length === 0" class="text-gray-500">
          No auctions match your filters.
        </div>

        <div v-else>
          <div class="flex items-center justify-end mb-4">
            <label for="mybids-sort" class="text-sm font-medium text-gray-700 mr-2">
              Sort By
            </label>
            <select
              id="mybids-sort"
              v-model="myBidsSort"
              class="block border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="recentDesc">Recent - Descending</option>
              <option value="recentAsc">Recent - Ascending</option>
              <option value="biggestBid">My Biggest Bid</option>
              <option value="recentlyWon">Recently Won</option>
              <option value="recentlyLost">Recently Lost</option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              v-for="bid in sortedMyBids"
              :key="bid.id"
              class="relative bg-white rounded-lg shadow p-4 h-full flex flex-col"
            >
              <!-- Outcome badge (ended only) -->
              <div class="absolute top-2 right-2">
                <span
                  v-if="isEnded(bid.endAt) && bid.didWin"
                  class="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Won
                </span>
                <span
                  v-else-if="isEnded(bid.endAt) && !bid.didWin"
                  class="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Lost
                </span>
                <span
                  v-else-if="!isEnded(bid.endAt) && bid.myBid != null && bid.highestBid != null && bid.myBid === bid.highestBid"
                  class="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Winning
                </span>
                <span
                  v-else-if="!isEnded(bid.endAt)"
                  class="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Losing
                </span>
              </div>

              <div class="flex-grow flex items-center justify-center mb-4">
                <CtoonAsset
                  :src="bid.assetPath"
                  :alt="bid.name"
                  :name="bid.name"
                  :ctoon-id="bid.ctoonId"
                  :user-ctoon-id="bid.userCtoonId"
                  image-class="max-w-full rounded"
                />
              </div>

              <h2 class="text-lg font-semibold mb-1 truncate">{{ bid.name }}</h2>
              <p class="text-sm text-gray-600 mb-1">
                Your Bid: {{ bid.myBid != null ? bid.myBid + ' points' : '—' }}
              </p>
              <p class="text-sm text-gray-600 mb-1">
                Highest Bid: {{ bid.highestBid != null ? bid.highestBid + ' points' : 'No bids' }}
              </p>
              <p class="text-sm text-gray-600 mb-1">
                Bids: {{ bid.bidCount ?? 0 }}
              </p>

              <p
                class="text-sm mb-4"
                :class="isEnded(bid.endAt) ? 'text-gray-600' : 'text-red-600'"
              >
                <template v-if="!isEnded(bid.endAt)">
                  Ending in {{ formatRemaining(bid.endAt) }}
                </template>
                <template v-else>
                  Ended on {{ formatDate(bid.endAt) }}
                </template>
              </p>

              <NuxtLink
                :to="`/auction/${bid.id}`"
                class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center mt-auto"
              >
                View Auction
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- My Auctions -->
    <template v-else-if="activeTab === 'mine'">
      <div v-if="isLoadingMy" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
      </div>

      <div v-else>
        <div v-if="myAuctions.length === 0" class="text-gray-500">
          You haven't created any auctions yet.
        </div>

        <div v-else-if="filteredMyAuctions.length === 0" class="text-gray-500">
          No auctions match your filters.
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="auction in filteredMyAuctions"
            :key="auction.id"
            class="relative bg-white rounded-lg shadow p-4 h-full"
          >
            <!-- status badge -->
            <div class="absolute top-2 right-2">
              <span
                v-if="new Date(auction.endAt) > now"
                class="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
              >
                In Progress
              </span>
              <span v-else class="bg-gray-500 text-white text-xs font-semibold px-2 py-1 rounded">
                Ended
              </span>
            </div>

            <div class="flex-grow flex items-center justify-center mb-4">
              <CtoonAsset
                :src="auction.assetPath"
                :alt="auction.name"
                :name="auction.name"
                :ctoon-id="auction.ctoonId"
                :user-ctoon-id="auction.userCtoonId"
                image-class="max-w-full rounded"
              />
            </div>

            <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
            <p class="text-sm text-gray-600 mb-1">Created: {{ formatDate(auction.createdAt) }}</p>
            <p v-if="!isEnded(auction.endAt)" class="text-sm text-red-600 mb-1">Ending in: {{ formatRemaining(auction.endAt) }}</p>
            <p class="text-sm text-gray-600 mb-1">Initial Bid: {{ auction.initialBid }} points</p>
            <p class="text-sm text-gray-600 mb-1">
              Winning Bid: {{ auction.winningBid != null ? auction.winningBid + ' points' : 'No bids' }}
            </p>
            <p class="text-sm text-gray-600 mb-1">
              Bids: {{ auction.bidCount ?? 0 }}
            </p>
            <p v-if="auction.winningBidder" class="text-sm text-gray-600">
              Winner: {{ auction.winningBidder }}
            </p>
            <div v-if="auction.isOwner" class="mt-4">
              <AddToAuction
                :userCtoon="{
                  id: auction.userCtoonId,
                  ctoonId: auction.ctoonId,
                  name: auction.name,
                  price: auction.price,
                  rarity: auction.rarity,
                  mintNumber: auction.mintNumber,
                  assetPath: auction.assetPath
                }"
                :isOwner="auction.isOwner"
                :hasActiveAuction="auction.hasActiveAuction"
                @auctionCreated="loadMyAuctions"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

        <!-- All Auctions -->
        <template v-else-if="activeTab === 'all'">
          <div v-if="isLoadingAll" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
          </div>

          <div v-else>
            <div v-if="allAuctions.length === 0" class="text-gray-500">
              No auctions found.
            </div>

            <div v-else>
              <div v-if="filteredAllAuctions.length === 0" class="text-gray-500">
                No auctions match your filters.
              </div>

              <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div
                  v-for="auction in filteredAllAuctions"
                  :key="auction.id"
                  class="relative bg-white rounded-lg shadow p-4 h-full"
                >
                  <!-- status badge -->
                  <div class="absolute top-2 right-2">
                    <span
                      v-if="new Date(auction.endAt) > now"
                      class="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
                    >
                      In Progress
                    </span>
                    <span v-else class="bg-gray-500 text-white text-xs font-semibold px-2 py-1 rounded">
                      Ended
                    </span>
                  </div>

                  <div class="flex-grow flex items-center justify-center mb-4">
                    <CtoonAsset
                      :src="auction.assetPath"
                      :alt="auction.name"
                      :name="auction.name"
                      :ctoon-id="auction.ctoonId"
                      :user-ctoon-id="auction.userCtoonId"
                      image-class="max-w-full rounded"
                    />
                  </div>

                  <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
                  <p class="text-sm text-gray-600 mb-1">Created: {{ formatDate(auction.createdAt) }}</p>
                  <p v-if="!isEnded(auction.endAt)" class="text-sm text-red-600 mb-1">
                    Ending in: {{ formatRemaining(auction.endAt) }}
                  </p>
                  <p class="text-sm text-gray-600 mb-1">Initial Bid: {{ auction.initialBid }} points</p>
                  <p class="text-sm text-gray-600 mb-1">
                    Winning Bid: {{ auction.winningBid != null ? auction.winningBid + ' points' : 'No bids' }}
                  </p>
                  <p class="text-sm text-gray-600 mb-1">
                    Bids: {{ auction.bidCount ?? 0 }}
                  </p>
                  <p v-if="auction.winningBidder" class="text-sm text-gray-600 mb-3">
                    Winner:
                    <NuxtLink
                      :to="`/czone/${auction.winningBidder}`"
                      class="text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {{ auction.winningBidder }}
                    </NuxtLink>
                  </p>

                  <NuxtLink
                    :to="`/auction/${auction.id}`"
                    class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center mt-auto"
                  >
                    View Auction
                  </NuxtLink>
                </div>
              </div>

              <div class="flex items-center justify-between mt-6">
                <button
                  class="px-3 py-2 rounded border border-gray-300 text-sm disabled:opacity-50"
                  :disabled="allPage <= 1"
                  @click="allPage = Math.max(1, allPage - 1)"
                >
                  Previous
                </button>
                <div class="text-sm text-gray-600">
                  Page {{ allPage }} of {{ allTotalPages }}
                </div>
                <button
                  class="px-3 py-2 rounded border border-gray-300 text-sm disabled:opacity-50"
                  :disabled="allPage >= allTotalPages"
                  @click="allPage = Math.min(allTotalPages, allPage + 1)"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'
import CtoonAsset from '@/components/CtoonAsset.vue'
import AddToAuction from '@/components/AddToAuction.vue'

definePageMeta({ title: 'Auctions', middleware: 'auth', layout: 'default' })

const activeTab = ref('current')

const auctions = ref([])
const isLoading = ref(false)

const trendingAuctions = ref([])
const isLoadingTrending = ref(false)
const hasLoadedTrending = ref(false)

const myAuctions = ref([])
const isLoadingMy = ref(false)

const myBids = ref([])
const isLoadingMyBids = ref(false)
const myBidsSort = ref('recentDesc')

const allAuctions = ref([])
const isLoadingAll = ref(false)
const allPage = ref(1)
const allPageSize = ref(50)
const allTotalPages = ref(1)
const allTotalCount = ref(0)

const now = ref(new Date())
let timer = null

// Filters & sorting (Current Auctions)
const searchQuery = ref('')
const selectedSeries = ref([])
const selectedRarities = ref([])
const selectedOwned = ref('all')
const sortBy = ref('endAsc')
const showFilters = ref(false)
const featuredOnly = ref(false)
const wishlistOnly = ref(false)
const wishlistCtoonIds = ref([])
const isLoadingWishlist = ref(false)
const hasLoadedWishlist = ref(false)

// Route + URL query sync
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

  if (selectedSeries.value.length) newQuery.series = selectedSeries.value
  else delete newQuery.series

  if (selectedRarities.value.length) newQuery.rarity = selectedRarities.value
  else delete newQuery.rarity

  if (selectedOwned.value && selectedOwned.value !== 'all') newQuery.owned = selectedOwned.value
  else delete newQuery.owned

  if (featuredOnly.value) newQuery.featured = '1'
  else delete newQuery.featured

  if (wishlistOnly.value) newQuery.wishlist = '1'
  else delete newQuery.wishlist

  if (sortBy.value && sortBy.value !== 'endAsc') newQuery.sort = sortBy.value
  else delete newQuery.sort

  if (activeTab.value && activeTab.value !== 'current') newQuery.tab = activeTab.value
  else delete newQuery.tab

  const current = JSON.stringify(route.query)
  const next    = JSON.stringify(newQuery)
  if (current !== next) router.replace({ path: route.path, query: newQuery })
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)

  // Initialize from URL query
  const qParam      = typeof route.query.q === 'string' ? route.query.q : ''
  const seriesParam = route.query.series
  const rarityParam = route.query.rarity
  const ownedParam  = typeof route.query.owned === 'string' ? route.query.owned : ''
  const sortParam   = typeof route.query.sort === 'string' ? route.query.sort : ''
  const tabParam    = typeof route.query.tab === 'string' ? route.query.tab : ''
  const featuredParam = typeof route.query.featured === 'string' ? route.query.featured : ''
  const wishlistParam = typeof route.query.wishlist === 'string' ? route.query.wishlist : ''

  if (qParam.trim()) searchQuery.value = qParam.trim()
  const initSeries   = normalizeListParam(seriesParam)
  const initRarities = normalizeListParam(rarityParam)
  if (initSeries.length)   selectedSeries.value = initSeries
  if (initRarities.length) selectedRarities.value = initRarities
  if (['all','owned','unowned'].includes(ownedParam)) selectedOwned.value = ownedParam

  const validSorts = ['endAsc','nameAsc','nameDesc','mintAsc','mintDesc','rarity']
  if (validSorts.includes(sortParam)) sortBy.value = sortParam

  const validTabs = ['current','mybids','mine','all']
  if (validTabs.includes(tabParam)) activeTab.value = tabParam

  if (['1','true','yes'].includes(featuredParam.toLowerCase())) featuredOnly.value = true
  if (['1','true','yes'].includes(wishlistParam.toLowerCase())) wishlistOnly.value = true

  // Normalize URL based on initialized values
  updateUrlQueryFromFilters()

  if (wishlistOnly.value) {
    loadWishlist()
  }

  loadAuctions()
  loadTrendingAuctions()
})

onUnmounted(() => {
  clearInterval(timer)
})

function loadAuctions() {
  isLoading.value = true
  $fetch('/api/auctions')
    .then(data => {
      auctions.value = data
    })
    .finally(() => {
      isLoading.value = false
    })
}

function loadTrendingAuctions() {
  if (hasLoadedTrending.value) return
  isLoadingTrending.value = true
  $fetch('/api/auctions/trending')
    .then(data => {
      trendingAuctions.value = Array.isArray(data) ? data : []
    })
    .finally(() => {
      isLoadingTrending.value = false
      hasLoadedTrending.value = true
    })
}

async function loadWishlist() {
  if (isLoadingWishlist.value || hasLoadedWishlist.value) return
  isLoadingWishlist.value = true
  try {
    const items = await $fetch('/api/wishlist')
    wishlistCtoonIds.value = Array.isArray(items)
      ? items.map(item => item?.id).filter(Boolean)
      : []
    hasLoadedWishlist.value = true
  } finally {
    isLoadingWishlist.value = false
  }
}

function loadMyAuctions() {
  isLoadingMy.value = true
  $fetch('/api/my-auctions')
    .then(data => {
      myAuctions.value = data
    })
    .finally(() => {
      isLoadingMy.value = false
    })
}

function loadMyBids() {
  isLoadingMyBids.value = true
  $fetch('/api/auction/mybids')
    .then(data => {
      // Expect each item to include at least:
      // { id, name, assetPath, endAt, myBid, highestBid, bidCount, didWin }
      myBids.value = Array.isArray(data) ? data : []
    })
    .finally(() => {
      isLoadingMyBids.value = false
    })
}

function loadAllAuctions() {
  isLoadingAll.value = true
  const params = new URLSearchParams({
    page: String(allPage.value),
    limit: String(allPageSize.value),
  })
  $fetch(`/api/auctions/all?${params.toString()}`)
    .then(data => {
      allAuctions.value = Array.isArray(data?.items) ? data.items : []
      allTotalCount.value = data?.total ?? 0
      allTotalPages.value = data?.totalPages ?? 1
    })
    .finally(() => {
      isLoadingAll.value = false
    })
}

watch(activeTab, newTab => {
  if (newTab === 'mine' && myAuctions.value.length === 0) {
    loadMyAuctions()
  }
  if (newTab === 'mybids' && myBids.value.length === 0) {
    loadMyBids()
  }
  if (newTab === 'all' && allAuctions.value.length === 0) {
    if (allPage.value !== 1) {
      allPage.value = 1
    } else {
      loadAllAuctions()
    }
  }
  updateUrlQueryFromFilters()
})

// Keep URL in sync when filters change
watch([searchQuery, selectedSeries, selectedRarities, selectedOwned, featuredOnly, wishlistOnly], () => {
  updateUrlQueryFromFilters()
}, { deep: true })
watch(sortBy, () => { updateUrlQueryFromFilters() })
watch(allPage, () => {
  if (activeTab.value === 'all') loadAllAuctions()
})

watch(wishlistOnly, value => {
  if (value) loadWishlist()
})

function isEnded(endAt) {
  return new Date(endAt) <= now.value
}

function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return 'ended'
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (hrs > 0)  return `${hrs}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatDate(date) {
  return new Date(date).toLocaleDateString()
}

const wishlistCtoonIdSet = computed(() => new Set(wishlistCtoonIds.value))
const normalizedSearch = computed(() => (searchQuery.value || '').toLowerCase().trim())
const filterSources = computed(() => [
  ...auctions.value,
  ...trendingAuctions.value,
  ...myAuctions.value,
  ...myBids.value,
  ...allAuctions.value
])

function applyCommonFilters(items) {
  const term = normalizedSearch.value
  const seriesFilter = selectedSeries.value
  const rarityFilter = selectedRarities.value
  const ownedFilter = selectedOwned.value
  const requireFeatured = featuredOnly.value
  const requireWishlist = wishlistOnly.value
  const wishlistSet = wishlistCtoonIdSet.value

  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item) return false
    if (term) {
      const nameMatch = (item.name || '').toLowerCase().includes(term)
      const chars = Array.isArray(item.characters) ? item.characters : []
      const charMatch = chars.some(ch => String(ch || '').toLowerCase().includes(term))
      if (!nameMatch && !charMatch) return false
    }
    if (seriesFilter.length && !seriesFilter.includes(item.series)) return false
    if (rarityFilter.length && !rarityFilter.includes(item.rarity)) return false
    if (requireFeatured && !item.isFeatured) return false
    if (ownedFilter === 'owned' && !item.isOwned) return false
    if (ownedFilter === 'unowned' && item.isOwned) return false
    if (requireWishlist) {
      if (!hasLoadedWishlist.value) return false
      if (!wishlistSet.has(item.ctoonId)) return false
    }
    return true
  })
}

const uniqueSeries = computed(() => {
  return [...new Set(filterSources.value.map(a => a.series).filter(Boolean))].sort()
})
const uniqueRarities = computed(() => {
  return [...new Set(filterSources.value.map(a => a.rarity).filter(Boolean))].sort()
})

const filteredAuctions = computed(() => {
  return applyCommonFilters(auctions.value).sort((a, b) => {
    switch (sortBy.value) {
      case 'endAsc':   return new Date(a.endAt) - new Date(b.endAt)
      case 'nameAsc':  return a.name.localeCompare(b.name)
      case 'nameDesc': return b.name.localeCompare(a.name)
      case 'mintAsc':  return (a.mintNumber || 0) - (b.mintNumber || 0)
      case 'mintDesc': return (b.mintNumber || 0) - (a.mintNumber || 0)
      case 'rarity':   return a.rarity.localeCompare(b.rarity)
      default:         return 0
    }
  })
})

const filteredTrendingAuctions = computed(() => applyCommonFilters(trendingAuctions.value))
const filteredMyAuctions = computed(() => applyCommonFilters(myAuctions.value))
const filteredAllAuctions = computed(() => {
  return applyCommonFilters(allAuctions.value).filter(auction => isEnded(auction.endAt))
})
const filteredMyBids = computed(() => applyCommonFilters(myBids.value))

/**
 * My Bids sorting:
 *  - Active auctions first (not ended)
 *  - Within each group, ending soonest first
 */
const sortedMyBids = computed(() => {
  const items = [...filteredMyBids.value]

  switch (myBidsSort.value) {
    case 'recentAsc':
      return items.sort((a, b) => new Date(a.endAt) - new Date(b.endAt))
    case 'biggestBid':
      return items.sort((a, b) => {
        const aBid = a.myBid ?? Number.NEGATIVE_INFINITY
        const bBid = b.myBid ?? Number.NEGATIVE_INFINITY
        if (bBid !== aBid) return bBid - aBid
        return new Date(b.endAt) - new Date(a.endAt)
      })
    case 'recentlyWon':
      return items.sort((a, b) => {
        const aEnded = isEnded(a.endAt)
        const bEnded = isEnded(b.endAt)
        if (aEnded !== bEnded) return aEnded ? -1 : 1
        if (aEnded && bEnded && a.didWin !== b.didWin) return a.didWin ? -1 : 1
        return new Date(b.endAt) - new Date(a.endAt)
      })
    case 'recentlyLost':
      return items.sort((a, b) => {
        const aEnded = isEnded(a.endAt)
        const bEnded = isEnded(b.endAt)
        if (aEnded !== bEnded) return aEnded ? -1 : 1
        if (aEnded && bEnded && a.didWin !== b.didWin) return a.didWin ? 1 : -1
        return new Date(b.endAt) - new Date(a.endAt)
      })
    case 'recentDesc':
    default:
      return items.sort((a, b) => new Date(b.endAt) - new Date(a.endAt))
  }
})
</script>

<style scoped>
/* scrollbar tweaks for filter lists */
::-webkit-scrollbar { width: 6px }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius:3px }
</style>
