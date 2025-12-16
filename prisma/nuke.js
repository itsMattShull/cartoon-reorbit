// server/scripts/nuke.js
import { prisma } from '../server/prisma.js'

async function nuke() {
  const del = async (label, fn) => {
    try {
      const res = await fn()
      console.log(`• ${label}: deleted ${res.count}`)
    } catch (e) {
      console.error(`✗ ${label}:`, e.message)
      throw e
    }
  }

  try {
    console.log('🔥 Resetting ALL tables (including Ctoon)…\n')

    // ── Trade / Auction ecosystem (most dependent first) ────────────────
    await del('Bid',            () => prisma.bid.deleteMany())
    await del('Auction',        () => prisma.auction.deleteMany())

    await del('TradeOfferCtoon',() => prisma.tradeOfferCtoon.deleteMany())
    await del('TradeOffer',     () => prisma.tradeOffer.deleteMany())

    await del('TradeCtoon',     () => prisma.tradeCtoon.deleteMany())
    await del('Trade',          () => prisma.trade.deleteMany())
    await del('TradeSpectator', () => prisma.tradeSpectator.deleteMany())
    await del('TradeRoom',      () => prisma.tradeRoom.deleteMany())

    // ── Gameplay / decks / logs ─────────────────────────────────────────
    await del('ClashDeckCard',  () => prisma.clashDeckCard.deleteMany())
    await del('ClashDeck',      () => prisma.clashDeck.deleteMany())
    await del('ClashGame',      () => prisma.clashGame.deleteMany())

    await del('WheelSpinLog',   () => prisma.wheelSpinLog.deleteMany())
    await del('WinWheelOption', () => prisma.winWheelOption.deleteMany()) // before GameConfig

    // ── Packs & rewards (child → parent order) ──────────────────────────
    await del('RewardCtoon',    () => prisma.rewardCtoon.deleteMany())
    await del('RewardPack',     () => prisma.rewardPack.deleteMany())
    await del('RewardBackground', () => prisma.rewardBackground.deleteMany())

    await del('Claim',          () => prisma.claim.deleteMany())
    await del('ClaimCodePrerequisite', () => prisma.claimCodePrerequisite.deleteMany())
    await del('ClaimCodeReward',() => prisma.claimCodeReward.deleteMany())
    await del('ClaimCode',      () => prisma.claimCode.deleteMany())

    await del('UserPack',       () => prisma.userPack.deleteMany())
    await del('PackCtoonOption',() => prisma.packCtoonOption.deleteMany())
    await del('PackRarityConfig',() => prisma.packRarityConfig.deleteMany())
    await del('Pack',           () => prisma.pack.deleteMany())

    // ── Backgrounds ─────────────────────────────────────────────────────
    await del('UserBackground', () => prisma.userBackground.deleteMany())
    await del('Background',     () => prisma.background.deleteMany())

    // ── Starter Sets (items first) ──────────────────────────────────────
    // await del('StarterSetItem', () => prisma.starterSetItem.deleteMany())
    // await del('StarterSet',     () => prisma.starterSet.deleteMany())

    // ── Misc app data tied to users / ctoons ────────────────────────────
    await del('WishlistItem',   () => prisma.wishlistItem.deleteMany())
    await del('Visit',          () => prisma.visit.deleteMany())
    await del('LoginLog',       () => prisma.loginLog.deleteMany())
    await del('GamePointLog',   () => prisma.gamePointLog.deleteMany())
    await del('PointsLog',      () => prisma.pointsLog.deleteMany())

    // ── Config (after WinWheelOption) ───────────────────────────────────
    await del('GameConfig',         () => prisma.gameConfig.deleteMany())
    await del('GlobalGameConfig',   () => prisma.globalGameConfig.deleteMany())

    // ── User-owned cToons must be cleared before Users/Ctoon ────────────
    await del('UserCtoon',      () => prisma.userCtoon.deleteMany())

    // ── User scaffolding (deps first) ───────────────────────────────────
    await del('Friend',         () => prisma.friend.deleteMany())
    await del('UserIP',         () => prisma.userIP.deleteMany())
    await del('CZone',          () => prisma.cZone.deleteMany())
    await del('UserPoints',     () => prisma.userPoints.deleteMany())
    await del('User',           () => prisma.user.deleteMany())

    // ── Finally: the cToon catalog itself ───────────────────────────────
    // await del('Ctoon',          () => prisma.ctoon.deleteMany())

    console.log('\n✅ Database reset complete: all tables cleared.')
  } catch (err) {
    console.error('\n❌ Reset failed:', err)
    process.exitCode = 1
  } finally {
    // no explicit disconnect
  }
}

nuke()
