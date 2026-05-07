<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Homepage &amp; Showcase</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
      <!-- Tabs -->
      <div class="border-b mb-6">
        <nav class="flex gap-4">
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Homepage' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Homepage'">Homepage</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Home' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Home'">Home</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Sidebar' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Sidebar'">Sidebar</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Release Settings' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Release Settings'">Release Settings</button>
          <button
            class="px-3 py-2 border-b-2"
            :class="activeTab==='Other' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Other'">Other</button>

        </nav>
      </div>

      <!-- Homepage tab -->
      <section v-if="activeTab==='Homepage'" class="space-y-6">
        <p class="text-sm text-gray-600">
          Upload SVG/PNG/JPEG/GIF/MP4. Files are stored on the server and paths saved in the database.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <!-- Top Left -->
          <div class="space-y-3">
            <h2 class="font-semibold">Top Left</h2>
            <p class="text-xs text-gray-500">Max size is 374px by 292px</p>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.topLeft && files.topLeft.type && files.topLeft.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.topLeft || '')"
                :src="previewUrls.topLeft || paths.topLeft" :poster="(previewUrls.topLeft && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.topLeft)) ? previewUrls.topLeft : (/\.(png|jpe?g|gif|svg)$/i.test(paths.topLeft||'') ? paths.topLeft : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.topLeft || paths.topLeft" :src="previewUrls.topLeft || paths.topLeft" alt="Top Left" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('topLeft', $event)" class="block w-full text-sm" />
            <div v-if="files.topLeft" class="text-xs text-gray-600 truncate">Selected: {{ files.topLeft.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.topLeft" @click="clearPath('topLeft')">Clear</button>
          </div>

          <!-- Top Right -->
          <div class="space-y-3">
            <h2 class="font-semibold">Top Right</h2>
            <p class="text-xs text-gray-500">Max size is 374px by 292px</p>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.topRight && files.topRight.type && files.topRight.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.topRight || '')"
                :src="previewUrls.topRight || paths.topRight" :poster="(previewUrls.topRight && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.topRight)) ? previewUrls.topRight : (/\.(png|jpe?g|gif|svg)$/i.test(paths.topRight||'') ? paths.topRight : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.topRight || paths.topRight" :src="previewUrls.topRight || paths.topRight" alt="Top Right" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('topRight', $event)" class="block w-full text-sm" />
            <div v-if="files.topRight" class="text-xs text-gray-600 truncate">Selected: {{ files.topRight.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.topRight" @click="clearPath('topRight')">Clear</button>
          </div>

          <!-- Bottom Left -->
          <div class="space-y-3">
            <h2 class="font-semibold">Bottom Left</h2>
            <p class="text-xs text-gray-500">Max size is 374px by 292px</p>
            <div class="aspect-video bg-gray-50 border rounded flex items-center justify-center overflow-hidden">
              <video v-if="(files.bottomLeft && files.bottomLeft.type && files.bottomLeft.type.startsWith('video/')) || /\.mp4($|\?)/i.test(paths.bottomLeft || '')"
                :src="previewUrls.bottomLeft || paths.bottomLeft" :poster="(previewUrls.bottomLeft && /\.(png|jpe?g|gif|svg)$/i.test(previewUrls.bottomLeft)) ? previewUrls.bottomLeft : (/\.(png|jpe?g|gif|svg)$/i.test(paths.bottomLeft||'') ? paths.bottomLeft : '')"
                controls preload="metadata" playsinline class="max-h-full max-w-full"></video>
              <img v-else-if="previewUrls.bottomLeft || paths.bottomLeft" :src="previewUrls.bottomLeft || paths.bottomLeft" alt="Bottom Left" class="max-h-full max-w-full" />
              <span v-else class="text-gray-400 text-sm">No image</span>
            </div>
                 <input type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif,video/mp4,.mp4"
                   @change="onFile('bottomLeft', $event)" class="block w-full text-sm" />
            <div v-if="files.bottomLeft" class="text-xs text-gray-600 truncate">Selected: {{ files.bottomLeft.name }}</div>
            <button type="button" class="px-3 py-1 text-sm rounded border"
                    v-if="paths.bottomLeft" @click="clearPath('bottomLeft')">Clear</button>
          </div>

          <!-- Bottom Right removed — now managed in the Sidebar tab -->
          <div class="space-y-3 border rounded p-4 bg-gray-50">
            <h2 class="font-semibold text-gray-400">Bottom Right</h2>
            <p class="text-xs text-gray-400">The Bottom Right image has been moved to the <button type="button" class="underline text-indigo-500" @click="activeTab='Sidebar'">Sidebar tab</button> as "Bottom Spotlight".</p>
          </div>
        </div>

        <div class="mt-2">
          <button class="btn-primary" :disabled="saving" @click="saveAll">
            <span v-if="!saving">Save</span><span v-else>Saving…</span>
          </button>
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

        <div class="mt-2">
          <button class="btn-primary" :disabled="saving" @click="saveOther">
            <span v-if="!saving">Save</span><span v-else>Saving…</span>
          </button>
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
  'win-wheel':   '/newsite/win-wheel',
  'winball':     '/newsite/winball',
  'lottery':     '/newsite/lottery',
  'auctions':    '/newsite/auctions',
  'gtoons-clash':'/newsite/gtoons-clash'
}

const activeTab = ref('Homepage')

const paths = ref({ topLeft:'', bottomLeft:'', topRight:'', bottomRight:'' })
const files = ref({ topLeft:null, bottomLeft:null, topRight:null, bottomRight:null })
const previewUrls = ref({ topLeft:null, bottomLeft:null, topRight:null, bottomRight:null, showcase:null, homeImage1:null, homeImage2:null, homeImage3:null, homeImage4:null, middleSidebar1:null, middleSidebar2:null, middleSidebar3:null, news:null, earnPoints:null })

const newsPath = ref('')
const newsFile = ref(null)

const earnPointsPath = ref('')
const earnPointsFile = ref(null)

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

// Release settings state
const releasePercent = ref(75)
const delayHours = ref(12)

function detectPreset(link) {
  if (!link) return ''
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
})

async function loadConfig() {
  const cfg = await $fetch('/api/admin/homepage')
  paths.value.topLeft     = cfg.topLeftImagePath     || ''
  paths.value.bottomLeft  = cfg.bottomLeftImagePath  || ''
  paths.value.topRight    = cfg.topRightImagePath    || ''
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
}


async function saveAll() {
  saving.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('topLeftPath',     paths.value.topLeft     || '')
    fd.append('bottomLeftPath',  paths.value.bottomLeft  || '')
    fd.append('topRightPath',    paths.value.topRight    || '')
    fd.append('bottomRightPath', paths.value.bottomRight || '')
    if (files.value.topLeft)     fd.append('topLeft',     files.value.topLeft)
    if (files.value.bottomLeft)  fd.append('bottomLeft',  files.value.bottomLeft)
    if (files.value.topRight)    fd.append('topRight',    files.value.topRight)
    if (files.value.bottomRight) fd.append('bottomRight', files.value.bottomRight)

    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    paths.value.topLeft     = res.topLeftImagePath     || ''
    paths.value.bottomLeft  = res.bottomLeftImagePath  || ''
    paths.value.topRight    = res.topRightImagePath    || ''
    paths.value.bottomRight = res.bottomRightImagePath || ''
    files.value = { topLeft:null, bottomLeft:null, topRight:null, bottomRight:null }
    toast.value = { type: 'ok', msg: 'Homepage images saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
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
    const res = await $fetch('/api/admin/homepage', { method: 'POST', body: fd })
    newsPath.value = res.newsImagePath || ''
    newsFile.value = null
    earnPointsPath.value = res.earnPointsImagePath || ''
    earnPointsFile.value = null
    toast.value = { type: 'ok', msg: 'Images saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadConfig)

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
</style>


