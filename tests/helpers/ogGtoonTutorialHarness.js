// tests/helpers/ogGtoonTutorialHarness.js
//
// Drives the real tutorial socket module (server/utils/ogGtoonsTutorial.js) with a fake socket and
// the lent decks built from the import CSV, so tests need neither a database nor socket.io.
import { loadOgGtoonCtoons } from './ogGtoonCsv.js'
import { buildTutorialDecks } from '../../server/utils/ogGtoonTutorialDeck.js'
import { registerOgGtoonsTutorial } from '../../server/utils/ogGtoonsTutorial.js'

export const catalog = loadOgGtoonCtoons()
export const decks = buildTutorialDecks(catalog)

let nextUser = 0
export function harness({ config, loadDecks, isInPvp = false } = {}) {
  const handlers = {}
  const sent = []
  const userId = `tut-user-${++nextUser}`
  const io = { local: { to: (sid) => ({ emit: (ev, payload) => sent.push({ sid, ev, payload }) }) } }
  const socket = {
    id: `sock-${userId}`, data: {},
    on: (ev, fn) => { handlers[ev] = fn },
    emit: (ev, payload) => sent.push({ sid: socket.id, ev, payload })
  }
  registerOgGtoonsTutorial(io, socket, async () => ({ id: userId, username: 'Tester' }), {
    loadDecks: loadDecks || (async () => decks),
    getConfig: async () => config || { gameEnabled: true, practiceEnabled: false },
    isInPvp: () => isInPvp
  })
  const call = (name, payload) => handlers[`oggtoons:tutorial:${name}`](payload)
  const VIEW = new Set(['oggtoons:matchStart', 'oggtoons:state', 'oggtoons:reveal', 'oggtoons:matchEnd'])
  const view = () => { for (let i = sent.length - 1; i >= 0; i--) if (VIEW.has(sent[i].ev)) return sent[i].payload; return null }
  const errors = () => sent.filter(s => s.ev === 'oggtoons:error').map(s => s.payload)
  return { userId, handlers, sent, call, view, errors }
}
