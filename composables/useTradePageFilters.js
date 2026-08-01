export const useTradePageFilters = () => {
  const tradeActiveTab = useState('tradeActiveTab', () => 'incoming')
  const tradeTargetUser = useState('tradeTargetUser', () => null)
  const tradeCurrentStep = useState('tradeCurrentStep', () => 1)

  const tradeFiltersOther = useState('tradeFiltersOther', () => ({
    nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all'
  }))
  const tradeFiltersSelf = useState('tradeFiltersSelf', () => ({
    nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false
  }))

  const tradeSetOptionsOther = useState('tradeSetOptionsOther', () => ['All'])
  const tradeSetOptionsSelf = useState('tradeSetOptionsSelf', () => ['All'])
  const tradeSeriesOptionsOther = useState('tradeSeriesOptionsOther', () => ['All'])
  const tradeSeriesOptionsSelf = useState('tradeSeriesOptionsSelf', () => ['All'])
  const tradeRarityOptionsOther = useState('tradeRarityOptionsOther', () => ['All'])
  const tradeRarityOptionsSelf = useState('tradeRarityOptionsSelf', () => ['All'])
  const tradeNameSuggestionsOther = useState('tradeNameSuggestionsOther', () => [])
  const tradeNameSuggestionsSelf = useState('tradeNameSuggestionsSelf', () => [])
  const tradeLoadingWishlist = useState('tradeLoadingWishlist', () => false)
  const tradeTargetWishlistCount = useState('tradeTargetWishlistCount', () => 0)

  // ── Counter-offer mode ────────────────────────────────────────────
  // Lives here rather than in Trade.vue because tradeActiveTab/tradeTargetUser/
  // tradeCurrentStep already do. A counter held in a component-local ref would
  // be dropped when the user navigates away mid-build while the wizard state
  // around it survived — and the send would then silently go out as a plain
  // offer, leaving the original still pending.
  const tradeCounterSourceId = useState('tradeCounterSourceId', () => null)
  const tradeCounterSummary = useState('tradeCounterSummary', () => null)

  return {
    tradeActiveTab,
    tradeTargetUser,
    tradeCurrentStep,
    tradeCounterSourceId,
    tradeCounterSummary,
    tradeFiltersOther,
    tradeFiltersSelf,
    tradeSetOptionsOther,
    tradeSetOptionsSelf,
    tradeSeriesOptionsOther,
    tradeSeriesOptionsSelf,
    tradeRarityOptionsOther,
    tradeRarityOptionsSelf,
    tradeNameSuggestionsOther,
    tradeNameSuggestionsSelf,
    tradeLoadingWishlist,
    tradeTargetWishlistCount,
  }
}
