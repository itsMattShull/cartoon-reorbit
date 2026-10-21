import { emptyDeckFilter } from '@/utils/ogGtoonDeckFilter'

// Shared between the Manage Deck tab (the grid) and the left sidebar (the controls).
export const useOgGtoonDeckFilter = () => useState('ogGtoonDeckFilter', () => emptyDeckFilter())

// Dropdown options, derived by the Manage Deck tab from the gToons the player owns.
export const useOgGtoonDeckMeta = () => useState('ogGtoonDeckMeta', () => ({
  sets: [],
  series: [],
  minNumber: 0,
  maxNumber: 0
}))
