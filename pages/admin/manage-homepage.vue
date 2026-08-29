<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Homepage &amp; Showcase</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
      <!-- Tabs -->
      <div class="border-b mb-6">
        <nav class="flex gap-1 sm:gap-4 overflow-x-auto flex-nowrap -mb-px">
          <button
            class="px-3 py-2 border-b-2 whitespace-nowrap shrink-0"
            :class="activeTab==='Hero' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Hero'">Hero</button>
          <button
            class="px-3 py-2 border-b-2 whitespace-nowrap shrink-0"
            :class="activeTab==='Home' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Home'">Home</button>
          <button
            class="px-3 py-2 border-b-2 whitespace-nowrap shrink-0"
            :class="activeTab==='Sidebar' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Sidebar'">Sidebar</button>
          <button
            class="px-3 py-2 border-b-2 whitespace-nowrap shrink-0"
            :class="activeTab==='Release Settings' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Release Settings'">Release Settings</button>
          <button
            class="px-3 py-2 border-b-2 whitespace-nowrap shrink-0"
            :class="activeTab==='Other' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Other'">Other</button>
          <button
            class="px-3 py-2 border-b-2 whitespace-nowrap shrink-0"
            :class="activeTab==='Favicon' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Favicon'">Favicon</button>
        </nav>
      </div>

      <!-- Hero tab (logged-out homepage redesign) -->
      <section v-if="activeTab==='Hero'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Controls the logged-out homepage (<code>/</code>) hero: a login panel on the left (top image,
          "Log in with Discord" box, bottom image) and a hero image with Tutorial / Watch Video buttons
          on the right. Images: PNG/JPEG/GIF, 8MB max. Video: MP4, 150MB max.
        </p>

        <!-- Hero image (right column) -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Hero Image (right side)</h2>
          <p class="text-xs text-gray-500">Suggested width around 700–900px. Displayed above the Tutorial / Watch Video buttons.</p>
          <div class="flex items-center gap-4">
            <div class="w-40 h-28 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="previewUrls.heroImage || heroImagePath" :src="previewUrls.heroImage || heroImagePath" alt="Hero" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-xs">No image</span>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                @change="onHeroFile('heroImage', $event)" class="block w-full text-sm" />
              <div v-if="heroImageFile" class="text-xs text-gray-600 truncate">Selected: {{ heroImageFile.name }}</div>
              <button type="button" class="px-3 py-1 text-sm rounded border"
                      v-if="heroImagePath" @click="clearHero('heroImage')">Clear</button>
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-xs text-gray-600 font-medium">Link to (optional)</label>
            <select v-model="heroImageLinkPreset" @change="onHeroLinkPresetChange('heroImage')" class="block w-full text-sm border rounded p-1.5">
              <option value="">— None —</option>
              <option v-for="(path, preset) in PAGE_LINKS" :key="preset" :value="preset">{{ preset }}</option>
              <option value="custom">Custom URL…</option>
            </select>
            <input v-if="heroImageLinkPreset === 'custom'" type="url" v-model="heroImageLink"
              placeholder="https://example.com" class="block w-full text-sm border rounded p-1.5 mt-1" />
          </div>
        </div>

        <!-- Hero video (watch-video modal) -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Hero Video (Watch Video button)</h2>
          <p class="text-xs text-gray-500">Opens in a popup when a visitor clicks "Watch Video". Leave empty to hide that button.</p>
          <div class="flex items-center gap-4">
            <div class="w-40 h-28 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <video v-if="(heroVideoFile && heroVideoFile.type && heroVideoFile.type.startsWith('video/')) || heroVideoPath"
                :src="previewUrls.heroVideo || heroVideoPath"
                :poster="heroVideoPosterPath || ''"
                preload="metadata" playsinline class="max-h-full max-w-full object-contain"></video>
              <span v-else class="text-gray-400 text-xs">No video</span>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <input type="file" accept="video/mp4,.mp4"
                @change="onHeroFile('heroVideo', $event)" class="block w-full text-sm" />
              <div v-if="heroVideoFile" class="text-xs text-gray-600 truncate">Selected: {{ heroVideoFile.name }}</div>
              <button type="button" class="px-3 py-1 text-sm rounded border"
                      v-if="heroVideoPath" @click="clearHero('heroVideo')">Clear</button>
            </div>
          </div>
        </div>

        <!-- Login panel images (left column) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div class="border rounded p-4 space-y-3">
            <h2 class="font-semibold">Login Panel — Top Image</h2>
            <p class="text-xs text-gray-500">Displayed above the "Log in with Discord" box.</p>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <img v-if="previewUrls.loginTop || loginTopImagePath" :src="previewUrls.loginTop || loginTopImagePath" alt="Login top" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
            <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
              @change="onHeroFile('loginTop', $event)" class="block w-full text-sm" />
            <div v-if="loginTopImageFile" class="text-xs text-gray-600 truncate">Selected: {{ loginTopImageFile.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="loginTopImagePath" @click="clearHero('loginTop')">Clear</button>
            <div class="space-y-1">
              <label class="text-xs text-gray-600 font-medium">Link to (optional)</label>
              <select v-model="loginTopImageLinkPreset" @change="onHeroLinkPresetChange('loginTop')" class="block w-full text-sm border rounded p-1.5">
                <option value="">— None —</option>
                <option v-for="(path, preset) in PAGE_LINKS" :key="preset" :value="preset">{{ preset }}</option>
                <option value="custom">Custom URL…</option>
              </select>
              <input v-if="loginTopImageLinkPreset === 'custom'" type="url" v-model="loginTopImageLink"
                placeholder="https://example.com" class="block w-full text-sm border rounded p-1.5 mt-1" />
            </div>
          </div>

          <div class="border rounded p-4 space-y-3">
            <h2 class="font-semibold">Login Panel — Bottom Image</h2>
            <p class="text-xs text-gray-500">Displayed below the "Log in with Discord" box.</p>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <img v-if="previewUrls.loginBottom || loginBottomImagePath" :src="previewUrls.loginBottom || loginBottomImagePath" alt="Login bottom" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
            <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
              @change="onHeroFile('loginBottom', $event)" class="block w-full text-sm" />
            <div v-if="loginBottomImageFile" class="text-xs text-gray-600 truncate">Selected: {{ loginBottomImageFile.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="loginBottomImagePath" @click="clearHero('loginBottom')">Clear</button>
            <div class="space-y-1">
              <label class="text-xs text-gray-600 font-medium">Link to (optional)</label>
              <select v-model="loginBottomImageLinkPreset" @change="onHeroLinkPresetChange('loginBottom')" class="block w-full text-sm border rounded p-1.5">
                <option value="">— None —</option>
                <option v-for="(path, preset) in PAGE_LINKS" :key="preset" :value="preset">{{ preset }}</option>
                <option value="custom">Custom URL…</option>
              </select>
              <input v-if="loginBottomImageLinkPreset === 'custom'" type="url" v-model="loginBottomImageLink"
                placeholder="https://example.com" class="block w-full text-sm border rounded p-1.5 mt-1" />
            </div>
          </div>
        </div>

        <div class="mt-2">
          <button class="btn-primary" :disabled="saving" @click="saveHero">
            <span v-if="!saving">Save Hero</span><span v-else>Saving…</span>
          </button>
        </div>

        <div class="border-t pt-4 mt-4">
          <p class="text-xs text-gray-400">
            The old Top Left / Top Right / Bottom Left hero images are no longer displayed anywhere on the
            site and have been replaced by the fields above. They're still viewable/editable for legacy
            record-keeping in <NuxtLink to="/newsite/admin/homepage" class="underline">Legacy Admin</NuxtLink>.
          </p>
        </div>
      </section>

      <!-- Home tab (formerly Showcase) -->
      <section v-if="activeTab==='Home'" class="space-y-6">
        <!-- Showcase image — compact -->
        <div class="border rounded p-4 space-y-2">
          <h2 class="font-semibold text-sm">Showcase Image / Video</h2>
          <div class="flex items-center gap-4">
            <div class="w-40 h-24 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <video v-if="(showcaseFile && showcaseFile.type && showcaseFile.type.startsWith('video/')) || /\.mp4($|\?)/i.test(showcasePath || '')"
                :src="previewUrls.showcase || showcasePath"
                :poster="(previewUrls.showcase && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.showcase)) ? previewUrls.showcase : (showcasePosterPath || (/\.(png|jpe?g|gif|svg)$/i.test(showcasePath||'') ? showcasePath : ''))"
                preload="metadata" playsinline class="max-h-full max-w-full object-contain"></video>
              <img v-else-if="previewUrls.showcase || showcasePath" :src="previewUrls.showcase || showcasePath" alt="Showcase" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-xs">None</span>
            </div>
            <div class="space-y-1 min-w-0">
              <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                @change="onShowcaseFile($event)" class="block w-full text-xs" />
              <div v-if="showcaseFile" class="text-xs text-gray-600 truncate">{{ showcaseFile.name }}</div>
              <div class="flex gap-2">
                <button type="button" class="px-2 py-0.5 text-xs rounded border"
                        v-if="showcasePath" @click="clearShowcase()">Clear</button>
                <button class="btn-primary text-xs px-3 py-1" :disabled="saving" @click="saveShowcase">
                  <span v-if="!saving">Save</span><span v-else>Saving…</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 4 Home Images -->
        <div>
          <h2 class="font-semibold mb-3">Home Page Images</h2>
          <p class="text-sm text-gray-500 mb-4">These 4 images display in the main content area of the newsite home page. Each can link to a page or custom URL.</p>
          <div class="space-y-4">
            <div v-for="n in 4" :key="n" class="border rounded p-4 space-y-3">
              <h3 class="font-medium text-sm">Image {{ n }}</h3>
              <div class="flex items-center gap-4">
                <div class="w-32 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="previewUrls['homeImage' + n] || homeImages[n].path"
                    :src="previewUrls['homeImage' + n] || homeImages[n].path"
                    :alt="'Home Image ' + n"
                    class="max-h-full max-w-full object-contain" />
                  <span v-else class="text-gray-400 text-xs">None</span>
                </div>
                <div class="space-y-2 flex-1 min-w-0">
                  <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                    @change="onHomeImageFile(n, $event)" class="block w-full text-xs" />
                  <p class="text-xs text-gray-500">Max size is 374px by 292px</p>
                  <div v-if="homeImageFiles[n]" class="text-xs text-gray-600 truncate">{{ homeImageFiles[n].name }}</div>
                  <button type="button" class="px-2 py-0.5 text-xs rounded border"
                          v-if="homeImages[n].path" @click="clearHomeImage(n)">Clear</button>
                  <div class="space-y-1">
                    <label class="text-xs text-gray-600 font-medium">Link to</label>
                    <select v-model="homeImages[n].linkPreset" @change="onLinkPresetChange(n)" class="block w-full text-sm border rounded p-1.5">
                      <option value="">— None —</option>
                      <option value="my-cworld">My cWorld</option>
                      <option value="cmart">cMart</option>
                      <option value="games">Games</option>
                      <option value="win-wheel">Win Wheel</option>
                      <option value="winball">Winball</option>
                      <option value="lottery">Lottery</option>
                      <option value="auctions">Auctions</option>
                      <option value="gtoons-clash">gToons Clash</option>
                      <option value="news">News</option>
                      <option value="earn-points">Earn Points</option>
                      <option value="tutorial">Tutorial</option>
                      <option value="custom">Custom URL…</option>
                    </select>
                    <input v-if="homeImages[n].linkPreset === 'custom'"
                      type="url" v-model="homeImages[n].link"
                      placeholder="https://example.com"
                      class="block w-full text-sm border rounded p-1.5 mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-4">
            <button class="btn-primary" :disabled="saving" @click="saveHomeImages">
              <span v-if="!saving">Save Home Images</span><span v-else>Saving…</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Sidebar tab -->
      <section v-if="activeTab==='Sidebar'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Configure the bottom spotlight image shown in the site sidebar.
        </p>

        <!-- Bottom Spotlight -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Bottom Spotlight</h2>
          <p class="text-xs text-gray-500">Size should be 757px by 254px.</p>
          <div class="flex items-center gap-4">
            <div class="w-48 h-20 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <video v-if="(files.bottomRight && files.bottomRight.type && files.bottomRight.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.bottomRight || '')"
                :src="previewUrls.bottomRight || paths.bottomRight"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.bottomRight || paths.bottomRight" :src="previewUrls.bottomRight || paths.bottomRight" alt="Bottom Spotlight" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-xs">No image</span>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                @change="onFile('bottomRight', $event)" class="block w-full text-sm" />
              <div v-if="files.bottomRight" class="text-xs text-gray-600 truncate">Selected: {{ files.bottomRight.name }}</div>
              <button type="button" class="px-3 py-1 text-sm rounded border"
                      v-if="paths.bottomRight" @click="clearPath('bottomRight')">Clear</button>
            </div>
          </div>

          <!-- Link options -->
          <div class="space-y-1 mt-2">
            <label class="text-sm font-medium text-gray-700">Link to</label>
            <select v-model="bottomSpotlightLinkPreset" @change="onBottomSpotlightPresetChange" class="block w-full text-sm border rounded p-1.5">
              <option value="">— None —</option>
              <option value="my-cworld">My cWorld</option>
              <option value="cmart">cMart</option>
              <option value="games">Games</option>
              <option value="win-wheel">Win Wheel</option>
              <option value="winball">Winball</option>
              <option value="lottery">Lottery</option>
              <option value="auctions">Auctions</option>
              <option value="gtoons-clash">gToons Clash</option>
              <option value="custom">Custom URL…</option>
            </select>
            <input v-if="bottomSpotlightLinkPreset === 'custom'"
              type="url" v-model="bottomSpotlightLink"
              placeholder="https://example.com"
              class="block w-full text-sm border rounded p-1.5 mt-1" />
            <p v-if="bottomSpotlightLinkPreset === 'winball'" class="text-xs text-indigo-600 mt-1">
              The Winball prize cToon overlay will be shown on the frontend.
            </p>
          </div>
        </div>

        <!-- Middle Sidebar -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Middle Sidebar</h2>
          <p class="text-sm text-gray-500">Up to 3 images displayed in the middle sidebar area. Each can link to a page or custom URL.</p>
          <p class="text-sm text-gray-500">Images must be 757px wide. Total height across all uploaded images must equal 1668px. Split evenly: 1 image = 1668px tall, 2 images = 834px each, 3 images = 556px each. You don't have to do evenly split heights, they just need to total up to 1668px.</p>
          <div class="space-y-4">
            <div v-for="n in 3" :key="n" class="border rounded p-3 space-y-2">
              <h3 class="font-medium text-sm">Image {{ n }}</h3>
              <div class="flex items-center gap-4">
                <div class="w-32 h-20 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="previewUrls['middleSidebar' + n] || middleSidebarImages[n].path"
                    :src="previewUrls['middleSidebar' + n] || middleSidebarImages[n].path"
                    :alt="'Middle Sidebar Image ' + n"
                    class="max-h-full max-w-full object-contain" />
                  <span v-else class="text-gray-400 text-xs">None</span>
                </div>
                <div class="space-y-2 flex-1 min-w-0">
                  <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                    @change="onMiddleSidebarFile(n, $event)" class="block w-full text-xs" />
                  <p class="text-xs text-gray-500">Max width of 757px.</p>
                  <div v-if="middleSidebarFiles[n]" class="text-xs text-gray-600 truncate">{{ middleSidebarFiles[n].name }}</div>
                  <button type="button" class="px-2 py-0.5 text-xs rounded border"
                          v-if="middleSidebarImages[n].path" @click="clearMiddleSidebar(n)">Clear</button>
                  <div class="space-y-1">
                    <label class="text-xs text-gray-600 font-medium">Link to</label>
                    <select v-model="middleSidebarImages[n].linkPreset" @change="onMiddleSidebarPresetChange(n)" class="block w-full text-sm border rounded p-1.5">
                      <option value="">— None —</option>
                      <option value="my-cworld">My cWorld</option>
                      <option value="cmart">cMart</option>
                      <option value="games">Games</option>
                      <option value="win-wheel">Win Wheel</option>
                      <option value="winball">Winball</option>
                      <option value="lottery">Lottery</option>
                      <option value="auctions">Auctions</option>
                      <option value="gtoons-clash">gToons Clash</option>
                      <option value="news">News</option>
                      <option value="earn-points">Earn Points</option>
                      <option value="tutorial">Tutorial</option>
                      <option value="custom">Custom URL…</option>
                    </select>
                    <input v-if="middleSidebarImages[n].linkPreset === 'custom'"
                      type="url" v-model="middleSidebarImages[n].link"
                      placeholder="https://example.com"
                      class="block w-full text-sm border rounded p-1.5 mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-2">
          <button class="btn-primary" :disabled="saving" @click="saveSidebar">
            <span v-if="!saving">Save Sidebar</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Release Settings tab -->
      <section v-if="activeTab==='Release Settings'" class="space-y-6 max-w-md">
        <p class="text-sm text-gray-600">Configure staged release defaults for all cToons.</p>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Initial Release %</label>
          <input type="number" v-model.number="releasePercent" min="0" max="100" class="w-full border rounded p-2" />
          <p class="text-xs text-gray-500">Percent of total released at the initial time (min 1 unit enforced at runtime).</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Delay (hours) to Final Release</label>
          <input type="number" v-model.number="delayHours" min="1" max="72" class="w-full border rounded p-2" />
          <p class="text-xs text-gray-500">Hours after initial release when the remaining quantity is released.</p>
        </div>
        <div>
          <button class="btn-primary" :disabled="saving" @click="saveReleaseSettings">
            <span v-if="!saving">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>



      <!-- Other tab -->
      <section v-if="activeTab==='Other'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Configure additional page images.
        </p>

        <!-- News image -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">News</h2>
          <p class="text-xs text-gray-500">Image displayed on the News page.</p>
          <div class="flex items-center gap-4">
            <div class="w-48 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="previewUrls.news || newsPath" :src="previewUrls.news || newsPath" alt="News" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-xs">No image</span>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                @change="onNewsFile($event)" class="block w-full text-sm" />
              <div v-if="newsFile" class="text-xs text-gray-600 truncate">Selected: {{ newsFile.name }}</div>
              <button type="button" class="px-3 py-1 text-sm rounded border"
                      v-if="newsPath" @click="clearNews()">Clear</button>
            </div>
          </div>
        </div>

        <!-- Earn Points image -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Earn Points</h2>
          <p class="text-xs text-gray-500">Image displayed on the Earn Points page.</p>
          <div class="flex items-center gap-4">
            <div class="w-48 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="previewUrls.earnPoints || earnPointsPath" :src="previewUrls.earnPoints || earnPointsPath" alt="Earn Points" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-xs">No image</span>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                @change="onEarnPointsFile($event)" class="block w-full text-sm" />
              <div v-if="earnPointsFile" class="text-xs text-gray-600 truncate">Selected: {{ earnPointsFile.name }}</div>
              <button type="button" class="px-3 py-1 text-sm rounded border"
                      v-if="earnPointsPath" @click="clearEarnPoints()">Clear</button>
            </div>
          </div>
        </div>

        <!-- Label image -->
        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Label Image</h2>
          <p class="text-xs text-gray-500">Image displayed as the orbit label on the newsite template (replaces the default orbit-label.gif).</p>
          <div class="flex items-center gap-4">
            <div class="w-48 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="previewUrls.label || labelPath" :src="previewUrls.label || labelPath" alt="Label" class="max-h-full max-w-full object-contain" />
              <span v-else class="text-gray-400 text-xs">No image (uses default)</span>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                @change="onLabelFile($event)" class="block w-full text-sm" />
              <div v-if="labelFile" class="text-xs text-gray-600 truncate">Selected: {{ labelFile.name }}</div>
              <button type="button" class="px-3 py-1 text-sm rounded border"
                      v-if="labelPath" @click="clearLabel()">Clear</button>
            </div>
          </div>
        </div>

        <div class="mt-2">
          <button class="btn-primary" :disabled="saving" @click="saveOther">
            <span v-if="!saving">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Favicon tab -->
      <section v-if="activeTab==='Favicon'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Upload one image (PNG, JPG, or WEBP) and it will replace the site's favicon and all
          meta/touch icons used site-wide. It will be automatically cropped to a centered square.
          Changes may take a minute to appear everywhere due to browser caching.
        </p>

        <div class="border rounded p-4 space-y-3">
          <h2 class="font-semibold">Master Icon Image</h2>
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div class="relative w-32 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="faviconPreviewUrl || faviconSourcePath" :src="faviconPreviewUrl || faviconSourcePath" alt="Favicon preview" class="max-h-full max-w-full object-contain" @load="onFaviconPreviewLoad" />
              <span v-else class="text-gray-400 text-xs">No image</span>
              <!-- Square crop-boundary overlay so admins can see what will be kept before saving -->
              <div v-if="faviconPreviewUrl" class="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div class="border-2 border-dashed border-indigo-500/80" :style="cropOverlayStyle"></div>
              </div>
            </div>
            <div class="space-y-2 flex-1 min-w-0">
              <label for="favicon-file-input" class="block text-sm font-medium text-gray-700">Choose image</label>
              <input id="favicon-file-input" type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp"
                @change="onFaviconFile($event)" class="block w-full text-sm" />
              <p v-if="faviconPreviewUrl" class="text-xs text-gray-500">
                Dashed box shows the centered square that will be used — anything outside it is cropped away.
              </p>
              <div v-if="faviconFile" class="text-xs text-gray-600 truncate">Selected: {{ faviconFile.name }}</div>
            </div>
          </div>

          <!-- A handful of representative generated sizes — not all ~20, to keep this usable on mobile -->
          <div v-if="faviconPreviewUrl" class="flex items-end gap-4 pt-2">
            <div v-for="s in [16, 32, 96, 180]" :key="s" class="flex flex-col items-center gap-1">
              <img :src="faviconPreviewUrl" :style="{ width: Math.min(s, 64) + 'px', height: Math.min(s, 64) + 'px' }" class="object-cover border rounded" :alt="s + 'px preview'" />
              <span class="text-[10px] text-gray-500">{{ s }}px</span>
            </div>
          </div>

          <div class="mt-2">
            <button class="btn-primary inline-flex items-center gap-2" :disabled="!faviconFile || faviconSaving" @click="saveFavicon">
              <svg v-if="faviconSaving" class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span v-if="!faviconSaving">Save Favicon</span><span v-else>Generating icons… this can take a few seconds</span>
            </button>
          </div>
        </div>
      </section>

      <div v-if="toast" :class="['fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded',
                                 toast.type==='error'?'bg-red-100 text-red-700':'bg-green-100 text-green-700']">
        {{ toast.msg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - Manage Homepage', middleware: ['auth','admin'], layout: 'admin' })

const PAGE_LINKS = {
  'my-cworld':   '/newsite/my-cworld',
  'cmart':       '/newsite/cmart',
  'games':       '/newsite/games',
  'win-wheel':   '/newsite/winwheel',
  'winball':     '/newsite/winball',
  'lottery':     '/newsite/lottery',
  'auctions':    '/newsite/AuctionHouse',
  'gtoons-clash':'/newsite/gtoons-clash',
  'news':        '/newsite/news',
  'earn-points': '/newsite/earnpoints',
  'tutorial':    '/newsite/tutorial'
}

const activeTab = ref('Hero')

const paths = ref({ bottomRight:'' })
const files = ref({ bottomRight:null })
const previewUrls = ref({ bottomRight:null, showcase:null, homeImage1:null, homeImage2:null, homeImage3:null, homeImage4:null, middleSidebar1:null, middleSidebar2:null, middleSidebar3:null, news:null, earnPoints:null, label:null, heroImage:null, heroVideo:null, loginTop:null, loginBottom:null })

// Hero tab state (logged-out homepage redesign)
const heroImagePath = ref('')
const heroImageFile = ref(null)
const heroImageLink = ref('')
const heroImageLinkPreset = ref('')

const heroVideoPath = ref('')
const heroVideoFile = ref(null)
const heroVideoPosterPath = ref('')

const loginTopImagePath = ref('')
const loginTopImageFile = ref(null)
const loginTopImageLink = ref('')
const loginTopImageLinkPreset = ref('')

const loginBottomImagePath = ref('')
const loginBottomImageFile = ref(null)
const loginBottomImageLink = ref('')
const loginBottomImageLinkPreset = ref('')

const HERO_FILE_REFS = {
  heroImage:    { path: heroImagePath,    file: heroImageFile },
  heroVideo:    { path: heroVideoPath,    file: heroVideoFile },
  loginTop:     { path: loginTopImagePath,    file: loginTopImageFile },
  loginBottom:  { path: loginBottomImagePath, file: loginBottomImageFile }
}
const HERO_LINK_REFS = {
  heroImage:   { link: heroImageLink,   preset: heroImageLinkPreset },
  loginTop:    { link: loginTopImageLink,    preset: loginTopImageLinkPreset },
  loginBottom: { link: loginBottomImageLink, preset: loginBottomImageLinkPreset }
}

function onHeroFile(key, e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value[key]) { URL.revokeObjectURL(previewUrls.value[key]); previewUrls.value[key] = null } } catch (e) {}
  HERO_FILE_REFS[key].file.value = f
  if (f) previewUrls.value[key] = URL.createObjectURL(f)
}

function clearHero(key) {
  HERO_FILE_REFS[key].path.value = ''
  if (previewUrls.value[key]) { try { URL.revokeObjectURL(previewUrls.value[key]) } catch (e) {} ; previewUrls.value[key] = null }
  HERO_FILE_REFS[key].file.value = null
}

function onHeroLinkPresetChange(key) {
  const refs = HERO_LINK_REFS[key]
  const preset = refs.preset.value
  if (preset === '') {
    refs.link.value = ''
  } else if (preset !== 'custom') {
    refs.link.value = PAGE_LINKS[preset] ?? ''
  }
}

async function saveHero() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('heroImagePath', heroImagePath.value || '')
    fd.append('heroImageLink', heroImageLink.value || '')
    if (heroImageFile.value) fd.append('heroImage', heroImageFile.value)

    fd.append('heroVideoPath', heroVideoPath.value || '')
    if (heroVideoFile.value) fd.append('heroVideo', heroVideoFile.value)

    fd.append('loginTopImagePath', loginTopImagePath.value || '')
    fd.append('loginTopImageLink', loginTopImageLink.value || '')
    if (loginTopImageFile.value) fd.append('loginTop', loginTopImageFile.value)

    fd.append('loginBottomImagePath', loginBottomImagePath.value || '')
    fd.append('loginBottomImageLink', loginBottomImageLink.value || '')
    if (loginBottomImageFile.value) fd.append('loginBottom', loginBottomImageFile.value)

    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    heroImagePath.value = res.heroImagePath || ''
    heroImageLink.value = res.heroImageLink || ''
    heroImageLinkPreset.value = detectPreset(heroImageLink.value)
    heroImageFile.value = null

    heroVideoPath.value = res.heroVideoPath || ''
    heroVideoFile.value = null

    loginTopImagePath.value = res.loginTopImagePath || ''
    loginTopImageLink.value = res.loginTopImageLink || ''
    loginTopImageLinkPreset.value = detectPreset(loginTopImageLink.value)
    loginTopImageFile.value = null

    loginBottomImagePath.value = res.loginBottomImagePath || ''
    loginBottomImageLink.value = res.loginBottomImageLink || ''
    loginBottomImageLinkPreset.value = detectPreset(loginBottomImageLink.value)
    loginBottomImageFile.value = null

    toast.value = { type: 'ok', msg: 'Hero saved.' }
    await loadConfig()
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.data?.statusMessage || e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

const newsPath = ref('')
const newsFile = ref(null)

const earnPointsPath = ref('')
const earnPointsFile = ref(null)

const labelPath = ref('')
const labelFile = ref(null)

const showcasePath = ref('')
const showcaseFile = ref(null)
const showcasePosterPath = ref('')

// Home images state (1-indexed, index 0 unused)
const homeImages = reactive({
  1: { path: '', link: '', linkPreset: '' },
  2: { path: '', link: '', linkPreset: '' },
  3: { path: '', link: '', linkPreset: '' },
  4: { path: '', link: '', linkPreset: '' }
})
const homeImageFiles = reactive({ 1: null, 2: null, 3: null, 4: null })

// Bottom spotlight link state
const bottomSpotlightLink = ref('')
const bottomSpotlightLinkPreset = ref('')

// Middle sidebar images state (1-indexed, index 0 unused)
const middleSidebarImages = reactive({
  1: { path: '', link: '', linkPreset: '' },
  2: { path: '', link: '', linkPreset: '' },
  3: { path: '', link: '', linkPreset: '' }
})
const middleSidebarFiles = reactive({ 1: null, 2: null, 3: null })

const saving = ref(false)
const toast  = ref(null)

// Favicon tab state
const faviconFile = ref(null)
const faviconPreviewUrl = ref(null)
const faviconSourcePath = ref('')
const faviconSaving = ref(false)
const faviconBoxPx = 128 // matches the w-32 h-32 preview box
const cropOverlayStyle = ref({ width: `${faviconBoxPx}px`, height: `${faviconBoxPx}px` })

function onFaviconPreviewLoad(e) {
  const img = e.target
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (!nw || !nh) return
  // Replicate object-contain's rendered size within the fixed preview box,
  // then draw the centered square crop boundary sharp will actually keep.
  const scale = Math.min(faviconBoxPx / nw, faviconBoxPx / nh)
  const dispW = nw * scale
  const dispH = nh * scale
  const side = Math.min(dispW, dispH)
  cropOverlayStyle.value = { width: `${side}px`, height: `${side}px` }
}

function onFaviconFile(e) {
  const f = e.target.files?.[0] || null
  try { if (faviconPreviewUrl.value) { URL.revokeObjectURL(faviconPreviewUrl.value); faviconPreviewUrl.value = null } } catch (e) {}
  faviconFile.value = f
  if (f) faviconPreviewUrl.value = URL.createObjectURL(f)
}

async function loadFaviconConfig() {
  try {
    const cfg = await $fetch('/api/admin/favicon')
    faviconSourcePath.value = cfg.faviconSourcePath || ''
  } catch {}
}

async function saveFavicon() {
  if (!faviconFile.value) return
  faviconSaving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('image', faviconFile.value)
    const res = await $fetch('/api/admin/favicon', { method: 'POST', body: fd })
    faviconSourcePath.value = res.faviconSourcePath || ''
    try { if (faviconPreviewUrl.value) URL.revokeObjectURL(faviconPreviewUrl.value) } catch (e) {}
    faviconPreviewUrl.value = null
    faviconFile.value = null
    toast.value = { type: 'ok', msg: 'Favicon updated. It may take a minute to appear everywhere due to browser caching.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.data?.statusMessage || e?.statusMessage || 'Save failed' }
  } finally {
    faviconSaving.value = false; setTimeout(() => { toast.value = null }, 4000)
  }
}

// Release settings state
const releasePercent = ref(75)
const delayHours = ref(12)

function detectPreset(link) {
  if (!link) return ''
  // Treat old /newsite/auctions path as the auctions preset
  if (link === '/newsite/auctions') return 'auctions'
  for (const [preset, path] of Object.entries(PAGE_LINKS)) {
    if (link === path) return preset
  }
  return 'custom'
}

function onLinkPresetChange(n) {
  const preset = homeImages[n].linkPreset
  if (preset === '' || preset === 'custom') {
    if (preset === '') homeImages[n].link = ''
    // 'custom' keeps whatever is in link
  } else {
    homeImages[n].link = PAGE_LINKS[preset] ?? ''
  }
}

function onBottomSpotlightPresetChange() {
  const preset = bottomSpotlightLinkPreset.value
  if (preset === '') {
    bottomSpotlightLink.value = ''
  } else if (preset !== 'custom') {
    bottomSpotlightLink.value = PAGE_LINKS[preset] ?? ''
  }
  // 'custom' keeps whatever is in bottomSpotlightLink
}

function onFile(key, e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value[key]) { URL.revokeObjectURL(previewUrls.value[key]); previewUrls.value[key] = null } } catch (e) {}
  files.value[key] = f
  if (f) previewUrls.value[key] = URL.createObjectURL(f)
}

function clearPath(key) {
  paths.value[key] = ''
  if (previewUrls.value[key]) { try { URL.revokeObjectURL(previewUrls.value[key]) } catch (e) {} ; previewUrls.value[key] = null }
  files.value[key] = null
}

function onShowcaseFile(e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value.showcase) { URL.revokeObjectURL(previewUrls.value.showcase); previewUrls.value.showcase = null } } catch (e) {}
  showcaseFile.value = f
  if (f) previewUrls.value.showcase = URL.createObjectURL(f)
}

