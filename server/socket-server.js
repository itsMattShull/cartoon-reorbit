import dotenv from 'dotenv';
dotenv.config();
import { createServer } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const PORT = process.env.SOCKET_PORT || 3001

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
})

const zoneVisitors = {}
const zoneSockets = {}

const tradeRooms = {}
const tradeSockets = {}

io.on('connection', socket => {
  console.log('connected')
  socket.on('join-zone', ({ zone }) => {
    console.log('joined: ', zone)
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
    console.log(zone)
    console.log(user)
    console.log(message)
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
})

httpServer.listen(PORT, () => {
  console.log('Socket server listening on port 3001')
})