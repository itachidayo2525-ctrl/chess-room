import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

const target=process.env.TEST_URL;
test('two players: isolation, legal moves, mate, rematch and disconnect',async()=>{
 const proc=target?null:spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3107'},stdio:['ignore','pipe','pipe']});
 const clients=[];
 try {
  if(proc) await once(proc.stdout,'data');
  const url=target||'http://127.0.0.1:3107';
  const connect=async()=>{const s=io(url,{transports:['websocket'],forceNew:true,reconnection:false,timeout:30000});clients.push(s);await Promise.race([once(s,'connect'),once(s,'connect_error').then(([e])=>{throw e})]);return s};
  const request=(s,event,...args)=>new Promise((resolve,reject)=>s.timeout(10000).emit(event,...args,(err,r)=>err?reject(err):resolve(r)));
  const a=await connect(),b=await connect(),c=await connect(),d=await connect();
  const code='test-'+Date.now();
  assert.ok((await request(a,'join','a')).error);
  assert.equal((await request(a,'join',code)).color,'w');
  assert.ok((await request(a,'move',{from:'e2',to:'e4'})).error);
  assert.equal((await request(b,'join',code)).color,'b');
  assert.ok((await request(c,'join',code)).error);
  assert.equal((await request(d,'join',code+'-other')).state.history.length,0);
  assert.ok((await request(b,'move',{from:'e7',to:'e5'})).error);
  assert.ok((await request(a,'move',{from:'e2',to:'e5'})).error);
  let lastA,lastB;a.on('state',s=>lastA=s);b.on('state',s=>lastB=s);
  for(const [s,from,to] of [[a,'f2','f3'],[b,'e7','e5'],[a,'g2','g4'],[b,'d8','h4']]){
   const nextA=once(a,'state'),nextB=once(b,'state');
   assert.equal((await request(s,'move',{from,to})).ok,true);await Promise.all([nextA,nextB]);
   assert.equal(lastA.fen,lastB.fen);
  }
  assert.equal(lastA.checkmate,true);assert.equal(lastA.winner,'b');assert.equal(lastA.history.length,4);
  assert.ok((await request(a,'move',{from:'a2',to:'a3'})).error);
  await request(a,'restart');assert.equal(lastA.history.length,4);
  const reset=once(a,'state');await request(b,'restart');await reset;assert.equal(lastA.history.length,0);
  const gone=once(a,'state');b.disconnect();await gone;assert.equal(lastA.players.b,false);
  assert.ok((await request(a,'move',{from:'e2',to:'e4'})).error);
  assert.equal((await request(c,'join',code)).color,'b');
  const home=await fetch(url);assert.equal(home.status,200);assert.match(await home.text(),/id="board"/);
  const vendor=await fetch(url+'/vendor/chess.js');assert.equal(vendor.status,200);assert.match(await vendor.text(),/export/);
  assert.equal((await fetch(url+'/healthz')).status,200);
 } finally {for(const s of clients)s.disconnect();if(proc)proc.kill();}
});
