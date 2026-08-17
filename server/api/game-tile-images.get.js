import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getPokemonBattleAssets } from '@/server/utils/pokemonBattleAssets'

export default defineEventHandler(async () => {
  const cfg = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      gameTileWinballImagePath:      true,
      gameTileLottoImagePath:        true,
      gameTileWinwheelImagePath:     true,
      gameTileClashImagePath:        true,
      gameTileTkoImagePath:          true,
      gameTileReorbitmatchImagePath: true,
      gameTileTowerImagePath:        true,
      gameTileReorbitmemoryImagePath: true,
      gameTileGuessctoonImagePath:   true,
      gameTileAsteroidImagePath:     true,
      gameTileFlappyImagePath:       true,
      gameTileBlackjackImagePath:    true,
      gameTileEdrpsImagePath:        true,
      gameTileFruitsamuraiImagePath: true,
      gameTilePokemonbattleImagePath: true
    }
  })

  // A game an admin has switched off is reported separately from its tile, because an absent
  // tile only means "no image uploaded" -- GamesHome still renders a text tile in that case,
  // which would leave a switched-off game plainly visible.
  const { config } = await getPokemonBattleAssets()
  const hidden = config.enabled ? [] : ['pokemonbattle']

  return {
    hidden,
    winball:      cfg?.gameTileWinballImagePath      ?? null,
    lotto:        cfg?.gameTileLottoImagePath        ?? null,
    winwheel:     cfg?.gameTileWinwheelImagePath     ?? null,
    clash:        cfg?.gameTileClashImagePath        ?? null,
    tko:          cfg?.gameTileTkoImagePath          ?? null,
    reorbitmatch: cfg?.gameTileReorbitmatchImagePath ?? null,
    tower:        cfg?.gameTileTowerImagePath        ?? null,
    reorbitmemory: cfg?.gameTileReorbitmemoryImagePath ?? null,
    guessctoon:   cfg?.gameTileGuessctoonImagePath    ?? null,
    asteroid:     cfg?.gameTileAsteroidImagePath      ?? null,
    flappy:       cfg?.gameTileFlappyImagePath        ?? null,
    blackjack:    cfg?.gameTileBlackjackImagePath     ?? null,
    edrps:        cfg?.gameTileEdrpsImagePath         ?? null,
    fruitsamurai: cfg?.gameTileFruitsamuraiImagePath  ?? null,
    pokemonbattle: cfg?.gameTilePokemonbattleImagePath ?? null
  }
})
