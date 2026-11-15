// socket.io-client for the composable test: connects to the test server and says which simulated player this module instance is.
import { io as realIo } from 'socket.io-client'
export const io = (url, opts = {}) => realIo(url, { ...opts, transports: ['websocket'], forceNew: true, auth: { uid: globalThis.__TEST_UID } })
