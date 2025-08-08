import dotenv from 'dotenv'
dotenv.config()

import { createServer }  from 'http'
import { Server }        from 'socket.io'
import { prisma as db }  from './prisma.js'
import { DateTime } from 'luxon'

import fs                 from 'node:fs'
import path               from 'node:path'
import { dirname }        from 'node:path'
import { fileURLToPath }  from 'node:url'
import { randomUUID }     from 'crypto'

/* ── Clash engine & helpers ────────────────────────────────── */
import { createBattle }   from './utils/battleEngine.js'

/* ── Load Cartoon-Network lanes once at boot ──────────────── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const lanesPath = path.join(__dirname, '../data/lanes.json')
const LANES     = JSON.parse(fs.readFileSync(lanesPath, 'utf-8'))

/* ────────────────────────────────────────────────────────────
 *  HTTP + Socket.IO bootstrap
 * ────────────────────────────────────────────────────────── */
const PORT = process.env.SOCKET_PORT || 3001
const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: '*' } })

/* ────────────────────────────────────────────────────────────
 *  cZone visitors & chat (unchanged)
 * ────────────────────────────────────────────────────────── */
const zoneVisitors = {}        // zone → count
const zoneSockets  = {}        // zone → Set(socketId)

// near top, alongside pveMatches:
const pvpRooms   = new Map();    // roomId -> { players: [userId], decks: {userId: deck} }
const pvpMatches = new Map();    // roomId -> { battle, recordId }

/* ────────────────────────────────────────────────────────────
 *  Trade rooms (unchanged)
 * ────────────────────────────────────────────────────────── */
const tradeRooms   = {}
const tradeSockets = {}

/* ── Clash PvE: Select → Reveal → Setup ───────────────────── */
// Fisher–Yates shuffle helper
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function aiChooseSelections(battle) {
  const { aiEnergy, aiHand } = battle.state
  const playable = aiHand.filter(c => c.cost <= aiEnergy)
  if (!playable.length) return []
  // pick highest-cost card, random lane
  const card = playable.sort((a, b) => b.cost - a.cost)[0]
  const laneIndex = Math.floor(Math.random() * 3)
  return [{ cardId: card.id, laneIndex }]
}

const pveMatches = new Map()

function broadcastPhase(io, match) {
  io.to(match.id).emit('phaseUpdate', match.battle.publicState())
}

async function endMatch(io, match, result) {
  const { winner, playerLanesWon, aiLanesWon } = result;
  let toGive = 0;

  if (winner === 'player') {
    try {
      const userId = match.playerUserId;

      // 1) Load Clash config (pointsPerWin)
      const clashConfig = await db.gameConfig.findUnique({
        where: { gameName: 'Clash' },
        select: { pointsPerWin: true }
      });

      // 2) Load the singleton global cap
      const globalConfig = await db.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { dailyPointLimit: true }
      });

      if (clashConfig && globalConfig) {
        const { pointsPerWin }         = clashConfig;
        const { dailyPointLimit: cap } = globalConfig;

        const nowCST    = DateTime.now().setZone('America/Chicago');
        const cutoffCST = nowCST.hour >= 20
          ? nowCST.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
          : nowCST.minus({ days: 1 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 });
        const cutoffUTC = cutoffCST.toUTC().toJSDate();

        // 6) Sum points awarded since that cutoff
        const agg = await db.gamePointLog.aggregate({
          where: {
            userId,
            createdAt: { gte: cutoffUTC }
          },
          _sum: { points: true }
        });
        const usedSinceCutoff = agg._sum.points || 0;

        // 7) Compute how many we can still give
        const remaining = Math.max(0, cap - usedSinceCutoff);
        toGive = Math.min(pointsPerWin, remaining);

        // 8) Award if possible
        if (toGive > 0) {
          await db.gamePointLog.create({ data: { userId, points: toGive } });
          const updated = await db.userPoints.upsert({
            where: { userId },
            create: { userId, points: toGive },
            update: { points: { increment: toGive } }
          });
          await db.pointsLog.create({
            data: { userId, points: toGive, total: updated.points, method: "Game - gToons Clash", direction: 'increase' }
          });
        }
      }
    } catch (err) {
      console.error('Failed to award Clash points:', err);
    }
  }

  // 9) Mark the game record ended
  await db.clashGame.update({
    where: { id: match.recordId },
    data: {
      endedAt:      new Date(),
      winnerUserId: winner === 'player' ? match.playerUserId : null,
      outcome:      winner
    }
  });

  // 10) Broadcast the end‐of‐game summary
  io.to(match.id).emit('gameEnd', {
    winner,
    playerLanesWon,
    aiLanesWon,
    pointsAwarded: toGive
  });

  clearInterval(match.timer);
  pveMatches.delete(match.id);
}


