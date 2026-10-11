import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {io} from 'socket.io-client';
import './styles.css';

const API=import.meta.env.VITE_SERVER_URL || `${location.protocol}//${location.hostname}:3001`;
const socket=io(API,{autoConnect:true,transports:['websocket','polling']});
const COLORS=['red','green','yellow','blue'];
// Start squares are arranged like the reference board:
// green = left, yellow = top, blue = right, red = bottom.
const START={green:1,yellow:14,blue:27,red:40};
const FINISH=57;

const TRACK=[
 [6,0],[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
 [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],
 [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
 [14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0]
];

const HOME_LANES={
  green:[[7,1],[7,2],[7,3],[7,4],[7,5]],
  yellow:[[1,7],[2,7],[3,7],[4,7],[5,7]],
  blue:[[7,13],[7,12],[7,11],[7,10],[7,9]],
  red:[[13,7],[12,7],[11,7],[10,7],[9,7]]
};

const BASES={
  green:[[1,1],[1,4],[4,1],[4,4]],
  yellow:[[1,10],[1,13],[4,10],[4,13]],
  blue:[[10,10],[10,13],[13,10],[13,13]],
  red:[[10,1],[10,4],[13,1],[13,4]]
};

// Eight classic safe squares: each player's start plus one mid-track safe square.
const SAFE_CELLS={
  '6-1':'green','8-2':'green',
  '1-8':'yellow','2-6':'yellow',
  '8-13':'blue','6-12':'blue',
  '13-6':'red','12-8':'red'
};

function App(){
 const params=new URLSearchParams(location.search); const initialRoom=params.get('room')||'';
 const [room,setRoom]=useState(null),[mode,setMode]=useState(initialRoom?'join':'home'),[name,setName]=useState(''),[maxPlayers,setMaxPlayers]=useState(4),[roomCode,setRoomCode]=useState(initialRoom.toUpperCase()),[error,setError]=useState('');
 const [copied,setCopied]=useState(false),[connected,setConnected]=useState(socket.connected);
 useEffect(()=>{
   const onState=r=>setRoom(r);
   const onError=e=>setError(e.message);
   const onConnect=()=>{setConnected(true);setError('')};
   const onDisconnect=()=>setConnected(false);
   socket.on('state',onState);
   socket.on('gameError',onError);
   socket.on('connect',onConnect);
   socket.on('disconnect',onDisconnect);
   socket.on('roomCreated',({code})=>{setRoomCode(code);history.replaceState({},'',`?room=${code}`);setMode('lobby')});
   return()=>{socket.off('state',onState);socket.off('gameError',onError);socket.off('connect',onConnect);socket.off('disconnect',onDisconnect);socket.off('roomCreated');socket.off('roomJoined')};
 },[]);
 useEffect(()=>{if(initialRoom)setMode('join')},[initialRoom]);
 const me=room?.players?.find(p=>p.id===socket.id);
 const create=()=>{
   setError('');
   if(!connected){setError('Not connected to the game server.');return;}
   socket.emit('createRoom',{maxPlayers,name:name.trim()||'Player'},res=>{
     if(!res?.ok){setError(res?.message||'Could not create room.');return;}
     setRoomCode(res.code);
     history.replaceState({},'',`?room=${res.code}`);
     setMode('lobby');
   });
 };
 const join=()=>{
   setError('');
   const normalized=roomCode.replace(/\s+/g,'').toUpperCase();
   if(normalized.length!==6){setError('Enter the 6-character room code.');return;}
   if(!connected){setError('Not connected to the game server.');return;}
   socket.emit('joinRoom',{code:normalized,name:name.trim()||'Player'},res=>{
     if(!res?.ok){setError(res?.message||'Could not join room.');return;}
     setRoomCode(res.code);
     history.replaceState({},'',`?room=${res.code}`);
     setMode('lobby');
   });
 };
 const copy=async()=>{
   const url=`${location.origin}${location.pathname}?room=${room?.code||roomCode}`;
   try{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{setError('Copy failed. Copy the room code manually.')}
 };
 if(room)return <Game room={room} me={me} copy={copy} copied={copied}/>;
 return <div className="shell"><header><div className="logo">LUDO<span>LIVE</span></div><div className="pill">{connected?'SERVER CONNECTED':'CONNECTING…'}</div></header><main className="hero"><section className="card home-card"><div className="dice-icon">⚄</div><h1>Play Ludo<br/><em>with your friends.</em></h1><p>Create a private room, share the code, and play together in real time.</p><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" maxLength={20}/>{mode==='home'&&!initialRoom&&<><div className="label">PLAYERS</div><div className="player-grid">{[2,3,4].map(n=><button className={maxPlayers===n?'selected':''} onClick={()=>setMaxPlayers(n)} key={n}>{n}<small> PLAYERS</small></button>)}</div><button className="primary" onClick={create}>CREATE ROOM <span>→</span></button><div className="or">OR</div><button className="secondary" onClick={()=>setMode('join')}>JOIN WITH ROOM CODE</button></>}{mode==='join'&&<><div className="label">ROOM CODE</div><input className="code-input" value={roomCode} onChange={e=>setRoomCode(e.target.value.replace(/\s+/g,'').toUpperCase().slice(0,6))} placeholder="ABC123" maxLength={6} autoCapitalize="characters" spellCheck="false"/><button className="primary" onClick={join}>JOIN ROOM <span>→</span></button><button className="link" onClick={()=>setMode('home')}>← Back</button></>}{error&&<div className="error">{error}</div>}</section></main><footer>Built for local multiplayer • Socket.IO powered</footer></div>
}

function Game({room,me,copy,copied}){
 const canAct=room.status==='playing'&&room.players[room.turn]?.id===me?.id;
 return <div className="game-shell"><header><div className="logo">LUDO<span>LIVE</span></div><div className="room-share"><span>ROOM</span><b>{room.code}</b><button onClick={copy}>{copied?'COPIED':'COPY LINK'}</button></div></header><div className="game-layout"><aside className="sidebar"><div className="side-title">PLAYERS <span>{room.players.length}/{room.maxPlayers}</span></div>{room.players.map((p,i)=><div className={`player-row ${i===room.turn?'active':''}`} key={p.id}><i className={p.color}></i><div><b>{p.name}{p.id===me?.id?' (YOU)':''}</b><small>{p.connected?'Connected':'Disconnected'} {p.finished?`• ${p.finished}/4 home`:''}</small></div>{i===room.turn&&room.status==='playing'&&<strong>TURN</strong>}</div>)}{room.status==='lobby'&&<div className="waiting">{room.players.length<room.maxPlayers?`Waiting for ${room.maxPlayers-room.players.length} more player${room.maxPlayers-room.players.length>1?'s':''}…`:'Ready to start!'}</div>}{room.status==='lobby'&&room.players[0]?.id===me?.id&&<button className="primary" disabled={room.players.length!==room.maxPlayers} onClick={()=>socket.emit('startGame')}>START GAME</button>}<div className="log"><b>GAME LOG</b><p>{room.lastAction}</p></div></aside><main className="board-area"><div className="turn-banner">{room.status==='lobby'?'SHARE THE ROOM CODE TO START':room.status==='finished'?`WINNER: ${room.players.find(p=>p.id===room.winner)?.name}`:canAct?(room.dice?`YOU ROLLED ${room.dice} — CHOOSE A TOKEN`:'YOUR TURN'):`${room.players[room.turn]?.name||'Player'}'S TURN`}</div><Board room={room} me={me}/>{room.status==='playing'&&<div className="controls"><div className="dice-control"><div className={`dice-stage ${room.dice?'rolled':''}`}><Die value={room.dice ?? room.lastRoll} animate={Boolean(room.dice)} animationKey={room.lastAction}/><span>{room.dice?`ROLLED ${room.dice}`:room.lastRoll?`LAST ROLL ${room.lastRoll}`:'DICE'}</span></div><button className="roll" disabled={!canAct||room.dice!==null} onClick={()=>socket.emit('rollDice')}>{room.dice?`ROLLED ${room.dice}`:'ROLL DICE'}</button></div><div className="hint">{canAct&&room.dice?'Click a highlighted token to move.':room.status==='playing'?'Watch the board — moves sync instantly.':''}</div></div>}</main></div></div>
}

function Board({room,me}){
 const current=room.players[room.turn]?.id===me?.id;
 const occupied=new Map();
 room.players.forEach(p=>p.tokens.forEach((t,k)=>{
   const pos=boardPosition(p.color,t);
   if(pos){const key=`${pos.r}-${pos.c}`;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push({p,t,k});}
 }));
 return <div className="ludo-board">
   <div className="board-grid">
     {Array.from({length:225},(_,n)=>{
       const r=Math.floor(n/15),c=n%15,key=`${r}-${c}`;
       const kind=cellKind(r,c),items=occupied.get(key)||[],safeColor=SAFE_CELLS[key];
       return <div key={n} className={`grid-cell ${kind}`}>
         {safeColor&&<span className={`safe-star ${safeColor}`}>★</span>}
         {items.map(x=><Token key={x.p.id+x.k} x={x} canMove={current&&room.dice&&x.p.id===me?.id&&legal(room.players[room.turn],room.dice).includes(x.k)}/>)}
       </div>
     })}
   </div>

   <HomeZone color="green" label="GREEN"/>
   <HomeZone color="yellow" label="YELLOW"/>
   <HomeZone color="red" label="RED"/>
   <HomeZone color="blue" label="BLUE"/>

   {room.players.map(p=>p.tokens.map((t,k)=>{
     if(t!==-1)return null;
     const base=basePosition(p.color,k);
     const canMove=current&&room.dice===6&&p.id===me?.id;
     return <div key={p.id+'base'+k} className={`base-token ${p.color} ${canMove?'base-movable':''}`} style={{left:`${base.c/15*100}%`,top:`${base.r/15*100}%`}}><Token x={{p,t,k}} canMove={canMove}/></div>
   }))}

   <div className="center-home"><span className="center-triangle yellow"></span><span className="center-triangle blue"></span><span className="center-triangle red"></span><span className="center-triangle green"></span></div>
 </div>
}

function HomeZone({color,label}){
 return <div className={`home-zone ${color}`}><div className="home-inner"><div className="home-caption">{label}</div></div></div>
}

function boardPosition(color,t){
 if(t===-1||t===FINISH)return null;
 if(t<52){const [r,c]=TRACK[(START[color]+t)%52];return {r,c}}
 const lane=HOME_LANES[color];return lane[t-52]?{r:lane[t-52][0],c:lane[t-52][1]}:null;
}
function basePosition(color,index){const [r,c]=BASES[color][index];return {r,c}}
function cellKind(r,c){
 let k='';
 if(r<6&&c<6)k+=' home-corner-green';
 if(r<6&&c>8)k+=' home-corner-yellow';
 if(r>8&&c>8)k+=' home-corner-blue';
 if(r>8&&c<6)k+=' home-corner-red';
 if(TRACK.some(([rr,cc])=>rr===r&&cc===c))k+=' track';
 for(const [color,lane] of Object.entries(HOME_LANES))if(lane.some(([rr,cc])=>rr===r&&cc===c))k+=` lane-${color}`;
 if(r>=6&&r<=8&&c>=6&&c<=8)k+=' center';
 return k;
}

function Die({value,animate,animationKey}){
 const n=Number(value);
 return <div key={animationKey} className={`die ${n>=1&&n<=6?'show':''} ${animate?'rolling':''}`} aria-label={n>=1&&n<=6?`Rolled ${n}`:'Dice'}><strong>{n>=1&&n<=6?n:'?'}</strong></div>
}
function Token({x,canMove}){return <button className={`token ${x.p.color} ${canMove?'movable':''}`} onClick={()=>canMove&&socket.emit('moveToken',{index:x.k})}>{x.k+1}</button>}
function legal(p,d){return p.tokens.map((t,i)=>(t!==FINISH&&((t===-1&&d===6)||(t>=0&&t+d<=FINISH)))?i:-1).filter(i=>i>=0)}

createRoot(document.getElementById('root')).render(<App/>);
