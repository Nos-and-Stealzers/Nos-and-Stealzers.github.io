const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const fixtures=require('./fixtures/learn-to-fly-saves.json');
const source=fs.readFileSync(path.join(__dirname,'../js/features/game-cheats.js'),'utf8');
function setup(game){
 const data=new Map(Object.entries(fixtures[game]));const events={};
 const swf='https://susorodni.github.io/swfgalaxy/games/'+({ltf1:'learntofly',ltf2:'learntofly2',ltf3:'learn-to-fly-3'})[game]+'.swf';
 const w={console,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,DataView,Set,atob,btoa,Blob,Response,CompressionStream,DecompressionStream,
 location:{href:'https://test.invalid/flash.html?swf='+encodeURIComponent(swf),search:'?swf='+encodeURIComponent(swf)},
 performance:{getEntriesByType:()=>[]},RufflePlayer:{},document:{querySelector:()=>({}),getElementById:()=>null},
 frames:[],requestAnimationFrame:()=>1,addEventListener:(k,fn)=>(events[k]??=[]).push(fn),
 localStorage:{get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}};
 w.window=w;vm.createContext(w);vm.runInContext(source,w);return {w,data,events};
}
test('Learn to Fly 2 offers cash only for occupied slots and isolates the other game',async()=>{
 const {w,data}=setup('ltf2'),before=new Map(data);
 const menu=await w.GameCheats.inspect(w);
 assert.ok(menu.items.some(i=>i.id==='fl:ltf2-cash-0:0'));
 assert.ok(!menu.items.some(i=>/^fl:ltf2-cash-[123]:/.test(i.id)));
 const result=await w.GameCheats.run(w,'fl:ltf2-cash-0:0',{value:234567});
 assert.equal(result.restart,true);
 assert.equal(result.items.find(i=>i.id==='fl:ltf2-cash-0:0').value,234567);
 const other=[...before.keys()].find(k=>k.endsWith('/learntofly'));
 assert.equal(data.get(other),before.get(other));
});
test('Learn to Fly cash is a named, bounded edit preserving other fields and backup',async()=>{
 const {w,data}=setup('ltf1');const before=new Map(data);
 const menu=await w.GameCheats.inspect(w);
 assert.ok(menu.items.some(i=>i.id==='fl:ltf1-cash:0'&&i.label==='Cash'));
 const result=await w.GameCheats.run(w,'fl:ltf1-cash:0',{value:123456});
 assert.equal(result.restart,true);
 assert.equal(result.items.find(i=>i.id==='fl:ltf1-cash:0').value,123456);
 const key=[...before.keys()][0];assert.equal(data.get('ach:flash-backup:'+key),before.get(key));
 await w.GameCheats.run(w,'fl:undo');assert.equal(data.get(key),before.get(key));
});

const zlib=require('node:zlib');
function ltf3Profile(w,data){
 const src=source.replace('window.GameCheats = {','window.__Amf = Amf; window.GameCheats = {');
 const ctx={console,URL,TextEncoder,TextDecoder,Uint8Array,DataView,Map,Set,atob,btoa,location:{href:'x'}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
 const Amf=ctx.__Amf,key=[...data.keys()].find(k=>/LearnToFly3\/profileData$/.test(k));
 const sol=Amf.readSol(Amf.b64d(data.get(key)));const str=sol.entries.find(e=>e[0]==='saveString')[1];
 return {Amf,p:Amf.readAmf3(new Uint8Array(zlib.inflateRawSync(Buffer.from(Amf.b64d(str)))))};
}
function field(o,n){const i=o.tr.sealed.indexOf(n);return i<0?undefined:o.sealed[i];}
test('Learn to Fly 1 upgrades are bounded levels; max and stage unlock edit only their fields',async()=>{
 const {w,data}=setup('ltf1');
 const menu=await w.GameCheats.inspect(w);
 assert.ok(menu.items.some(i=>i.id==='fl:ltf1-lvlgl:0'));
 let r=await w.GameCheats.run(w,'fl:ltf1-lvlgl:0',{value:99});
 assert.equal(r.items.find(i=>i.id==='fl:ltf1-lvlgl:0').value,4);
 r=await w.GameCheats.run(w,'fl:kb:0:ltf1-max');
 assert.equal(r.items.find(i=>i.id==='fl:ltf1-lvlrh:0').value,11);
 assert.equal(r.items.find(i=>i.id==='fl:ltf1-lvlro:0').value,4);
 r=await w.GameCheats.run(w,'fl:kb:0:ltf1-stages');
 assert.equal(r.restart,true);
 const cash=r.items.find(i=>i.id==='fl:ltf1-cash:0').value;assert.equal(cash,17);
});
test('Learn to Fly 2 unlocks modes, music and every item in occupied slots only',async()=>{
 const {w,data}=setup('ltf2');
 const menu=await w.GameCheats.inspect(w);
 assert.ok(menu.items.some(i=>i.id==='fl:kb:0:ltf2-items-0'));
 assert.ok(!menu.items.some(i=>i.id==='fl:kb:0:ltf2-items-1'));
 await w.GameCheats.run(w,'fl:kb:0:ltf2-unlock');
 await w.GameCheats.run(w,'fl:kb:0:ltf2-items-0');
 const r=await w.GameCheats.run(w,'fl:ltf2-points:0',{value:5000});
 assert.equal(r.items.find(i=>i.id==='fl:ltf2-points:0').value,5000);
 const key=[...data.keys()].find(k=>k.endsWith('/mainprofile'));
 const txt=Buffer.from(data.get(key),'base64').toString('latin1');
 assert.ok(txt.includes('2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1'));
 assert.ok(txt.includes('true,true,true,true,true'));
});
test('Learn to Fly 3 unlock keys, modes, debug menu and bonus points round-trip',async()=>{
 const {w,data}=setup('ltf3');
 const menu=await w.GameCheats.inspect(w);
 for(const id of ['fl:l3:0:unlock','fl:l3:0:modes','fl:l3:0:debug','fl:ltf-bp:0'])assert.ok(menu.items.some(i=>i.id===id),id);
 await w.GameCheats.run(w,'fl:l3:0:unlock');await w.GameCheats.run(w,'fl:l3:0:unlock');
 await w.GameCheats.run(w,'fl:l3:0:modes');await w.GameCheats.run(w,'fl:l3:0:debug');
 const r=await w.GameCheats.run(w,'fl:ltf-bp:0',{value:777777});
 assert.equal(r.items.find(i=>i.id==='fl:ltf-bp:0').value,777777);
 const {p}=ltf3Profile(w,data);
 const keys=field(p,'itemUnlockKeys');assert.equal(keys.m,16);assert.equal(keys.cls,'SafeString');
 assert.equal(keys.items.map(x=>field(x,'value')).join(),'masterUnlock,extraItems');
 assert.equal(field(p,'rewardKeys').items.map(x=>field(x,'value')).join(),'enableTestMenu');
 assert.equal(field(p,'modeUnlockedSandbox'),true);
 assert.equal(field(field(p,'bonusPoints'),'value').v,777777);
 assert.equal(field(p,'musicBoughtKeys').items.length,3);
});