function startSelectTimer(io, match) {
  match.selectDeadline = Date.now() + 60_000
  if (match.timer) clearInterval(match.timer)
  match.timer = setInterval(() => {
    match.battle.tick(Date.now())
    broadcastPhase(io, match)
    if (match.battle.state.phase === 'gameEnd') {
      endMatch(io, match, match.battle.state.result)
    }
  }, 1000)
}


io.on('connection', socket => {
  // --- List open PvP rooms ---
  socket.on('listClashRooms', async () => {
    // fetch only active, waiting rooms
    const rooms = Array.from(pvpRooms.entries())
      .filter(([id, data]) => data.players.length === 1)
      .map(([id, data]) => ({ id, owner: data.players[0] }));
    socket.emit('clashRooms', rooms);
  });

  // --- Create a new PvP room ---
  socket.on('createClashRoom', ({ roomId, userId, deck }) => {
    // store room
    pvpRooms.set(roomId, { players: [userId], decks: { [userId]: deck } });
    // persist to DB
    db.clashGame.create({ data: { player1UserId: userId, player2UserId: null } })
      .then(record => {
        pvpRooms.get(roomId).recordId = record.id;
      });
    socket.join(roomId);
    // notify lobby
    io.emit('roomCreated', { id: roomId, owner: userId });
  });

  // --- Join existing PvP room ---
  socket.on('joinClashRoom', ({ roomId, userId, deck }) => {
    const room = pvpRooms.get(roomId);
    if (!room || room.players.length !== 1) {
      socket.emit('joinError', { message: 'Room unavailable.' });
      return;
    }
    room.players.push(userId);
    room.decks[userId] = deck;
    socket.join(roomId);
    // update DB record with player2UserId
    db.clashGame.update({ where: { id: room.recordId }, data: { player2UserId: userId } });

    // start PvP match
    const battleId = randomUUID();
    const battle = createBattle({
      playerDeck: room.decks[ room.players[0] ],
      aiDeck:     room.decks[ room.players[1] ], // reuse second deck field
      battleId,
      lanes: LANES
    });
    // store match
    pvpMatches.set(roomId, { battle, recordId: room.recordId });

    // emit gameStart to both
    io.to(roomId).emit('gameStart', battle.publicState());
  });

  // --- Relay selectCards & game flow ---
  socket.on('selectPvPCards', ({ selections }) => {
    const roomId = socket.data.roomId;
    const match  = pvpMatches.get(roomId);
    if (!match) return;
    const side   = match.battle.state.priority === 'player1' ? 'player' : 'player2';
    match.battle.select(side, selections);
    match.battle.confirm(side);
    broadcastPhase(io, match);
  });

  /* ──────────   Clash PvE   ────────── */
  socket.on('joinPvE', async ({ deck, userId }) => {
    const aiDeck = shuffle(deck).slice(0, 12)
    const gameId = randomUUID()
    const battle = createBattle({
      playerDeck: deck,
      aiDeck,
      battleId: gameId,
      lanes: LANES
    })

    const { id: recordId } = await db.clashGame.create({
      data: {
        player1UserId: userId,
        player2UserId: null
      }
    })

    const match = {
      id:           gameId,
      socketId:     socket.id,
      battle,
      playerConfirmed: false,
      recordId,
      aiConfirmed:     false,
      timer:           null,
      selectDeadline:  null,
      playerUserId: userId
    }

    pveMatches.set(gameId, match)

    socket.data.gameId = gameId
    socket.join(gameId)

    startSelectTimer(io, match)
    socket.emit('gameStart', battle.publicState())
  })

  /* ── Handle player selection ──────────────────────────── */
  socket.on('selectCards', ({ selections }) => {
    const match = pveMatches.get(socket.data.gameId)
    if (!match) {
      console.warn(
        '[Server] no match found for socket.data.gameId=',
        socket.data.gameId
      )
      return
    }
    if (match.battle.state.phase !== 'select') {
      console.warn('[Server] selectCards but phase=', match.battle.state.phase)
      return
    }

    // AI makes its selection
    const aiSel = aiChooseSelections(match.battle)

    // Apply & confirm both sides (engine will run reveal→setup)
    match.battle.select('player', selections)
    match.battle.select('ai', aiSel)
    match.battle.confirm('player')
    match.battle.confirm('ai')

    // broadcast the new state (after reveal & setup)
    broadcastPhase(io, match)

    // restart the select timer for the next turn
    startSelectTimer(io, match)
    broadcastPhase(io, match)

    // handle game end
    if (match.battle.state.phase === 'gameEnd') {
      endMatch(io, match, match.battle.state.result)
    }
  })

  /* ── Disconnect handling ──────────────────────────────── */
  socket.on('disconnect', () => {
    const gid = socket.data.gameId
    if (!gid) return
    const match = pveMatches.get(gid)
    if (match) {
      endMatch(io, match, {
        winner: 'incomplete',           // mark as incomplete
        playerLanesWon: 0,
        aiLanesWon:     0,
        reason:        'player_disconnect'
      })
    }
  })

  socket.on('join-zone', ({ zone }) => {
    socket.zone = zone
    socket.join(zone)

    zoneSockets[zone] = (zoneSockets[zone] || new Set());
    if (!zoneSockets[zone].has(socket.id)) {
      zoneSockets[zone].add(socket.id)
      zoneVisitors[zone] = (zoneVisitors[zone] || 0) + 1
      io.to(zone).emit('visitor-count', zoneVisitors[zone])
    }
  })

  socket.on('chat-message', ({ zone, user, message }) => {
    io.to(zone).emit('chat-message', { user, message })
  })

  socket.on('join-trade-room', async ({ room, user }) => {
    socket.tradeRoom = room
    socket.user = user
    socket.join(room)
    if (!tradeRooms[room]) {
      tradeRooms[room] = {
        traderA: null,
        traderB: null,
        spectators: new Set(),
        offers: {},
        confirmed: {},
        finalized: {}   // track finalize-phase per user
      }
    }

    const roomData = tradeRooms[room]

    if (!roomData.traderA) {
      roomData.traderA = user
    } else if (roomData.traderA !== user && roomData.traderB !== user) {
      roomData.spectators.add(socket.id)
    }

    tradeSockets[socket.id] = room

    // Load full user info for traders
    const traderAUser = roomData.traderA
      ? await db.user.findUnique({
          where: { username: roomData.traderA },
          select: { username: true, avatar: true }
        })
      : null;
    const traderBUser = roomData.traderB
      ? await db.user.findUnique({
          where: { username: roomData.traderB },
          select: { username: true, avatar: true }
        })
      : null;

    io.to(room).emit('trade-room-update', {
      traderA: traderAUser,
      traderB: traderBUser,
      spectators: roomData.spectators.size,
      offers: roomData.offers,
      confirmed: roomData.confirmed
    })
  })

  socket.on('become-traderB', async ({ room, user }) => {
    const roomData = tradeRooms[room]
    if (!roomData) return

    if (!roomData.traderB) {
      roomData.traderB = user
      // Remove from spectators if previously added
      roomData.spectators.delete(socket.id)
      // Persist Trader B to database
      try {
        // Look up the user ID by username
        const dbUser = await db.user.findUnique({ where: { username: user } });
        if (dbUser) {
          await db.tradeRoom.update({
            where: { name: room },
            data: { traderBId: dbUser.id }
          });
        }
      } catch (err) {
        console.error('Failed to set traderB in DB:', err);
      }

      // Load full user info for traders
      const traderAUser = roomData.traderA
        ? await db.user.findUnique({
            where: { username: roomData.traderA },
            select: { username: true, avatar: true }
          })
        : null;
      const traderBUser = roomData.traderB
        ? await db.user.findUnique({
            where: { username: roomData.traderB },
            select: { username: true, avatar: true }
          })
        : null;

      io.to(room).emit('trade-room-update', {
        traderA: traderAUser,
        traderB: traderBUser,
        spectators: roomData.spectators.size,
        offers: roomData.offers,
        confirmed: roomData.confirmed
      })
    } else {
      socket.emit('become-traderB-failed', { message: 'Trader B slot is already taken.' })
    }
  })

  socket.on('add-trade-offer', async ({ room, user, ctoons }) => {
    const roomData = tradeRooms[room]
    if (!roomData) return

    roomData.offers[user] = ctoons
    roomData.confirmed[user] = false

    // Load full user info for traders
    const traderAUser = roomData.traderA
      ? await db.user.findUnique({
          where: { username: roomData.traderA },
          select: { username: true, avatar: true }
        })
      : null;
    const traderBUser = roomData.traderB
      ? await db.user.findUnique({
          where: { username: roomData.traderB },
          select: { username: true, avatar: true }
        })
      : null;

    io.to(room).emit('trade-room-update', {
      traderA: traderAUser,
      traderB: traderBUser,
      spectators: roomData.spectators.size,
      offers: roomData.offers,
      confirmed: roomData.confirmed
    })
  })

  socket.on('remove-all-trade-offer', async ({ room, user }) => {
    const roomData = tradeRooms[room]
    if (!roomData) return

    roomData.offers[user] = []
    roomData.confirmed[user] = false

    // Load full user info for traders
    const traderAUser = roomData.traderA
      ? await db.user.findUnique({
          where: { username: roomData.traderA },
          select: { username: true, avatar: true }
        })
      : null;
    const traderBUser = roomData.traderB
      ? await db.user.findUnique({
          where: { username: roomData.traderB },
          select: { username: true, avatar: true }
        })
      : null;

    io.to(room).emit('trade-room-update', {
      traderA: traderAUser,
      traderB: traderBUser,
      spectators: roomData.spectators.size,
      offers: roomData.offers,
      confirmed: roomData.confirmed
    })
  })

  socket.on('confirm-trade', async ({ room, user }) => {
    const roomData = tradeRooms[room]
    if (!roomData) return

    roomData.confirmed[user] = true

    // Load full user info for traders
    const traderAUser = roomData.traderA
      ? await db.user.findUnique({
          where: { username: roomData.traderA },
          select: { username: true, avatar: true }
        })
      : null;
    const traderBUser = roomData.traderB
      ? await db.user.findUnique({
          where: { username: roomData.traderB },
          select: { username: true, avatar: true }
        })
      : null;

    io.to(room).emit('trade-room-update', {
      traderA: traderAUser,
      traderB: traderBUser,
      spectators: roomData.spectators.size,
      offers: roomData.offers,
      confirmed: roomData.confirmed
    })
  })

  socket.on('cancel-trade', async ({ room, user }) => {
    const roomData = tradeRooms[room]
    if (!roomData) return
  
    // Mark this user as un-confirmed
    roomData.confirmed   = {}
    roomData.finalized   = {}
  
    // Look up full trader info
    const traderAUser = roomData.traderA
      ? await db.user.findUnique({
          where: { username: roomData.traderA },
          select: { username: true, avatar: true }
        })
      : null
  
    const traderBUser = roomData.traderB
      ? await db.user.findUnique({
          where: { username: roomData.traderB },
          select: { username: true, avatar: true }
        })
      : null
  
    // Broadcast the updated, enriched room snapshot
    io.to(room).emit('trade-room-update', {
      traderA: traderAUser,
      traderB: traderBUser,
      spectators: roomData.spectators.size,
      offers: roomData.offers,
      confirmed: roomData.confirmed
    })
  })

  // --- Finalize-trade event for two-phase trade flow ---
  socket.on('finalize-trade', async ({ room, user }) => {
    const roomData = tradeRooms[room]
    if (!roomData) return
    roomData.finalized[user] = true

    // If both traders have finalized, execute the swap:
    const a = roomData.traderA, b = roomData.traderB
    if (roomData.finalized[a] && roomData.finalized[b]) {
      // 1) Resolve IDs
      const recA = await db.user.findUnique({ where: { username: a }, select:{id:true} })
      const recB = await db.user.findUnique({ where: { username: b }, select:{id:true} })
      if (!recA || !recB) return
      const aId = recA.id, bId = recB.id

      const offersA = roomData.offers[a]||[]
      const offersB = roomData.offers[b]||[]
      const ops = []

      for (const c of offersA) {
        ops.push(db.userCtoon.update({ where:{id:c.id}, data:{ userId: bId } }))
      }
      for (const c of offersB) {
        ops.push(db.userCtoon.update({ where:{id:c.id}, data:{ userId: aId } }))
      }

      Promise.all(ops)
        .then(async () => {
          // CZone cleanup omitted for brevity (keep yours)
          try {
            // Trader A’s zone
            const aZone = await db.cZone.findUnique({ where: { userId: aId } });
            if (aZone && Array.isArray(aZone.layoutData)) {
              const filtered = aZone.layoutData.filter(id => !offersA.some(ct => ct.id === id));
              await db.cZone.update({
                where: { userId: aId },
                data: { layoutData: filtered }
              });
            }
          } catch (err) {
            console.error('Failed updating CZone for Trader A:', err);
          }
          try {
            // Trader B’s zone
            const bZone = await db.cZone.findUnique({ where: { userId: bId } });
            if (bZone && Array.isArray(bZone.layoutData)) {
              const filtered = bZone.layoutData.filter(id => !offersB.some(ct => ct.id === id));
              await db.cZone.update({
                where: { userId: bId },
                data: { layoutData: filtered }
              });
            }
          } catch (err) {
            console.error('Failed updating CZone for Trader B:', err);
          }
          // Reset state
          roomData.offers = {}
          roomData.confirmed = {}
          roomData.finalized = {}

          // Notify cleared
          const traderAUser = await db.user.findUnique({ where:{id:aId}, select:{username:true,avatar:true} })
          const traderBUser = await db.user.findUnique({ where:{id:bId}, select:{username:true,avatar:true} })
          io.to(room).emit('trade-room-update', {
            traderA: traderAUser,
            traderB: traderBUser,
            spectators: roomData.spectators.size,
            offers: roomData.offers,
            confirmed: roomData.confirmed
          })
          io.to(room).emit('trade-complete', { message: 'Trade completed successfully.' })
        })
        .catch(err => {
          console.error('Trade execution failed:', err)
          io.to(room).emit('trade-error', { message: 'Trade failed. Please try again.' })
        })
    }
  })

  socket.on('trade-chat', ({ room, user, message }) => {
    io.to(room).emit('trade-chat', { user, message })
  })

  socket.on('leave-zone', ({ zone }) => {
    if (zone && zoneVisitors[zone]) {
      zoneVisitors[zone]--
      if (zoneSockets[zone]) {
        zoneSockets[zone].delete(socket.id)
      }

      if (zoneVisitors[zone] <= 0) {
        delete zoneVisitors[zone]
        delete zoneSockets[zone]
      } else {
        io.to(zone).emit('visitor-count', zoneVisitors[zone])
      }
    }
  })

  socket.on('disconnecting', async () => {
    const zone = socket.zone
    if (zone && zoneSockets[zone] && zoneSockets[zone].has(socket.id)) {
      zoneSockets[zone].delete(socket.id)
      zoneVisitors[zone] = Math.max((zoneVisitors[zone] || 1) - 1, 0)

      if (zoneVisitors[zone] === 0) {
        delete zoneVisitors[zone]
        delete zoneSockets[zone]
      } else {
        io.to(zone).emit('visitor-count', zoneVisitors[zone])
      }
    }

    const tradeRoom = tradeSockets[socket.id]
    if (
      tradeRoom &&
      tradeRooms[tradeRoom] &&
      (
        tradeRooms[tradeRoom].traderA === socket.user ||
        tradeRooms[tradeRoom].traderB === socket.user
      )
    ) {
      const roomData = tradeRooms[tradeRoom]
      let leftA = false;
      let leftB = false;
      if (roomData.traderA === socket.user) { roomData.traderA = null; leftA = true; }
      if (roomData.traderB === socket.user) { roomData.traderB = null; leftB = true; }
      roomData.spectators.delete(socket.id)
      delete tradeSockets[socket.id]
    
      // ← Insert here:
      // Reset this trader’s offers and confirmation/finalization state
      roomData.offers[socket.user]    = []
      roomData.confirmed[socket.user] = false
      roomData.finalized[socket.user] = false
    
      // Persist trader slot removal to database …
      // Persist trader slot removal to database
      try {
        const updateData = {};
        if (leftA) updateData.traderAId = null;
        if (leftB) updateData.traderBId = null;
        if (Object.keys(updateData).length) {
          await db.tradeRoom.update({
            where: { name: tradeRoom },
            data: updateData
          });
        }
      } catch (err) {
        console.error('Failed to clear trader slot in DB:', err);
      }

      // Notify remaining clients of updated room state
      // Load full user info for traders
      const traderAUser = roomData.traderA
        ? await db.user.findUnique({ where: { username: roomData.traderA }, select: { username: true, avatar: true } })
        : null;
      const traderBUser = roomData.traderB
        ? await db.user.findUnique({ where: { username: roomData.traderB }, select: { username: true, avatar: true } })
        : null;
      io.to(tradeRoom).emit('trade-room-update', {
        traderA: traderAUser,
        traderB: traderBUser,
        spectators: roomData.spectators.size,
        offers: roomData.offers,
        confirmed: roomData.confirmed
      });

      const bothTradersGone = !roomData.traderA && !roomData.traderB;
      if (bothTradersGone) {
        // Notify spectators to leave the room
        for (const spectatorSocketId of roomData.spectators) {
          io.to(spectatorSocketId).emit('leave-trade-room');
        }
        // Notify room that it's inactive
        io.to(tradeRoom).emit('trade-room-inactive');

        const updatedRoom = await db.tradeRoom.update({
          where: { name: tradeRoom },
          data: { active: false }
        });

        try {
          // If no trades exist for this room, clean up
          const hasTrade = await db.trade.findFirst({
            where: { roomId: updatedRoom.id }
          });
          if (!hasTrade) {
            await db.tradeSpectator.deleteMany({
              where: { roomId: updatedRoom.id }
            });
            await db.tradeRoom.delete({
              where: { id: updatedRoom.id }
            });
          }
        } catch (err) {
          // Ignore if the trade room record was already deleted (P2025)
          if (err.code !== 'P2025') {
            console.error('Failed to clean up trade room:', err);
          }
        }
        // Clear out room state
        delete tradeRooms[tradeRoom];
      }
    }
    else if (tradeRoom && tradeRooms[tradeRoom]) {
      // Spectator leaving
      const roomData = tradeRooms[tradeRoom];
      if (roomData.spectators.has(socket.id)) {
        roomData.spectators.delete(socket.id);
        delete tradeSockets[socket.id];
        // Load full user info for traders
        const traderAUser = roomData.traderA
          ? await db.user.findUnique({ where: { username: roomData.traderA }, select: { username: true, avatar: true } })
          : null;
        const traderBUser = roomData.traderB
          ? await db.user.findUnique({ where: { username: roomData.traderB }, select: { username: true, avatar: true } })
          : null;
        // Emit updated room state
        io.to(tradeRoom).emit('trade-room-update', {
          traderA: traderAUser,
          traderB: traderBUser,
          spectators: roomData.spectators.size,
          offers: roomData.offers,
          confirmed: roomData.confirmed
        });
      }
    }
  })

  socket.on('leave-traderoom', async () => {
    const tradeRoom = tradeSockets[socket.id];
    if (
      tradeRoom &&
      tradeRooms[tradeRoom] &&
      (
        tradeRooms[tradeRoom].traderA === socket.user ||
        tradeRooms[tradeRoom].traderB === socket.user
      )
    ) {
      const roomData = tradeRooms[tradeRoom];
      let leftA = false;
      let leftB = false;
      if (roomData.traderA === socket.user) { roomData.traderA = null; leftA = true; }
      if (roomData.traderB === socket.user) { roomData.traderB = null; leftB = true; }
      roomData.spectators.delete(socket.id);
      delete tradeSockets[socket.id];
    
      // ← Insert here:
      roomData.offers[socket.user]    = []
      roomData.confirmed[socket.user] = false
      roomData.finalized[socket.user] = false
    
      // Persist trader slot removal to database
      try {
        const updateData = {};
        if (leftA) updateData.traderAId = null;
        if (leftB) updateData.traderBId = null;
        if (Object.keys(updateData).length) {
          await db.tradeRoom.update({
            where: { name: tradeRoom },
            data: updateData
          });
        }
      } catch (err) {
        console.error('Failed to clear trader slot in DB:', err);
      }
      // Notify remaining clients of updated room state
      const traderAUser = roomData.traderA
        ? await db.user.findUnique({ where: { username: roomData.traderA }, select: { username: true, avatar: true } })
        : null;
      const traderBUser = roomData.traderB
        ? await db.user.findUnique({ where: { username: roomData.traderB }, select: { username: true, avatar: true } })
        : null;
      io.to(tradeRoom).emit('trade-room-update', {
        traderA: traderAUser,
        traderB: traderBUser,
        spectators: roomData.spectators.size,
        offers: roomData.offers,
        confirmed: roomData.confirmed
      });
      
      const bothTradersGone = !roomData.traderA && !roomData.traderB;
      if (bothTradersGone) {
        for (const spectatorSocketId of roomData.spectators) {
          io.to(spectatorSocketId).emit('leave-trade-room');
        }
        io.to(tradeRoom).emit('trade-room-inactive');
        try {
          const updatedRoom = await db.tradeRoom.update({
            where: { name: tradeRoom },
            data: { active: false }
          });
          // If no trades exist for this room, clean up
          const hasTrade = await db.trade.findFirst({
            where: { roomId: updatedRoom.id }
          });
          if (!hasTrade) {
            await db.tradeSpectator.deleteMany({
              where: { roomId: updatedRoom.id }
            });
            await db.tradeRoom.delete({
              where: { id: updatedRoom.id }
            });
          }
        } catch (err) {
          // Ignore if record not found (P2025)
          if (err.code !== 'P2025') {
            console.error('Failed to clean up trade room:', err);
          }
        }
        delete tradeRooms[tradeRoom];
      }
    }
    else if (tradeRoom && tradeRooms[tradeRoom]) {
      // Spectator leaving via explicit event
      const roomData = tradeRooms[tradeRoom];
      if (roomData.spectators.has(socket.id)) {
        roomData.spectators.delete(socket.id);
        delete tradeSockets[socket.id];
        // Load full user info for traders
        const traderAUser = roomData.traderA
          ? await db.user.findUnique({ where: { username: roomData.traderA }, select: { username: true, avatar: true } })
          : null;
        const traderBUser = roomData.traderB
          ? await db.user.findUnique({ where: { username: roomData.traderB }, select: { username: true, avatar: true } })
          : null;
        io.to(tradeRoom).emit('trade-room-update', {
          traderA: traderAUser,
          traderB: traderBUser,
          spectators: roomData.spectators.size,
          offers: roomData.offers,
          confirmed: roomData.confirmed
        });
      }
    }
  });

  socket.on('new-bid', payload => {
    // forward every property, including newEndAt when present
    io.to(`auction_${payload.auctionId}`).emit('new-bid', payload)
  })

  socket.on('join-auction', ({ auctionId }) => {
    socket.join(`auction_${auctionId}`)
  })

  // leave that auction room
  socket.on('leave-auction', ({ auctionId }) => {
    socket.leave(`auction_${auctionId}`)
  })
})

