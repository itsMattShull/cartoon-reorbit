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

const ASSET_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://www.cartoonreorbit.com'
    : 'http://localhost:3000';

const withAsset = p => (p
  ? (p.startsWith('http') ? p : `${ASSET_BASE}${p}`)
  : null);

const sid = v => String(v)

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

// --- Stake settlement helper: pays out based on outcome, safely once ---
async function settleStakes(recordId, { outcome, winnerUserId, whoLeftUserId } = {}) {
  return db.$transaction(async tx => {
    const rec = await tx.clashGame.findUnique({
      where: { id: recordId },
      select: {
        player1UserId: true, player2UserId: true,
        player1Points: true, player2Points: true
      }
    })
    if (!rec) return { payouts: {} }

    const p1 = rec.player1UserId
    const p2 = rec.player2UserId
    const s1 = rec.player1Points || 0
    const s2 = rec.player2Points || 0
    const pot = s1 + s2

    // If already settled (stakes zeroed), do nothing.
    if (pot === 0 && s1 === 0 && s2 === 0) return { payouts: {} }

    const payouts = {}

    if (outcome === 'tie') {
      if (p1 && s1 > 0) payouts[p1] = (payouts[p1] || 0) + s1
      if (p2 && s2 > 0) payouts[p2] = (payouts[p2] || 0) + s2
    } else {
      // Winner path: either explicit winnerUserId or survivor on disconnect
      let winner = winnerUserId
      if (!winner && whoLeftUserId) {
        winner = whoLeftUserId === p1 ? p2 : p1
      }
      if (winner && pot > 0) payouts[winner] = (payouts[winner] || 0) + pot
    }

    // credit users & log
    for (const [uid, amt] of Object.entries(payouts)) {
      if (amt <= 0) continue
      const updated = await tx.userPoints.upsert({
        where: { userId: uid },
        create: { userId: uid, points: amt },
        update: { points: { increment: amt } }
      })
      await tx.pointsLog.create({
        data: {
          userId: uid,
          points: amt,
          total:  updated.points,
          method: 'Game - gToons Clash',
          direction: 'increase'
        }
      })
    }

    return { payouts }
  })
}

