<template>
  <Nav />
  <div v-if="ownerIsBooster" class="main"></div>

  <!-- ───────── Mobile Layout ───────── -->

  <!-- Mobile Skeleton -->
  <div
    v-if="loading"
    class="lg:hidden mt-20 md:mt-20 py-6 max-w-6xl mx-auto flex flex-col gap-6 animate-pulse"
  >
    <!-- Owner Section skeleton -->
    <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mx-4">
      <div
        class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t"
      >
        OWNER
      </div>
      <div class="w-14 h-14 rounded-full border border-blue-300 bg-gray-300"></div>
      <div class="flex-1 h-6 bg-gray-300 rounded"></div>
    </div>

    <!-- Top toolbar skeleton (mobile, stacked) -->
    <div class="flex flex-col gap-2 mx-4 mt-2">
      <!-- Row 1: user cZone navigation -->
      <div class="flex gap-2 justify-center">
        <div class="bg-gray-300 h-8 w-28 rounded"></div>
        <div class="bg-gray-300 h-8 w-28 rounded"></div>
        <div class="bg-gray-300 h-8 w-28 rounded"></div>
      </div>

      <!-- Row 2: zone number arrows -->
      <div class="flex items-center justify-center gap-2 mt-2 sm:mt-0">
        <div class="bg-gray-300 h-8 w-10 rounded"></div>
        <div class="bg-gray-300 h-4 w-32 rounded"></div>
        <div class="bg-gray-300 h-8 w-10 rounded"></div>
      </div>
    </div>

    <!-- CZone Canvas skeleton (mobile) -->
    <div class="flex" :class="{ booster: ownerIsBooster }">
      <!-- OUTER: controls layout size to the scaled dimensions -->
      <div :style="outerScaleStyle" class="mb-4">
        <!-- INNER: keeps the true 800x600, just visually scaled -->
        <div :style="scaleStyle">
          <div
            class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto bg-gray-200"
          ></div>
        </div>
      </div>
    </div>

    <!-- Navigation and Points skeleton -->
    <div class="flex justify-between items-center text-sm flex-wrap gap-4 mb-6 mx-4">
      <div class="flex gap-2 flex-wrap">
        <div class="h-8 w-32 bg-gray-300 rounded ml-2"></div>
        <div class="h-8 w-32 bg-gray-300 rounded ml-2"></div>
        <div class="h-8 w-32 bg-gray-300 rounded ml-2"></div>
      </div>
      <div class="h-8 w-32 bg-gray-300 rounded"></div>
    </div>
  </div>

  <!-- Mobile Layout Only (real content) -->
  <div
    v-else
    class="lg:hidden mt-20 md:mt-20 py-6 max-w-6xl mx-auto flex flex-col gap-6"
  >
    <!-- Owner Section -->
    <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mx-4" :class="{ booster: ownerIsBooster }">
      <div
        class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t"
      >
        OWNER
      </div>
      <img
        :src="`/avatars/${ownerAvatar}`"
        alt="Owner Avatar"
        class="w-14 h-14 rounded-full border border-blue-300"
      />
      <div class="text-xl font-semibold text-blue-700" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ ownerName }}</div>
    </div>

    <!-- Top toolbar (mobile, stacked) -->
    <div class="flex flex-col gap-2 mx-4 mt-2">
      <!-- Row 1: user cZone navigation -->
      <div class="flex gap-2 justify-center">
        <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToPreviousUser">
          Previous cZone
        </button>
        <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToRandomUser">
          Random cZone
        </button>
        <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToNextUser">
          Next cZone
        </button>
      </div>

      <!-- Row 2: zone number arrows -->
      <div v-if="hasOtherZones" class="flex items-center justify-center gap-2 mt-2 sm:mt-0">
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
          @click="goToPrevious"
          :disabled="!hasPrevious"
          aria-label="Previous Zone"
        >←</button>
        <span class="text-sm">Zone {{ currentZoneIndex + 1 }} of {{ maxZoneNumber }}</span>
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
          @click="goToNext"
          :disabled="!hasNext"
          aria-label="Next Zone"
        >→</button>
      </div>
    </div>

    <!-- CZone Canvas (mobile) -->
    <div class="flex" :class="{ booster: ownerIsBooster }">
      <!-- OUTER: controls layout size to the scaled dimensions -->
      <div :style="outerScaleStyle" class="mb-4">
        <!-- INNER: keeps the true 800x600, just visually scaled -->
        <div :style="scaleStyle">
          <div
            class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto"
            :style="canvasBackgroundStyle"
          >
            <div class="absolute inset-0">
              <div
                v-for="(item, index) in cZoneItems"
                :key="item.key || index"
                class="absolute"
                :style="item.style"
              >
                <button
                  v-if="item.isSearch"
                  type="button"
                  class="czone-search-ctoon"
                  :class="{ 'opacity-70 cursor-wait': item.isCapturing }"
                  @click="captureCzoneSearchItem(item)"
                >
                  <img :src="item.assetPath" :alt="item.name" class="czone-search-image" />
                </button>
                <CtoonAsset
                  v-else
                  :src="item.assetPath"
                  :alt="item.name"
                  :name="item.name"
                  :ctoon-id="item.ctoonId"
                  :user-ctoon-id="item.id"
                  :is-gtoon="item.isGtoon"
                  :power="item.power"
                  :cost="item.cost"
                  image-class="object-contain cursor-pointer max-w-[initial]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation and Points -->
    <div class="flex justify-between items-center text-sm flex-wrap gap-4 mb-6 mx-4">
      <div class="flex gap-2 flex-wrap">
        <button
          v-if="user?.id !== ownerId"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded ml-2"
          @click="openWishlist"
        >
          View Wishlist ({{ wishlistCountText }})
        </button>
        <button
          v-if="user?.id !== ownerId"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded ml-2"
          @click="openTradeList"
        >
          View Trade List ({{ tradeListCountText }})
        </button>
        <button
          v-if="user?.id !== ownerId"
          @click="goToOfferTrade"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded ml-2"
        >
          Offer Trade
        </button>
        <button
          v-if="user?.id === ownerId"
          @click="navigateTo(editPath)"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded flex items-center gap-1"
        >
          ✏️ Edit cZone
        </button>
      </div>
      <div
        class="bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded shadow text-sm"
      >
        My Points: {{ user?.points ?? 0 }}
      </div>
    </div>
  </div>

  <!-- ───────── Desktop Layout ───────── -->

  <!-- Desktop Skeleton -->
  <div
    v-if="loading"
    class="hidden lg:flex mt-20 md:mt-20 pt-10 px-4 py-6 max-w-6xl mx-auto flex gap-6 animate-pulse"
  >
    <!-- Left Column: Chat and Visitors skeleton -->
    <div class="w-1/3 bg-white rounded-xl shadow-md p-4 flex flex-col">
      <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mb-4">
        <div
          class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t"
        >
          OWNER
        </div>
        <div class="w-14 h-14 rounded-full border border-blue-300 bg-gray-300"></div>
        <div class="flex-1 h-6 bg-gray-300 rounded"></div>
      </div>
      <div class="h-5 w-40 bg-gray-300 rounded mb-2"></div>
      <div
        class="overflow-y-auto border rounded p-2 mb-4 text-sm h-96 flex flex-col-reverse"
      >
        <div class="w-full space-y-2">
          <div
            v-for="i in 6"
            :key="i"
            class="mb-1 flex gap-2 text-sm items-start"
          >
            <div class="w-20 h-4 bg-gray-300 rounded"></div>
            <div class="flex-1 h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
      <div class="flex gap-2 items-center">
        <div class="flex-1 h-9 bg-gray-300 rounded"></div>
        <div class="h-9 w-20 bg-gray-300 rounded"></div>
      </div>
    </div>

    <!-- Right Column: CZone Display skeleton -->
    <div class="min-w-[800px] bg-white rounded-xl shadow-md">
      <div>
        <!-- Top toolbar (desktop) skeleton -->
        <div class="flex items-center justify-between px-4 mt-2 mb-2">
          <div class="flex gap-2">
            <div class="h-8 w-28 bg-gray-300 rounded"></div>
            <div class="h-8 w-28 bg-gray-300 rounded"></div>
            <div class="h-8 w-28 bg-gray-300 rounded"></div>
          </div>

          <div class="flex items-center gap-2">
            <div class="h-8 w-10 bg-gray-300 rounded"></div>
            <div class="h-4 w-32 bg-gray-300 rounded"></div>
            <div class="h-8 w-10 bg-gray-300 rounded"></div>
          </div>
        </div>

        <!-- Fixed-size CZone canvas/display skeleton -->
        <div class="flex justify-center overflow-hidden mb-4">
          <div
            class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto bg-gray-200"
          ></div>
        </div>

        <div class="flex justify-between items-start text-sm mb-6 px-4">
          <!-- Left side: buttons skeleton -->
          <div class="flex flex-col gap-6">
            <div class="flex gap-2">
              <div class="h-8 w-28 bg-gray-300 rounded"></div>
              <div class="h-8 w-32 bg-gray-300 rounded"></div>
              <div class="h-8 w-28 bg-gray-300 rounded"></div>
            </div>
          </div>

          <!-- Right side: points badge skeleton -->
          <div class="h-8 w-32 bg-gray-300 rounded"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Desktop Layout (real content) -->
  <div
    v-else
    class="hidden lg:flex mt-20 md:mt-20 pt-10 px-4 py-6 max-w-6xl mx-auto flex gap-6"
  >
    <!-- Left Column: Chat and Visitors -->
    <div class="w-1/3 bg-white rounded-xl shadow-md p-4 flex flex-col">
      <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mb-4" :class="{ booster: ownerIsBooster }">
        <div
          class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t"
        >
          OWNER
        </div>
        <img
          :src="`/avatars/${ownerAvatar}`"
          alt="Owner Avatar"
          class="w-14 h-14 rounded-full border border-blue-300"
        />
        <div class="text-xl font-semibold text-blue-700"  style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ ownerName }}</div>
      </div>
      <h2 class="text-lg font-bold mb-2">Visitors: {{ visitorCount }}</h2>
      <div
        :ref="(el) => { if (el && chatContainer) chatContainer.value = el }"
        class="overflow-y-auto border rounded p-2 mb-4 text-sm h-96 flex flex-col-reverse"
      >
        <div
          v-for="(msg, index) in [...chatMessages].reverse()"
          :key="index"
          class="mb-1 flex gap-2 text-sm items-start"
        >
          <NuxtLink
            :to="`/czone/${msg.user}`"
            class="czone-chat-user font-bold hover:no-underline no-underline"
          >
            {{ msg.user }}
          </NuxtLink>
          <div class="czone-chat-message flex-1 break-words">{{ msg.message }}</div>
        </div>
      </div>
      <ClientOnly>
        <form @submit.prevent="sendMessage" class="flex gap-2 items-center">
          <select
            v-model="newMessage"
            class="flex-1 border px-2 py-1 rounded text-sm"
          >
            <option value="" disabled selected>Select a message</option>
            <option v-for="msg in predefinedMessages" :key="msg" :value="msg">
              {{ msg }}
            </option>
          </select>
          <button
            type="submit"
            :disabled="!newMessage"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-sm"
          >
            Send
          </button>
        </form>
      </ClientOnly>
    </div>

    <!-- Right Column: CZone Display -->
    <div class="min-w-[800px] bg-white rounded-xl shadow-md">
      <div :class="{ booster: ownerIsBooster }">
        <!-- Top toolbar (desktop) -->
        <div class="flex items-center justify-between px-4 mt-2 mb-2">
          <!-- Left: user cZone navigation -->
          <div class="flex gap-2">
            <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToPreviousUser">
              Previous cZone
            </button>
            <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToRandomUser">
              Random cZone
            </button>
            <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToNextUser">
              Next cZone
            </button>
          </div>

          <!-- Right: zone index arrows -->
          <div v-if="hasOtherZones" class="flex items-center gap-2">
            <button
              class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
              @click="goToPrevious"
              :disabled="!hasPrevious"
              aria-label="Previous Zone"
            >←</button>
            <span class="text-sm">Zone {{ currentZoneIndex + 1 }} of {{ maxZoneNumber }}</span>
            <button
              class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
              @click="goToNext"
              :disabled="!hasNext"
              aria-label="Next Zone"
            >→</button>
          </div>
        </div>
        <div class="flex justify-center overflow-hidden mb-4">
          <div
            class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto"
            :style="canvasBackgroundStyle"
          >
            <!-- Fixed-size CZone canvas/display -->
            <div class="absolute top-0 left-0">
              <div
                v-for="(item, index) in cZoneItems"
                :key="item.key || index"
                class="absolute"
                :style="item.style"
              >
                <button
                  v-if="item.isSearch"
                  type="button"
                  class="czone-search-ctoon"
                  :class="{ 'opacity-70 cursor-wait': item.isCapturing }"
                  @click="captureCzoneSearchItem(item)"
                >
                  <img :src="item.assetPath" :alt="item.name" class="czone-search-image" />
                </button>
                <CtoonAsset
                  v-else
                  :src="item.assetPath"
                  :alt="item.name"
                  :name="item.name"
                  :ctoon-id="item.ctoonId"
                  :user-ctoon-id="item.id"
                  :is-gtoon="item.isGtoon"
                  :power="item.power"
                  :cost="item.cost"
                  image-class="object-contain cursor-pointer max-w-[initial]"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-start text-sm mb-6 px-4">
          <!-- Left side: two vertical groups -->
          <div class="flex flex-col gap-6">
            <!-- Group 2: wishlist / collection / edit -->
            <div class="flex gap-2">
              <button
                v-if="user?.id !== ownerId"
                class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded"
                @click="openWishlist"
              >
                View Wishlist ({{ wishlistCountText }})
              </button>
              <button
                v-if="user?.id !== ownerId"
                class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded"
                @click="openTradeList"
              >
                View Trade List ({{ tradeListCountText }})
              </button>
              <button
                v-if="user?.id !== ownerId"
                @click="goToOfferTrade"
                class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded ml-2"
              >
                Offer Trade
              </button>
              <button
                v-if="user?.id === ownerId"
                @click="navigateTo(editPath)"
                class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded flex items-center gap-1"
              >
                ✏️ Edit cZone
              </button>
            </div>
          </div>

          <!-- Right side: points badge -->
          <div class="bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded shadow text-sm">
            My Points: {{ user?.points ?? 0 }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Wishlist modal -->
  <transition name="fade">
    <div
      v-if="wishlistModalVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/50 overflow-y-auto p-4"
    >
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <button
          class="absolute top-3 right-3 text-gray-500 hover:text-black"
          @click="closeWishlist"
        >✕</button>
        <h2 class="text-xl font-semibold mb-4">🎁 {{ ownerName }}’s Wishlist</h2>

        <div v-if="isLoadingWishlist" class="text-center py-10">
          Loading…
        </div>
        <div v-else-if="wishlistCtoons.length === 0" class="text-center py-10">
          No cToons on their wishlist.
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="item in wishlistCtoons"
            :key="item.ctoon.id"
            class="flex flex-col items-center border rounded p-2"
          >
            <CtoonAsset
              :src="item.ctoon.assetPath"
              :alt="item.ctoon.name"
              :name="item.ctoon.name"
              :ctoon-id="item.ctoon.id"
              :is-gtoon="item.ctoon.isGtoon"
              :power="item.ctoon.power"
              :cost="item.ctoon.cost"
              image-class="w-20 h-20 object-contain mb-2"
            />
            <p class="text-sm text-center">{{ item.ctoon.name }}</p>
            <p class="text-xs text-gray-600 mt-1">Offer: {{ item.offeredPoints }} pts</p>
            <p class="text-xs text-gray-600 mt-1">
              You own: {{ item.viewerOwnedCount || 0 }} {{ (item.viewerOwnedCount || 0) === 1 ? 'copy' : 'copies' }}
            </p>
            <p
              v-if="(item.viewerOwnedCount || 0) > 0 && item.viewerTradeMintNumber !== null && item.viewerTradeMintNumber !== undefined"
              class="text-xs text-gray-600"
            >
              Send your highest mint: #{{ item.viewerTradeMintNumber }}
            </p>
            <p
              v-else-if="(item.viewerOwnedCount || 0) > 0"
              class="text-xs text-gray-600"
            >
              Highest mint to trade: none (no mint #, newest copy traded)
            </p>
            <p
              v-else
              class="text-xs text-gray-600"
            >
              Trade disabled: you do not own this cToon.
            </p>

            <button
              class="mt-2 w-full px-3 py-1 rounded text-white text-sm"
              :class="item.hasEnough && (item.viewerOwnedCount || 0) > 0 ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'"
              :disabled="!item.hasEnough || (item.viewerOwnedCount || 0) === 0 || isProcessingWishlistTrade"
              @click="onClickWishlistTrade(item)"
            >
              Trade for {{ item.offeredPoints }} points
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
  <!-- Trade List modal -->
  <transition name="fade">
    <div
      v-if="tradeListModalVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/50 overflow-y-auto p-4"
    >
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <button
          class="absolute top-3 right-3 text-gray-500 hover:text-black"
          @click="closeTradeList"
        >✕</button>
        <h2 class="text-xl font-semibold mb-4">{{ ownerName }}’s Trade List</h2>

        <div v-if="isLoadingTradeList" class="text-center py-10">
          Loading…
        </div>
        <div v-else-if="tradeListCtoons.length === 0" class="text-center py-10">
          No cToons on their trade list.
        </div>
        <div v-else class="grid grid-cols-2 gap-4">
          <div
            v-for="item in tradeListCtoons"
            :key="item.userCtoonId"
            class="flex flex-col items-center border rounded p-2"
          >
            <CtoonAsset
              :src="item.assetPath"
              :alt="item.name"
              :name="item.name"
              :ctoon-id="item.ctoonId"
              :user-ctoon-id="item.userCtoonId"
              :is-gtoon="item.isGtoon"
              :power="item.power"
              :cost="item.cost"
              image-class="w-20 h-20 object-contain mb-2"
            />
            <p class="text-sm text-center">{{ item.name }}</p>
            <p class="text-xs text-gray-600 mt-1">Mint #{{ item.mintNumber ?? 'N/A' }}</p>
          </div>
        </div>
      </div>
    </div>
  </transition>
  <!-- Collection & Trade Modal -->
  <transition name="fade">
    <div
      v-if="collectionModalVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/50 p-4"
    >
      <div
        class="relative bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 flex flex-col max-h-[80vh]"
      >
        <!-- Close button -->
        <button
          class="absolute top-3 right-3 text-gray-500 hover:text-black"
          @click="closeCollection"
        >
          ✕
        </button>

        <!-- Header -->
        <h2 class="text-xl font-semibold mb-4">
          {{ tradeStep === 1 ? `${ownerName}’s Collection` : 'Your Collection' }}
        </h2>

        <!-- ─── Scrollable content ─── -->
        <div class="flex-1 overflow-y-auto">
          <!-- STEP 1: Select target’s cToons -->
          <div v-if="tradeStep === 1">
            <div v-if="isLoadingCollection" class="text-center py-10">Loading…</div>
            <div v-else-if="collectionCtoons.length === 0" class="text-center py-10">
              No cToons in their collection.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                v-for="c in sortedCollectionCtoons"
                :key="c.id"
                @click="selectTargetCtoon(c)"
                class="relative flex flex-col items-center p-2 cursor-pointer border rounded hover:shadow"
                :class="selectedTargetCtoons.includes(c) ? 'border-indigo-500 bg-indigo-50' : ''"
              >
                <span
                  class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full"
                  :class="selfOwnedIds.has(c.ctoonId)
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-200 text-gray-600'"
                >
                  {{ selfOwnedIds.has(c.ctoonId) ? 'Owned' : 'Unowned' }}
                </span>

                <CtoonAsset
                  :src="c.assetPath"
                  :alt="c.name"
                  :name="c.name"
                  :ctoon-id="c.ctoonId"
                  :user-ctoon-id="c.id"
                  :is-gtoon="c.isGtoon"
                  :power="c.power"
                  :cost="c.cost"
                  image-class="w-16 h-16 object-contain mb-2 mt-8"
                  stop-propagation
                />
                <p class="text-sm text-center">{{ c.name }}</p>
                <p class="text-xs text-gray-600">{{ c.rarity }}</p>
                <p class="text-xs text-gray-600">
                  Mint #{{ c.mintNumber }} of {{ c.quantity !== null ? c.quantity : 'Unlimited' }}
                </p>
                <p class="text-xs text-gray-600">
                  {{ c.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
                </p>
              </div>
            </div>
            <div v-if="tradeStep === 1"
              class="absolute bottom-0 left-0 right-0 border-t bg-white px-6 py-4 text-right"
            >
              <button
                :disabled="!selectedTargetCtoons.length"
                @click="startTrade"
                class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Create Trade
              </button>
            </div>
          </div>

          <!-- STEP 2: Select your cToons + points -->
          <div v-else>
            <div v-if="isLoadingSelfCollection" class="text-center py-10">Loading…</div>
            <div v-else-if="selfCtoons.length === 0" class="text-center py-10">
              You have no cToons to trade.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div
                v-for="c in sortedSelfCtoons"
                :key="c.id"
                @click="selectInitiatorCtoon(c)"
                :class="[
                  'relative flex flex-col items-center p-2 cursor-pointer border rounded',
                  selectedInitiatorCtoons.includes(c)
                    ? 'border-green-500 bg-green-100'
                    : ''
                ]"
              >
                <span
                  class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full"
                  :class="targetOwnedIds.has(c.ctoonId)
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-200 text-gray-600'"
                >
                  {{ targetOwnedIds.has(c.ctoonId) ? 'Owned by Owner' : 'Unowned by Owner' }}
                </span>

                <CtoonAsset
                  :src="c.assetPath"
                  :alt="c.name"
                  :name="c.name"
                  :ctoon-id="c.ctoonId"
                  :user-ctoon-id="c.id"
                  :is-gtoon="c.isGtoon"
                  :power="c.power"
                  :cost="c.cost"
                  image-class="w-16 h-16 object-contain mb-1 mt-8"
                  stop-propagation
                />
                <p class="text-sm text-center">{{ c.name }}</p>
                <p class="text-xs text-gray-600">{{ c.rarity }}</p>
                <p class="text-xs text-gray-600">
                  Mint #{{ c.mintNumber }} of {{ c.quantity !== null ? c.quantity : 'Unlimited' }}
                </p>
                <p class="text-xs text-gray-600">
                  {{ c.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ─── Fixed footer (only on Step 2) ─── -->
        <div
          v-if="tradeStep === 2"
          class="mt-4 pt-4 border-t flex items-center justify-between bg-white"
        >
          <div>
            Points to Offer
            <input
              type="number"
              v-model.number="pointsToOffer"
              :max="user?.points || 0"
              min="0"
              @input="pointsToOffer = Math.max(0, pointsToOffer)"
              placeholder="Points"
              class="border px-2 py-1 rounded w-24"
            />
          </div>
          <button
            :disabled="pointsToOffer < 0 || (selectedInitiatorCtoons.length === 0 && pointsToOffer === 0)"
            @click="sendOffer"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Send Offer
          </button>
        </div>
      </div>
    </div>
  </transition>

  <!-- Capture modal -->
  <transition name="fade">
    <div
      v-if="captureModalVisible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="closeCaptureModal"
    >
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-md max-h-[90vh] flex flex-col">
        <div class="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">cToon Captured</h2>
          <button class="text-gray-500 hover:text-black" @click="closeCaptureModal">✕</button>
        </div>
        <div class="p-4 overflow-y-auto flex-1">
          <div v-if="capturedCtoon" class="space-y-4">
            <img
              :src="capturedCtoon.assetPath"
              :alt="capturedCtoon.name || 'Captured cToon'"
              class="w-full max-h-56 object-contain rounded"
            />
            <div class="space-y-1 text-sm">
              <div><span class="text-gray-500">Name:</span> <span class="font-medium">{{ capturedCtoon.name || '—' }}</span></div>
              <div><span class="text-gray-500">Rarity:</span> <span class="font-medium">{{ capturedCtoon.rarity || '—' }}</span></div>
              <div><span class="text-gray-500">Series:</span> <span class="font-medium">{{ capturedCtoon.series || '—' }}</span></div>
              <div><span class="text-gray-500">Set:</span> <span class="font-medium">{{ capturedCtoon.set || '—' }}</span></div>
            </div>
          </div>
        </div>
        <div class="px-4 py-3 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700" @click="closeCaptureModal">Close</button>
        </div>
      </div>
    </div>
  </transition>

  <!-- Toast -->
  <Toast
    v-if="showToast"
    :message="toastMessage"
    :type="toastType"
  />
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import { useAuth } from '@/composables/useAuth'
import { useCtoonModal } from '@/composables/useCtoonModal'
import AddToWishlist from '@/components/AddToWishlist.vue'
import CtoonAsset from '@/components/CtoonAsset.vue'
import Toast from '@/components/Toast.vue'
import Nav from '@/components/Nav.vue'

definePageMeta({
  title: route => {
    const raw = route.params.username
    const name = typeof raw === 'string' ? raw : (Array.isArray(raw) ? raw[0] : '')
    return name ? `${name}'s cZone` : 'cZone'
  },
  middleware: 'auth',
  layout: 'default',
  // Force a fresh instance per path to avoid reuse/flicker (stable, encoded)
  key: route => route.path
})

function bgUrl(v) {
  if (!v) return ''
  const s = String(v)
  if (/^(https?:)?\/\//.test(s) || s.startsWith('/')) return s
  return `/backgrounds/${s}`
}

// ——— Scale logic for mobile ———
const scale = ref(1)
const recalcScale = () => {
  const gutter = 32 // account for page padding
  scale.value = Math.min(1, (window.innerWidth - gutter) / CANVAS_W)
}
const CANVAS_W = 800
const CANVAS_H = 600

const outerScaleStyle = computed(() => ({
  width: `${CANVAS_W * scale.value}px`,
  height: `${CANVAS_H * scale.value}px`,
  position: 'relative',
  overflow: 'hidden',
  margin: '0 auto'
}))

// apply the transform to the inner wrapper, not the outer
const scaleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`
}))

// ——— Routing + Auth ———
const route = useRoute()
const router = useRouter()
const username = ref(route.params.username)
const { user, fetchSelf } = useAuth()
const { setContext, clearContext, holidaySignal, holidayRedeem } = useCtoonModal()

// ——— Loading indicator ———
const loading = ref(true)

// ——— Owner & chat state ———
const ownerName = ref(username.value)
const ownerIsBooster = ref(false)
const ownerAvatar = ref('/avatars/default.png')
const ownerId = ref(null)
const visitorCount = ref(0)
const chatMessages = ref([])
const newMessage = ref('')
const chatContainer = ref(null)

// —— Trade modal state ——
const collectionModalVisible     = ref(false)
const tradeStep                  = ref(1)      // 1 = select target’s, 2 = select yours
const collectionCtoons           = ref([])
const isLoadingCollection        = ref(false)
const selectedTargetCtoons       = ref([])
const selfCtoons                 = ref([])
const isLoadingSelfCollection    = ref(false)
const isLoadingSelf              = ref(false)
const selectedInitiatorCtoons    = ref([])
const pointsToOffer              = ref(0)

const showToast        = ref(false)
const toastMessage     = ref('')
const toastType        = ref('success') // 'success' or 'error'

const captureModalVisible = ref(false)
const capturedCtoon = ref(null)

const isOwnerViewing = computed(() => user.value?.id === ownerId.value)

watch(ownerIsBooster, (isBooster) => {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('booster-bg', !!isBooster)
}, { immediate: true })

function displayToast(message, type = 'success') {
  toastMessage.value = message
  toastType.value    = type
  showToast.value    = true
  setTimeout(() => {
    showToast.value = false
  }, 4000)
}

function closeCaptureModal() {
  captureModalVisible.value = false
  capturedCtoon.value = null
}

watch([isOwnerViewing, username], () => {
  setContext({ source: 'czone', isOwner: isOwnerViewing.value, username: username.value })
}, { immediate: true })

watch(holidaySignal, async () => {
  if (holidayRedeem.value?.reward?.name) {
    displayToast(`Opened! You received ${holidayRedeem.value.reward.name} 🎉`, 'success')
  }
  await loadCzone()
})

async function loadCzone({ showLoading = false, awardVisit = false } = {}) {
  if (showLoading) loading.value = true
  try {
    const res = await $fetch(`/api/czone/${username.value}`)
    ownerName.value = res.ownerName
    ownerIsBooster.value = res.isBooster
    ownerAvatar.value = res.avatar || '/avatars/default.png'
    ownerId.value = res.ownerId

    if (res.cZone?.zones && Array.isArray(res.cZone.zones) && res.cZone.zones.length >= 1) {
      zones.value = res.cZone.zones.map(z => ({
        background: typeof z.background === 'string' ? z.background : '',
        toons: Array.isArray(z.toons) ? z.toons : []
      }))
    } else {
      zones.value = [
        { background: res.cZone?.background || '', toons: res.cZone?.layoutData || [] },
        { background: '', toons: [] },
        { background: '', toons: [] }
      ]
    }

    if (currentZoneIndex.value > zones.value.length - 1) {
      currentZoneIndex.value = zones.value.length - 1
    }

    if (awardVisit && user.value && res.ownerId !== user.value.id) {
      await $fetch('/api/points/visit', {
        method: 'POST',
        body: { zoneOwnerId: res.ownerId }
      })
      await fetchSelf({ force: true })
    }
  } catch (err) {
    console.error('Failed to fetch cZone:', err)
    zones.value = [
      { background: '', toons: [] },
      { background: '', toons: [] },
      { background: '', toons: [] }
    ]
    ownerAvatar.value = '/avatars/default.png'
  } finally {
    if (showLoading) loading.value = false
  }
}

// —— Load someone’s collection ——
async function loadCollection(userToLoad) {
  isLoadingCollection.value = true
  collectionCtoons.value     = await $fetch(`/api/collection/${userToLoad}`)
  isLoadingCollection.value = false
}

// —— Open / reset ——
function openCollection() {
  tradeStep.value              = 1
  selectedTargetCtoons.value   = []
  loadCollection(username.value)
  loadSelfCollection()
  collectionModalVisible.value = true
}
function closeCollection() {
  collectionModalVisible.value = false
  tradeStep.value              = 1
}

const isProcessingWishlistTrade = ref(false)

async function onClickWishlistTrade(item) {
  if (!item?.hasEnough || (item?.viewerOwnedCount || 0) === 0 || isProcessingWishlistTrade.value) return
  isProcessingWishlistTrade.value = true

  try {
    // optimistic remove from UI
    const prev = [...wishlistCtoons.value]
    wishlistCtoons.value = prev.filter(w => w.id !== item.id)

    await $fetch(`/api/wishlist/accept/${item.id}`, {
      method: 'POST',
      body: { wishlistItemId: item.id }
    })

    displayToast('Trade completed.', 'success', 4000)

    // refresh viewer points and the wishlist from server
    await fetchSelf({ force: true })
    await loadUserWishlist()
  } catch (err) {
    displayToast(err?.data?.message || 'Failed to complete trade.', 'error', 5000)
    // ensure UI is in sync with server on failure
    await loadUserWishlist()
  } finally {
    isProcessingWishlistTrade.value = false
  }
}

// —— Select/deselect target’s cToon ——
function selectTargetCtoon(ct) {
  const idx = selectedTargetCtoons.value.findIndex(t => t.id === ct.id)
  if (idx >= 0) selectedTargetCtoons.value.splice(idx, 1)
  else selectedTargetCtoons.value.push(ct)
}

// —— Move to step 2 —— 
function startTrade() {
  tradeStep.value             = 2
  selectedInitiatorCtoons.value = []
  pointsToOffer.value         = 0
  loadSelfCollection()
}

// fetch the viewing user’s own collection
async function loadSelfCollection() {
  isLoadingSelf.value = true
  isLoadingSelfCollection.value = true
  selfCtoons.value    = await $fetch(`/api/collection/${user.value.username}`)
  isLoadingSelf.value = false
  isLoadingSelfCollection.value = false
}

// a Set of ctoonIds the viewer owns
const selfOwnedIds = computed(() =>
  new Set(selfCtoons.value.map(sc => sc.ctoonId))
)

const targetOwnedIds = computed(() =>
  new Set(collectionCtoons.value.map(ct => ct.ctoonId))
)

// —— Select/deselect your cToon ——
function selectInitiatorCtoon(ct) {
  const idx = selectedInitiatorCtoons.value.findIndex(t => t.id === ct.id)
  if (idx >= 0) selectedInitiatorCtoons.value.splice(idx, 1)
  else selectedInitiatorCtoons.value.push(ct)
}

function goToOfferTrade() {
  const uname = String(route.params.username || '').trim()
  if (!uname) return
  router.push(`/create-trade/${encodeURIComponent(uname)}`)
}

// ——— Zones state ———
const zones = ref([
  { background: '', toons: [] },
  { background: '', toons: [] },
  { background: '', toons: [] }
])

const czoneSearchItems = ref([])
const SEARCH_TOON_SIZE = 140

const wishlistModalVisible  = ref(false)
const wishlistCtoons        = ref([])
const isLoadingWishlist     = ref(false)
const hasLoadedWishlist     = ref(false)
const wishlistCount         = ref(0)
const isLoadingWishlistCount = ref(false)
const hasLoadedWishlistCount = ref(false)
const tradeListModalVisible = ref(false)
const tradeListCtoons       = ref([])
const isLoadingTradeList    = ref(false)
const hasLoadedTradeList    = ref(false)

async function loadUserWishlist() {
  isLoadingWishlist.value = true
  try {
    wishlistCtoons.value = await $fetch(`/api/wishlist/users/${username.value}`)
    wishlistCount.value = Array.isArray(wishlistCtoons.value) ? wishlistCtoons.value.length : 0
    hasLoadedWishlistCount.value = true
  } catch (err) {
    wishlistCtoons.value = []
    wishlistCount.value = 0
  } finally {
    isLoadingWishlist.value = false
    hasLoadedWishlist.value = true
  }
}

async function loadUserWishlistCount() {
  isLoadingWishlistCount.value = true
  try {
    const res = await $fetch(`/api/wishlist/users/${username.value}/count`)
    wishlistCount.value = Number(res?.count ?? 0)
  } catch (err) {
    wishlistCount.value = 0
  } finally {
    isLoadingWishlistCount.value = false
    hasLoadedWishlistCount.value = true
  }
}

async function loadUserTradeList() {
  isLoadingTradeList.value = true
  try {
    tradeListCtoons.value = await $fetch(`/api/trade-list/users/${username.value}`)
  } catch (err) {
    tradeListCtoons.value = []
  } finally {
    isLoadingTradeList.value = false
    hasLoadedTradeList.value = true
  }
}

function openWishlist() {
  loadUserWishlist()
  wishlistModalVisible.value = true
}
function closeWishlist() {
  wishlistModalVisible.value = false
}

const wishlistCountText = computed(() => {
  if (!hasLoadedWishlist.value && isLoadingWishlist.value) return '...'
  if (hasLoadedWishlist.value) return String(wishlistCtoons.value.length)
  if (!hasLoadedWishlistCount.value && isLoadingWishlistCount.value) return '...'
  if (hasLoadedWishlistCount.value) return String(wishlistCount.value)
  return '0'
})

function openTradeList() {
  loadUserTradeList()
  tradeListModalVisible.value = true
}
function closeTradeList() {
  tradeListModalVisible.value = false
}

const tradeListCountText = computed(() => {
  if (!hasLoadedTradeList.value && isLoadingTradeList.value) return '...'
  if (!hasLoadedTradeList.value) return '0'
  return String(tradeListCtoons.value.length)
})

// Which zone index is currently displayed
const currentZoneIndex = ref(0)
const currentZone = computed(() => zones.value[currentZoneIndex.value])
const maxZoneNumber = computed(() => {
  let max = 1
  zones.value.forEach((zone, idx) => {
    if (Array.isArray(zone.toons) && zone.toons.length > 0) {
      max = Math.max(max, idx + 1)
    }
  })
  return max
})

function randomSearchPosition(size) {
  const maxX = Math.max(0, CANVAS_W - size)
  const maxY = Math.max(0, CANVAS_H - size)
  return {
    x: Math.floor(Math.random() * (maxX + 1)),
    y: Math.floor(Math.random() * (maxY + 1))
  }
}

function buildSearchItems(items) {
  return items.map((entry) => {
    const size = SEARCH_TOON_SIZE
    const pos = randomSearchPosition(size)
    return {
      appearanceId: entry.appearanceId,
      cZoneSearchId: entry.cZoneSearchId,
      ctoonId: entry.ctoon?.id,
      name: entry.ctoon?.name || 'cToon',
      assetPath: entry.ctoon?.assetPath,
      rarity: entry.ctoon?.rarity,
      x: pos.x,
      y: pos.y,
      size,
      isCapturing: false,
      key: `search-${entry.appearanceId}`
    }
  }).filter(item => item.ctoonId && item.assetPath)
}

async function loadCzoneSearchItems() {
  czoneSearchItems.value = []
  if (!user.value?.id || !ownerId.value) return
  if (user.value.id === ownerId.value) return
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const res = await $fetch(`/api/czone/${username.value}/searches`, {
      query: { tz, zoneIndex: currentZoneIndex.value }
    })
    const items = Array.isArray(res?.items) ? res.items : []
    czoneSearchItems.value = buildSearchItems(items)
  } catch (err) {
    console.error('Failed to load cZone Search items', err)
    czoneSearchItems.value = []
  }
}

async function captureCzoneSearchItem(item) {
  if (!item || item.isCapturing) return
  item.isCapturing = true
  try {
    const res = await $fetch('/api/czone/searches/capture', {
      method: 'POST',
      body: { appearanceId: item.appearanceId }
    })
    const name = res?.ctoon?.name || item.name
    displayToast(`Captured ${name}!`, 'success')
    capturedCtoon.value = res?.ctoon ? { ...res.ctoon } : {
      name: item.name,
      assetPath: item.assetPath,
      rarity: item.rarity,
      series: item.series,
      set: item.set
    }
    captureModalVisible.value = true
    czoneSearchItems.value = czoneSearchItems.value.filter(i => i.appearanceId !== item.appearanceId)
  } catch (err) {
    const message = err?.data?.statusMessage || 'Failed to capture cToon.'
    displayToast(message, 'error')
    if (String(message).toLowerCase().includes('already')) {
      czoneSearchItems.value = czoneSearchItems.value.filter(i => i.appearanceId !== item.appearanceId)
      return
    }
    item.isCapturing = false
  }
}

// Build a list of “renderable” cToon items for the current zone
// (Expose indices so we can update the clicked slot later)
const cZoneItems = computed(() => {
  const zidx = currentZoneIndex.value
  const baseItems = (currentZone.value.toons || []).map((item, idx) => ({
    ...item,
    style: `top: ${item.y}px; left: ${item.x}px; width: ${item.width}px; height: ${item.height}px;`,
    __zoneIndex: zidx,
    __itemIndex: idx
  }))
  if (zidx !== 0 || !czoneSearchItems.value.length) return baseItems
  const searchItems = czoneSearchItems.value.map((item, idx) => ({
    ...item,
    isSearch: true,
    style: `top: ${item.y}px; left: ${item.x}px; width: ${item.size}px; height: ${item.size}px; z-index: 60;`,
    __zoneIndex: zidx,
    __itemIndex: idx
  }))
  return [...baseItems, ...searchItems]
})

// ——— Show arrows only if another zone (besides the current one) has ≥1 toon ———
const hasOtherZones = computed(() => {
  return zones.value.some((zone, idx) => {
    return idx !== currentZoneIndex.value
      && Array.isArray(zone.toons)
      && zone.toons.length > 0
  })
})

// Helper booleans for “Next” / “Previous” arrow enable/disable
const hasNext = computed(() => {
  for (let i = currentZoneIndex.value + 1; i < zones.value.length; i++) {
    if (zones.value[i].toons.length > 0) return true
  }
  return false
})
const hasPrevious = computed(() => {
  for (let i = currentZoneIndex.value - 1; i >= 0; i--) {
    if (zones.value[i].toons.length > 0) return true
  }
  return false
})

// Functions to advance to the next/previous non‐empty zone
function goToNext() {
  for (let i = currentZoneIndex.value + 1; i < zones.value.length; i++) {
    if (zones.value[i].toons.length > 0) {
      currentZoneIndex.value = i
      return
    }
  }
}
function goToPrevious() {
  for (let i = currentZoneIndex.value - 1; i >= 0; i--) {
    if (zones.value[i].toons.length > 0) {
      currentZoneIndex.value = i
      return
    }
  }
}
function goToRandom() {
  const nonEmpty = zones.value
    .map((z, idx) => (z.toons.length > 0 ? idx : -1))
    .filter(idx => idx >= 0)
  if (nonEmpty.length > 0) {
    currentZoneIndex.value =
      nonEmpty[Math.floor(Math.random() * nonEmpty.length)]
  }
}

// ——— Chat/send logic ———
const predefinedMessages = [
  'Cool cZone!', 'Love your cToons!', 'Nice layout!', 'Wow!', 'Awesome collection!',
  'Want to trade?', 'Thanks!', "You're Welcome :-)", 'This place rocks!', 'So nostalgic!',
  'Love the vibe here!', 'Totally bringing back memories!', 'Such a clean setup!',
  'You’ve got style!', 'Trade you a rare for this one?', 'This collection is fire!',
  'Whoa, didn’t expect that one!', 'Classic combo!', 'Can’t stop looking at these!',
  'Great theme!', 'I need that cToon!', "You're a collector pro!", 'Impressive layout!',
  'Cartoon goals right here!', 'This gave me chills!', 'Super unique choices!',
  'Totally underrated!', 'I wish I had this setup!', 'Nice flex!', "You're a legend!",
  '10/10 would visit again!', 'Mind if I screenshot this?', 'One word: EPIC!'
]
const socket = io(import.meta.env.PROD
  ? undefined
  : `http://localhost:${useRuntimeConfig().public.socketPort}`
)

function sendMessage() {
  if (!user.value || !socket) return
  const msg = {
    zone: username.value,
    user: user.value.username,
    message: newMessage.value
  }
  socket.emit('chat-message', msg)
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
  newMessage.value = ''
}

// ——— Per‐user cZone navigation (Previous/Next/Random viewer) ———
async function goToPreviousUser() {
  try {
    const res = await $fetch(`/api/czone/${username.value}/previous`)
    if (res?.username) {
      router.push(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch previous user:', err)
  }
}
async function goToNextUser() {
  try {
    const res = await $fetch(`/api/czone/${username.value}/next`)
    if (res?.username) {
      router.push(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch next user:', err)
  }
}
async function goToRandomUser() {
  try {
    const res = await $fetch(`/api/czone/${username.value}/random`)
    if (res?.username) {
      router.push(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch random user:', err)
  }
}

const editPath = computed(() => `/edit`)

const canvasBackgroundStyle = computed(() => {
  const src = bgUrl(currentZone.value.background)
  if (!src) return { backgroundColor: 'transparent' }
  return {
    backgroundImage: `url('${src}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
})

// STEP 1: Sort the other user’s collection so Unowned come first
const sortedCollectionCtoons = computed(() => {
  return [...collectionCtoons.value].sort((a, b) => {
    const aOwned = selfOwnedIds.value.has(a.ctoonId)
    const bOwned = selfOwnedIds.value.has(b.ctoonId)
    return (aOwned === bOwned) ? 0 : (aOwned ? 1 : -1)
  })
})

// STEP 2: Sort your own collection so “Unowned by Owner” first
const sortedSelfCtoons = computed(() => {
  return [...selfCtoons.value].sort((a, b) => {
    const aOwnedByOwner = targetOwnedIds.value.has(a.ctoonId)
    const bOwnedByOwner = targetOwnedIds.value.has(b.ctoonId)
    return (aOwnedByOwner === bOwnedByOwner) ? 0 : (aOwnedByOwner ? 1 : -1)
  })
})

onMounted(async () => {
  recalcScale()
  window.addEventListener('resize', recalcScale)

  await fetchSelf({ force: true })

  await loadCzone({ showLoading: true, awardVisit: true })
  await loadCzoneSearchItems()
  loadUserWishlistCount()
  loadUserTradeList()

  // socket listeners
  socket.emit('join-zone', { zone: username.value })
  socket.on('visitor-count', count => {
    visitorCount.value = count
  })
  socket.on('chat-message', msg => {
    chatMessages.value.push(msg)
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
})

onBeforeUnmount(() => {
  if (socket && username.value) {
    socket.emit('leave-zone', { zone: username.value })
  }
  window.removeEventListener('resize', recalcScale)
  document.body.classList.remove('booster-bg')
  clearContext()
})

// With definePageMeta key forcing remount per username, the route-change
// watcher is no longer needed. onMounted/onBeforeUnmount handle lifecycle.
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from {
  transform: translateX(100%);
}
.slide-leave-to {
  transform: translateX(100%);
}
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.3s ease;
}
.slide-panel-enter-from {
  transform: translateX(100%);
}
.slide-panel-leave-to {
  transform: translateX(100%);
}

/* Chat text colors */
.czone-chat-user {
  color: #4338ca;
  display: inline-block;
  width: 11ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.czone-chat-message {
  color: #1f2937;
}

.czone-search-ctoon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.czone-search-ctoon::before {
  content: '';
  position: absolute;
  inset: -14px;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.75) 0%, rgba(255, 215, 0, 0.15) 55%, rgba(255, 215, 0, 0) 70%);
  border-radius: 50%;
  filter: blur(2px);
  animation: czone-search-pulse 2.6s ease-in-out infinite;
  z-index: 0;
}
.czone-search-image {
  position: relative;
  z-index: 1;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
}

@keyframes czone-search-pulse {
  0% { transform: scale(0.9); opacity: 0.65; }
  50% { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.65; }
}

/* Dark‐mode overrides when ownerIsBooster toggles body.booster-bg */
  .booster-bg {
    background-color: #121212;
    color: #e0e0e0;
  }

  /* Utility overrides */
  .booster-bg .bg-white           { background-color: #1a1a1a !important; }
  .booster-bg .rounded-xl         { background-color: #1a1a1a !important; }
  .booster-bg .shadow-md          { box-shadow: none !important; }
  .booster-bg .border-gray-300    { border-color: #444 !important; }
  .booster-bg .border-blue-500    { border-color: #555 !important; }
  .booster-bg .text-black         { color: #ccc !important; }
  .booster-bg .text-gray-600      { color: #aaa !important; }
  .booster-bg .bg-gray-200        { background-color: #2a2a2a !important; }
  .booster-bg .bg-gray-300        { background-color: #333 !important; }
  .booster-bg .bg-indigo-100      { background-color: #222 !important; }
  .booster-bg .bg-indigo-500,
  .booster-bg .bg-indigo-600      { background-color: #333 !important; }

  .booster-bg .czone-chat-user {
    color: #c7d2fe;
  }
  .booster-bg .czone-chat-message {
    color: #e5e7eb;
  }
  /* Owner’s username (was text-blue-700) */
  .booster-bg .text-blue-700 {
    color: #ffffff !important;
  }

  /* “My Points” badge (was text-indigo-800) */
  .booster-bg .text-indigo-800 {
    color: #ffffff !important;
  }

  /* Form controls */
  .booster-bg button,
  .booster-bg input,
  .booster-bg select {
    background-color: #2a2a2a !important;
    color: #eee !important;
    border-color: #555 !important;
  }

  /* Animated golden glow on booster elements */
   .booster {
    position: relative;
    z-index: 1;
    border: 2px solid #ffd700 !important;
    background-clip: padding-box;
    animation: booster-glow 3s ease-in-out infinite !important;
  }

  @keyframes booster-glow {
    0%, 100% {
      box-shadow:
        0 0 8px 2px rgba(255, 215, 0, 0.6),
        0 0 0 4px rgba(255, 215, 0, 0.2);
    }
    50% {
      box-shadow:
        0 0 20px 6px rgba(255, 215, 0, 0.9),
        0 0 0 8px rgba(255, 215, 0, 0.3);
    }
  }

  .main {
    position: fixed;
    top: 50%;
    left: 50%;
    height: 1px;
    width: 1px;
    background-color: #fff;
    border-radius: 50%;
    box-shadow: -42vw -4vh 0px 0px #fff,25vw -41vh 0px 0px #fff,-20vw 49vh 0px 1px #fff,5vw 40vh 1px 1px #fff,29vw 19vh 1px 0px #fff,-44vw -13vh 0px 0px #fff,46vw 41vh 0px 1px #fff,-3vw -45vh 0px 1px #fff,47vw 35vh 1px 0px #fff,12vw -8vh 1px 0px #fff,-34vw 48vh 1px 1px #fff,32vw 26vh 1px 1px #fff,32vw -41vh 1px 1px #fff,0vw 37vh 1px 1px #fff,34vw -26vh 1px 0px #fff,-14vw -49vh 1px 0px #fff,-12vw 45vh 0px 1px #fff,-44vw -33vh 0px 1px #fff,-13vw 41vh 0px 0px #fff,-36vw -11vh 0px 1px #fff,-23vw -24vh 1px 0px #fff,-38vw -27vh 0px 1px #fff,16vw -19vh 0px 0px #fff,28vw 33vh 1px 0px #fff,-49vw -4vh 0px 0px #fff,16vw 32vh 0px 1px #fff,36vw -18vh 1px 0px #fff,-25vw -30vh 1px 0px #fff,-23vw 24vh 0px 1px #fff,-2vw -35vh 1px 1px #fff,-25vw 9vh 0px 0px #fff,-15vw -34vh 0px 0px #fff,-8vw -19vh 1px 0px #fff,-20vw -20vh 1px 1px #fff,42vw 50vh 0px 1px #fff,-32vw 10vh 1px 0px #fff,-23vw -17vh 0px 0px #fff,44vw 15vh 1px 0px #fff,-40vw 33vh 1px 1px #fff,-43vw 8vh 0px 0px #fff,-48vw -15vh 1px 1px #fff,-24vw 17vh 0px 0px #fff,-31vw 50vh 1px 0px #fff,36vw -38vh 0px 1px #fff,-7vw 48vh 0px 0px #fff,15vw -32vh 0px 0px #fff,29vw -41vh 0px 0px #fff,2vw 37vh 1px 0px #fff,7vw -40vh 1px 1px #fff,15vw 18vh 0px 0px #fff,25vw -13vh 1px 1px #fff,-46vw -12vh 1px 1px #fff,-18vw 22vh 0px 0px #fff,23vw -9vh 1px 0px #fff,50vw 12vh 0px 1px #fff,45vw 2vh 0px 0px #fff,14vw -48vh 1px 0px #fff,23vw 43vh 0px 1px #fff,-40vw 16vh 1px 1px #fff,20vw -31vh 0px 1px #fff,-17vw 44vh 1px 1px #fff,18vw -45vh 0px 0px #fff,33vw -6vh 0px 0px #fff,0vw 7vh 0px 1px #fff,-10vw -18vh 0px 1px #fff,-19vw 5vh 1px 0px #fff,1vw 42vh 0px 0px #fff,22vw 48vh 0px 1px #fff,39vw -8vh 1px 1px #fff,-6vw -42vh 1px 0px #fff,-47vw 34vh 0px 0px #fff,-46vw 19vh 0px 1px #fff,-12vw -32vh 0px 0px #fff,-45vw -38vh 0px 1px #fff,-28vw 18vh 1px 0px #fff,-38vw -46vh 1px 1px #fff,49vw -6vh 1px 1px #fff,-28vw 18vh 1px 1px #fff,10vw -24vh 0px 1px #fff,-5vw -11vh 1px 1px #fff,33vw -8vh 1px 0px #fff,-16vw 17vh 0px 0px #fff,18vw 27vh 0px 1px #fff,-8vw -10vh 1px 1px #fff;
  
  /* stars were too big with the layers above but left the code in case no one cares  -- as in, if noone's just that  one other loner who actually cares    */
  
  box-shadow: 24vw 9vh 1px 0px #fff,12vw -24vh 0px 1px #fff,-45vw -22vh 0px 0px #fff,-37vw -40vh 0px 1px #fff,29vw 19vh 0px 1px #fff,4vw -8vh 0px 1px #fff,-5vw 21vh 1px 1px #fff,-27vw 26vh 1px 1px #fff,-47vw -3vh 1px 1px #fff,-28vw -30vh 0px 1px #fff,-43vw -27vh 0px 1px #fff,4vw 22vh 1px 1px #fff,36vw 23vh 0px 0px #fff,-21vw 24vh 1px 1px #fff,-16vw 2vh 1px 0px #fff,-16vw -6vh 0px 0px #fff,5vw 26vh 0px 0px #fff,-34vw 41vh 0px 0px #fff,1vw 42vh 1px 1px #fff,11vw -13vh 1px 1px #fff,48vw -8vh 1px 0px #fff,22vw -15vh 0px 0px #fff,45vw 49vh 0px 0px #fff,43vw -27vh 1px 1px #fff,20vw -2vh 0px 0px #fff,8vw 22vh 0px 1px #fff,39vw 48vh 1px 1px #fff,-21vw -11vh 0px 1px #fff,-40vw 45vh 0px 1px #fff,11vw -30vh 1px 0px #fff,26vw 30vh 1px 0px #fff,45vw -29vh 0px 1px #fff,-2vw 18vh 0px 0px #fff,-29vw -45vh 1px 0px #fff,-7vw -27vh 1px 1px #fff,42vw 24vh 0px 0px #fff,45vw -48vh 1px 0px #fff,-36vw -18vh 0px 0px #fff,-44vw 13vh 0px 1px #fff,36vw 16vh 0px 1px #fff,40vw 24vh 0px 0px #fff,18vw 11vh 0px 0px #fff,-15vw -23vh 1px 0px #fff,-24vw 48vh 0px 1px #fff,27vw -45vh 1px 0px #fff,-2vw -24vh 0px 1px #fff,-15vw -28vh 0px 0px #fff,-43vw 13vh 1px 0px #fff,7vw 27vh 1px 0px #fff,47vw 5vh 0px 0px #fff,-45vw 15vh 1px 1px #fff,-5vw -28vh 0px 1px #fff,38vw 25vh 1px 1px #fff,-39vw -1vh 1px 0px #fff,5vw 0vh 1px 0px #fff,49vw 13vh 0px 0px #fff,48vw 10vh 0px 1px #fff,19vw -28vh 0px 0px #fff,4vw 7vh 0px 0px #fff,21vw 21vh 1px 1px #fff,-15vw -15vh 0px 1px #fff,-6vw -42vh 1px 0px #fff,-15vw 48vh 1px 1px #fff,-23vw 25vh 1px 1px #fff,-48vw 25vh 0px 1px #fff,-31vw -19vh 0px 1px #fff,4vw 37vh 1px 1px #fff,-43vw 28vh 0px 0px #fff,3vw -25vh 0px 1px #fff,-39vw 14vh 0px 1px #fff,-40vw 31vh 0px 1px #fff,35vw -36vh 1px 1px #fff,16vw 49vh 0px 0px #fff,6vw 39vh 0px 0px #fff,3vw -35vh 0px 1px #fff,-44vw -2vh 1px 0px #fff,-6vw 21vh 1px 0px #fff,48vw 9vh 1px 1px #fff,-43vw 30vh 1px 1px #fff,29vw -12vh 1px 1px #fff,-48vw 13vh 1px 0px #fff,-42vw 32vh 1px 1px #fff,34vw 15vh 1px 1px #fff,29vw -37vh 1px 1px #fff,28vw 2vh 0px 0px #fff;
  animation: zoom 16s alternate infinite; 
}

@keyframes zoom {
    0%{
        transform: scale(1);
    }
    100%{
        transform: scale(1.5);
    }
}
</style>
