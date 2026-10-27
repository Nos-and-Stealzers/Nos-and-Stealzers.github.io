'use strict';
/* Meccha Chameleon: UI. Menu shell (Play / Servers / Locker / Career), modals, HUD, hub overlay, boot. */

const ICON = {
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  power: '<path d="M12 3v8"/><path d="M6.5 7a8 8 0 1 0 11 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01"/>',
  brush: '<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12c-2 0-3 1.5-3 3.5S2 20 2 20s4.5.5 6-1 1.5-3 .5-4"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  clone: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  decoy: '<circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a5 5 0 0 0 0 8M16 8a5 5 0 0 1 0 8"/>',
  pose: '<circle cx="12" cy="4.5" r="2"/><path d="M4 9l8 1 8-1M12 10v5l-4 6M12 15l4 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  hammer: '<path d="M4 20l9-9"/><path d="M11 5l4-2 6 6-2 4z"/>',
  splat: '<circle cx="12" cy="12" r="5"/><circle cx="5" cy="6" r="1.6"/><circle cx="19" cy="7" r="1.3"/><circle cx="18" cy="18" r="1.8"/><circle cx="6" cy="18" r="1.2"/>',
  ping: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.4.2 4.2 1.8 4.8 4.8"/>',
};
const ico = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;

const WIN_DOWNLOAD = 'https://github.com/Nos-and-Stealzers/meccha-chameleon/releases/latest/download/peperhide-Windows.zip';
const TIPS = [
  'Lie face down on a rug and paint your back like the rug pattern.',
  'The Mimic brush paints whatever is behind you from the camera angle. Line the camera up with where hunters will look from.',
  'Shiny floors need shiny chameleons. Match roughness and shine, not just colour.',
  'Hunters notice movement far more than bad paint. Freeze the moment you see a "?".',
  'Drop a clone somewhere obvious, then hide somewhere smarter. Bonked clones are worth 40 XP.',
  'Throw a decoy (V) across the room when a hunter is closing in.',
  'Hunters: right-click fires paintballs. A pink splat floating in mid-air is a chameleon.',
  'Hunters: Ping (E) makes nearby chameleons chirp. Close your eyes and listen.',
  'Stand in front of the Camo tester in the lobby to grade your paint job.',
  'Hold Tab during a round to see the scoreboard.',
  'Sprinting (Shift) is loud. Hunters hear running footsteps, so walk the last few metres to your spot.',
  'Jump at a wall and press Space again to stick to it. Space climbs, C lowers, Shift lets go.',
  'Hold G, point at a pose and let go. Tap G to keep the wheel open and click instead.',
  'Hunters split up and search rooms as a team. If one spots you, the others come running.',
  'In paint mode, hover the room and press Space to grab that exact colour.',
];
const MODES = [
  { id: 'quick', name: 'Quick match', kind: 'Online', desc: 'Jump into the busiest public server. Up to 15 players.', bg: 'lobby', tag: 'Live' },
  { id: 'hide', name: 'Hide', kind: 'Solo', desc: 'Paint yourself and survive the AI hunters with AI teammates.', bg: 'mansion', map: true, diff: true },
  { id: 'seek', name: 'Seek', kind: 'Solo', desc: 'You hunt. AI chameleons have painted themselves somewhere.', bg: 'gallery', map: true, diff: true },
  { id: 'infection', name: 'Infection', kind: 'Solo', desc: 'Get caught and you become a hunter. Last one standing wins.', bg: 'backrooms', map: true, diff: true },
  { id: 'practice', name: 'Practice', kind: 'Lobby', desc: 'Free roam the club. Try poses, paint and test your camo.', bg: 'lobby' },
  { id: 'party', name: 'Party', kind: 'Local', desc: 'Pass & play on one PC. Friends hide in turns, one hunts.', bg: 'sugar', map: true, diff: true, party: true },
];

