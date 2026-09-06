<template>
  <!-- Teleported to body for the same reason as the other Economy overlays
       (EconomyCtoonHistoryModal, EconomyFeaturedAuctionsCarousel): .site-container
       carries a transform, which makes it the containing block for
       position:fixed descendants and clips them. z-index 1100 matches the
       normal Economy-modal tier — this only ever opens from the ticker on the
       base page, never from inside another modal, so it never needs to stack
       above the 1150 carousel/history tier. -->
  <Teleport to="body">
    <div class="eavm-overlay" @click.self="$emit('close')">
      <div class="eavm-card">
        <!-- AuctionDetails already renders its own '‹ Back' header and manages
             its own load/socket lifecycle (join/leave auction_${id}, live bid
             and auction-ended handling) — this wrapper adds nothing but the
             overlay chrome. Its 'back' emit is this modal's only close path. -->
        <AuctionDetails :auction-id="auctionId" @back="$emit('close')" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  auctionId: { type: [String, Number], required: true }
})
defineEmits(['close'])
</script>

<style scoped>
.eavm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px;
  box-sizing: border-box;
}

.eavm-card {
  background: #0b1f33;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  /* AuctionDetails' root is height:100% (it normally sits in a layout with a
     fixed-height content area), so this needs an explicit height, not just a
     max-height, for that percentage chain to resolve. */
  height: 90vh;
  max-height: 640px;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
}

@media (max-width: 768px) {
  .eavm-card {
    height: 94vh;
    max-height: none;
  }
}
</style>
