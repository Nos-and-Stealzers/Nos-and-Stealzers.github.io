const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const flush=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
async function boot(page, overrides={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,page+'.html'),'utf8'),{url:'https://hub.test/'+page+'.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;const timers=[];w.setInterval=fn=>{timers.push(fn);return timers.length};w.clearInterval=()=>{};
 w.UI={el:(tag,cls,text)=>{const e=w.document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e},icon:(name,cls)=>{const e=w.document.createElement('span');e.className='svg-ico'+(cls?' '+cls:'');e.dataset.icon=name;return e;},toast:()=>{},formatWhen:()=>'',params:()=>new URLSearchParams(),setParams:()=>{},debounce:fn=>fn,attachImage:()=>{}};
 w.Capture={supported:()=>({file:true}),fromBlob:async()=>null};
 w.Art={avatar:()=>w.document.createElement('span')};w.Session={ready:Promise.resolve({backend:true,user:{id:1}}),user:{id:1},refreshBadges:()=>{}};
 w.API={lookupCode:async()=>{throw new Error('No account uses that code')},friends:async()=>({friends:[],incoming:[],outgoing:[],blocked:[]}),threads:async()=>({threads:[{id:1,title:'Alpha'},{id:2,title:'Beta'}]}),thread:async id=>({threadId:id,title:String(id),canSend:true,messages:[]}),...overrides};
 w.eval(fs.readFileSync(path.join(root,'js/features/social-ui.js'),'utf8'));
 if(page==='messages')w.eval(fs.readFileSync(path.join(root,'js/features/chat-core.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'js/pages/page-'+page+'.js'),'utf8'));
 await flush();
 return {w,d:w.document,timers,close:()=>w.close()};
}
async function choose(c,index){c.d.querySelectorAll('.chat-row')[index].click();await flush();await flush();}
const box=c=>c.d.querySelector('.chat-input');
const log=c=>c.d.querySelector('.chat-log');
function submit(c){c.d.querySelector('.chat-compose').dispatchEvent(new c.w.Event('submit',{cancelable:true}));}
test('message drafts belong to their conversation',async()=>{
 const c=await boot('messages');await choose(c,0);box(c).value='Alpha draft';box(c).dispatchEvent(new c.w.Event('input'));await choose(c,1);
 assert.equal(box(c).value,'');box(c).value='Beta draft';box(c).dispatchEvent(new c.w.Event('input'));await choose(c,0);assert.equal(box(c).value,'Alpha draft');c.close();
});
test('a late poll cannot paint another conversation',async()=>{
 const late=deferred();let calls=0;const c=await boot('messages',{thread:async (id,after)=>{if(id===1 && ++calls>1)return late.promise;return {threadId:id,canSend:true,messages:[{id:1,body:'hi',at:Date.now(),from:{username:'a'}}]}}});
 await choose(c,0);c.timers[c.timers.length-1]();await choose(c,1);late.resolve({messages:[{id:9,body:'wrong thread',at:Date.now(),from:{username:'a'}}]});await flush();assert.doesNotMatch(log(c).textContent,/wrong thread/);c.close();
});
test('sending is optimistic, sends once, and keeps typing usable',async()=>{
 const sent=deferred();let calls=0;const c=await boot('messages',{send:()=>{calls++;return sent.promise}});await choose(c,0);
 box(c).value='first';submit(c);submit(c);assert.equal(calls,1);assert.equal(box(c).value,'');
 assert.equal(c.d.querySelectorAll('.chat-msg.is-sending').length,1);
 box(c).value='next draft';sent.resolve({message:{id:5,body:'first',mine:true,at:Date.now()}});await flush();
 assert.equal(box(c).value,'next draft');assert.equal(c.d.querySelectorAll('.chat-msg.is-sending').length,0);c.close();
});
test('a failed send can be retried without retyping',async()=>{
 let n=0;const c=await boot('messages',{send:async()=>{if(++n===1)throw new Error('Offline');return {message:{id:7,body:'hey',mine:true,at:Date.now()}}}});await choose(c,0);
 box(c).value='hey';submit(c);await flush();await flush();assert.equal(c.d.querySelectorAll('.chat-msg.is-failed').length,1);
 c.d.querySelector('.chat-fail-btn').click();await flush();await flush();assert.equal(n,2);assert.equal(c.d.querySelectorAll('.chat-msg.is-failed').length,0);
 assert.equal([...c.d.querySelectorAll('.chat-text')].filter(x=>x.textContent==='hey').length,1);c.close();
});
test('message text is never parsed as HTML',async()=>{
 const c=await boot('messages',{thread:async id=>({threadId:id,canSend:true,messages:[{id:1,body:'<img src=x onerror=alert(1)> https://ok.test/a',at:Date.now(),from:{username:'a'}}]})});
 await choose(c,0);assert.equal(log(c).querySelector('img'),null);assert.equal(log(c).querySelector('a').getAttribute('href'),'https://ok.test/a');c.close();
});
test('search submit previews six-letter usernames without sending requests',async()=>{
 let searches=[],adds=0;const c=await boot('friends',{searchUsers:async q=>{searches.push(q);return {users:[{username:q}]};},addFriend:async()=>{adds++}});
 c.d.getElementById('find').value='player';c.d.getElementById('add-form').dispatchEvent(new c.w.Event('submit',{cancelable:true}));await flush();assert.deepEqual(searches,['player']);assert.equal(adds,0);assert.match(c.d.getElementById('results').textContent,/player/);c.close();
});
test('search responses cannot overwrite a newer query',async()=>{
 const old=deferred();const c=await boot('friends',{searchUsers:q=>q==='al'?old.promise:Promise.resolve({users:[{username:'bob'}]})});const box=c.d.getElementById('find');box.value='al';box.dispatchEvent(new c.w.Event('input'));box.value='bo';box.dispatchEvent(new c.w.Event('input'));await flush();old.resolve({users:[{username:'alice'}]});await flush();assert.match(c.d.getElementById('results').textContent,/bob/);assert.doesNotMatch(c.d.getElementById('results').textContent,/alice/);c.close();
});
test('friend categories have explicit empty states and load failures offer retry',async()=>{
 const c=await boot('friends');for(const id of ['incoming','outgoing','blocked']){assert.ok(c.d.getElementById(id).textContent.trim());assert.equal(c.d.getElementById('b-'+id).hidden,false);}c.close();
 const broken=await boot('friends',{friends:async()=>{throw new Error('Offline')}});assert.match(broken.d.getElementById('social-status').textContent,/Offline/);assert.equal(broken.d.getElementById('social-retry').hidden,false);broken.close();
});
test('messages provide search and a mobile return to conversations',async()=>{
 const c=await boot('messages');const filter=c.d.getElementById('thread-search');assert.ok(filter);filter.value='Beta';filter.dispatchEvent(new c.w.Event('input'));assert.equal(c.d.querySelectorAll('.chat-row').length,1);await choose(c,0);assert.equal(c.d.getElementById('msgs').classList.contains('is-viewing'),true);c.d.querySelector('.msgs-back').click();assert.equal(c.d.getElementById('msgs').classList.contains('is-viewing'),false);c.close();
});
module.exports={boot,flush,deferred,choose};
