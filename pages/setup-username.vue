<!-- pages/setup-username.vue -->
<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center p-6">
    <div class="bg-white rounded-xl shadow-xl p-8 w-full text-center">

      <!-- STEP 1: Username ----------------------------------------------------->
      <template v-if="step === 1">
        <h1 class="text-2xl font-bold mb-4">Choose a username</h1>
        <p class="text-gray-600 mb-6">
          Pick a fun Cartoon Orbit-style username (or randomize!)
        </p>

        <div class="grid grid-cols-3 gap-2 mb-4">
          <select v-model="part1" class="border rounded-lg p-2">
            <option v-for="w in wordLists[0]" :key="`1-${w}`" :value="w">{{ w }}</option>
          </select>
          <select v-model="part2" class="border rounded-lg p-2">
            <option v-for="w in wordLists[1]" :key="`2-${w}`" :value="w">{{ w }}</option>
          </select>
          <select v-model="part3" class="border rounded-lg p-2">
            <option v-for="w in wordLists[2]" :key="`3-${w}`" :value="w">{{ w }}</option>
          </select>
        </div>

        <div class="mb-4">
          <button @click="randomize" class="text-sm text-indigo-600 hover:underline">
            🔄 Randomize
          </button>
        </div>

        <button @click="saveUsername"
                :disabled="savingUsername"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50">
          Save Username
        </button>

        <p v-if="error" class="text-red-500 mt-4">{{ error }}</p>
      </template>

      <!-- STEP 2: Avatar ------------------------------------------------------->
      <template v-else-if="step === 2">
        <h1 class="text-2xl font-bold mb-4">Choose an avatar</h1>
        <p class="text-gray-600 mb-6">Select an avatar to represent you.</p>

        <div class="grid grid-cols-4 gap-4 max-h-72 overflow-y-auto mb-4">
          <label v-for="img in avatars" :key="img" class="cursor-pointer">
            <img :src="`avatars/${img}`"
                 :class="[
                   'rounded-lg border-4 max-w-[50px] max-h-[50px]',
                   selectedAvatar === img ? 'border-indigo-600' : 'border-transparent'
                 ]"/>
            <input type="radio" class="hidden" :value="img" v-model="selectedAvatar" />
          </label>
        </div>

        <button @click="saveAvatar"
                :disabled="savingAvatar"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50">
          Save Avatar
        </button>

        <p v-if="error" class="text-red-500 mt-4">{{ error }}</p>
      </template>

      <!-- STEP 3: Starter Sets ------------------------------------------------->
      <template v-else>
        <h1 class="text-2xl font-bold mb-4">Choose a Starter Set</h1>
        <p class="text-gray-600 mb-6">Pick a pack to begin your collection.</p>

        <div v-if="loadingSets" class="text-gray-500 mb-4">Loading starter sets…</div>

        <div v-else class="grid grid-cols-1 gap-6 mb-4">
          <div
            v-for="(set, index) in starterSets"
            :key="set.id"
            @click="selectedSet = index"
            :class="[
              'p-4 border rounded-lg cursor-pointer transition text-left',
              selectedSet === index ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300'
            ]"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="font-semibold">{{ set.name }}</div>
              <div class="text-xs text-gray-500">Set {{ index + 1 }}</div>
            </div>

            <div class="grid grid-cols-5 gap-2">
              <img
                v-for="(it, idx) in set.items"
                :key="it.id || idx"
                :src="it?.ctoon?.assetPath || ''"
                class="rounded object-contain w-16 h-16"
              />
            </div>

            <p v-if="set.description" class="text-xs text-gray-500 mt-2">{{ set.description }}</p>
          </div>

          <div v-if="!starterSets.length && !loadingSets" class="text-gray-500">
            No starter sets available yet.
          </div>
        </div>

        <button
          :disabled="selectedSet === null || savingStarterSet || !starterSets.length"
          @click="chooseStarterSet"
          class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          Choose Starter Set
        </button>

        <p v-if="error" class="text-red-500 mt-4">{{ error }}</p>
      </template>

    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: ['auth'],
  layout: 'default'
})

