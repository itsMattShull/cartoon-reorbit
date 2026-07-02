// Ephemeral, per-visit "Art Mode" toggle for cZone viewing — hides the Second
// Edition overlay icon for the viewer only. Defaults off; MyCzone.vue resets it
// to off whenever the viewed cZone/user changes.
export const useArtMode = () => useState('czoneArtMode', () => false)
