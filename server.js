import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const app=express(),server=http.createServer(app),io=new Server(server);
app.get('/healthz',(_req,res)=>res.json({ok:true}));
app.get('/vendor/chess.js',(_req,res)=>res.sendFile(path.join(root,'node_modules/chess.js/dist/esm/chess.js')));
app.use(express.static(path.join(root,'public')));
const rooms=new Map();
function clean(code){return typeof code==='string'?code.normalize('NFKC').trim():''}
function state(r){return {fen:r.game.fen(),turn:r.game.turn(),history:r.game.history({verbose:true}).map(m=>({from:m.from,to:m.to,san:m.san})),players:{w:!!r.players.w,b:!!r.players.b},over:r.game.isGameOver(),check:r.game.isCheck(),checkmate:r.game.isCheckmate(),draw:r.game.isDraw(),winner:r.game.isCheckmate()?(r.game.turn()==='w'?'b':'w'):null};}
function emit(r){io.to(r.id).emit('state',state(r))}
io.on('connection',socket=>{
 socket.on('join',(raw,callback)=>{
  const ack=typeof callback==='function'?callback:()=>{};
  const code=clean(raw);if(code.length<4||code.length>64){ack?.({error:'合言葉は4〜64文字にしてください'});return}
  const id=crypto.createHash('sha256').update(code).digest('hex');let r=rooms.get(id);
  if(!r){r={id,game:new Chess(),players:{w:null,b:null},created:Date.now()};rooms.set(id,r)}
  if(socket.data.room){ack?.({error:'すでに入室しています'});return}
  const color=!r.players.w?'w':!r.players.b?'b':null;
  if(!color){ack?.({error:'この部屋は満員です'});return}
  r.players[color]=socket.id;socket.data={room:id,color};socket.join(id);
  ack?.({color,state:state(r)});emit(r);
 });
 socket.on('move',(move,callback)=>{
  const ack=typeof callback==='function'?callback:()=>{};
  const r=rooms.get(socket.data.room);if(!r||r.players[socket.data.color]!==socket.id){ack?.({error:'入室してください'});return}
  if(!r.players.w||!r.players.b){ack({error:'対戦相手を待っています'});return}
  if(r.game.turn()!==socket.data.color||r.game.isGameOver()){ack?.({error:'今はあなたの番ではありません'});return}
  if(!move||typeof move.from!=='string'||typeof move.to!=='string'){ack?.({error:'無効な手です'});return}
  try{const result=r.game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});if(!result){ack?.({error:'その手は指せません'});return}r.ready?.clear();ack?.({ok:true});emit(r)}catch{ack?.({error:'その手は指せません'})}
 });
 socket.on('restart',callback=>{
  const ack=typeof callback==='function'?callback:()=>{};
  const r=rooms.get(socket.data.room);if(!r){ack?.({error:'部屋がありません'});return}
  r.ready??=new Set();r.ready.add(socket.data.color);
  if(r.ready.size===2&&r.players.w&&r.players.b){r.game.reset();r.ready.clear();emit(r);io.to(r.id).emit('notice','再戦が始まりました')}else{io.to(r.id).emit('notice','再戦の承認を待っています')}
  ack?.({ok:true});
 });
 socket.on('disconnect',()=>{
  const r=rooms.get(socket.data.room);if(!r)return;
  if(r.players[socket.data.color]===socket.id)r.players[socket.data.color]=null;
  r.ready?.delete(socket.data.color);emit(r);
  if(!r.players.w&&!r.players.b)rooms.delete(r.id);
 });
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Chess Room ready'));