import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { navigateTo } from '#app'

const router = useRouter()
const { user, fetchSelf } = useAuth()

const step = ref(1)
const error = ref('')

const savingUsername = ref(false)
const savingAvatar = ref(false)
const savingStarterSet = ref(false)

const part1 = ref('')
const part2 = ref('')
const part3 = ref('')
const username = ref('')
const selectedAvatar = ref('')

const avatars = ref([])

/* NEW: live starter sets */
const starterSets = ref([])     // [{ id, key, name, description, items: [{ id, position, ctoon: { id, assetPath, ... } }] }]
const selectedSet = ref(null)   // index into starterSets
const loadingSets = ref(false)

/* ── Word lists (unchanged) ─────────────────────────────────────────── */
const wordLists = [
  [
    'Awesome','Blazing','Brave','Bubbly','Cheery','Chill','Cosmic','Crazy','Cuddly','Cyber',
    'Daring','Dizzy','Electric','Epic','Funky','Fuzzy','Galactic','Glitchy','Groovy','Happy',
    'Hyper','Jolly','Jumpy','Kooky','Legendary','Loopy','Lucky','Mega','Mellow','Mighty',
    'Mystic','Neon','Nifty','Pixel','Plucky','Quirky','Radical','Raging','Retro','Rockin',
    'Sassy','Savvy','Silly','Slick','Snazzy','Sneaky','Solar','Spiffy','Spunky','Stellar',
    'Stormy','Sunny','Super','Swift','Techno','Thundering','Turbo','Ultra','Velvet','Vibrant',
    'Wild','Witty','Wobbly','Zany','Zen','Atomic','Blitz','Bold','Chroma','Crimson','Crystal',
    'Doodle','Dragon','Echo','Fluffy','Frosty','Fusion','Galaxy','Harmony','Inferno','Jade',
    'Karma','Lunar','Magnetic','Nova','Obsidian','Prismatic','Quantum','Rainbow','Shadow',
    'Titanic','Umbra','Vortex','Whimsical','Xeno','Yonder','Zephyr','Aurora','Orbit','Primo'
  ],
  [
    'Alien','Angel','Bandit','Beast','Bot','Brawler','Captain','Cheetah','Charger','Comet',
    'Crafter','Cyclone','Dancer','Dino','DJ','Dragon','Drifter','Dynamo','Eagle','Explorer',
    'Falcon','Flame','Gamer','Gargoyle','Ghost','Glider','Goblin','Golem','Guitar','Hacker',
    'Hero','Hobbit','Hunter','Jester','Jumper','Knight','Koala','Laser','Lion','Lizard',
    'Magician','Mammoth','Mantis','Martian','Mermaid','Mime','Monkey','Monster','Ninja',
    'Nomad','Otter','Owlet','Panther','Penguin','Phantom','Phoenix','Pirate','Pixel','Puma',
    'Punk','Puzzler','Raccoon','Ranger','Rhino','Robot','Rocket','Samurai','Sasquatch','Scout',
    'Seeker','Shark','Skater','Sloth','Snake','Spark','Specter','Spider','Sprite','Squirrel',
    'Stingray','Storm','Surfer','Tiger','Tinker','Titan','Toon','Torch','Tornado','Turtle',
    'Viking','Viper','Voyager','Warrior','Wizard','Wombat','Yeti','Zebra','Zeppelin','Zombie'
  ],
  [
    'Ace','Adventurer','Agent','Alchemist','Avenger','Baron','Beast','Champion','Chief','Crafter',
    'Crusader','Daredevil','Defender','Druid','Duke','Enchanter','Engineer','Fighter','Guru','Hunter',
    'Juggernaut','King','Legend','Lord','Maestro','Master','Maverick','Mercenary','Mystic','Nerd',
    'Nomad','Overlord','Paladin','Pirate','Prodigy','Protector','Pioneer','Queen','Raider','Ranger',
    'Rockstar','Rogue','Sage','Samurai','Scholar','Scout','Seer','Sentinel','Shaman','Slayer',
    'Smith','Sorcerer','Specialist','Speedster','Stargazer','Strategist','Summoner','Superstar',
    'Survivor','Tactician','Tempest','Tinker','Trailblazer','Traveler','Trickster','Vagabond','Vanguard',
    'Virtuoso','Visionary','Voyager','Warlock','Warrior','Whiz','Wizard','Wrestler','Warden','Warlord',
    'Architect','Artisan','Athlete','Commander','Conqueror','Creator','Dreamer','Explorer','Guardian',
    'Inventor','Leader','Pilot','Rebel','Sculptor','Seeker','Technician','Trendsetter','Tycoon','Wanderer'
  ]
]

