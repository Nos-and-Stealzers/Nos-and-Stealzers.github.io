const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const fixtures=require('./fixtures/learn-to-fly-saves.json');
const source=fs.readFileSync(path.join(__dirname,'../js/features/game-cheats.js'),'utf8');
function setup(game){
 const data=new Map(Object.entries(fixtures[game]));const events={};
 const swf='https://susorodni.github.io/swfgalaxy/games/'+(game==='ltf1'?'learntofly':'learntofly2')+'.swf';
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