function clearShowcase() {
  showcasePath.value = ''
  if (previewUrls.value.showcase) { try { URL.revokeObjectURL(previewUrls.value.showcase) } catch (e) {} ; previewUrls.value.showcase = null }
  showcaseFile.value = null
}

function clearHomeImage(n) {
  homeImages[n].path = ''
  const key = `homeImage${n}`
  if (previewUrls.value[key]) { try { URL.revokeObjectURL(previewUrls.value[key]) } catch (e) {} ; previewUrls.value[key] = null }
  homeImageFiles[n] = null
}

function onHomeImageFile(n, e) {
  const f = e.target.files?.[0] || null
  const key = `homeImage${n}`
  try { if (previewUrls.value[key]) { URL.revokeObjectURL(previewUrls.value[key]); previewUrls.value[key] = null } } catch (e) {}
  homeImageFiles[n] = f
  if (f) previewUrls.value[key] = URL.createObjectURL(f)
}

function onMiddleSidebarFile(n, e) {
  const f = e.target.files?.[0] || null
  const key = `middleSidebar${n}`
  try { if (previewUrls.value[key]) { URL.revokeObjectURL(previewUrls.value[key]); previewUrls.value[key] = null } } catch (e) {}
  middleSidebarFiles[n] = f
  if (f) previewUrls.value[key] = URL.createObjectURL(f)
}

