"use strict";
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const callbacks = {};
let offline = false, result;
const fresh = {status:200,source:'node',clone(){return this;}};
const cached = {status:200,source:'supabase'};
const context = {
  caches:{match:()=>Promise.resolve(cached),open:()=>Promise.resolve({put:()=>Promise.resolve()})},
  fetch:()=>offline?Promise.reject(new Error('offline')):Promise.resolve(fresh),
  self:{location:{origin:'http://localhost:8792'},addEventListener:(name,fn)=>callbacks[name]=fn},URL,Promise
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),context);
function request(){callbacks.fetch({request:{method:'GET',url:'http://localhost:8792/js/core/config.js',mode:'cors'},respondWith(promise){result=promise;}});return result;}
(async()=>{
 assert.equal((await request()).source,'node','Live backend config wins over stale provider cache');
 offline=true;
 assert.equal((await request()).source,'supabase','Offline browsing still receives last known config');
 console.log('PASS fresh backend configuration with offline fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
