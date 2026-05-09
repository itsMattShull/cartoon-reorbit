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

  return {
    tradeActiveTab,
    tradeTargetUser,
    tradeCurrentStep,
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