function sample (arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randomize () {
  part1.value = sample(wordLists[0])
  part2.value = sample(wordLists[1])
  part3.value = sample(wordLists[2])
}

// Initialize dropdowns with random selections
part1.value = sample(wordLists[0])
part2.value = sample(wordLists[1])
part3.value = sample(wordLists[2])

/* ── Lifecycle ──────────────────────────────────────────────────────── */
onMounted(async () => {
  if (!user.value) return navigateTo('/')
  if (!user.value.needsSetup) return navigateTo('/dashboard')

  if (user.value.username) {
    step.value = 2 // username already set
    await loadAvatars()
    await loadStarterSets()
  }
})

/* ── Actions ───────────────────────────────────────────────────────── */
async function saveUsername () {
  error.value = ''
  username.value = `${part1.value}${part2.value}${part3.value}`
  savingUsername.value = true
  try {
    await $fetch('/api/auth/set-username', {
      method: 'POST',
      body: { username: username.value },
      credentials: 'include'
    })
    await fetchSelf()
    step.value = 2
    await loadAvatars()
    await loadStarterSets()
  } catch (e) {
    error.value = e?.data?.message || 'Username already taken, try again.'
  } finally {
    savingUsername.value = false
  }
}

async function loadAvatars () {
  avatars.value = await $fetch('/api/avatars', { credentials: 'include' })
}

/* NEW: load active starter sets */
async function loadStarterSets () {
  error.value = ''
  loadingSets.value = true
  try {
    // public onboarding endpoint
    starterSets.value = await $fetch('/api/starters', { credentials: 'include' })
  } catch (e) {
    console.error('Failed to load starter sets:', e)
    error.value = 'Failed to load starter sets.'
  } finally {
    loadingSets.value = false
  }
}

async function saveAvatar () {
  if (!selectedAvatar.value) {
    error.value = 'Please select an avatar.'
    return
  }
  error.value = ''
  savingAvatar.value = true
  try {
    await $fetch('/api/auth/set-avatar', {
      method: 'POST',
      body: { avatar: selectedAvatar.value },
      credentials: 'include'
    })
    await fetchSelf()

    if (!user.value?.username || !user.value?.avatar) {
      step.value = 2
    } else {
      step.value = 3
      await loadStarterSets()
    }
  } catch (e) {
    error.value = 'Could not save avatar.'
  } finally {
    savingAvatar.value = false
  }
}

/* UPDATED: choose by setId (or setKey if you prefer) */
async function chooseStarterSet () {
  if (selectedSet.value === null) return
  const set = starterSets.value[selectedSet.value]
  savingStarterSet.value = true
  error.value = ''
  try {
    const response = await $fetch('/api/starter-sets', {
      method: 'POST',
      body: { setId: set.id }, // or { setKey: set.key }
      credentials: 'include'
    })
    if (response?.success) {
      window.location.reload()
    } else {
      throw new Error('Starter set not granted')
    }
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Could not save starter set.'
  } finally {
    savingStarterSet.value = false
  }
}
</script>

<style scoped>
/* optional styles */
</style>
