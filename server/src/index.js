import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

const PORT = process.env.PORT || 3001;
const rooms = new Map();
const COLORS = ['red','green','yellow','blue'];
const START = { green: 1, yellow: 14, blue: 27, red: 40 };
// Safe squares match the eight star squares on the classic board.
const SAFE = new Set([1, 9, 14, 22, 27, 35, 40, 48]);
const PATH = 52;
const HOME = 56;
const FINISH = 57;
const MAX_TOKENS = 4;

function code() {
  // Human-friendly 6-character room code; avoid ambiguous characters.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  } while (rooms.has(c));
  return c;
}
function uid() { return crypto.randomUUID(); }
function playerView(p) { return { id:p.id, name:p.name, color:p.color, tokens:p.tokens, connected:p.connected, finished:p.finished }; }
function roomView(r) {
  return { code:r.code, maxPlayers:r.maxPlayers, status:r.status, turn:r.turn, dice:r.dice, lastRoll:r.lastRoll, winner:r.winner, players:r.players.map(playerView), lastAction:r.lastAction };
}
function broadcast(r) { io.to(r.code).emit('state', roomView(r)); }
function orderedColors(r) { return COLORS.slice(0, r.maxPlayers); }
function makePlayer(name, color, id, playerKey) { return { id, playerKey, name:name.slice(0,20), color, tokens:[-1,-1,-1,-1], connected:true, finished:0 }; }
function nextConnectedIndex(r, from) {
  for (let i=1;i<=r.players.length;i++) {
    const idx=(from+i)%r.players.length;
    if (r.players[idx].connected) return idx;
  }
  return from;
}
function globalPos(color, progress) {
  if (progress < 0 || progress >= PATH) return null;
  return (START[color] + progress) % PATH;
}
function canMove(token, dice) {
  if (token === FINISH) return false;
  if (token === -1) return dice === 6;
  return token + dice <= FINISH;
}
function legalMoves(p, dice) { return p.tokens.map((t,i)=>canMove(t,dice)?i:-1).filter(i=>i>=0); }
function moveToken(r, p, index) {
  const dice=r.dice;
  let old=p.tokens[index];
  let next = old === -1 ? 0 : old + dice;
  p.tokens[index]=next;
  if (next===FINISH) p.finished++;
  let captured=0;
  const gp=globalPos(p.color,next);
  if (gp!==null && !SAFE.has(gp)) {
    for (const other of r.players) {
      if (other.id===p.id) continue;
      other.tokens = other.tokens.map(t => globalPos(other.color,t)===gp ? (captured++, -1) : t);
    }
  }
  return {old,next,captured};
}
function advanceTurn(r, extra) {
  if (r.players.some(p=>p.finished===MAX_TOKENS)) {
    r.status='finished';
    r.winner=r.players.find(p=>p.finished===MAX_TOKENS)?.id;
    return;
  }
  if (!extra) r.turn=nextConnectedIndex(r,r.turn);
  r.dice=null;
}
function getCurrent(r,socketId) { return r.players[r.turn]?.id===socketId ? r.players[r.turn] : null; }
function emitError(socket,msg){ socket.emit('gameError',{message:msg}); }