// 2. Periodically scan for ended auctions and finalize them.
//    Runs every 60s (adjust as desired).
// in your socket‐server.js (or wherever you close auctions):
setInterval(async () => {
  const now = new Date()
  // find all auctions that have just expired
  const toClose = await db.auction.findMany({
    where: { status: 'ACTIVE', endAt: { lte: now } }
  })

  for (const auc of toClose) {
    const { id, creatorId, userCtoonId } = auc

    // 1) fetch *all* bids for this auction, descending
    const allBids = await db.bid.findMany({
      where: { auctionId: id },
      orderBy: { amount: 'desc' }
    })

    // 2) pick the first bid whose bidder still has ≥ that many points
    let winningBid = null
    for (const b of allBids) {
      const ptsRec = await db.userPoints.findUnique({ where: { userId: b.userId } })
      const pts     = ptsRec?.points ?? 0
      if (pts >= b.amount) {
        winningBid = b
        break
      }
    }

    // 3) Now wrap the final update & any transfers in a transaction
    await db.$transaction(async tx => {
      // close the auction record
      await tx.auction.update({
        where: { id },
        data: {
          status:   'CLOSED',
          winnerId: winningBid?.userId || null,
          highestBidderId: winningBid?.userId || null,
          winnerAt: now,
          // if we found a valid winningBid, update highestBid to match it
          ...(winningBid && { highestBid: winningBid.amount })
        }
      })

      // unlock the cToon
      await tx.userCtoon.update({
        where: { id: userCtoonId },
        data:  { isTradeable: true }
      })

      // 4) if we have a real winner, do the point transfers + cToon transfer
      if (winningBid) {
        // debit the winner
        const loserPts = await tx.userPoints.update({
          where: { userId: winningBid.userId },
          data: { points: { decrement: winningBid.amount } }
        })
        await tx.pointsLog.create({
          data: {
            userId:   winningBid.userId,
            points:   winningBid.amount,
            total:    loserPts.points,
            method:   'Auction',
            direction:'decrease'
          }
        })

        // credit the creator
        const creatorPts = await tx.userPoints.upsert({
          where:  { userId: creatorId },
          create: { userId: creatorId, points: winningBid.amount },
          update: { points: { increment: winningBid.amount } }
        })
        await tx.pointsLog.create({
          data: {
            userId:   creatorId,
            points:   winningBid.amount,
            total:    creatorPts.points,
            method:   'Auction',
            direction:'increase'
          }
        })

        // transfer the cToon
        await tx.userCtoon.update({
          where: { id: userCtoonId },
          data:  { userId: winningBid.userId, isTradeable: true }
        })
      }
    })

    // 5) notify clients of the final outcome
    io.to(`auction_${id}`).emit('auction-ended', {
      winnerId:   winningBid?.userId ?? null,
      winningBid: winningBid?.amount ?? 0
    })
  }
}, 60 * 1000)