function clearMiddleSidebar(n) {
  middleSidebarImages[n].path = ''
  const key = `middleSidebar${n}`
  if (previewUrls.value[key]) { try { URL.revokeObjectURL(previewUrls.value[key]) } catch (e) {} ; previewUrls.value[key] = null }
  middleSidebarFiles[n] = null
}

function onNewsFile(e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value.news) { URL.revokeObjectURL(previewUrls.value.news); previewUrls.value.news = null } } catch (e) {}
  newsFile.value = f
  if (f) previewUrls.value.news = URL.createObjectURL(f)
}

function clearNews() {
  newsPath.value = ''
  if (previewUrls.value.news) { try { URL.revokeObjectURL(previewUrls.value.news) } catch (e) {} ; previewUrls.value.news = null }
  newsFile.value = null
}

function onEarnPointsFile(e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value.earnPoints) { URL.revokeObjectURL(previewUrls.value.earnPoints); previewUrls.value.earnPoints = null } } catch (e) {}
  earnPointsFile.value = f
  if (f) previewUrls.value.earnPoints = URL.createObjectURL(f)
}

function clearEarnPoints() {
  earnPointsPath.value = ''
  if (previewUrls.value.earnPoints) { try { URL.revokeObjectURL(previewUrls.value.earnPoints) } catch (e) {} ; previewUrls.value.earnPoints = null }
  earnPointsFile.value = null
}

