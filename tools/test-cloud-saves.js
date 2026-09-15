'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const tick = () => new Promise(r => setImmediate(r));
function harness(file) {
  const events = {}, timers = new Map(), disk = new Map(); let timer = 0;
  const w = { console, URL, Promise, Date, Object, JSON, Error, Number, String,
    setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); }, setInterval() {},
    addEventListener(n, fn) { (events[n] ||= []).push(fn); },
    dispatchEvent(e) { (events[e.type] || []).forEach(fn => fn(e)); },
    CustomEvent: function(type, opts) { this.type = type; this.detail = opts.detail; },
    localStorage: { getItem(k) { return disk.get(k) ?? null; }, setItem(k,v) { disk.set(k,String(v)); }, removeItem(k) { disk.delete(k); } },
    location: { origin: 'https://hub.example', href: 'https://hub.example/', pathname: '/', search: '' },
    SITE: { gameHosts: { one: 'https://one.example', two: 'https://two.example' } },
    API: { available: () => Promise.resolve(false), unread: () => Promise.resolve({}), putSave: s => Promise.resolve({save:s}) }
  };
  w.window = w; w.document = w;
  let save = {favorites: ['guest'], recents: [], stats: {}, ratings: {}};
  w.Store = { exportAll: () => structuredClone(save), importAll(s) { save = structuredClone(s); } };
  const frames = [];
  w.body = {appendChild(f) { frames.push(f); f.handlers.load(); }};
  w.createElement = () => ({style:{}, handlers:{}, setAttribute(){}, addEventListener(n,f){this.handlers[n]=f;}, remove(){}, contentWindow:{postMessage(data,origin){this.last={data,origin};}}});
  vm.createContext(w); vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),w);
  return {w, frames, disk, events, timers, save: () => save, change(s) {save=s; w.dispatchEvent(new w.CustomEvent('store:change',{detail:{}}));}};
}
test('account switch does not upload previous user or guest data', async () => {
 const h=harness('js/core/session.js'); await h.w.Session.ready;
 h.w.Session.setUser({id:'alice'});
 h.change({favorites:['alice-private'],recents:[],stats:{},ratings:{}});
 h.w.Session.setUser({id:'bob'});
 assert.deepEqual(h.save().favorites, []);
 h.w.Session.setUser({id:'alice'});
 assert.deepEqual(h.save().favorites, ['alice-private']);
 h.w.Session.setUser(null);
 assert.deepEqual(h.save().favorites, ['guest']);
});
test('late sync response cannot overwrite another identity or newer local edits', async () => {
 const h=harness('js/core/session.js'); await h.w.Session.ready; h.w.Session.setUser({id:'alice'});
 let finish; h.w.API.putSave=()=>new Promise(r=>{finish=r;});
 const pending=h.w.Session.pushSave(); await tick();
 h.w.Session.setUser({id:'bob'});
 finish({save:{favorites:['alice-secret']}}); await pending;
 assert.deepEqual(h.save().favorites, []);
 const pending2=h.w.Session.pushSave(); await tick();
 h.change({favorites:['new-local'],recents:[],stats:{},ratings:{}});
 finish({save:{favorites:['stale']}}); await pending2;
 assert.deepEqual(h.save().favorites, ['new-local']);
});
test('uploads coalesce; offline copy is durable and retries on reconnect', async () => {
 const h=harness('js/core/session.js'); await h.w.Session.ready; h.w.Session.setUser({id:'alice'});
 let calls=0, finish; h.w.API.putSave=()=>{calls++;return new Promise(r=>{finish=r;});};
 const a=h.w.Session.pushSave(), b=h.w.Session.pushSave(); await tick();
 assert.equal(calls,1); finish({save:h.save()}); await Promise.all([a,b]);
 h.w.API.putSave=()=>Promise.reject(new Error('offline'));
 h.change({favorites:['offline'],recents:[],stats:{},ratings:{}}); await h.w.Session.pushSave();
 assert.deepEqual(JSON.parse(h.disk.get('ach:save-slot:user:alice')).favorites,['offline']);
 h.w.API.putSave=s=>{calls++;return Promise.resolve({save:s});};
 h.w.dispatchEvent({type:'online'}); await tick(); assert.equal(calls,2);
});
test('bridge replies bind request id to exact source AND origin', async () => {
 const h=harness('js/features/game-saves.js');
 let resolved=false; const a=h.w.GameSaves.readAll('one.example').then(()=>{resolved=true;});
 const b=h.w.GameSaves.readAll('two.example'); await tick();
 const id=h.frames[0].contentWindow.last.data.id;
 const respond=(source,origin,rid)=>h.w.dispatchEvent({type:'message',source,origin,data:{channel:'ach-save-bridge',id:rid,ok:true,data:{save:'1'}}});
 respond(h.frames[1].contentWindow,'https://two.example',id); await tick(); assert.equal(resolved,false);
 respond(h.frames[0].contentWindow,'https://evil.example',id); await tick(); assert.equal(resolved,false);
 respond(h.frames[0].contentWindow,'https://one.example',id);
 respond(h.frames[1].contentWindow,'https://two.example',h.frames[1].contentWindow.last.data.id);
 await Promise.all([a,b]); assert.equal(resolved,true);
});
test('backupHost refuses partial snapshots and identity changes before upload', async () => {
 const h=harness('js/features/game-saves.js'); h.w.Session={user:{id:'alice'}};
 let uploads=0; h.w.API.putGameSave=()=>{uploads++;return Promise.resolve({});};
 assert.equal(typeof h.w.GameSaves.backupHost,'function');
 const a=h.w.GameSaves.backupHost('one.example'); await tick();
 const reply=data=>h.w.dispatchEvent({type:'message',source:h.frames[0].contentWindow,origin:'https://one.example',data:{channel:'ach-save-bridge',id:h.frames[0].contentWindow.last.data.id,ok:true,keys:1,data:{save:'1'},...data}});
 reply({partial:true}); await assert.rejects(a,/incomplete/i); assert.equal(uploads,0);
 const b=h.w.GameSaves.backupHost('one.example'); await tick(); h.w.Session.user={id:'bob'}; reply({});
 await assert.rejects(b,/account changed/i); assert.equal(uploads,0);
 const c=h.w.GameSaves.backupHost('one.example'); await tick(); reply({}); await c; assert.equal(uploads,1);
});
module.exports = {harness,tick};