function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
let bannerT = null;
function banner(kicker, title, sub = '', cls = '', dur = 2200) {
  const b = $('#banner'); clearTimeout(bannerT);
  b.className = cls; b.querySelector('.bk').textContent = kicker; b.querySelector('.bk').style.display = kicker ? '' : 'none';
  b.querySelector('.bt').textContent = title; b.querySelector('.bs').textContent = sub;
  void b.offsetWidth; b.classList.add('show');
  bannerT = setTimeout(() => { b.classList.add('out'); bannerT = setTimeout(() => (b.className = 'hidden'), 300); }, dur);
}
function feed(html, kind = '') {
  const el = document.createElement('div'); el.className = 'feeditem ' + kind; el.innerHTML = html;
  $('#feed').prepend(el); setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7600);
  while ($('#feed').children.length > 6) $('#feed').lastChild.remove();
}
function seg(id, value, fn, disabled = false) {
  const el = $(id); if (!el) return;
  el.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === String(value)); b.disabled = disabled; });
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); fn(b.dataset.v); };
}
const segHTML = (opts) => Object.entries(opts).map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
function mapCards(el, cur, fn, disabled = false) {
  el.innerHTML = MAP_ORDER.map((id) => {
    const m = MAPS[id], th = THUMBS[id];
    return `<button class="mapcard ${id === cur ? 'on' : ''}" data-v="${id}" ${disabled ? 'disabled' : ''} style="--c1:${m.colors[0]};--c2:${m.colors[1]}" title="${esc(m.desc)}"><i class="thumb" ${th ? `style="background-image:url(${th})"` : ''}></i><b>${m.name}</b></button>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); fn(b.dataset.v); };
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ================= item thumbnails (rendered once, cached) ================= */
const ITHUMB = {};
const Thumbs = (() => {
  let sc = null, cam, rt;
  const S = 128, buf = new Uint8Array(S * S * 4);
  function setup() {
    if (sc) return;
    sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x5a6478, 1.0));
    const d = new THREE.DirectionalLight(0xffffff, 0.6); d.position.set(2, 3, 4); sc.add(d);
    cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50); rt = new THREE.WebGLRenderTarget(S, S);
  }
  function shot(obj, yaw = 0.5) {
    setup(); sc.add(obj); obj.rotation.y = yaw; obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new V3()), sz = bb.getSize(new V3());
    const dist = Math.max(sz.x, sz.y, sz.z) * 2.1 + 0.05;
    cam.position.set(c.x + dist * 0.25, c.y + dist * 0.2, c.z + dist * 0.95); cam.lookAt(c);
    const pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
    renderer.setClearColor(0, 0); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf); renderer.setRenderTarget(null); renderer.setClearColor(pc, pa);
    sc.remove(obj);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  function get(kind, key) {
    const k = kind + ':' + key;
    if (ITHUMB[k] !== undefined) return ITHUMB[k];
    let url = null;
    try {
      if (kind === 'shape') { const c = new Cham({ name: 't', shape: key, parent: new THREE.Group() }); c.setPose('stand', true); url = shot(c.root, 0.35); c.dispose(); }
      else if (kind === 'eyes') { const cv = document.createElement('canvas'); cv.width = cv.height = 96; const g = cv.getContext('2d'); g.fillStyle = WHITE; g.beginPath(); g.arc(48, 48, 46, 0, 7); g.fill(); const t = document.createElement('canvas'); t.width = t.height = 96; t.getContext('2d').putImageData(drawFaceCanvas(key, 96), 0, 0); g.drawImage(t, 0, -6); url = cv.toDataURL(); }
      else if (kind === 'hat' || kind === 'visor') {
        if (key === 'none') url = '';
        else { const grp = new THREE.Group(); grp.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: 0.7 }))); grp.add(buildHeadGear(kind === 'hat' ? { hat: key, visor: 'none' } : { hat: 'none', visor: key })); url = shot(grp, kind === 'hat' ? 0.4 : 0.35); }
      }
      else if (kind === 'tool') url = shot(buildTool(key), 0.6);
    } catch (e) { console.warn('thumb', kind, key, e); }
    return (ITHUMB[k] = url);
  }
  return { get };
})();

/* ================= UI ================= */
const UI = {
  curTool: 'brush', color: '#7a4a2c', brush: 10, recent: [], chatOpen: false, wheelOpen: false, wheelHold: false, panelOpen: false,
  page: 'home', slot: 'shape', returnTo: null, settingsBack: null, abKey: '', srvFilter: 'all', srvSel: null, srvRows: [], publicRows: null,
  playlist: Object.assign({ mode: 'quick', map: 'mansion', diff: 'normal', humans: 2, ai: 1 }, JSON.parse(localStorage.getItem('mc_playlist') || '{}')),
  modeDraft: null,

  /* ---------- screen routing (game.js calls screen('menu'|'online'|'char'|'end'|'load'|'hand'|'pause'|null)) ---------- */
  screen(name) {
    for (const s of $$('.modal')) s.classList.add('hidden');
    const shellPages = { menu: this.page === 'modes' ? 'home' : this.page, online: 'servers', char: 'locker' };
    if (name in shellPages) { $('#shell').classList.remove('hidden'); this.go(name === 'menu' ? (this.returnTo === 'hub' ? 'home' : shellPages.menu) : shellPages[name], true); }
    else { $('#shell').classList.add('hidden'); Preview.stop(); this.stopBrowser(); document.body.className = document.body.className.replace(/\bpage-\w+/g, ''); }
    if (name && !(name in shellPages)) $('#screen-' + name)?.classList.remove('hidden');
    document.body.classList.toggle('in-menu', name in shellPages);
  },
  go(page, silent) {
    if (!silent) Sound.click();
    this.page = page;
    for (const p of $$('.page')) p.classList.toggle('hidden', p.id !== 'page-' + page);
    $$('#navTabs button').forEach((b) => b.classList.toggle('on', b.dataset.page === page || (page === 'modes' && b.dataset.page === 'home')));
    document.body.className = document.body.className.replace(/\bpage-\w+/g, '') + ' page-' + page;
    const inHub = this.returnTo === 'hub' && G.phase === 'hub';
    $('#navTabs').classList.toggle('hidden', inHub);
    if (page === 'locker') { Preview.start('#previewCanvas'); this.renderLocker(); } else Preview.stop();
    if (page === 'servers') this.startBrowser(); else this.stopBrowser();
    if (page === 'home') this.renderHome();
    if (page === 'modes') this.renderModes();
    if (page === 'career') this.renderCareer();
    this.renderChip();
  },
  hud(on) { $('#hud').classList.toggle('hidden', !on); if (!on) this.scoreboard(false); },
  hubHud(on) { $('#hubHud').classList.toggle('hidden', !on); if (!on) this.hubPanel(false); },
  blind(on) { $('#blind').classList.toggle('hidden', !on); },
  loading(on, txt) {
    if (!on) { if (!$('#screen-load').classList.contains('hidden')) this.screen(null); return; }
    const id = MAP_ORDER.find((k) => txt && txt.includes(MAPS[k].name));
    $('#loadBg').style.backgroundImage = id && THUMBS[id] ? `url(${THUMBS[id]})` : THUMBS.lobby ? `url(${THUMBS.lobby})` : '';
    $('#loadKicker').textContent = id ? 'Loading map' : 'Please wait';
    $('#loadTitle').textContent = id ? MAPS[id].name : txt.replace(/…$/, '');
    $('#loadTip').textContent = id ? MAPS[id].desc : pick(TIPS);
    this.screen('load');
    if (!id) $('#loadTip').textContent = pick(TIPS);
  },
  hand(title, text) { $('#handTitle').textContent = title; $('#handText').textContent = text; this.screen('hand'); },
  pause(on) {
    if (!on) { if (!$('#screen-pause').classList.contains('hidden')) this.screen(null); return; }
    const hub = G.phase === 'hub';
    $('#pauseSub').textContent = G.online ? (Net.isPublic ? 'Public server' : 'Online') : hub ? 'Practice' : 'Solo';
    $('#pauseTitle').textContent = hub ? (G.online ? (Net.server?.name || 'Lobby') : 'Club') : 'Paused';
    $('#quitBtn').textContent = G.online ? 'Leave server' : hub ? 'Leave club' : 'Quit to menu';
    $('#pauseChar').classList.toggle('hidden', !hub);
    this.screen('pause');
  },

  /* ---------- top bar chip ---------- */
  renderChip() {
    const L = levelInfo(PROFILE.xp);
    $('#pcName').textContent = PROFILE.name; $('#pcLevel').textContent = L.level;
    $('#pcRing').style.setProperty('--p', L.into / L.need); $('#pcXpBar').style.width = (L.into / L.need * 100) + '%';
  },

  /* ---------- home ---------- */
  renderHome() {
    const pl = this.playlist, m = MODES.find((x) => x.id === pl.mode) || MODES[0];
    $('#plKind').textContent = m.kind; $('#plName').textContent = m.name;
    $('#plSub').textContent = m.id === 'quick' ? 'Public servers · up to 15 players' : m.id === 'practice' ? 'Chameleon Club' : `${MAPS[pl.map].name} · ${DIFF[pl.diff].name}` + (m.party ? ` · ${pl.humans} hider${pl.humans > 1 ? 's' : ''}` : '');
    const th = m.map ? THUMBS[pl.map] : THUMBS[m.bg];
    $('#plThumb').style.backgroundImage = th ? `url(${th})` : '';
    $('#tipText').textContent = pick(TIPS);
    $('#playBtn').classList.remove('searching'); $('#playBtn').querySelector('span').textContent = 'Play';
  },
  renderModes() {
    const d = this.modeDraft || (this.modeDraft = { ...this.playlist });
    $('#modeGrid').innerHTML = MODES.map((m) => `<button class="mode ${d.mode === m.id ? 'on' : ''}" data-v="${m.id}" style="background-image:url(${THUMBS[m.bg] || ''})"><span class="tag ${m.tag ? 'live' : ''}">${m.tag || m.kind}</span><div class="mtxt"><b>${m.name}</b><small>${m.desc}</small></div></button>`).join('');
    $('#modeGrid').onclick = (e) => { const b = e.target.closest('.mode'); if (!b) return; d.mode = b.dataset.v; Sound.click(); this.renderModes(); };
    const m = MODES.find((x) => x.id === d.mode);
    $('#modeOpts').classList.toggle('hidden', !m.map);
    $('#optPartyRow').classList.toggle('hidden', !m.party); $('#optPartyAiRow').classList.toggle('hidden', !m.party);
    mapCards($('#modeMaps'), d.map, (v) => { d.map = v; });
    seg('#modeDiff', d.diff, (v) => { d.diff = v; });
    seg('#partyHumans', d.humans, (v) => { d.humans = +v; });
    seg('#partyAI', d.ai, (v) => { d.ai = +v; });
    $('#modeHelp').textContent = m.desc;
  },
  async play() {
    Sound.init();
    const pl = this.playlist;
    if (pl.mode === 'quick') return quickMatch();
    if (pl.mode === 'practice') { G.online = false; G.isHost = true; G.myId = 'me'; enterHub(); toast('Practice club: try poses, paint yourself, test your camo. Ready pad starts a round.', 'good'); return; }
    if (pl.mode === 'party') return G.startParty(pl.humans, pl.ai, pl.map, pl.diff);
    G.solo = { kind: pl.mode, map: pl.map, diff: pl.diff };
    G.startSolo();
  },

  /* ---------- in-round HUD ---------- */
  paintPanel(on) {
    $('#paintPanel').classList.toggle('hidden', !on);
    document.body.classList.toggle('painting', !!on);
    if (on && G.my) {
      $('#rough').value = Math.round(G.my.mat.roughness * 100); $('#roughVal').textContent = G.my.mat.roughness.toFixed(2);
      $('#metal').value = Math.round(G.my.mat.metalness * 100); $('#metalVal').textContent = G.my.mat.metalness.toFixed(2);
      $('#inkRow').classList.toggle('hidden', G.phase === 'hub');
      $('#shapeSeg').innerHTML = segHTML(Object.fromEntries(Object.entries(SHAPES).filter(([k]) => isUnlocked('shape', k)).map(([k, s]) => [k, s.label])));
      this.refreshInk(); this.refreshBars();
    }
  },
  tool(t) { this.curTool = t; $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); },
  setColor(hex, addRecent) { this.color = hex; $('#color').value = hex; $('#colorHex').textContent = hex; if (addRecent) { this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, 16); $('#swatches').innerHTML = this.recent.map((c) => `<i style="background:${c}" data-c="${c}" title="${c}"></i>`).join(''); } },
  setRough(r) { if (!G.my) return; G.my.mat.roughness = r; $('#rough').value = Math.round(r * 100); $('#roughVal').textContent = r.toFixed(2); },
  refreshInk() { $('#inkBar').style.width = G.ink + '%'; },
  stamina(v, tired) {
    const el = $('#stamina'); if (!el) return;
    el.classList.toggle('hidden', v > 0.995); el.classList.toggle('tired', !!tired);
    el.firstElementChild.style.width = (v * 100).toFixed(1) + '%';
  },
  wheel(open, hold = false) {
    if (open && !controllable()) return;
    this.wheelOpen = open; this.wheelHold = hold; this.wheelHover = null;
    $('#poseWheel').classList.toggle('hidden', !open);
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      const cur = G.my?.pose;
      $('#wheelPoses').innerHTML = POSE_ORDER.map((k) => `<button data-pose="${k}" class="${k === cur ? 'on' : ''}"><span class="pz pz-${k}"></span><b>${POSES[k].label}</b>${POSES[k].key ? `<kbd>${POSES[k].key}</kbd>` : ''}</button>`).join('');
      $('#wheelEmotes').classList.toggle('hidden', G.phase !== 'hub');
    }
  },
  abilities() {
    const hunter = G.view === 'first' && !!G.myHunter, hider = !!G.my && G.view === 'third';
    const key = hunter ? 'h' : hider ? 'c' : '';
    if (key !== this.abKey) {
      this.abKey = key;
      const A = (id, icon, label, kb) => `<button class="ab" id="ab-${id}" data-ab="${id}"><span class="cd"></span><kbd>${kb}</kbd>${ico(icon)}<b>${label}</b><em class="cnt"></em></button>`;
      $('#abilities').innerHTML = hunter ? A('paint', 'splat', 'Paint', 'RMB') + A('ping', 'ping', 'Ping', 'E') + A('bonk', 'hammer', 'Bonk', 'LMB')
        : hider ? `<button class="ab ready" id="readyBtn"><b>Ready</b><kbd>Enter</kbd></button>` + A('pose', 'pose', 'Poses', 'G') + A('brush', 'brush', 'Paint', 'F') + A('clone', 'clone', 'Clone', 'Q') + A('taunt', 'note', 'Taunt', 'H') + A('decoy', 'decoy', 'Decoy', 'V') : '';
    }
    if (!key) return;
    const set = (id, frac, cnt, off) => { const el = $('#ab-' + id); if (!el) return; el.style.setProperty('--p', clamp(frac, 0, 1)); el.querySelector('.cnt').textContent = cnt ?? ''; el.classList.toggle('off', !!off); };
    if (hunter) {
      set('ping', G.ab.ping / AB.pingCD, G.ab.ping > 0 ? Math.ceil(G.ab.ping) : '', G.ab.ping > 0 || G.phase !== 'hunt');
      set('paint', G.ab.ammo < AB.ammo ? 1 - G.ab.ammoT / AB.ammoRecharge : 0, G.ab.ammo + '/' + AB.ammo, G.ab.ammo < 1 || G.phase !== 'hunt');
      set('bonk', 0, '', G.phase !== 'hunt');
    } else {
      set('pose', 0, '');
      set('clone', 0, G.ab.clones, G.ab.clones <= 0);
      set('taunt', G.ab.taunt / AB.tauntCD, G.ab.taunt > 0 ? Math.ceil(G.ab.taunt) : '', G.phase !== 'hunt' || G.ab.taunt > 0);
      set('decoy', 0, G.ab.decoys, G.phase !== 'hunt' || G.ab.decoys <= 0);
      $('#readyBtn')?.classList.toggle('hidden', !(G.phase === 'prep' && (!G.online || G.isHost)));
    }
  },
  refreshBars() {
    const P = G.my;
    $$('#paintPoses [data-pose]').forEach((b) => b.classList.toggle('on', !!P && b.dataset.pose === P.pose));
    $$('#shapeSeg button').forEach((b) => b.classList.toggle('on', !!P && b.dataset.v === P.shape));
    $$('#sizeSeg button').forEach((b) => b.classList.toggle('on', !!P && b.dataset.v === P.size));
    $('#crosshair').classList.toggle('hidden', G.view !== 'first');
    $('#eyes').classList.toggle('hidden', !(G.phase === 'hunt' && P && !P.caught && G.hunters.some((h) => h.ai)));
    if (playing()) this.abilities();
  },
  crossHot(on) { $('#crosshair').classList.toggle('hot', on); },
  status() {
    const real = G.realHiders();
    $('#status').innerHTML = `<div class="sthead"><span>Chameleons</span><span>${real.filter((c) => !c.caught).length}/${real.length}</span></div>` + real.map((c) => `<div class="plrow ${c.caught ? 'caught' : ''}" style="--c:${c.color}"><span class="nm">${esc(c.name)}${c === G.my ? '<em>you</em>' : ''}</span>${c.caught ? '<span class="x">found</span>' : ''}</div>`).join('');
  },
  tick() {
    const t = Math.max(0, G.timer);
    $('#timer').textContent = fmtTime(t);
    $('#timer').classList.toggle('low', t < 10.5);
    $('#timerBar').style.width = (G.phaseLen ? t / G.phaseLen * 100 : 0) + '%';
    const left = G.realHiders().filter((c) => !c.caught).length;
    $('#tHiders').textContent = left; $('#tHunters').textContent = G.hunters.length;
    let phase = '', sub = '', hint = '';
    if (G.phase === 'prep') { phase = 'Hiding'; sub = G.view === 'first' ? 'Hunters wait for the gate' : G.party ? `${G.my?.name}: paint and pose` : 'Paint yourself and find a spot'; }
    else if (G.phase === 'hunt') { phase = 'Hunt'; sub = G.view === 'spec' ? 'Spectating' : MAP.name; }
    if (G.view === 'third' && !G.paint) hint = G.my?.stick ? 'Stuck to the wall · Space up · C down · A/D slide · Shift let go' : 'Shift sprint · C crouch · F paint · G poses · Space twice by a wall to stick' + (G.online ? ' · T chat' : '') + ' · Tab scores';
    else if (G.view === 'first') hint = 'Shift sprint · LMB bonk · RMB paintball · E ping · Listen for footsteps and chirps' + (G.online ? ' · T chat' : '');
    else if (G.view === 'spec') { const hs = G.hunters.filter((h) => !h.local); hint = hs.length ? `Spectating ${hs[G.specIdx % hs.length].name} · 1-9 switch hunter · Tab scoreboard` : ''; }
    $('#phase').textContent = phase; $('#sub').textContent = sub; $('#hint').textContent = hint;
    if (G.phase === 'hunt' && G.my) {
      const s = clamp(G.playerSus || 0, 0, 1);
      $('#eyesBar').style.width = (s * 100) + '%';
      $('#eyesTxt').textContent = s < 0.05 ? 'Unseen' : s < 0.35 ? 'Glanced at' : s < 1 ? 'Suspicious' : 'Spotted';
      $('#eyes').dataset.lvl = s < 0.05 ? 0 : s < 0.35 ? 1 : s < 1 ? 2 : 3;
    }
    if (G.phase === 'prep' && G.view === 'first') $('#blindTime').textContent = Math.ceil(t);
    this.refreshBars(); this.status();
    if (!$('#scoreboard').classList.contains('hidden')) this.renderScoreboard();
  },
  scoreboard(on) {
    if (on && !(playing() || G.phase === 'end')) return;
    $('#scoreboard').classList.toggle('hidden', !on);
    if (on) this.renderScoreboard();
  },
  renderScoreboard() {
    const finds = {};
    for (const c of G.realHiders()) if (c.caught && c.caughtBy) finds[c.caughtBy] = (finds[c.caughtBy] || 0) + 1;
    $('#sbTitle').textContent = MAP?.name || 'Scoreboard';
    $('#sbSub').textContent = `${G.P?.mode === 'infection' ? 'Infection' : 'Classic'} · ${G.online ? (Net.server?.name || 'Online') : 'Offline'}${G.online ? ` · ${Net.ping} ms` : ''}`;
    const hid = G.realHiders().map((c) => `<div class="sbrow ${c === G.my ? 'me' : ''}"><span class="dot" style="background:${c.color}"></span><span>${esc(c.name)}${c.human ? '' : ' <span class="s">bot</span>'}</span><span class="s">${c.caught ? 'Found ' + fmtTime(c.caughtAt || 0) : 'Hiding'}</span><span class="r">${c.caught ? '–' : '✓'}</span></div>`).join('');
    const hun = G.hunters.map((h) => `<div class="sbrow ${h.local ? 'me' : ''}"><span class="dot" style="background:${h.color}"></span><span>${esc(h.name)}${h.ai ? ' <span class="s">bot</span>' : ''}</span><span class="s">Hunter</span><span class="r">${finds[h.id] || 0} found</span></div>`).join('');
    $('#sbBody').innerHTML = `<div class="sbteam h"><h4>Chameleons</h4>${hid}</div><div class="sbteam k"><h4>Hunters</h4>${hun}</div>`;
  },

  /* ---------- hub overlay ---------- */
  renderHub() {
    if (!G.hub) return;
    const H = G.hub, players = hubPlayers(), counts = voteCounts();
    $('#hubTitle').textContent = G.online ? (Net.server?.name || 'Lobby') : 'Practice club';
    $('#hubCount').textContent = G.online ? `${players.length}/${Net.server?.max || 15}` : '1/1';
    $('#hubPlayers').innerHTML = players.map((p) => `<div class="plrow ${p.inHub === false ? 'caught' : ''}" style="--c:${p.tag || '#fff'}"><span class="nm">${esc(p.name)}${p.me ? '<em>you</em>' : ''}${p.host ? '<em>host</em>' : ''}</span>${p.inHub === false ? '<span class="nr">in round</span>' : p.ready ? '<span class="rd">ready</span>' : '<span class="nr">not ready</span>'}</div>`).join('');
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    $('#hubVotes').innerHTML = MAP_ORDER.map((id) => `<div class="vrow ${H.vote === id ? 'mine' : ''}"><span class="vn">${MAPS[id].name}</span><span class="vc">${counts[id] || 0}</span><div class="vb"><i style="width:${(counts[id] || 0) / total * 100}%"></i></div></div>`).join('');
    if (this.panelOpen) this.renderHubPanel();
  },
  hubTick() {
    const H = G.hub; if (!H) return;
    const players = hubPlayers().filter((p) => p.inHub !== false), nReady = players.filter((p) => p.ready).length;
    const el = $('#hubStatus');
    if (H.cd != null) { el.dataset.cd = 1; el.innerHTML = `<span class="eyebrow">${MAPS[topVote() || G.lobby.settings.map]?.name || ''}</span><b>Starting in ${H.cd}</b><span class="s">${nReady}/${players.length} ready</span>`; }
    else {
      el.dataset.cd = 0;
      const need = G.online && players.length >= 3 ? `${Math.ceil(players.length / 2)} ready starts a 20s timer` : 'everyone ready starts the round';
      el.innerHTML = H.ready ? `<span class="eyebrow">You're ready</span><b>${nReady}/${players.length} ready</b><span class="s">${need}</span>` : `<span class="eyebrow">${nReady}/${players.length} ready</span><b>Stand on the green pad</b><span class="s">Vote by walking onto a map pad · ${need}</span>`;
    }
    const T = $('#hubTester');
    T.classList.toggle('show', H.testShow > 0.5);
    if (H.testShow > 0.5) {
      const r = H.testRate, grade = r < 0.04 ? 'S' : r < 0.12 ? 'A' : r < 0.3 ? 'B' : r < 0.6 ? 'C' : 'D';
      const txt = { S: 'Invisible. Perfect camo.', A: 'Great camo. Hard to spot.', B: 'Decent. A sharp hunter might notice.', C: 'Visible. Paint more of you.', D: 'Spotted instantly.' }[grade];
      $('#testerGrade').textContent = grade; $('#testerGrade').dataset.g = grade; $('#testerTxt').textContent = H.me.speed > 0.4 ? 'Stop moving to get graded.' : txt;
      $('#testerBar').style.width = clamp(r / 0.8, 0, 1) * 100 + '%';
    }
  },
  hubPanel(open) {
    if (open && G.phase !== 'hub') return;
    this.panelOpen = open;
    $('#hubPanel').classList.toggle('hidden', !open);
    if (open) { if (document.pointerLockElement) document.exitPointerLock(); this.renderHubPanel(); }
    else if (G.phase === 'hub' && $('#shell').classList.contains('hidden')) G.lock();
  },
  renderHubPanel() {
    const host = !G.online || Net.isHost, s = G.online ? G.lobby.settings : null;
    $('#hpTitle').textContent = G.online ? 'Lobby settings' : 'Practice settings';
    $('#hpOnline').classList.toggle('hidden', !G.online); $('#hpOffline').classList.toggle('hidden', G.online);
    if (G.online) {
      const segs = [['#lsMode', 'mode'], ['#lsHunters', 'hunters'], ['#lsAiHunters', 'aiHunters'], ['#lsAiHiders', 'aiHiders'], ['#lsPrep', 'prep'], ['#lsHunt', 'hunt'], ['#lsDiff', 'diff']];
      for (const [id, k] of segs) seg(id, s[k], (v) => { s[k] = isNaN(+v) ? v : +v; pushLobby(); }, !host);
      mapCards($('#lsMaps'), s.map, (v) => { s.map = v; pushLobby(); }, !host);
      $('#hpNote').textContent = host ? 'You are the host. Votes pick the map; the fallback is used when nobody votes.' : 'Only the host can change these.';
      $('#lobbyShare').innerHTML = host && this.hostIPs && !Net.isPublic ? 'Friends join with ' + this.hostIPs.map((i) => `<code>${i.address}:${this.hostPort}</code>${i.tailscale ? ' <span class="muted">Tailscale</span>' : ''}`).join(' · ') : '';
      $('#hpPlayers').innerHTML = [...G.lobby.players.values()].map((p) => `<div class="plrow" style="--c:${p.profile?.tag || '#fff'}"><span class="nm">${esc(p.name)}${p.profile?.level ? ` <span class="muted small">Lv ${p.profile.level}</span>` : ''}</span>${host && !Net.isPublic && p.id !== Net.id ? `<button class="ghostbtn kick" data-id="${p.id}">Kick</button>` : ''}</div>`).join('');
      $('#hpPlayers').onclick = (e) => { const b = e.target.closest('.kick'); if (b) Net.send({ t: 'kick', id: b.dataset.id }); };
    } else {
      seg('#psKind', G.solo.kind, (v) => { G.solo.kind = v; });
      seg('#psDiff', G.solo.diff, (v) => { G.solo.diff = v; });
    }
    $('#hpStart').classList.toggle('hidden', !host);
  },

  /* ---------- end screen ---------- */
  end(R) {
    $('#endBanner').className = 'endbanner ' + (R.won ? 'win' : 'lose');
    $('#endKicker').textContent = R.won ? 'Victory' : 'Defeat';
    $('#endTitle').textContent = R.title; $('#endText').textContent = R.text;
    $('#endList').innerHTML = R.items.map((i) => `<li><span>${esc(i.name)}</span><span class="${i.ok ? 'ok' : 'no'}">${i.txt}</span></li>`).join('');
    $('#endXp').innerHTML = R.xp.map(([k, v]) => `<li><span>${esc(k)}</span><b>+${v}</b></li>`).join('') + `<li class="tot"><span>Total</span><b>+${R.gained} XP</b></li>`;
    const L = levelInfo(PROFILE.xp);
    $('#endLevel').textContent = R.after > R.before ? `Level up! ${R.before} → ${R.after}` : `Level ${L.level}`;
    $('#endLvBar').style.width = '0%'; setTimeout(() => ($('#endLvBar').style.width = (L.into / L.need * 100) + '%'), 150);
    $('#endLvTxt').textContent = `${L.into} / ${L.need} XP`;
    $('#endUnlocks').innerHTML = R.unlocks.map((u) => `<span class="chip">${ico('star')}${esc(u)}</span>`).join('');
    $('#revealBtn').textContent = R.surv ? 'Show hiding spots' : 'Replay hiding spots';
    $('#againBtn').textContent = R.online ? 'Back to lobby' : 'Play again';
    $('#menuBtn').textContent = R.online ? 'Leave server' : 'Menu';
    this.hud(false); this.screen('end');
    clearInterval(this.autoBackT); $('#endAuto')?.remove();
    if (R.online) {
      let n = 15; const el = document.createElement('div'); el.id = 'endAuto'; el.className = 'autoback'; $('.endscreen').appendChild(el);
      const tick = () => { el.textContent = `Back to the lobby in ${n}s`; if (n-- <= 0) { clearInterval(this.autoBackT); if (G.phase === 'end' && G.online) backToHub(); } };
      tick(); this.autoBackT = setInterval(tick, 1000);
    }
  },

  /* ---------- chat ---------- */
  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    $('#gameChat').classList.remove('hidden'); $('#gameChatInput').value = ''; setTimeout(() => $('#gameChatInput').focus(), 0);
  },
  closeChat(send) {
    const v = $('#gameChatInput').value.trim();
    if (send && v) Net.send({ t: 'chat', text: v });
    this.chatOpen = false; $('#gameChat').classList.add('hidden'); $('#gameChatInput').blur(); G.lock();
  },
  addChat(name, text, sys, from) {
    G.lobby.chat.push({ name, text, sys }); if (G.lobby.chat.length > 80) G.lobby.chat.shift();
    const el = document.createElement('div'); el.className = 'chatline' + (sys ? ' sys' : ''); el.innerHTML = sys ? esc(text) : `<b>${esc(name)}:</b> ${esc(text)}`;
    $('#chatFeed').appendChild(el); setTimeout(() => el.classList.add('out'), 10000); setTimeout(() => el.remove(), 10600);
    while ($('#chatFeed').children.length > 8) $('#chatFeed').firstChild.remove();
    if (!sys) { Sound.chat(); if (G.phase === 'hub' && from) chatBubble(from, text); }
  },

  /* ---------- locker ---------- */
  SLOTS: {
    shape: { label: 'Body', group: 'cham', opts: () => Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])), get: () => PROFILE.cham.shape, set: (v) => (PROFILE.cham.shape = v), kind: 'shape' },
    eyes: { label: 'Face', group: 'cham', opts: () => EYES, get: () => PROFILE.cham.eyes, set: (v) => (PROFILE.cham.eyes = v), kind: 'eyes' },
    tag: { label: 'Name colour', group: 'cham', color: true, opts: () => Object.fromEntries(TAG_COLORS.map((c) => [c, c])), get: () => PROFILE.tag, set: (v) => (PROFILE.tag = v) },
    suit: { label: 'Suit', group: 'hunter', color: true, opts: () => Object.fromEntries(HUNTER_COLORS.map((c) => [c, c])), get: () => PROFILE.hunter.color, set: (v) => (PROFILE.hunter.color = v) },
    hat: { label: 'Hat', group: 'hunter', opts: () => HATS, get: () => PROFILE.hunter.hat, set: (v) => (PROFILE.hunter.hat = v), kind: 'hat' },
    visor: { label: 'Face gear', group: 'hunter', opts: () => VISORS, get: () => PROFILE.hunter.visor, set: (v) => (PROFILE.hunter.visor = v), kind: 'visor' },
    tool: { label: 'Weapon', group: 'hunter', opts: () => TOOLS, get: () => PROFILE.hunter.tool, set: (v) => (PROFILE.hunter.tool = v), kind: 'tool' },
  },
  renderLocker() {
    $('#nameInput').value = PROFILE.name;
    const slotHTML = (k) => {
      const S = this.SLOTS[k], cur = S.get(), lab = S.opts()[cur];
      const th = S.color ? '' : S.kind && Thumbs.get(S.kind, cur);
      const sw = S.color ? `<span class="sw" style="background:${cur}"></span>` : `<span class="sw" style="${th ? `background:rgba(255,255,255,.06) center/contain no-repeat url(${th})` : ''}">${th ? '' : '–'}</span>`;
      return `<button class="slot ${this.slot === k ? 'on' : ''}" data-slot="${k}">${sw}<div><small>${S.label}</small><b>${S.color ? '' : esc(lab || '')}</b></div></button>`;
    };
    $('#slotsCham').innerHTML = Object.keys(this.SLOTS).filter((k) => this.SLOTS[k].group === 'cham').map(slotHTML).join('');
    $('#slotsHunter').innerHTML = Object.keys(this.SLOTS).filter((k) => this.SLOTS[k].group === 'hunter').map(slotHTML).join('');
    const S = this.SLOTS[this.slot], cur = S.get();
    $('#itemsTitle').textContent = S.label;
    const opts = Object.entries(S.opts());
    $('#itemsSub').textContent = S.kind ? `${opts.filter(([k]) => isUnlocked(S.kind, k)).length}/${opts.length} unlocked` : '';
    $('#itemGrid').innerHTML = opts.map(([k, l]) => {
      const lv = S.kind ? unlockLevel(S.kind, k) : 1, locked = myLevel() < lv;
      if (S.color) return `<button class="item color ${k === cur ? 'on' : ''}" data-v="${k}"><span class="ibox" style="background:${k}"></span><b>${k}</b></button>`;
      const th = Thumbs.get(S.kind, k);
      return `<button class="item ${k === cur ? 'on' : ''} ${locked ? 'locked' : ''}" data-v="${k}" ${locked ? `title="Unlocks at level ${lv}"` : ''}>${locked ? `<span class="lockt">${ico('lock')}LV ${lv}</span>` : ''}<span class="ibox" style="${th ? `width:64px;height:64px;background:center/contain no-repeat url(${th})` : ''}">${th ? '' : '–'}</span><b>${esc(l)}</b></button>`;
    }).join('');
    const hunterTab = S.group === 'hunter';
    if (hunterTab) { if (this._prevKey !== 'h' + JSON.stringify(PROFILE.hunter)) { Preview.showHunter(PROFILE.hunter); this._prevKey = 'h' + JSON.stringify(PROFILE.hunter); } }
    else if (this._prevKey !== 'c' + PROFILE.cham.shape + PROFILE.cham.eyes) { Preview.showCham(PROFILE.cham.shape, PROFILE.cham.eyes); this._prevKey = 'c' + PROFILE.cham.shape + PROFILE.cham.eyes; }
  },

  /* ---------- career ---------- */
  renderCareer() {
    const L = levelInfo(PROFILE.xp), S = PROFILE.stats;
    $('#carLevel').textContent = L.level; $('#carXpBar').style.width = (L.into / L.need * 100) + '%';
    $('#carXpTxt').textContent = `${L.into} / ${L.need} XP to level ${L.level + 1} · ${PROFILE.xp} XP total`;
    $('#statGrid').innerHTML = [['Rounds played', S.games], ['Wins', S.wins], ['Win rate', S.games ? Math.round(S.wins / S.games * 100) + '%' : '–'], ['Times survived', S.survived], ['Chameleons found', S.found], ['Taunts', S.taunts], ['Best hider score', S.bestScore], ['Level', L.level]].map(([k, v]) => `<div class="stat glass"><b>${v}</b><span>${k}</span></div>`).join('');
    const items = Object.entries(UNLOCKS).flatMap(([kind, o]) => Object.entries(o).filter(([, l]) => l > 1).map(([k, l]) => ({ kind, k, l }))).sort((a, b) => a.l - b.l);
    const next = items.find((x) => x.l > L.level);
    $('#rewardTrack').innerHTML = items.map((x) => {
      const got = L.level >= x.l, th = Thumbs.get(x.kind, x.k);
      return `<div class="reward glass ${got ? 'got' : ''} ${x === next ? 'next' : ''}"><span class="rl">LV ${x.l}</span><span class="ri" style="${th ? `background:rgba(255,255,255,.06) center/contain no-repeat url(${th})` : ''}">${th ? '' : got ? ico('check') : ico('lock')}</span><b>${esc(unlockName(x.kind, x.k).replace(/ (body|face|hat|hunter face|weapon)$/, ''))}</b><small>${{ shape: 'Body', eyes: 'Face', hat: 'Hat', visor: 'Face gear', tool: 'Weapon' }[x.kind]}</small></div>`;
    }).join('');
  },

  /* ---------- server browser ---------- */
  browserTimer: null,
  startBrowser() {
    this.stopBrowser();
    let pubT = 0;
    const run = async () => {
      if (Date.now() - pubT > 6000) { pubT = Date.now(); const p = await fetchPublic(); this.publicRows = p; }
      const rows = [];
      for (const s of this.publicRows || []) rows.push({ key: 'pub:' + s.id, src: 'public', name: s.name, addr: s.url, map: s.map, mode: s.mode, players: s.players, max: s.max, inGame: s.inGame, offline: s.offline });
      if (this.publicRows === null) rows.push({ key: 'pub:err', src: 'public', name: 'Public servers', offline: true, err: 'Could not reach the public server list' });
      if (window.mcNative) for (const s of await mcNative.lanList()) rows.push({ key: 'lan:' + s.host + ':' + s.port, src: 'lan', name: s.name, addr: s.host + ':' + s.port, map: s.map, mode: s.mode, players: s.players, max: s.max, inGame: s.inGame, locked: s.locked });
      const favs = JSON.parse(localStorage.getItem('mc_servers') || '[]');
      const infos = await Promise.all(favs.map((a) => fetchInfo(a)));
      favs.forEach((a, i) => { const inf = infos[i], n = Net.normalize(a); if (rows.some((r) => r.addr === n)) return; rows.push(inf ? { key: 'fav:' + n, src: 'saved', name: inf.name, addr: n, map: inf.map, mode: inf.mode, players: inf.players, max: inf.max, inGame: inf.inGame, locked: inf.locked } : { key: 'fav:' + n, src: 'saved', name: n, addr: n, offline: true }); });
      this.srvRows = rows;
      if (this.page === 'servers' && !$('#shell').classList.contains('hidden')) this.renderServers();
    };
    run(); this.browserTimer = setInterval(run, 2500);
  },
  stopBrowser() { clearInterval(this.browserTimer); this.browserTimer = null; },
  renderServers() {
    const el = $('#serverList'), f = this.srvFilter;
    const rows = this.srvRows.filter((r) => f === 'all' || r.src === f);
    if (!rows.length) { el.innerHTML = `<div class="empty">${f === 'lan' ? 'No servers on your network. Host one below.' : f === 'saved' ? 'Servers you join by address show up here.' : 'Looking for servers…'}</div>`; }
    else el.innerHTML = rows.map((r) => {
      const full = r.players >= r.max;
      return `<button class="srv ${r.offline ? 'off' : ''} ${this.srvSel === r.key ? 'sel' : ''}" data-key="${esc(r.key)}">
      <i class="srvthumb" style="${THUMBS[r.map] ? `background-image:url(${THUMBS[r.map]})` : ''}"></i>
      <div class="srvname"><b>${esc(r.name)}${r.locked ? ' ' + ico('lock') : ''}</b><span><span class="badge ${r.src === 'public' ? 'pub' : r.src === 'lan' ? 'lan' : ''}">${r.src}</span>${r.err ? esc(r.err) : r.src === 'public' ? 'Official · always on' : esc(r.addr || '')}</span></div>
      <span>${r.offline ? '–' : MAPS[r.map]?.name || r.map}</span>
      <span>${r.offline ? '–' : r.mode === 'infection' ? 'Infection' : 'Classic'}</span>
      <span class="st ${r.inGame ? 'ing' : ''}">${r.offline ? 'Offline' : r.inGame ? 'Round in progress' : 'In lobby'}</span>
      <span class="cnt">${r.offline ? '–' : `<span class="${full ? 'full' : ''}">${r.players}</span><small>/${r.max}</small><div class="fillbar"><i style="width:${r.players / r.max * 100}%"></i></div>`}</span></button>`;
    }).join('');
    el.onclick = (e) => { const b = e.target.closest('.srv'); if (!b) return; this.srvSel = b.dataset.key; Sound.click(); this.renderServers(); };
    el.ondblclick = (e) => { const b = e.target.closest('.srv'); if (b) joinRow(this.srvRows.find((r) => r.key === b.dataset.key)); };
    const sel = this.srvRows.find((r) => r.key === this.srvSel);
    $('#srvDetail').innerHTML = !sel ? '<div class="empty">Select a server to see details.<br><br>Double-click to join.</div>'
      : `<i class="dthumb" style="${THUMBS[sel.map] ? `background-image:url(${THUMBS[sel.map]})` : ''}"></i><div class="dbody"><span class="badge ${sel.src === 'public' ? 'pub' : sel.src === 'lan' ? 'lan' : ''}">${sel.src}</span><h3>${esc(sel.name)}</h3>
        <div class="kv"><span>Players</span><b>${sel.offline ? '–' : sel.players + ' / ' + sel.max}</b><span>Map</span><b>${sel.offline ? '–' : MAPS[sel.map]?.name || sel.map}</b><span>Mode</span><b>${sel.offline ? '–' : sel.mode === 'infection' ? 'Infection' : 'Classic'}</b><span>Status</span><b>${sel.offline ? 'Offline' : sel.inGame ? 'Round in progress (you spectate until it ends)' : 'In lobby'}</b>${sel.src !== 'public' ? `<span>Address</span><b>${esc(sel.addr || '')}</b>` : ''}</div>
        <button class="cta" id="detailJoin" ${sel.offline || sel.players >= sel.max ? 'disabled' : ''}>${sel.players >= sel.max ? 'Full' : 'Join'}</button></div>`;
    $('#detailJoin')?.addEventListener('click', () => joinRow(sel));
  },
};

