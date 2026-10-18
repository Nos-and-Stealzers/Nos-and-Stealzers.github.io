/* Isolated DOM regressions: npm's jsdom is the only test dependency. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let JSDOM;
try { ({JSDOM} = require('jsdom')); }
catch (_) { ({JSDOM} = require(path.join(require('node:os').homedir(), 'node_modules/jsdom'))); }
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const user = id => ({id,username:id,displayName:id,role:'user',state:'active',friends:0,messages:0});
async function boot(search=false) {
 const file = search ? 'admin-search.html' : 'admin.html';
 const dom = new JSDOM(fs.readFileSync(path.join(root,file),'utf8'), {url:'https://fixture.invalid/'+file+'?keep=yes'+(search?'':'#workbench'),runScripts:'outside-only'});
 const w=dom.window,d=w.document;
 w.Session={isStaff:()=>true,isAdmin:()=>true,isDev:()=>true,isOwner:()=>true};
 w.UI={el(tag,cls,text){const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;},icon:()=>d.createElement('span'),userTags:()=>d.createElement('span'),toast(){},debounce:fn=>fn,formatWhen:String,formatDuration:String};
 w.SocialUI={gate:fn=>fn({id:'me',username:'staff',role:'owner'}),avatar:()=>d.createElement('span')};
 w.SITE={categories:{},gameHosts:{}};w.Catalog={all:[],categories:[],byId:()=>null};w.Store={settings:()=>({})};
 w.API={adminOverview:()=>Promise.resolve({users:{},social:{},topGames:[]}),adminAudit:()=>Promise.resolve({entries:[]}),currentAnnouncement:()=>Promise.resolve(null),siteFlags:()=>Promise.resolve({}),adminListNotes:()=>Promise.resolve([]),adminUsers:()=>Promise.resolve({users:[user('alpha'),user('beta')]})};
 w.confirm=()=>true;
 let source=fs.readFileSync(path.join(root,'js/pages/page-admin'+(search?'-search':'')+'.js'),'utf8');
 if(!search) source=source.replace('      var initialTab =','      window.testAdmin={users:loadUsers,show:show,overview:loadOverview};\n      var initialTab =');
 w.eval(source);await tick();await tick();return {dom,w,d,t:w.testAdmin};
}
(async()=>{
 const {dom,w,d,t}=await boot();await t.show('users');
 const row=d.querySelector('[data-user-id="alpha"]');
 const linkEvent=new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});row.querySelector('a').dispatchEvent(linkEvent);
 assert.equal(linkEvent.defaultPrevented,false,'profile Enter must not become a row selection');
 assert(!d.querySelector('#user-detail strong'));
 row.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
 assert.equal(row.getAttribute('aria-pressed'),'true');assert.equal(d.activeElement.id,'user-detail');
 d.querySelector('[data-section="notes"]').open=true;d.querySelector('[aria-label="New staff note"]').value='unsent note';
 const pw=d.querySelector('[aria-label="New account password"]');pw.value='DraftPassword123!';
 // A refresh must update current data/permission gates, not retain stale controls.
 w.API.adminUsers=()=>Promise.resolve({users:[{...user('alpha'),displayName:'Updated',state:'suspended'},user('beta')]});await t.users();
 assert.equal(d.querySelector('#user-detail strong').textContent,'Updated');assert.match(d.querySelector('[data-section="access"]').textContent,/Restore account/);
 assert.equal(d.querySelector('[aria-label="New staff note"]').value,'unsent note');assert.equal(d.querySelector('[aria-label="New account password"]').value,'DraftPassword123!');assert(d.querySelector('[data-section="notes"]').open);
 // A failed reset retains the password and offers a persistent accessible error.
 w.API.adminSetPassword=()=>Promise.reject(new Error('Fixture reset refused'));
 const reset=Array.from(d.querySelectorAll('#user-detail button')).find(n=>n.textContent==='Set new password');reset.click();await tick();await tick();
 assert.equal(reset.disabled,false);assert.match(d.querySelector('.admin-action-error[role="alert"]').textContent,/reset refused/);assert.equal(d.querySelector('[aria-label="New account password"]').value,'DraftPassword123!');
 // A delayed action for alpha must not clear the newly selected beta.
 const action=deferred();w.API.adminSetMute=()=>action.promise;Array.from(d.querySelectorAll('#user-detail button')).find(n=>n.textContent==='10 min').click();d.querySelector('[data-user-id="beta"]').click();action.resolve();await tick();await tick();assert.equal(d.querySelector('#user-detail strong').textContent,'beta');
 // Filtered-away selection is cleared, including its potentially destructive tools.
 const oldNotes=deferred();let notesCalls=0;w.API.adminListNotes=()=>++notesCalls===1?oldNotes.promise:Promise.resolve([{id:1,body:'Latest note',createdAt:0}]);w.API.adminAddNote=()=>Promise.resolve();d.querySelector('[data-user-id="beta"]').click();d.querySelector('[aria-label="New staff note"]').value='Latest note';Array.from(d.querySelectorAll('#user-detail button')).find(n=>n.textContent==='Add').click();await tick();await tick();oldNotes.resolve([{id:2,body:'Stale note',createdAt:0}]);await tick();assert.match(d.querySelector('[data-section="notes"]').textContent,/Latest note/);assert(!d.querySelector('[data-section="notes"]').textContent.includes('Stale note'));
 d.getElementById('user-filter').value='suspended';d.getElementById('user-filter').dispatchEvent(new w.Event('change'));assert(!d.querySelector('#user-detail button'));assert.match(d.getElementById('user-detail').textContent,/not in these results/);
 // Promoting a selected account to caller rank removes formerly offered controls.
 d.getElementById('user-filter').value='all';d.getElementById('user-filter').dispatchEvent(new w.Event('change'));d.querySelector('[data-user-id="alpha"]').click();w.API.adminUsers=()=>Promise.resolve({users:[{...user('alpha'),role:'owner'}]});await t.users();assert(!d.querySelector('#user-detail button'));
 // Auxiliary overview failure cannot be silently advertised as a complete refresh.
 w.API.currentAnnouncement=()=>Promise.reject(new Error('announcement unavailable'));assert.equal(await t.overview(),false);await t.show('overview');assert.match(d.getElementById('admin-load-error').textContent,/announcement unavailable/);assert.match(d.getElementById('ann-current').textContent,/Could not check/);
 // HTML contracts: original IDs and no duplicates, no production fixture scripts.
 const form=d.getElementById('user-create');form.hidden=false;d.getElementById('uc-username').value='firstuser';d.getElementById('uc-password').value='Password123!';const create=deferred();w.API.adminCreateUser=()=>create.promise;form.requestSubmit();d.getElementById('uc-username').value='nextuser';d.getElementById('uc-username').dispatchEvent(new w.Event('input',{bubbles:true}));create.resolve({user:{username:'firstuser'}});await tick();await tick();assert.equal(d.getElementById('uc-username').value,'nextuser');assert.match(d.getElementById('uc-done').textContent,/Created @firstuser/);
 for(const file of ['admin.html','admin-search.html']){const h=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'));const ids=Array.from(h.window.document.querySelectorAll('[id]')).map(n=>n.id);assert.equal(ids.length,new Set(ids).size);assert(!h.window.document.querySelector('script[src*="fixture"]'));h.window.close();}
 dom.window.close();
 const search=await boot(true);const sd=search.d,sw=search.w;
 sd.getElementById('q').value='save & restore';sd.getElementById('search-form').dispatchEvent(new sw.Event('submit',{cancelable:true}));assert.equal(new URL(sw.location.href).searchParams.get('q'),'save & restore');assert.equal(new URL(sw.location.href).searchParams.get('keep'),'yes');assert.match(sd.getElementById('open-tab').href,/q=save%20%26%20restore/);assert.equal(sd.getElementById('results').getAttribute('aria-busy'),'true');
 sd.getElementById('results').dispatchEvent(new sw.Event('load'));assert.match(sd.getElementById('admin-load-status').textContent,/blocked or blank/);
 sd.getElementById('q').value='';sd.getElementById('search-form').dispatchEvent(new sw.Event('submit',{cancelable:true}));assert(!new URL(sw.location.href).searchParams.has('q'));assert(sd.getElementById('results').hasAttribute('srcdoc'));assert(!sd.getElementById('open-tab').href.includes('?q='));
 sw.history.back();await new Promise(r=>setTimeout(r,30));assert.equal(sd.getElementById('q').value,'save & restore');assert(!sd.getElementById('results').hasAttribute('srcdoc'));search.dom.window.close();
 console.log('PASS: profile keyboard semantics, selected-state/focus, refreshed detail/draft preservation, reset error/retry, late action selection, filtered selection, refreshed permissions, partial overview failure, HTML ID/fixture contracts, search encoding/URL/clear/back state');
})().catch(err=>{console.error(err);process.exitCode=1;});
