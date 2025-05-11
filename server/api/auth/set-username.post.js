export default defineEventHandler(async (event) => {
    const userId = event.context.userId
    if (!userId) throw createError({ statusCode: 401 })
  
    const { username } = await readBody(event)

    // ------------ allowed username segments (must match client dropdowns) ------------
    const PREFIXES = [
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
    ]

    const MIDDLES = [
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
    ]

    const SUFFIXES = [
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

    // validate pattern function
    function isValidUsername (str) {
      for (const pre of PREFIXES) {
        if (str.startsWith(pre)) {
          const rest1 = str.slice(pre.length)
          for (const mid of MIDDLES) {
            if (rest1.startsWith(mid)) {
              const suf = rest1.slice(mid.length)
              return SUFFIXES.includes(suf)
            }
          }
        }
      }
      return false
    }

    if (!username || !isValidUsername(username)) {
      throw createError({ statusCode: 400, statusMessage: 'Username must be built from the provided options.' })
    }
  
    const prisma = event.context.prisma
  
    // Ensure uniqueness
    const exists = await prisma.user.findFirst({ where: { username } })
    if (exists) throw createError({ statusCode: 409, statusMessage: 'Username already taken' })
  
    // Update local DB
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username }
    })
  
    // Update nickname in Discord server
    const { botToken, discord } = useRuntimeConfig(event)
    try {
      await $fetch(
        `https://discord.com/api/guilds/${discord.guildId}/members/${user.discordId}`,
        {
          method: 'PATCH',
          headers: { Authorization: botToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nick: username })
        }
      )
    } catch (err) {
      console.warn('Nickname update skipped (likely owner):', err?.response?.status || err)
      // continue without throwing
    }
  
    return { success: true }
  })
  