// Auction notifications
setInterval(async () => {
  const now  = new Date()
  const five = new Date(now.getTime() + 5 * 60 * 1000)

  // fetch auctions ending in the next 5m, not yet notified
  const soonAuctions = await db.auction.findMany({
    where: {
      status: 'ACTIVE',
      endAt:   { lte: five, gt: now },
      endingSoonNotified: false
    },
    include: {
      userCtoon:     { include: { ctoon: true } },
      creator:       true,
      highestBidder: true     // ← include highestBidder
    }
  })

  for (const auc of soonAuctions) {
    try {
      const botToken  = process.env.BOT_TOKEN
      const channelId = '1401244687163068528'
      const baseUrl   = process.env.NODE_ENV === 'production'
        ? 'https://www.cartoonreorbit.com'
        : 'http://localhost:3001'
      const auctionLink = `${baseUrl}/auction/${auc.id}`

      // cToon details
      const { name, rarity, assetPath } = auc.userCtoon.ctoon
      const mintNumber = auc.userCtoon.mintNumber

      // determine bid display: use initialBet if no bids
      const hasBidder       = Boolean(auc.highestBidder)
      const displayedBid    = hasBidder ? auc.highestBid : auc.initialBet
      const topBidderTag    = hasBidder
        ? `<@${auc.highestBidder.discordId}>`
        : 'No one has bid on it'

      // build & encode image URL
      const rawImageUrl = assetPath
        ? assetPath.startsWith('http')
          ? assetPath
          : `${baseUrl}${assetPath}`
        : null
      const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

      // payload with embed + image + bid info
      const payload = {
        content: `⏰ **Auction ending within 5 minutes!** ⏰`,
        embeds: [
          {
            title: name,
            url: auctionLink,
            fields: [
              { name: 'Rarity',       value: rarity,                           inline: true },
              { name: 'Mint #',       value: `${mintNumber ?? 'N/A'}`,       inline: true },
              { name: 'Highest Bid',  value: `${displayedBid}`,               inline: true },
              { name: 'Top Bidder',   value: topBidderTag,                    inline: true },
              { name: 'Ends In',      value: `<t:${Math.floor(new Date(auc.endAt).getTime()/1000)}:R>`, inline: false },
              { name: 'View Auction', value: `[Click here](${auctionLink})`,   inline: false }
            ],
            ...(imageUrl ? { image: { url: imageUrl } } : {})
          }
        ]
      }

      // send to Discord
      const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `${botToken}`,
            'Content-Type':  'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

      const json = await res.json()
      if (!res.ok) {
        console.error(
          `Discord warning failed (${res.status}):`,
          JSON.stringify(json, null, 2)
        )
      }

      // mark as notified
      await db.auction.update({
        where: { id: auc.id },
        data:  { endingSoonNotified: true }
      })
    } catch (err) {
      console.error(`Failed 5m-warning for auction ${auc.id}:`, err)
    }
  }
}, 60 * 1000)

httpServer.listen(PORT, () => {
  console.log('Socket server listening on port 3001')
})