async function awardClashWinPoints(userId) {
  let toGive = 0
  try {
    const clashConfig  = await db.gameConfig.findUnique({
      where: { gameName: 'Clash' },
      select: { pointsPerWin: true }
    })
    const globalConfig = await db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    if (!clashConfig || !globalConfig) return 0

    const { pointsPerWin }         = clashConfig
    const { dailyPointLimit: cap } = globalConfig

    const nowCST    = DateTime.now().setZone('America/Chicago')
    const cutoffCST = nowCST.hour >= 20
      ? nowCST.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
      : nowCST.minus({ days: 1 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
    const cutoffUTC = cutoffCST.toUTC().toJSDate()

    const agg = await db.gamePointLog.aggregate({
      where: { userId, createdAt: { gte: cutoffUTC } },
      _sum:  { points: true }
    })
    const used = agg._sum.points || 0
    const remaining = Math.max(0, cap - used)
    toGive = Math.min(pointsPerWin, remaining)
    if (toGive > 0) {
      await db.gamePointLog.create({ data: { userId, points: toGive } })
      const updated = await db.userPoints.upsert({
        where:  { userId },
        create: { userId, points: toGive },
        update: { points: { increment: toGive } }
      })
      await db.pointsLog.create({
        data: { userId, points: toGive, total: updated.points, method: 'Game - gToons Clash', direction: 'increase' }
      })
    }
  } catch (e) {
    console.error('Failed to award PvP Clash points:', e)
  }
  return toGive
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

function clampSelectionsToLaneCap(state, selections, side, cap = 4) {
  if (!Array.isArray(selections)) return []
  const counts = state.lanes.map(l => side === 'player' ? l.player.length : l.ai.length)
  const out = []
  for (const sel of selections) {
    const i = sel.laneIndex
    if (Number.isInteger(i) && i >= 0 && i < counts.length && counts[i] < cap) {
      out.push(sel)
      counts[i]++
    }
  }
  return out
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

const clone = o => JSON.parse(JSON.stringify(o));

function viewForUser(match, uid, baseState = null) {
  // engine uses 'player' (owner) and 'ai' (joiner). We remap so
  // each client always sees themselves as "player".
  const engineSide = match.userSide?.[uid]; // 'player' or 'ai'
  const raw = clone(baseState || match.battle.state);

  if (engineSide === 'player') {
    // Hide opponent hand/deck
    raw.aiHand = undefined;
    raw.aiDeck = undefined;
    return raw;
  }

  // engineSide === 'ai'  -> this is PLAYER 2. Swap fields so they see "me" as player.
  [raw.playerEnergy, raw.aiEnergy] = [raw.aiEnergy, raw.playerEnergy];
  [raw.playerHand,   raw.aiHand  ] = [raw.aiHand,   raw.playerHand  ];
  [raw.playerDeck,   raw.aiDeck  ] = [raw.aiDeck,   raw.playerDeck  ];
  raw.lanes.forEach(l => { [l.player, l.ai] = [l.ai, l.player]; });

  // Flip priority wording so UI texts ("You attack first") stay correct.
  if (raw.priority === 'player') raw.priority = 'ai';
  else if (raw.priority === 'ai') raw.priority = 'player';

  // Now hide opponent (which is 'ai' after swap)
  raw.aiHand = undefined;
  raw.aiDeck = undefined;
  return raw;
}

async function emitStateToRoom(io, roomId, match, build) {
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    const uid = s.data.userId;
    s.emit('phaseUpdate', build(uid));
  }
}

function roomSize(io, roomId) {
  const set = io.sockets.adapter.rooms.get(roomId)
  return set ? set.size : 0
}

async function handleClashLeave(io, { roomId, userId, leavingSocketId }) {
  if (!roomId) return

  // If there is an active PvP match in this room, end it as incomplete.
  const match = pvpMatches.get(roomId)
  if (match) {
    // compute “future” size after this socket leaves
    let size = roomSize(io, roomId)
    const set = io.sockets.adapter.rooms.get(roomId)
    if (leavingSocketId && set && set.has(leavingSocketId)) size -= 1

    if (match.timer) clearInterval(match.timer)

    // Figure out survivor/winner for stake payout
    const p1Id = Object.entries(match.userSide).find(([, side]) => side === 'player')?.[0] || null;
    const p2Id = Object.entries(match.userSide).find(([, side]) => side === 'ai')?.[0] || null;

    // Mark DB and settle stakes to survivor
    let stakePayouts = {}
    try {
      await db.clashGame.update({
        where: { id: match.recordId },
        data: {
          endedAt:       new Date(),
          outcome:       'incomplete',
          winnerUserId:  null,
          whoLeftUserId: userId || null
        }
      })

      const { payouts } = await settleStakes(match.recordId, {
        outcome: 'win',
        winnerUserId: null,
        whoLeftUserId: userId || null
      })
      stakePayouts = payouts || {}
    } catch (e) {
      console.error('Failed to mark PvP game incomplete / settle stakes:', e)
    }

    // Notify remaining sockets with individualized payout amount
    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) {
      s.emit('gameEnd', {
        winner: 'incomplete',
        playerLanesWon: 0,
        aiLanesWon: 0,
        reason: 'opponent_disconnect',
        pointsAwarded: 0,
        // 👇 NEW
        stakeAwarded: Number(stakePayouts[s.data.userId] || 0)
      })
    }

    // cleanup
    pvpMatches.delete(roomId)
    io.emit('roomRemoved', { id: roomId })
    return
  }

  // ── Otherwise handle *lobby* rooms (unchanged logic) ──
  const lobby = pvpRooms.get(roomId)
  if (lobby) {
    if (userId) {
      lobby.players = lobby.players.filter(id => id !== String(userId))
      if (lobby.decks) delete lobby.decks[String(userId)]
    }

    // recompute future size after this socket leaves
    let size = roomSize(io, roomId)
    const set = io.sockets.adapter.rooms.get(roomId)
    if (leavingSocketId && set && set.has(leavingSocketId)) size -= 1

    if (size <= 0) {
      pvpRooms.delete(roomId)
      io.emit('roomRemoved', { id: roomId })
    } else if (lobby.players.length === 1) {
      const u = await db.user.findUnique({
        where: { id: lobby.players[0] },
        select: { username: true }
      })
      io.emit('roomCreated', { 
        id: roomId, 
        owner: u?.username || 'Unknown',
        points: lobby.stakePoints ?? 0
      })
    }
  }
}

function lobbySnapshot(room) {
  const [p1, p2] = room.players
  return {
    players: room.players,
    usernames: room.usernames || {},
    points: room.stakePoints || 0,
    haveDeck: {
      [p1]: !!room.decks?.[p1],
      [p2]: !!room.decks?.[p2],
    },
    ready: room.ready || {}
  }
}

async function startPvpMatch(roomId) {
  const room = pvpRooms.get(roomId)
  if (!room || pvpMatches.has(roomId)) return
  const [p1, p2] = room.players
  if (!room.decks?.[p1] || !room.decks?.[p2]) return
  if (!room.ready?.[p1] || !room.ready?.[p2]) return
  const stake = Math.max(0, Math.floor(Number(room.stakePoints || 0)))

  const battleId = randomUUID()
  const battle = createBattle({
    playerDeck: room.decks[p1],
    aiDeck:     room.decks[p2],   // 2nd player as opponent
    battleId,
    lanes: LANES
  })

  // create the DB record *now* (game really starts here)
  let record
  try {
    record = await db.$transaction(async tx => {
      // Ensure UserPoints rows exist
      await tx.userPoints.upsert({ where: { userId: p1 }, create: { userId: p1, points: 0 }, update: {} })
      await tx.userPoints.upsert({ where: { userId: p2 }, create: { userId: p2, points: 0 }, update: {} })

      // Load balances now that rows exist
      const a = await tx.userPoints.findUnique({ where: { userId: p1 } })
      const b = await tx.userPoints.findUnique({ where: { userId: p2 } })

      if ((a?.points ?? 0) < stake || (b?.points ?? 0) < stake) {
        throw new Error('INSUFFICIENT_STAKE_BALANCE')
      }

      // Debit both (only if stake > 0)
      let aAfter = a, bAfter = b
      if (stake > 0) {
        aAfter = await tx.userPoints.update({
          where: { userId: p1 },
          data:  { points: { decrement: stake } }
        })
        await tx.pointsLog.create({
          data: { userId: p1, points: stake, total: aAfter.points, method: 'Game - gToons Clash', direction: 'decrease' }
        })

        bAfter = await tx.userPoints.update({
          where: { userId: p2 },
          data:  { points: { decrement: stake } }
        })
        await tx.pointsLog.create({
          data: { userId: p2, points: stake, total: bAfter.points, method: 'Game - gToons Clash', direction: 'decrease' }
        })
      }

      // Create the ClashGame with the stake on both sides
      const rec = await tx.clashGame.create({
        data: {
          player1UserId: p1,
          player2UserId: p2,
          player1Points: stake,     // 👈 NEW
          player2Points: stake,     // 👈 NEW
          startedAt:     new Date()
        }
      })
      return rec
    })
  } catch (err) {
    if (String(err?.message) === 'INSUFFICIENT_STAKE_BALANCE') {
      // Notify room that the match cannot start due to stake issues
      io.to(roomId).emit('pvpStakeError', { message: 'One or both players lack enough points to stake.' })
      // Return the room to “waiting” state if needed
      // (Nothing debited; lobby stays intact.)
      return
    }
    console.error('Failed to create staked ClashGame:', err)
    io.to(roomId).emit('pvpStakeError', { message: 'Failed to initialize staked match.' })
    return
  }

  pvpMatches.set(roomId, {
    battle,
    recordId: record.id,
    // map userId -> battle side ("player" is owner, "ai" is joiner)
    userSide: { [p1]: 'player', [p2]: 'ai' },
    pending:  { player: null, ai: null },
    confirmed:{ player: false, ai: false },
    timer: null
  })
  pvpRooms.delete(roomId); // no longer a lobby entity

  (async () => {
    const match = pvpMatches.get(roomId);
    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) {
      s.emit('gameStart', viewForUser(match, s.data.userId));
    }
  })();
  startPvpTimer(io, roomId)
}

function startPvpTimer(io, roomId) {
  const match = pvpMatches.get(roomId);
  if (!match) return;

  match.selectDeadline = Date.now() + 60_000;
  if (match.timer) clearInterval(match.timer);

  match.timer = setInterval(async () => {
    const now = Date.now();

    // ----- HARD TIMEOUT ON SELECT -----
    if (match.battle.state.phase === 'select' &&
        match.selectDeadline &&
        now >= match.selectDeadline) {

      const pConf = !!match.confirmed.player;
      const aConf = !!match.confirmed.ai;

      // Stop ticking and close the room no matter what.
      clearInterval(match.timer);
      match.timer = null;

      if (!pConf && !aConf) {
        // Case A: nobody confirmed → INCOMPLETE
        try {
          await db.clashGame.update({
            where: { id: match.recordId },
            data: {
              endedAt:      new Date(),
              outcome:      'incomplete',
              winnerUserId: null
            }
          });
        } catch (e) {
          console.error('Failed to mark PvP timeout incomplete:', e);
        }

        const sockets = await io.in(roomId).fetchSockets();
        for (const s of sockets) {
          s.emit('gameEnd', {
            winner: 'incomplete',
            playerLanesWon: 0,
            aiLanesWon:     0,
            reason:          'turn_timeout',
            pointsAwarded:   0
          });
        }
        pvpMatches.delete(roomId);
        return;
      }

      // Case B: exactly one confirmed → that side wins
      const winnerSide = pConf ? 'player' : 'ai';
      const p1Id = Object.entries(match.userSide).find(([, side]) => side === 'player')?.[0] || null;
      const p2Id = Object.entries(match.userSide).find(([, side]) => side === 'ai')?.[0] || null;
      const winnerUserId = winnerSide === 'player' ? p1Id : p2Id;

      let awarded = 0;
      let stakePayouts = {};
      try {
        await db.clashGame.update({
          where: { id: match.recordId },
          data: {
            endedAt:      new Date(),
            winnerUserId: winnerUserId,
            outcome:      'player'       // keep your outcome mapping as-is
          }
        });
        if (winnerUserId) {
          awarded = await awardClashWinPoints(winnerUserId);
        }
        // 👇 NEW: settle the pot for the winner
        const { payouts } = await settleStakes(match.recordId, {
          outcome: 'win',
          winnerUserId
        });
        stakePayouts = payouts || {};
      } catch (e) {
        console.error('Failed to close PvP on timeout win:', e);
      }

      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        const mine = match.userSide?.[s.data.userId] || 'player';
        const winner =
          winnerSide === 'player'
            ? (mine === 'player' ? 'player' : 'ai')
            : (mine === 'player' ? 'ai' : 'player');

        s.emit('gameEnd', {
          winner,
          playerLanesWon: 0,
          aiLanesWon:     0,
          reason:         'turn_timeout',
          pointsAwarded:  (s.data.userId === winnerUserId ? awarded : 0),
          // 👇 NEW: amount of stake they personally received
          stakeAwarded:   Number(stakePayouts[s.data.userId] || 0)
        });
      }

      pvpMatches.delete(roomId);
      return;
    }
    // -----------------------------------

    // Freeze engine if one side has confirmed and we’re waiting on the other
    const waitingOnOther =
      match.battle.state.phase === 'select' &&
      (match.confirmed.player || match.confirmed.ai) &&
      !(match.confirmed.player && match.confirmed.ai);

    if (!waitingOnOther) {
      match.battle.tick(now);
    }

    const raw = clone(match.battle.state);

    await emitStateToRoom(io, roomId, match, uid => {
      const snap = viewForUser(match, uid, raw);
      if (snap.phase === 'select' && !snap.selectEndsAt && match.selectDeadline) {
        snap.selectEndsAt = match.selectDeadline;
      }
      return snap;
    });

    if (raw.phase === 'gameEnd') {
      clearInterval(match.timer);
      match.timer = null;

      const p1Id = Object.entries(match.userSide).find(([, side]) => side === 'player')?.[0] || null;
      const p2Id = Object.entries(match.userSide).find(([, side]) => side === 'ai')?.[0] || null;
      const outcome = raw.winner; // 'player' | 'ai' | 'tie'
      const winnerUserId = outcome === 'player' ? p1Id : outcome === 'ai' ? p2Id : null;

      let awarded = 0;
      let stakePayouts = {};
      try {
        await db.clashGame.update({
          where: { id: match.recordId },
          data: {
            endedAt:      new Date(),
            winnerUserId: winnerUserId,
            outcome:      outcome    // 👈 keep actual outcome (not always 'player')
          }
        });

        if (winnerUserId) {
          awarded = await awardClashWinPoints(winnerUserId);
        }

        // 👇 NEW: settle pot (winner gets pot; tie returns each stake)
        const { payouts } = await settleStakes(match.recordId, {
          outcome: outcome === 'tie' ? 'tie' : 'win',
          winnerUserId
        });
        stakePayouts = payouts || {};
      } catch (e) {
        console.error('Failed to finalize PvP game:', e);
      }

      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        const mine = match.userSide?.[s.data.userId] || 'player';
        const winner =
          raw.winner === 'tie' ? 'tie'
          : raw.winner === 'player'
            ? (mine === 'player' ? 'player' : 'ai')
            : (mine === 'player' ? 'ai'     : 'player');

        const youLanes =  mine === 'player' ? raw.playerLanesWon : raw.aiLanesWon;
        const oppLanes =  mine === 'player' ? raw.aiLanesWon     : raw.playerLanesWon;

        s.emit('gameEnd', {
          winner,
          playerLanesWon: youLanes,
          aiLanesWon:     oppLanes,
          pointsAwarded:  (s.data.userId === winnerUserId ? awarded : 0),
          // 👇 NEW
          stakeAwarded:   Number(stakePayouts[s.data.userId] || 0)
        });
      }
      pvpMatches.delete(roomId);
    }
  }, 1000);
}