function onLabelFile(e) {
  const f = e.target.files?.[0] || null
  try { if (previewUrls.value.label) { URL.revokeObjectURL(previewUrls.value.label); previewUrls.value.label = null } } catch (e) {}
  labelFile.value = f
  if (f) previewUrls.value.label = URL.createObjectURL(f)
}

function clearLabel() {
  labelPath.value = ''
  if (previewUrls.value.label) { try { URL.revokeObjectURL(previewUrls.value.label) } catch (e) {} ; previewUrls.value.label = null }
  labelFile.value = null
}

function onMiddleSidebarPresetChange(n) {
  const preset = middleSidebarImages[n].linkPreset
  if (preset === '') {
    middleSidebarImages[n].link = ''
  } else if (preset !== 'custom') {
    middleSidebarImages[n].link = PAGE_LINKS[preset] ?? ''
  }
}

onBeforeUnmount(() => {
  for (const k of Object.keys(previewUrls.value)) {
    const u = previewUrls.value[k]
    if (u) { try { URL.revokeObjectURL(u) } catch (e) {} }
  }
  if (faviconPreviewUrl.value) { try { URL.revokeObjectURL(faviconPreviewUrl.value) } catch (e) {} }
})

async function loadConfig() {
  const cfg = await $fetch('/api/admin/homepage')
  paths.value.bottomRight = cfg.bottomRightImagePath || ''
  showcasePath.value      = cfg.showcaseImagePath    || ''
  showcasePosterPath.value = cfg.showcasePosterPath  || ''

  for (let n = 1; n <= 4; n++) {
    homeImages[n].path = cfg[`homeImage${n}Path`] || ''
    const rawLink = cfg[`homeImage${n}Link`] || ''
    homeImages[n].link = rawLink
    homeImages[n].linkPreset = detectPreset(rawLink)
  }

  const rawBottomLink = cfg.bottomRightLink || ''
  bottomSpotlightLink.value = rawBottomLink
  bottomSpotlightLinkPreset.value = detectPreset(rawBottomLink)

  for (let n = 1; n <= 3; n++) {
    middleSidebarImages[n].path = cfg[`middleSidebar${n}ImagePath`] || ''
    const rawLink = cfg[`middleSidebar${n}Link`] || ''
    middleSidebarImages[n].link = rawLink
    middleSidebarImages[n].linkPreset = detectPreset(rawLink)
  }

  newsPath.value = cfg.newsImagePath || ''
  earnPointsPath.value = cfg.earnPointsImagePath || ''
  labelPath.value = cfg.labelImagePath || ''

  heroImagePath.value = cfg.heroImagePath || ''
  heroImageLink.value = cfg.heroImageLink || ''
  heroImageLinkPreset.value = detectPreset(heroImageLink.value)

  heroVideoPath.value = cfg.heroVideoPath || ''
  heroVideoPosterPath.value = cfg.heroVideoPosterPath || ''

  loginTopImagePath.value = cfg.loginTopImagePath || ''
  loginTopImageLink.value = cfg.loginTopImageLink || ''
  loginTopImageLinkPreset.value = detectPreset(loginTopImageLink.value)

  loginBottomImagePath.value = cfg.loginBottomImagePath || ''
  loginBottomImageLink.value = cfg.loginBottomImageLink || ''
  loginBottomImageLinkPreset.value = detectPreset(loginBottomImageLink.value)
}


