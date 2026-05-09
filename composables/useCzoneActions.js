// Module-level singleton — stores function references from the mounted MyCzone instance
const _actions = { save: null, clearZone: null }

export const useCzoneActions = () => ({
  register: (save, clearZone) => {
    _actions.save = save
    _actions.clearZone = clearZone
  },
  unregister: () => {
    _actions.save = null
    _actions.clearZone = null
  },
  save: () => _actions.save?.(),
  clearZone: () => _actions.clearZone?.(),
})