io.on('connection', socket => {
  socket.on('createRoom', ({maxPlayers=4,name='Player',playerKey=''} = {}, ack) => {
    maxPlayers=Number(maxPlayers);
    if (![2,3,4].includes(maxPlayers)) { if (ack) ack({ok:false,message:'Choose 2, 3 or 4 players.'}); return emitError(socket,'Choose 2, 3 or 4 players.'); }
    const r={code:code(),maxPlayers,status:'lobby',players:[],turn:0,dice:null,lastRoll:null,winner:null,lastAction:'Room created.'};
    const color=orderedColors(r)[0];
    r.players.push(makePlayer(name||'Player',color,socket.id,String(playerKey||'')));
    rooms.set(r.code,r); socket.join(r.code); socket.data.room=r.code;
    socket.emit('roomCreated',{code:r.code});
    if (ack) ack({ok:true, code:r.code});
    broadcast(r);
  });

  socket.on('joinRoom', ({code:raw,name='Player',playerKey=''} = {}, ack) => {
    const normalized = String(raw || '').replace(/\s+/g,'').toUpperCase();
    const r=rooms.get(normalized);
    if (!r) { if (ack) ack({ok:false,message:'Room not found. Check the 6-character code.'}); return emitError(socket,'Room not found. Check the 6-character code.'); }
    // If this browser already owns a slot in the room, reclaim it instead of
    // adding a duplicate player. This also works after the game has started.
    const existing = playerKey ? r.players.find(p => p.playerKey === String(playerKey)) : null;
    if (existing) {
      existing.id = socket.id;
      existing.connected = true;
      socket.join(r.code); socket.data.room = r.code;
      if (r.cleanupTimer) { clearTimeout(r.cleanupTimer); r.cleanupTimer = null; }
      r.lastAction = `${existing.name} reconnected.`;
      socket.emit('roomJoined',{code:r.code});
      if (ack) ack({ok:true, code:r.code, reconnected:true});
      broadcast(r);
      return;
    }
    if (r.status!=='lobby') { if (ack) ack({ok:false,message:'Game has already started. Rejoin with the same browser that was playing.'}); return emitError(socket,'Game has already started.'); }
    if (r.players.length>=r.maxPlayers) { if (ack) ack({ok:false,message:'Room is full.'}); return emitError(socket,'Room is full.'); }
    const color=orderedColors(r)[r.players.length];
    r.players.push(makePlayer(name||'Player',color,socket.id,String(playerKey||'')));
    socket.join(r.code); socket.data.room=r.code;
    r.lastAction=`${name||'Player'} joined room ${r.code}.`;
    socket.emit('roomJoined',{code:r.code});
    if (ack) ack({ok:true, code:r.code});
    broadcast(r);
  });

  socket.on('rejoinRoom', ({code:raw,playerKey} = {}, ack) => {
    const normalized = String(raw || '').replace(/\s+/g,'').toUpperCase();
    const r = rooms.get(normalized);
    if (!r || !playerKey) {
      if (ack) ack({ok:false,message:'Saved game could not be found. Join with the room code again.'});
      return;
    }
    const p = r.players.find(x => x.playerKey === String(playerKey));
    if (!p) {
      if (ack) ack({ok:false,message:'This browser is not linked to a player in that room. Join with the room code.'});
      return;
    }
    p.id = socket.id;
    p.connected = true;
    socket.join(r.code); socket.data.room = r.code;
    if (r.cleanupTimer) { clearTimeout(r.cleanupTimer); r.cleanupTimer = null; }
    r.lastAction = `${p.name} reconnected.`;
    if (ack) ack({ok:true,code:r.code});
    broadcast(r);
  });

  socket.on('startGame', () => {
    const r=rooms.get(socket.data.room); if (!r) return;
    if (r.players[0]?.id!==socket.id) return emitError(socket,'Only the room creator can start.');
    if (r.players.length!==r.maxPlayers) return emitError(socket,`Waiting for ${r.maxPlayers-r.players.length} more player(s).`);
    r.status='playing'; r.turn=0; r.dice=null; r.lastRoll=null; r.lastAction=`${r.players[0].name} starts.`; broadcast(r);
  });

  socket.on('rollDice', () => {
    const r=rooms.get(socket.data.room); if (!r || r.status!=='playing') return;
    const p=getCurrent(r,socket.id); if (!p) return emitError(socket,'It is not your turn.');
    if (r.dice!==null) return emitError(socket,'Choose a token first.');
    r.dice=Math.floor(Math.random()*6)+1;
    r.lastRoll=r.dice;
    const moves=legalMoves(p,r.dice);
    r.lastAction=`${p.name} rolled ${r.dice}.`;
    if (moves.length===0) { advanceTurn(r,r.dice===6); if (r.dice===6) r.lastAction+=` No legal move, roll again.`; else r.lastAction+=` No legal move.`; }
    broadcast(r);
  });

  socket.on('moveToken', ({index}) => {
    const r=rooms.get(socket.data.room); if (!r || r.status!=='playing') return;
    const p=getCurrent(r,socket.id); if (!p) return emitError(socket,'It is not your turn.');
    if (r.dice===null) return emitError(socket,'Roll the dice first.');
    index=Number(index);
    if (!legalMoves(p,r.dice).includes(index)) return emitError(socket,'That token cannot move.');
    const rolled=r.dice; const result=moveToken(r,p,index);
    r.lastAction=result.captured ? `${p.name} captured ${result.captured} token.` : `${p.name} moved token ${index+1}.`;
    const extra=rolled===6 && p.finished<MAX_TOKENS;
    advanceTurn(r,extra);
    if (extra && r.status==='playing') r.lastAction+=' Roll again!';
    broadcast(r);
  });

  socket.on('leaveRoom',()=>leave(socket));
  socket.on('disconnect',()=>leave(socket,true));
});
function leave(socket, silent=false) {
  const r=rooms.get(socket.data.room); if (!r) return;
  const p=r.players.find(x=>x.id===socket.id); if (p) p.connected=false;
  if (!silent) socket.leave(r.code);
  if (r.players.every(p=>!p.connected)) {
    // Keep disconnected rooms available for 30 minutes so every player can
    // recover after a network outage or page refresh.
    if (!r.cleanupTimer) r.cleanupTimer = setTimeout(() => {
      if (rooms.get(r.code) === r && r.players.every(player => !player.connected)) rooms.delete(r.code);
    }, 30 * 60 * 1000);
    return;
  }
  if (r.status==='playing' && r.players[r.turn]?.id===socket.id) r.turn=nextConnectedIndex(r,r.turn);
  r.lastAction=`${p?.name||'A player'} disconnected.`; broadcast(r);
}

server.listen(PORT,()=>console.log(`Ludo server listening on http://localhost:${PORT}`));