async function saveShowcase() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('showcasePath', showcasePath.value || '')
    if (showcaseFile.value) fd.append('showcase', showcaseFile.value)

    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    showcasePath.value = res.showcaseImagePath || ''
    showcaseFile.value = null
    toast.value = { type: 'ok', msg: 'Showcase image saved.' }
    await loadConfig()
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

async function saveHomeImages() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    for (let n = 1; n <= 4; n++) {
      fd.append(`homeImage${n}Path`, homeImages[n].path || '')
      fd.append(`homeImage${n}Link`, homeImages[n].link || '')
      if (homeImageFiles[n]) fd.append(`homeImage${n}`, homeImageFiles[n])
    }
    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    for (let n = 1; n <= 4; n++) {
      homeImages[n].path = res[`homeImage${n}Path`] || ''
      homeImageFiles[n] = null
    }
    toast.value = { type: 'ok', msg: 'Home images saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

async function saveSidebar() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('bottomRightPath', paths.value.bottomRight || '')
    fd.append('bottomRightLink', bottomSpotlightLink.value || '')
    if (files.value.bottomRight) fd.append('bottomRight', files.value.bottomRight)

    for (let n = 1; n <= 3; n++) {
      fd.append(`middleSidebar${n}Path`, middleSidebarImages[n].path || '')
      fd.append(`middleSidebar${n}Link`, middleSidebarImages[n].link || '')
      if (middleSidebarFiles[n]) fd.append(`middleSidebar${n}`, middleSidebarFiles[n])
    }

    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    paths.value.bottomRight = res.bottomRightImagePath || ''
    bottomSpotlightLink.value = res.bottomRightLink || ''
    bottomSpotlightLinkPreset.value = detectPreset(bottomSpotlightLink.value)
    files.value.bottomRight = null

    for (let n = 1; n <= 3; n++) {
      middleSidebarImages[n].path = res[`middleSidebar${n}ImagePath`] || ''
      middleSidebarFiles[n] = null
    }

    toast.value = { type: 'ok', msg: 'Sidebar saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

async function saveOther() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('newsPath', newsPath.value || '')
    if (newsFile.value) fd.append('news', newsFile.value)
    fd.append('earnPointsPath', earnPointsPath.value || '')
    if (earnPointsFile.value) fd.append('earnPoints', earnPointsFile.value)
    fd.append('labelPath', labelPath.value || '')
    if (labelFile.value) fd.append('label', labelFile.value)
    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    newsPath.value = res.newsImagePath || ''
    newsFile.value = null
    earnPointsPath.value = res.earnPointsImagePath || ''
    earnPointsFile.value = null
    labelPath.value = res.labelImagePath || ''
    labelFile.value = null
    toast.value = { type: 'ok', msg: 'Images saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadConfig)
onMounted(loadFaviconConfig)


onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/release-settings')
    releasePercent.value = Number(res.initialReleasePercent ?? 75)
    delayHours.value = Number(res.finalReleaseDelayHours ?? 12)
  } catch {}
})

async function saveReleaseSettings() {
  saving.value = true; toast.value = null
  try {
    const res = await $fetch('/api/admin/release-settings', {
      method: 'POST',
      body: {
        initialReleasePercent: Number(releasePercent.value),
        finalReleaseDelayHours: Number(delayHours.value)
      }
    })
    releasePercent.value = Number(res.initialReleasePercent)
    delayHours.value = Number(res.finalReleaseDelayHours)
    toast.value = { type: 'ok', msg: 'Release settings saved.' }
  } catch (e) {
    console.error(e)
    toast.value = { type: 'error', msg: e?.statusMessage || 'Failed to save release settings' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }

@media (max-width: 767px) {
  .aspect-video {
    aspect-ratio: unset;
    min-height: 80px;
  }
}
</style>