io.on('connection', socket => {

  socket.on('leaveClashRoom', async ({ roomId, userId }) => {
    try {
      // leave socket.io room
      socket.leave(roomId)

      // delegate everything else (lobby or active match) to one place
      await handleClashLeave(io, {
        roomId,
        userId,
        leavingSocketId: socket.id
      })
    } catch (e) {
      console.error('leaveClashRoom failed:', e)
    }
  })

  // --- List open PvP rooms ---
  socket.on('listClashRooms', async () => {
    // waiting rooms = exactly one player
    const waiting = Array.from(pvpRooms.entries()).filter(([, data]) => data.players.length === 1)
    const ownerIds = waiting.map(([, data]) => data.players[0])
    const users = ownerIds.length
      ? await db.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, username: true }
        })
      : []
    const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Unknown']))
    const rooms = waiting.map(([id, data]) => ({
      id,
      owner: nameById[data.players[0]] || 'Unknown',
      points: data.stakePoints ?? 0 
    }))
    socket.emit('clashRooms', rooms)
  })

  // --- Create a new PvP room ---
  socket.on('createClashRoom', async ({ roomId, userId, deck, points }) => {
    // store room
    const uid = sid(userId)

    // Validate & clamp stake against creator's balance server-side
    const requested = Math.max(0, Math.floor(Number(points || 0)))
    const up = await db.userPoints.findUnique({ where: { userId: uid } })
    const balance = up?.points ?? 0
    const stake = Math.min(requested, balance)   // never exceed current balance

    pvpRooms.set(roomId, {
      players: [uid],
      decks: {},          // set later via setPvpDeck
      ready: {},          // userId -> bool
      usernames: {},       // userId -> username
      stakePoints: stake
    })
    socket.join(roomId);
    socket.data.roomId = roomId
    socket.data.userId = uid
    // notify lobby
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, discordId: true }
    })
    pvpRooms.get(roomId).usernames[uid] = u?.username || 'Unknown'
    io.emit('roomCreated', { id: roomId, owner: u?.username || 'Unknown', points: stake })

    // ── Discord announce: new gToons Clash PvP room ─────────────────────────
    try {
      const botToken  = process.env.BOT_TOKEN
      const channelId = '1404262134527033416'
      if (!botToken) {
        console.warn('BOT_TOKEN not set; skipping PvP room Discord notify')
      } else {
        const display = u?.discordId ? `<@${u.discordId}>` : (u?.username || 'Unknown')
        const payload = {
          content: `🎮 ${display} created a gToons Clash **PvP** room and is looking for a match!  Head over here to play them: https://www.cartoonreorbit.com/games/clash/rooms`
        }
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `${botToken}`, // keep consistent with your auction code
              'Content-Type':  'application/json'
            },
            body: JSON.stringify(payload)
          }
        )
        if (!res.ok) {
          let errJson = null
          try { errJson = await res.json() } catch {}
          console.error('Failed to send PvP room Discord message:', res.status, errJson)
        }
      }
    } catch (err) {
      console.error('Discord PvP room notify failed:', err)
    }
  });

  // --- Join existing PvP room ---
  socket.on('joinClashRoom', async ({ roomId, userId, deck }) => {
    const room = pvpRooms.get(roomId);
    if (!room || room.players.length !== 1) {
      socket.emit('joinError', { message: 'Room unavailable.' });
      return;
    }
    socket.join(roomId)
    socket.data.roomId = roomId
    const uid = sid(userId)
    socket.data.userId = uid

    const ownerId = room.players[0]
    // If the owner opens their own room page, don't "take" the second slot.
    if (uid === ownerId) {
      // Owner loading their page; idle until opponent arrives
      io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
      return
    }

    // A different user is joining: fill second slot
    if (!room.players.includes(uid)) room.players.push(uid)
    const u2 = await db.user.findUnique({ where: { id: userId }, select: { username: true } })
    room.usernames[uid] = u2?.username || 'Unknown'

    // Now this room is no longer "waiting" → remove from lobby lists
    io.emit('roomRemoved', { id: roomId })
    // Tell both clients the current pregame state
    io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
  });

  socket.on('listClashDecks', async ({ userId }) => {
    const decks = await db.clashDeck.findMany({
      where: { userId },
      include: { cards: { include: { ctoon: true } } }
    })
    const payload = decks.map(d => ({
      id: d.id,
      name: d.name,
      size: d.cards.length,
      // For preview; server will refetch on selection anyway if you want
      sampleNames: d.cards.slice(0, 3).map(c => c.ctoon.name)
    }))
    socket.emit('clashDecks', payload)
  })

  socket.on('setPvpDeck', async ({ roomId, userId, deckId }) => {
    const room = pvpRooms.get(roomId)
    const uid = sid(userId)
    if (!room || !room.players.includes(uid)) return

    const deck = await db.clashDeck.findUnique({
      where: { id: deckId },
      include: { cards: { include: { ctoon: true } } }
    })
    if (!deck || deck.userId !== userId) {
      socket.emit('deckError', { message: 'Invalid deck' })
      return
    }

    const cards = deck.cards.map(dc => dc.ctoon).slice(0, 12)
    room.decks[uid] = cards.map(c => ({
      id: c.id,
      name: c.name,
      assetPath: withAsset(c.assetPath),
      cost: c.cost ?? 1,
      power: c.power ?? 1,
      abilityKey: c.abilityKey || null,
      gtoonType: c.gtoonType || null,
      abilityData: c.abilityData || null
    }))

    io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
    await startPvpMatch(roomId)
  })

  socket.on('readyPvp', async ({ roomId, userId, ready }) => {
    const room = pvpRooms.get(roomId)
    const uid = sid(userId)
    if (!room || !room.players.includes(uid)) return
    room.ready = room.ready || {}
    room.ready[uid] = !!ready

    io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
    await startPvpMatch(roomId)
  })

  // --- Relay selectCards & game flow ---
  socket.on('selectPvPCards', async ({ selections }) => {
    const roomId = socket.data.roomId;
    const match  = pvpMatches.get(roomId);
    if (!match) return;

    const uid  = socket.data.userId;
    const side = match.userSide?.[uid]; // 'player' | 'ai'
    if (!side) return;

    // record this player's selections
    match.pending[side]   = selections;
    match.confirmed[side] = true;

    // If both are in, apply and jump straight to the next SELECT (no reveal frame)
    if (match.confirmed.player && match.confirmed.ai) {
      // Apply → confirm both sides; engine will do reveal+setup internally
      const pSel = clampSelectionsToLaneCap(match.battle.state, match.pending.player || [], 'player')
      const aSel = clampSelectionsToLaneCap(match.battle.state, match.pending.ai     || [], 'ai')

      match.battle.select('player', pSel)
      match.battle.select('ai',     aSel)
      match.battle.confirm('player');
      match.battle.confirm('ai');

      // clear for next turn
      match.pending   = { player: null, ai: null };
      match.confirmed = { player: false, ai: false };

      // New countdown window for the next turn’s SELECT
      match.selectDeadline = Date.now() + 60_000;

      // Send the *post-advance* state (usually phase === 'select' of the next turn)
      const afterRaw = clone(match.battle.state);
      const sockets  = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        const snap = viewForUser(match, s.data.userId, afterRaw);
        if (snap.phase === 'select' && !snap.selectEndsAt && match.selectDeadline) {
          snap.selectEndsAt = match.selectDeadline;
        }
        s.emit('phaseUpdate', snap);
      }
    }
  });

  /* ──────────   Clash PvE   ────────── */
  socket.on('joinPvE', async ({ deck, userId }) => {
    try {
      const normalize = (arr = []) => arr.slice(0, 12).map(d => {
        const c = d?.ctoon ?? d
        return {
          id: c.id,
          name: c.name,
          assetPath: withAsset(c.assetPath),
          cost: c.cost ?? 1,
          power: c.power ?? 1,
          abilityKey: c.abilityKey || null,
          gtoonType: c.gtoonType || null,
          abilityData: c.abilityData || null
        }
      })
      const playerDeck = normalize(deck)
      const aiDeck     = shuffle(playerDeck).slice(0, 12)
      const gameId = randomUUID()
      const battle = createBattle({
        playerDeck,
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
    } catch (e) {
      console.error('joinPvE failed:', e)
      socket.emit('joinError', { message: 'Failed to start match.' })
    }
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

    // Apply & confirm both sides (engine will run reveal→setup)
    const playerSel = clampSelectionsToLaneCap(match.battle.state, selections, 'player')
    const aiSel     = clampSelectionsToLaneCap(match.battle.state, aiChooseSelections(match.battle), 'ai')

    match.battle.select('player', playerSel)
    match.battle.select('ai',     aiSel)
    match.battle.confirm('player')
    match.battle.confirm('ai')
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

    const a = roomData.traderA, b = roomData.traderB
    if (!(roomData.finalized[a] && roomData.finalized[b])) return

    const recA = await db.user.findUnique({ where: { username: a }, select:{id:true} })
    const recB = await db.user.findUnique({ where: { username: b }, select:{id:true} })
    if (!recA || !recB) return
    const aId = recA.id, bId = recB.id

    const offersA = roomData.offers[a] || []
    const offersB = roomData.offers[b] || []

    try {
      // swap + ownership logs
      await db.$transaction(async (tx) => {
        const logs = []

        for (const c of offersA) {
          const uc = await tx.userCtoon.update({
            where:  { id: c.id },
            data:   { userId: bId },
            select: { id: true, ctoonId: true, mintNumber: true }
          })
          logs.push({ userId: bId, ctoonId: uc.ctoonId, userCtoonId: uc.id, mintNumber: uc.mintNumber })
        }

        for (const c of offersB) {
          const uc = await tx.userCtoon.update({
            where:  { id: c.id },
            data:   { userId: aId },
            select: { id: true, ctoonId: true, mintNumber: true }
          })
          logs.push({ userId: aId, ctoonId: uc.ctoonId, userCtoonId: uc.id, mintNumber: uc.mintNumber })
        }

        if (logs.length) await tx.ctoonOwnerLog.createMany({ data: logs })
      })

      // CZone cleanup
      try {
        const aZone = await db.cZone.findUnique({ where: { userId: aId } })
        if (aZone && Array.isArray(aZone.layoutData)) {
          const filtered = aZone.layoutData.filter(id => !offersA.some(ct => ct.id === id))
          await db.cZone.update({ where: { userId: aId }, data: { layoutData: filtered } })
        }
      } catch (e) { console.error('CZone A update failed:', e) }

      try {
        const bZone = await db.cZone.findUnique({ where: { userId: bId } })
        if (bZone && Array.isArray(bZone.layoutData)) {
          const filtered = bZone.layoutData.filter(id => !offersB.some(ct => ct.id === id))
          await db.cZone.update({ where: { userId: bId }, data: { layoutData: filtered } })
        }
      } catch (e) { console.error('CZone B update failed:', e) }

      // reset state and notify
      roomData.offers = {}
      roomData.confirmed = {}
      roomData.finalized = {}

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
    } catch (err) {
      console.error('Trade execution failed:', err)
      io.to(room).emit('trade-error', { message: 'Trade failed. Please try again.' })
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
    // Clash PvP cleanup if user leaves the game page / disconnects
    if (socket.data?.roomId) {
      await handleClashLeave(io, {
        roomId: socket.data.roomId,
        userId: socket.data.userId,
        leavingSocketId: socket.id
      })
    }

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
  try {
    console.log('Checking for auctions to close…')
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
            ...(winningBid && { highestBid: winningBid.amount })
          }
        })

        if (winningBid) {
          // transfer cToon to winner + log ownership
          const uc = await tx.userCtoon.update({
            where:  { id: userCtoonId },
            data:   { userId: winningBid.userId, isTradeable: true },
            select: { id: true, ctoonId: true, mintNumber: true }
          })
          await tx.ctoonOwnerLog.create({
            data: {
              userId:      winningBid.userId,
              ctoonId:     uc.ctoonId,
              userCtoonId: uc.id,
              mintNumber:  uc.mintNumber
            }
          })

          // debit winner
          const loserPts = await tx.userPoints.update({
            where: { userId: winningBid.userId },
            data:  { points: { decrement: winningBid.amount } }
          })
          await tx.pointsLog.create({
            data: { userId: winningBid.userId, points: winningBid.amount, total: loserPts.points, method: 'Auction', direction: 'decrease' }
          })

          // credit creator
          const creatorPts = await tx.userPoints.upsert({
            where:  { userId: creatorId },
            create: { userId: creatorId, points: winningBid.amount },
            update: { points: { increment: winningBid.amount } }
          })
          await tx.pointsLog.create({
            data: { userId: creatorId, points: winningBid.amount, total: creatorPts.points, method: 'Auction', direction: 'increase' }
          })
        } else {
          // no winner → just unlock, keep current owner
          await tx.userCtoon.update({
            where: { id: userCtoonId },
            data:  { isTradeable: true }
          })
        }
      })


      // 5) notify clients of the final outcome
      io.to(`auction_${id}`).emit('auction-ended', {
        winnerId:   winningBid?.userId ?? null,
        winningBid: winningBid?.amount ?? 0
      })
    } 
  } catch (err) {
    console.error(`Auction closing failed for ${id}:`, err)
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
      highestBidder: true
    }
  })

  // prefetch holiday flags for all involved ctoonIds
  const ctoonIds = Array.from(
    new Set(soonAuctions.map(a => a.userCtoon.ctoonId))
  )
  const holidayRows = ctoonIds.length
    ? await db.holidayEventItem.findMany({
        where: { ctoonId: { in: ctoonIds } },
        select: { ctoonId: true }
      })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  for (const auc of soonAuctions) {
    try {
      const botToken  = process.env.BOT_TOKEN
      const channelId = '1401244687163068528'
      const baseUrl   = process.env.NODE_ENV === 'production'
        ? 'https://www.cartoonreorbit.com'
        : 'http://localhost:3000'
      const auctionLink = `${baseUrl}/auction/${auc.id}`

      // cToon details
      const { name, rarity, assetPath } = auc.userCtoon.ctoon
      const mintNumber = auc.userCtoon.mintNumber
      const isHolidayItem = holidaySet.has(auc.userCtoon.ctoonId)

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

      // embed fields, omit Mint # for Holiday items
      const fields = [
        { name: 'Rarity',       value: rarity ?? 'N/A',                 inline: true },
        ...(!isHolidayItem ? [{ name: 'Mint #', value: `${mintNumber ?? 'N/A'}`, inline: true }] : []),
        { name: 'Highest Bid',  value: `${displayedBid}`,               inline: true },
        { name: 'Top Bidder',   value: topBidderTag,                    inline: true },
        { name: 'Ends In',      value: `<t:${Math.floor(new Date(auc.endAt).getTime()/1000)}:R>`, inline: false },
        { name: 'View Auction', value: `[Click here](${auctionLink})`,  inline: false }
      ]

      // payload with embed + image + bid info
      const payload = {
        content: `⏰ **Auction ending within 5 minutes!** ⏰`,
        embeds: [
          {
            title: name,
            url: auctionLink,
            fields,
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