export const useCzoneState = () => useState('czoneState', () => ({
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
  saveTrigger:      0,      // incremented by CzoneEdit to trigger save in MyCzone
  clearTrigger:     0,      // incremented by CzoneEdit to trigger clearZone in MyCzone
}))
