'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../js/features/game-cheats.js'), 'utf8');
function game(path, title, entries = {}) {
 const values = new Map(Object.entries(entries)), listeners = {};
 const win = { location: {pathname: path, href: 'https://play.arcadecampushub.online'+path},
  document: {title, scripts: [], getElementById: () => null, querySelector: () => null, getElementsByTagName:()=>[], documentElement:{innerHTML:''}},
  localStorage: {getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),key:i=>[...values.keys()][i],get length(){return values.size;}},
  requestAnimationFrame:()=>1, frames:[], addEventListener:(ev,fn)=>(listeners[ev] ||= []).push(fn),
  Object,Function,URL,URLSearchParams,eval:()=>undefined };
 const sandbox={window:win,console,TextDecoder,TextEncoder,Uint8Array,atob,btoa};
 vm.runInNewContext(code,sandbox);
 return {win,api:win.GameCheats,values,listeners};
}
test('CSGO edits only its observed save and requests reload',async()=>{
 const original={money:7.5,inventory:{item0:'preserve'},itemCounter:1,currentCase:'case2',stackingUpgradesPurchased:{upgrade1:0},other:'keep'};
 const {win,api,values}=game('/games-huge/csgo-clicker/index.html','CS:GO Clicker',{savegame:JSON.stringify(original),unrelated:'sentinel'});
 assert.equal((await api.inspect(win)).engine,'CS:GO Clicker');
 const result=await api.run(win,'csgo-rich');
 assert.equal(result.restart,true);
 assert.deepEqual(JSON.parse(values.get('savegame')),{...original,money:1000007.5});
 assert.equal(values.get('unrelated'),'sentinel');
});
test('Trimps fills capped basic resources and saves via local-only export',async()=>{
 const {win,api,values}=game('/games-huge/trimps/index.html','Trimps 5.6.4');
 win.game={resources:{food:{owned:2,max:500},wood:{owned:3,max:500},metal:{owned:4,max:500}},global:{}};
 win.getMaxForResource=k=>win.game.resources[k].max;
 win.updateLabels=()=>{};
 win.save=exportOnly=>{assert.equal(exportOnly,true);return 'compressed-native-save';};
 assert.equal((await api.inspect(win)).engine,'Trimps');
 await api.run(win,'trimp-fill');
 assert.equal(win.game.resources.food.owned,500);
 assert.equal(win.game.resources.wood.owned,500);
 assert.equal(win.game.resources.metal.owned,500);
 assert.equal(values.get('trimpSave1'),'compressed-native-save');
});
test('Space Company fills real legacy resource globals within storage limits',async()=>{
 const {win,api,values}=game('/games-huge/spacecompany/index.html','Space Company | 3kh0');
 Object.assign(win,{metal:2,gem:3,wood:4,metalStorage:50,gemStorage:50,woodStorage:50});
 win.Game={resources:{getStorage:k=>win[k+'Storage'],addResource:(k,n)=>{win[k]=Math.min(win[k+'Storage'],Math.max(0,win[k]+n));}},ui:{updateBoundElements:()=>{}},save:()=>{values.set('save',JSON.stringify({metal:win.metal,gem:win.gem,wood:win.wood}));}};
 assert.equal((await api.inspect(win)).engine,'Space Company');
 await api.run(win,'sc-fill');
 assert.equal(win.metal,50);assert.equal(win.gem,50);assert.equal(win.wood,50);
 assert.equal(JSON.parse(values.get('save')).wood,50);
});
test('Original idle games gain currency without touching other same-origin saves',async()=>{
 const {win,api,values}=game('/games/originals/idle-miner.html','Idle Miner',{idleMiner:JSON.stringify({gold:3,depth:2,pick:1,drills:0,layer:0}),cookieEmpire:'other-game'});
 assert.equal((await api.inspect(win)).engine,'Idle Miner');
 const result=await api.run(win,'im-rich');
 assert.equal(result.restart,true);assert.equal(JSON.parse(values.get('idleMiner')).gold,100003);
 assert.equal(values.get('cookieEmpire'),'other-game');
 const cookie=game('/games/originals/cookie-empire.html','Cookie Empire',{cookieEmpire:JSON.stringify({cookies:2,owned:{cursor:1}})});
 assert.equal((await cookie.api.inspect(cookie.win)).engine,'Cookie Empire');
 await cookie.api.run(cookie.win,'ce-buildings');
 assert.equal(JSON.parse(cookie.values.get('cookieEmpire')).owned.cursor,11);
 assert.equal(JSON.parse(cookie.values.get('cookieEmpire')).owned.rocket,10);
});
test('Saved keys from all new adapters cannot contaminate an unrelated page',async()=>{
 const saves={savegame:JSON.stringify({money:7.5,inventory:{},itemCounter:0,currentCase:'case2',stackingUpgradesPurchased:{}}),idleMiner:JSON.stringify({gold:2,depth:0,pick:1,drills:0,layer:0}),cookieEmpire:JSON.stringify({cookies:2,owned:{}}),trimpSave1:'stored',save:'stored'};
 const {win,api,values}=game('/games-huge/basketball-stars/index.html','Basketball Stars',saves);
 const menu=await api.inspect(win);
 assert.equal(menu.engine,'Any game');
 const before=[...values];
 for(const id of ['csgo-rich','im-rich','ce-rich','sc-fill','trimp-fill'])await api.run(win,id);
 assert.deepEqual([...values],before);
});
test('Missing or malformed saves expose no writable actions',async()=>{
 for(const [path,title,key] of [['/games-huge/csgo-clicker/index.html','CS:GO Clicker','savegame'],['/games/originals/idle-miner.html','Idle Miner','idleMiner'],['/games/originals/cookie-empire.html','Cookie Empire','cookieEmpire']]){
  for(const raw of [null,'{broken','{}']){
   const {win,api,values}=game(path,title,raw===null?{}:{[key]:raw});
   const menu=await api.inspect(win);
   assert.equal(menu.items.filter(i=>!i.id.startsWith('q:')).length,0);
   assert.equal(values.get(key),raw===null?undefined:raw);
  }
 }
});
test('Invalid and unknown CS edits do not write; latest edit wins unload',async()=>{
 const save={money:7.5,inventory:{},itemCounter:0,currentCase:'case2',stackingUpgradesPurchased:{}};
 const {win,api,values,listeners}=game('/games-huge/csgo-clicker/index.html','CS:GO Clicker',{savegame:JSON.stringify(save)});
 for(const value of ['',-1,Infinity,NaN])await api.run(win,'csgo-money',{value});
 await api.run(win,'not-a-cheat');
 assert.equal(values.get('savegame'),JSON.stringify(save));
 await api.run(win,'csgo-money',{value:42});await api.run(win,'csgo-money',{value:56});
 values.set('savegame',JSON.stringify(save));listeners.beforeunload.forEach(fn=>fn());
 assert.equal(JSON.parse(values.get('savegame')).money,56);
 assert.equal(listeners.beforeunload.length,1);
});
test('Trimps setters clamp to capacity and never call an online save',async()=>{
 const {win,api}=game('/games-huge/trimps/index.html','Trimps');
 win.game={resources:{food:{owned:2,max:500},wood:{owned:3,max:500},metal:{owned:4,max:500}},global:{}};
 win.getMaxForResource=k=>win.game.resources[k].max;win.updateLabels=()=>{};
 win.save=exportOnly=>{assert.equal(exportOnly,true);return 'native';};
 await api.run(win,'trimp-food',{value:1000000});assert.equal(win.game.resources.food.owned,500);
 for(const value of ['',-1,Infinity])await api.run(win,'trimp-food',{value});
 assert.equal(win.game.resources.food.owned,500);
});
test('Native API globals still require the exact game path and title',async()=>{
 const {win,api}=game('/games-huge/unrelated/index.html','Trimps');
 win.game={resources:{food:{owned:2,max:500},wood:{owned:3,max:500},metal:{owned:4,max:500}},global:{}};
 win.getMaxForResource=()=>500;win.updateLabels=()=>{};win.save=()=>{throw Error('must not save')};
 assert.notEqual((await api.inspect(win)).engine,'Trimps');
 await api.run(win,'trimp-fill');assert.equal(win.game.resources.food.owned,2);
 win.document.title='Space Company';win.Game={resources:{getStorage:()=>50,addResource:()=>{throw Error('must not write')}},ui:{updateBoundElements:()=>{}},save:()=>{throw Error('must not save')}};
 Object.assign(win,{metal:2,gem:3,wood:4,metalStorage:50,gemStorage:50,woodStorage:50});
 assert.notEqual((await api.inspect(win)).engine,'Space Company');
 await api.run(win,'sc-fill');assert.equal(win.metal,2);
});
test('New support declarations exactly match live verified IDs',()=>{
 const map={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../data/mod-games.js'),'utf8'),map);
 const live=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'mod-games-live.json'),'utf8'));
 const expected={'huge-csgo-clicker':'csgo','huge-trimps':'trimps','huge-spacecompany':'spacecompany','huge-space-company':'spacecompany','original-idle-miner':'idleminer','original-cookie-empire':'cookieempire'};
 for(const [id,kind] of Object.entries(expected)){
  assert.equal(map.window.MOD_GAMES[id],kind);assert.equal(live[id].kind,kind);assert.equal(live[id].verified,true);
 }
});
