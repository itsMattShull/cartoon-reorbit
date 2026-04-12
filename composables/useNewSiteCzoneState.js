export const useNewSiteCzoneState = () => useState('newSiteCzoneState', () => ({
  buildMode:        false,
  zones:            [{ background: '', toons: [] }],
  activeZone:       0,
  saving:           false,
  collection:       [],
  loadingCollection: false,
  backgrounds:      [],
  activeDrag:       null,   // { ctoon: {...} } when dragging from CzoneEdit
  ghostX:           0,
  ghostY:           0,
}))