/* ================= online flows ================= */
function joinRow(r) { if (!r || r.offline) return; joinServer(r.addr, r.locked); }
async function quickMatch() {
  const btn = $('#playBtn'); btn.classList.add('searching'); btn.querySelector('span').textContent = 'Finding server…';
  const list = await fetchPublic();
  if (!list) { btn.classList.remove('searching'); btn.querySelector('span').textContent = 'Play'; toast('Could not reach the public servers. Check your internet.', 'bad'); return; }
  const open = list.filter((s) => !s.offline && s.players < s.max);
  if (!open.length) { btn.classList.remove('searching'); btn.querySelector('span').textContent = 'Play'; toast('All public servers are full right now.', 'warn'); return; }
  open.sort((a, b) => (b.players - a.players) || ((a.inGame ? 1 : 0) - (b.inGame ? 1 : 0)));
  const best = open.find((s) => !s.inGame && s.players > 0) || open.find((s) => s.players > 0) || open[0];
  await joinServer(best.url, false);
}
async function joinServer(addr, locked, password) {
  if (locked && password == null) { const pw = prompt('Server password'); if (pw == null) return; password = pw; }
  const pub = /^wss:/.test(addr);
  UI.loading(true, 'Connecting…');
  $('#loadTitle').textContent = pub ? 'Joining public server' : 'Connecting'; $('#loadTip').textContent = pub ? addr.replace(/^wss:\/\/[^/]+\/room\//, '').replace('pub-', 'Public ') : addr;
  try {
    const w = await Net.connect(addr, password || '');
    enterLobby(w);
    if (!pub) { const favs = JSON.parse(localStorage.getItem('mc_servers') || '[]'); const a = Net.normalize(addr); if (!favs.includes(a) && !/^127\.|^localhost/.test(a)) { favs.unshift(a); localStorage.setItem('mc_servers', JSON.stringify(favs.slice(0, 12))); } }
  } catch (e) { UI.loading(false); UI.screen(pub && UI.playlist.mode === 'quick' && UI.page === 'home' ? 'menu' : 'online'); toast(e.message, 'bad'); }
}
function enterLobby(w) {
  Sound.init();
  G.online = true; G.myId = Net.id; G.isHost = Net.isHost; G.party = null;
  const L = G.lobby; L.players = new Map(w.players.map((p) => [p.id, p])); L.chat = []; L.inGame = !!w.lobby.inGame;
  if (w.lobby.settings && Object.keys(w.lobby.settings).length) L.settings = { ...L.settings, ...w.lobby.settings };
  UI.loading(false); UI.returnTo = null;
  enterHub();
  UI.addChat('', `Connected to ${Net.server?.name || 'server'}.` + (L.inGame ? ' A round is running; you will spectate it.' : ''), true);
}
function backToHub() { if (document.pointerLockElement) document.exitPointerLock(); G.isHost = Net.isHost; enterHub(); }
Net.on('join', (m) => { G.lobby.players.set(m.player.id, m.player); UI.addChat('', `${m.player.name} joined.`, true); UI.renderHub(); G.sendLate(m.player.id); });
Net.on('leave', (m) => {
  const p = G.lobby.players.get(m.id); G.lobby.players.delete(m.id);
  if (p) UI.addChat('', `${p.name} left.`, true);
  if (G.hub) { const o = G.hub.others.get(m.id); if (o) { o.cham.dispose(); G.hiders = G.hiders.filter((c) => c !== o.cham); G.hub.others.delete(m.id); } }
  const c = G.phase !== 'hub' && G.findCham(m.id); if (c && !c.caught) { c.caught = true; c.root.visible = false; }
  const h = G.phase !== 'hub' && (G.findHunter(m.id) || G.findHunter(m.id + '_h')); if (h) { h.dispose(); G.hunters = G.hunters.filter((x) => x !== h); }
  if (G.isHost && G.phase === 'hunt' && !G.realHiders().some((x) => !x.caught)) G.hostEnd();
  UI.renderHub();
});
Net.on('host', () => {
  G.isHost = Net.isHost; G.lobby.inGame = false;
  UI.addChat('', Net.isHost ? 'You are now the host.' : 'The host changed.', true);
  if (playing() || G.phase === 'end') { toast('Host left. Back to the lobby.', 'warn'); backToHub(); }
  else UI.renderHub();
});
Net.on('lobby', (m) => { G.lobby.settings = { ...G.lobby.settings, ...(m.lobby.settings || {}) }; G.lobby.inGame = !!m.lobby.inGame; UI.renderHub(); });
Net.on('profile', (m) => { const p = G.lobby.players.get(m.id); if (p) { p.name = m.name; p.profile = m.profile; } UI.renderHub(); });
Net.on('chat', (m) => UI.addChat(m.name, m.text, false, m.from));
Net.on('relay', (m) => G.onRelay(m.from, m.d));
Net.on('kicked', (reason) => toast(reason || 'Removed from server', 'bad'));
Net.on('closed', () => { toast('Disconnected from server.', 'bad'); G.online = false; G.clearRound(); G.phase = 'menu'; UI.hud(false); UI.hubHud(false); showMenuScene(); UI.screen('online'); });

async function hostServer() {
  const opts = { name: $('#hName').value || `${PROFILE.name}'s server`, port: +$('#hPort').value || 7777, password: $('#hPass').value, max: clamp(+$('#hMax').value || 15, 2, 24) };
  UI.loading(true, 'Starting server…');
  const r = await mcNative.hostStart(opts);
  if (!r.ok) { UI.loading(false); UI.screen('online'); toast(r.error, 'bad'); return; }
  const rank = (a) => (a.startsWith('192.168.56.') || a.startsWith('172.') ? 0 : a.startsWith('100.') ? 1 : 2);
  UI.hostIPs = r.ips.filter((i) => rank(i.address) > 0).sort((a, b) => rank(b.address) - rank(a.address)); UI.hostPort = r.port;
  try { const w = await Net.connect('127.0.0.1:' + r.port, opts.password); enterLobby(w); toast('Server is up. Press Tab for lobby settings.', 'good'); }
  catch (e) { UI.loading(false); UI.screen('online'); toast(e.message, 'bad'); }
}
function sendProfile() { if (G.online) Net.send({ t: 'profile', name: PROFILE.name, profile: publicProfile() }); }

/* ================= settings ================= */
const KEYS = [
  ['Chameleon', [['Move', 'WASD'], ['Sprint (stamina)', 'Shift (hold)'], ['Crouch / sneak', 'C (hold)' + (window.mcNative ? ' or Ctrl' : '')], ['Jump', 'Space'], ['Stick to a wall', 'Space in the air by a wall'], ['On a wall', 'Space up · C down · Shift let go'], ['Paint mode (colours)', 'F'], ['Sample colour (painting)', 'Space or Alt+click'], ['Pose wheel', 'G (hold, point, release)'], ['Quick poses', '1-0'], ['Turn', 'Z / X'], ['Clone', 'Q'], ['Taunt', 'H'], ['Decoy', 'V'], ['Ready (prep)', 'Enter']]],
  ['Hunter', [['Sprint (stamina)', 'Shift (hold)'], ['Bonk', 'Left click'], ['Paintball', 'Right click'], ['Ping', 'E']]],
  ['General', [['Scoreboard', 'Tab (hold)'], ['Lobby settings', 'Tab (lobby)'], ['Chat', 'T'], ['Emotes (lobby)', 'G'], ['Menu', 'Esc'], ['Fullscreen', 'F11']]],
];
function openSettings(back) {
  UI.settingsBack = back;
  if (back === 'pause') $('#screen-pause').classList.add('hidden');
  $('#screen-settings').classList.remove('hidden');
  const S = SETTINGS;
  const apply = () => { saveSettings(); camera.fov = S.fov; camera.updateProjectionMatrix(); Sound.setVolume(S.vol); };
  const bind = (id, key, fmt) => { const el = $(id); el.value = S[key]; $(id + 'Val').textContent = fmt(S[key]); el.oninput = () => { S[key] = Number(el.value); $(id + 'Val').textContent = fmt(S[key]); apply(); }; };
  bind('#setSens', 'sens', (v) => (+v).toFixed(2)); bind('#setVol', 'vol', (v) => Math.round(v * 100) + '%'); bind('#setFov', 'fov', (v) => v + '°');
  seg('#setQuality', S.quality, (v) => { S.quality = v; saveSettings(); applyQuality(); });
  seg('#setInvert', S.invertY ? 'on' : 'off', (v) => { S.invertY = v === 'on'; saveSettings(); });
  $('#keyList').innerHTML = KEYS.map(([g, ks]) => `<h4>${g}</h4>` + ks.map(([a, k]) => `<div><span>${a}</span><kbd>${k}</kbd></div>`).join('')).join('');
}
function closeSettings() { $('#screen-settings').classList.add('hidden'); if (UI.settingsBack === 'pause') UI.pause(true); }

/* ================= wiring ================= */
function wire() {
  $$('[data-ico]').forEach((el) => el.insertAdjacentHTML('afterbegin', ico(el.dataset.ico)));
  $('#navTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) UI.go(b.dataset.page); };
  $('#pchip').onclick = () => UI.go('career');
  $('#navSettings').onclick = () => openSettings('menu');
  $('#navQuit').onclick = () => (window.mcNative ? mcNative.quit() : window.close());
  $('#navQuit').classList.toggle('hidden', !window.mcNative);
  $$('[data-back]').forEach((b) => (b.onclick = () => UI.go(b.dataset.back)));
  $('#playlistCard').onclick = () => { UI.modeDraft = { ...UI.playlist }; UI.go('modes'); };
  $('#modeConfirm').onclick = () => { UI.playlist = { ...UI.modeDraft }; localStorage.setItem('mc_playlist', JSON.stringify(UI.playlist)); UI.modeDraft = null; UI.go('home'); };
  $('#playBtn').onclick = () => { if (!$('#playBtn').classList.contains('searching')) UI.play(); };
  $('#srvFilter').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#srvFilter button').forEach((x) => x.classList.toggle('on', x === b)); UI.srvFilter = b.dataset.v; UI.renderServers(); };
  $('#refreshBtn').onclick = () => { UI.publicRows = UI.publicRows || []; UI.startBrowser(); };
  $('#connectBtn').onclick = () => { if (!window.mcNative && location.protocol === 'https:' && !/^wss:/i.test($('#addrInput').value.trim())) { toast('Browsers can only join wss:// addresses. Use the public servers or the Windows app.', 'warn'); return; } joinServer($('#addrInput').value, false, $('#addrPass').value); };
  $('#addrInput').onkeydown = (e) => { if (e.key === 'Enter') $('#connectBtn').click(); };
  $('#hostBtn').onclick = () => {
    if (!window.mcNative) { toast('Hosting needs the desktop app.', 'warn'); return; }
    if (!$('#hName').value) $('#hName').value = `${PROFILE.name}'s server`;
    $('#screen-host').classList.remove('hidden');
  };
  $('#managerBtn').classList.toggle('hidden', !window.mcNative);
  $('#hostBtn').classList.toggle('hidden', !window.mcNative);
  if (!window.mcNative) {
    $('#addrInput').placeholder = 'Direct connect needs the Windows app (browsers block ws:// on https pages)';
    const v = $('.version'); v.innerHTML = esc(v.textContent) + ' · <a href="' + WIN_DOWNLOAD + '" target="_blank" rel="noopener" style="color:var(--accent);pointer-events:auto">Get the Windows app</a> for LAN, hosting and the Server Manager';
  }
  $('#managerBtn').onclick = () => { mcNative.openManager(); toast('Server Manager opened. It runs your dedicated servers (2 by default).', 'good'); };
  $('#hostCancel').onclick = () => $('#screen-host').classList.add('hidden');
  $('#hostGo').onclick = () => { $('#screen-host').classList.add('hidden'); hostServer(); };
  // locker
  $('.slots').onclick = (e) => { const b = e.target.closest('.slot'); if (!b) return; UI.slot = b.dataset.slot; Sound.click(); UI.renderLocker(); };
  $('#itemGrid').onclick = (e) => {
    const b = e.target.closest('.item'); if (!b) return;
    if (b.classList.contains('locked')) { toast(b.title, 'warn'); return; }
    UI.SLOTS[UI.slot].set(b.dataset.v); saveProfile(); Sound.click(); UI.renderLocker(); sendProfile();
  };
  $('#nameInput').onchange = (e) => { PROFILE.name = (e.target.value.trim() || PROFILE.name).slice(0, 20); saveProfile(); UI.renderChip(); sendProfile(); };
  $('#randomChar').onclick = () => {
    const pickU = (kind, o) => pick(Object.keys(o).filter((k) => isUnlocked(kind, k)));
    PROFILE.cham = { shape: pickU('shape', SHAPES), eyes: pickU('eyes', EYES) };
    PROFILE.hunter = { color: pick(HUNTER_COLORS), hat: pickU('hat', HATS), visor: pickU('visor', VISORS), tool: pickU('tool', TOOLS) };
    PROFILE.tag = pick(TAG_COLORS); saveProfile(); UI.renderLocker(); sendProfile(); Sound.click();
  };
  // settings
  $('#setTabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#setTabs button').forEach((x) => x.classList.toggle('on', x === b)); $$('.setpane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.v)); Sound.click(); };
  $('#setBack').onclick = closeSettings;
  $('#fsBtn').onclick = () => (window.mcNative ? mcNative.fullscreen() : document.documentElement.requestFullscreen?.());
  // round flow
  $('#handGo').onclick = () => G.handGo();
  $('#againBtn').onclick = () => { clearInterval(UI.autoBackT); if (G.online) backToHub(); else if (G.party) G.startParty(UI.playlist.humans, UI.playlist.ai, UI.playlist.map, UI.playlist.diff); else G.startSolo(); };
  $('#menuBtn').onclick = () => { clearInterval(UI.autoBackT); G.toMenu(); };
  $('#revealBtn').onclick = () => G.startReveal();
  $('#resumeBtn').onclick = () => { G.paused = false; UI.screen(null); G.lock(); };
  $('#pauseSettings').onclick = () => openSettings('pause');
  $('#pauseChar').onclick = () => { UI.returnTo = 'hub'; UI.screen('char'); };
  $('#quitBtn').onclick = () => { G.paused = false; G.toMenu(); };
  // paint panel
  $('#paintDone').onclick = () => togglePaint();
  $$('[data-tool]').forEach((b) => (b.onclick = () => UI.tool(b.dataset.tool)));
  $('#color').oninput = (e) => UI.setColor(e.target.value, false);
  $('#color').onchange = (e) => UI.setColor(e.target.value, true);
  $('#swatches').onclick = (e) => { if (e.target.dataset.c) UI.setColor(e.target.dataset.c, false); };
  $('#brushSize').oninput = (e) => { UI.brush = +e.target.value; $('#sizeVal').textContent = UI.brush; };
  $('#rough').oninput = (e) => UI.setRough(+e.target.value / 100);
  $('#metal').oninput = (e) => { if (!G.my) return; G.my.mat.metalness = +e.target.value / 100; $('#metalVal').textContent = G.my.mat.metalness.toFixed(2); };
  $('#undoBtn').onclick = undo;
  $('#clearBtn').onclick = () => { if (!G.my) return; pushUndo(); G.my.blank(); };
  $('#shapeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b && G.my) { G.my.setShape(b.dataset.v); UI.refreshBars(); } };
  $('#sizeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b && G.my) { G.my.setSize(b.dataset.v); UI.refreshBars(); } };
  $('#rotL').onclick = () => G.my?.setYaw(G.my.yaw + Math.PI / 12);
  $('#rotR').onclick = () => G.my?.setYaw(G.my.yaw - Math.PI / 12);
  $('#paintPoses').innerHTML = POSE_ORDER.map((k) => `<button data-pose="${k}">${POSES[k].label}</button>`).join('');
  $('#paintPoses').onclick = (e) => { const b = e.target.closest('[data-pose]'); if (b && G.my) { setPose(b.dataset.pose); G.my.rebake(); } };
  $('#poseWheel').onmouseover = (e) => {
    const b = e.target.closest('[data-pose],[data-emote]'); if (!b) return;
    UI.wheelHover = b.dataset.pose || b.dataset.emote;
    for (const o of $('#poseWheel').querySelectorAll('.hot')) o.classList.remove('hot'); b.classList.add('hot'); Sound.hover?.();
  };
  $('#poseWheel').onclick = (e) => {
    const b = e.target.closest('[data-pose],[data-emote]');
    if (b) { Sound.click(); if (b.dataset.emote) G.my?.setEmote(b.dataset.emote); else setPose(b.dataset.pose); }
    if (b || e.target === $('#poseWheel')) { UI.wheel(false); G.lock(); }
  };
  $('#abilities').onclick = (e) => {
    const b = e.target.closest('.ab'); if (!b) return;
    if (b.id === 'readyBtn') { if (G.phase === 'prep') G.finishPrep(); return; }
    const a = b.dataset.ab;
    if (!controllable()) return;
    if (a === 'brush') togglePaint(); else if (a === 'clone') makeClone(); else if (a === 'taunt') taunt(); else if (a === 'decoy') decoy(); else if (a === 'pose') UI.wheel(true);
  };
  // hub panel
  $('#hpStart').onclick = () => { UI.hubPanel(false); if (G.online) { if (Net.isHost) G.hostStartOnline(topVote() || G.lobby.settings.map); } else hubStart(); };
  $('#hpClose').onclick = () => UI.hubPanel(false);
  $('#hpLeave').onclick = () => { UI.hubPanel(false); G.toMenu(); };
  $('#hpChar').onclick = () => { UI.hubPanel(false); UI.returnTo = 'hub'; UI.screen('char'); };
  $('#gameChatInput').onkeydown = (e) => { if (e.key === 'Enter') UI.closeChat(true); if (e.key === 'Escape') UI.closeChat(false); e.stopPropagation(); };
  $('#lsHunters').innerHTML = '<button data-v="auto">Auto</button>' + segHTML({ 1: '1', 2: '2', 3: '3', 4: '4' }); $('#lsAiHunters').innerHTML = segHTML({ 0: '0', 1: '1', 2: '2', 3: '3' }); $('#lsAiHiders').innerHTML = segHTML({ 0: '0', 1: '1', 2: '2', 3: '3', 4: '4' });
  $('#lsPrep').innerHTML = segHTML({ 45: '45s', 60: '60s', 90: '90s' }); $('#lsHunt').innerHTML = segHTML({ 120: '2m', 180: '3m', 240: '4m', 300: '5m' });
  $('#lsMode').innerHTML = segHTML({ classic: 'Classic', infection: 'Infection' }); $('#lsDiff').innerHTML = segHTML({ easy: 'Easy', normal: 'Normal', hard: 'Hard' });
  // menu keys
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const shell = !$('#shell').classList.contains('hidden');
    if (e.code === 'Tab' && (playing() || G.phase === 'end') && !e.repeat) { e.preventDefault(); UI.scoreboard(true); }
    if (!$('#screen-settings').classList.contains('hidden') && e.code === 'Escape') { closeSettings(); return; }
    if (!$('#screen-host').classList.contains('hidden') && e.code === 'Escape') { $('#screen-host').classList.add('hidden'); return; }
    if (UI.wheelOpen && e.code === 'Escape') { UI.wheel(false); G.lock(); return; }
    if (!shell) return;
    if (e.code === 'Escape') {
      if (UI.returnTo === 'hub' && G.phase === 'hub') $('#charBackHub')?.click();
      else if (UI.page !== 'home') UI.go(UI.page === 'modes' ? 'home' : 'home');
    }
    if (e.code === 'Enter' && UI.page === 'home') UI.play();
    if (e.code === 'Enter' && UI.page === 'modes') $('#modeConfirm').click();
  });
  addEventListener('keyup', (e) => { if (e.code === 'Tab') UI.scoreboard(false); });
  // in-hub locker: the nav is hidden, add a back button to the topbar
  const hb = document.createElement('button'); hb.id = 'charBackHub'; hb.className = 'secbtn hidden'; hb.textContent = 'Back to lobby';
  $('#topbarNav .right').prepend(hb);
  hb.onclick = () => {
    UI.returnTo = null; G.paused = false; UI.screen(null);
    if (G.my && !G.my.painted && (G.my.shape !== PROFILE.cham.shape || G.my.eyes !== PROFILE.cham.eyes)) { G.my.eyes = PROFILE.cham.eyes; G.my.setShape(PROFILE.cham.shape); G.my.blank(); }
    G.lock();
  };
  new MutationObserver(() => hb.classList.toggle('hidden', !(UI.returnTo === 'hub' && G.phase === 'hub'))).observe($('#shell'), { attributes: true });
  document.addEventListener('mouseover', (e) => { const b = e.target.closest?.('button'); if (b && b !== UI._hov && !b.disabled) { UI._hov = b; Sound.hover(); } });
  UI.setColor('#7a4a2c', true);
}

/* Pose thumbnails for the pose wheel. */
function makePoseThumbs() {
  const S = 160, rt = new THREE.WebGLRenderTarget(S, S), buf = new Uint8Array(S * S * 4);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x6a7488, 1.0));
  const d = new THREE.DirectionalLight(0xffffff, 0.55); d.position.set(2, 3, 4); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S);
  const doll = new Cham({ name: 'thumb', parent: sc }); doll.mat.map = null; doll.mat.color.set('#eef1f6'); doll.mat.needsUpdate = true;
  const css = [], prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (const k of POSE_ORDER) {
    doll.setPose(k, true); doll.setYaw(0.5); doll.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(doll.mesh), ctr = bb.getCenter(new V3()), sz = bb.getSize(new V3());
    const dist = Math.max(sz.x, sz.y, sz.z) * 2.2 + 0.6;
    cam.position.set(ctr.x + dist * 0.3, ctr.y + dist * 0.35, ctr.z + dist * 0.9); cam.lookAt(ctr);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf); renderer.setRenderTarget(null);
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0);
    css.push(`.pz-${k}{background-image:url(${c.toDataURL('image/png')})}`);
  }
  renderer.setClearColor(prevClear, prevA);
  doll.dispose(); rt.dispose();
  const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
}

/* ================= boot ================= */
(async () => {
  wire();
  UI.loading(true, 'Starting…');
  $('#loadTitle').textContent = 'peperhide'; $('#loadKicker').textContent = 'Starting up';
  try { await loadModels(); } catch (e) { console.warn('models', e); }
  try { await makeThumbs(); } catch (e) { console.warn('thumbs', e); }
  try { makePoseThumbs(); } catch (e) { console.warn('pose thumbs', e); }
  showMenuScene();
  G.phase = 'menu';
  UI.screen('menu');
  requestAnimationFrame(frame);
})();
window.__mc = { G, scene, camera, renderer, autoCamo, Cham, Hunter, findSpot, env, colliders, bonk, togglePaint, paintAt, UI, Net, loadMap, enterHub, shootPaint, hunterPing, decoy, quickMatch, step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); } };
