'use strict';
/* Map editor. Open it from the Editor tab or with `peperhide.exe --editor`.
   Scene-view controls follow Unity: hold right mouse to look and fly with WASD (Q/E down/up, Shift faster),
   W/E/R switch move/rotate/scale, F frames the selection. Changes are stored as map edits (editcore.js), never by
   rewriting maps.js, so the original map code keeps working and every edit can be undone or reset. */

const ED_PACKS = { f: 'Furniture', food: 'Food', surv: 'Survival', mkt: 'Market', toy: 'Toys', hol: 'Holiday', arc: 'Arcade', nat: 'Nature', pir: 'Pirate', grave: 'Graveyard', plat: 'Platformer' };
const ED_TEX = ['wood', 'woodDark', 'woodLight', 'parquet', 'checker', 'carpet', 'concrete', 'brick', 'terraTile', 'poolTile', 'marble', 'terrazzo', 'crate', 'hazard', 'brWall', 'sewerWall', 'galleryWall', 'darkWall', 'candyFloor', 'chocolate', 'mint', 'cookie'];
const ED_SVG = {
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  scale: '<path d="M4 20h7v-7H4z"/><path d="M13 11l7-7M14 4h6v6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  save: '<path d="M5 3h11l4 4v14H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  exit: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
  magnet: '<path d="M6 3v9a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>',
  roof: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M3 3l18 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  floor: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5 15a8 8 0 1 0 1.7-8.3L4 10"/>',
};
const edIco = (k) => `<svg class="ed-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ED_SVG[k] || ''}</svg>`;
const edNice = (s) => s.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
const edDeg = (r) => Math.round(THREE.MathUtils.radToDeg(r) * 10) / 10;
const edNum = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

const MapEditor = {
  on: false, mapId: 'mansion', E: null, dirty: false, undoS: [], redoS: [], sel: [],
  mode: 'translate', space: 'world', snap: false, hideCeil: true, writable: false,
  tc: null, pivot: null, group: null, boxes: [], markers: [], drag: null,
  cam: { yaw: 0, pitch: -0.6, pos: new V3() }, look: false, pan: false, keys: {},
  thumbQ: [], thumbs: {}, cat: 'all', wired: false, reach: null,

  /* ---------- open / close ---------- */
  async enter(id) {
    if (G.phase !== 'menu') { toast('Finish or leave the current game first.', 'warn'); return; }
    if (window.mcNative?.editsInfo) { try { this.writable = !!(await mcNative.editsInfo()).writable; } catch { this.writable = false; } }
    this.wire();
    this.mapId = MAP_ORDER.includes(id) ? id : MAP_ORDER.includes(this.mapId) ? this.mapId : MAP_ORDER[0];
    $('#edMap').value = this.mapId;
    disposeMenuDoll(); UI.screen(null); UI.hud(false); UI.hubHud(false);
    G.phase = 'editor'; this.on = true;
    document.body.classList.add('in-editor'); $('#editor').classList.remove('hidden');
    this.E = this.copy(MapEdits.get(this.mapId)) || blankEdits();
    this.undoS = []; this.redoS = []; this.dirty = false;
    this.rebuild(true);
    this.status();
  },
  leave() {
    this.deselect();
    if (this.tc) { scene.remove(this.tc); this.tc.detach(); }
    if (this.group) scene.remove(this.group);
    if (this.pivot) scene.remove(this.pivot);
    if (document.pointerLockElement) document.exitPointerLock();
    this.on = false; MapEdits.temp = null;
    document.body.classList.remove('in-editor'); $('#editor').classList.add('hidden');
    G.phase = 'menu'; camera.fov = SETTINGS.fov; camera.updateProjectionMatrix();
    showMenuScene(); UI.screen('menu');
  },
  exit() { this.ask('Leave the editor?', 'Your unsaved changes to this map will be lost.', () => this.leave()); },

  /* ---------- map (re)building ---------- */
  rebuild(resetCam) {
    const keep = this.sel.map((o) => this.selKey(o)).filter(Boolean);
    this.deselect();
    loadMap(this.mapId, this.E);
    if (!this.tc) this.makeGizmo();
    if (!this.group) { this.group = new THREE.Group(); this.group.name = 'editor'; }
    scene.add(this.group); scene.add(this.pivot); scene.add(this.tc);
    this.ceiling(); this.makeMarkers();
    if (resetCam) this.frameMap();
    this.reach = null; this.drawReach();
    const rep = MAP.editReport || { missing: [] };
    this.missing = rep.missing;
    const objs = keep.map((k) => this.findKey(k)).filter(Boolean);
    if (objs.length) this.select(objs);
    this.inspector(); this.changes();
  },
  ceiling() {
    const top = MAP.ceilH - 0.06;
    for (const o of mapItems()) {
      if (o.isLight) continue;
      const b = new THREE.Box3().setFromObject(o);
      if (b.min.y >= top) { o.visible = !this.hideCeil; o.userData.edCeil = true; }
    }
  },
  frameMap() {
    const B = MAP.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, ext = Math.max(B.x1 - B.x0, B.z1 - B.z0);
    this.cam.pos.set(cx, Math.max(8, ext * 0.55), B.z1 + ext * 0.25);
    this.cam.yaw = 0; this.cam.pitch = -Math.atan2(this.cam.pos.y, this.cam.pos.z - cz);
    camera.fov = 60; camera.far = 220; camera.updateProjectionMatrix();
  },
  copy(e) { return e ? JSON.parse(JSON.stringify(e)) : null; },

  /* ---------- gizmo ---------- */
  makeGizmo() {
    this.pivot = new THREE.Object3D(); this.pivot.name = 'editorPivot';
    const tc = (this.tc = new THREE.TransformControls(camera, renderer.domElement));
    tc.size = 0.9; tc.setMode(this.mode); tc.setSpace(this.space);
    tc.addEventListener('mouseDown', () => this.dragStart());
    tc.addEventListener('objectChange', () => this.dragMove());
    tc.addEventListener('mouseUp', () => this.dragEnd());
  },
  applySnap(on) {
    const tc = this.tc; if (!tc) return;
    tc.setTranslationSnap(on ? 0.25 : null); tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null); tc.setScaleSnap(on ? 0.1 : null);
  },
  dragStart() {
    this.drag = { before: JSON.stringify(this.E), pivot: this.pivot.matrixWorld.clone(), items: this.sel.map((o) => ({ o, m: o.matrixWorld.clone() })) };
  },
  dragMove() {
    const d = this.drag; if (!d) return;
    this.pivot.updateMatrixWorld(true);
    const D = this.pivot.matrixWorld.clone().multiply(d.pivot.clone().invert()), m = new THREE.Matrix4();
    for (const it of d.items) {
      m.multiplyMatrices(D, it.m); m.decompose(it.o.position, it.o.quaternion, it.o.scale);
      if (it.o.userData.spawn) { it.o.position.y = 0; it.o.quaternion.identity(); it.o.scale.set(1, 1, 1); }
      it.o.updateMatrixWorld(true);
    }
    this.inspectorValues();
  },
  dragEnd() {
    const d = this.drag; this.drag = null; if (!d) return;
    const moved = d.items.some((it) => !it.m.equals(it.o.matrixWorld));
    if (!moved) return;
    this.pushUndo(d.before);
    for (const it of d.items) this.record(it.o);
    this.afterChange();
  },

  /* ---------- recording edits ---------- */
  record(o) {
    if (o.userData.spawn) { this.recordSpawns(); return; }
    refreshItem(o);
    const t = itemTransform(o);
    if (o.userData.addIdx != null) Object.assign(this.E.added[o.userData.addIdx], t);
    else this.E.objects[o.userData.eid] = t;
  },
  recordSpawns() {
    const r = (v) => edNum(v, 2);
    const pl = this.markers.find((m) => m.userData.spawn === 'player'), hs = this.markers.filter((m) => m.userData.spawn === 'hunter');
    this.E.spawn = { player: [r(pl.position.x), r(pl.position.z)], hunters: hs.map((m) => [r(m.position.x), r(m.position.z)]) };
    MAP.playerSpawn = this.E.spawn.player.slice(); MAP.hunterSpawns = this.E.spawn.hunters.map((h) => h.slice());
  },
  pushUndo(before) { this.undoS.push(before); if (this.undoS.length > 80) this.undoS.shift(); this.redoS = []; },
  afterChange() {
    this.dirty = true; this.reach = null; this.drawReach();
    if (typeof contactShadows === 'function') contactShadows(true);
    this.placePivot(); this.inspector(); this.changes(); this.status();
  },
  undo() {
    if (!this.undoS.length) return;
    this.redoS.push(JSON.stringify(this.E)); this.E = JSON.parse(this.undoS.pop());
    this.dirty = true; this.rebuild(false); this.status();
  },
  redo() {
    if (!this.redoS.length) return;
    this.undoS.push(JSON.stringify(this.E)); this.E = JSON.parse(this.redoS.pop());
    this.dirty = true; this.rebuild(false); this.status();
  },

  /* ---------- selection ---------- */
  selKey(o) { return o.userData.spawn ? 'spawn:' + o.userData.spawn + ':' + (o.userData.idx || 0) : o.userData.eid; },
  findKey(k) {
    if (k.startsWith('spawn:')) return this.markers.find((m) => this.selKey(m) === k) || null;
    return mapItems().find((o) => o.userData.eid === k) || null;
  },
  select(list, add) {
    list = list.filter(Boolean);
    if (add) { for (const o of list) { const i = this.sel.indexOf(o); if (i >= 0) this.sel.splice(i, 1); else this.sel.push(o); } }
    else this.sel = list;
    for (const b of this.boxes) { this.group.remove(b); b.geometry.dispose(); }
    this.boxes = this.sel.map((o) => { const h = new THREE.BoxHelper(o.isPointLight ? this.markers.find((m) => m.userData.lightOf === o) || o : o, o.userData.spawn ? 0x7cf2c4 : 0xffd23f); h.material.depthTest = false; h.renderOrder = 999; this.group.add(h); return h; });
    this.placePivot(); this.inspector();
  },
  deselect() { if (this.sel.length || this.boxes.length) this.select([]); },
  placePivot() {
    const tc = this.tc; if (!tc) return;
    if (!this.sel.length) { tc.detach(); return; }
    const pv = this.pivot;
    if (this.sel.length === 1) { const o = this.sel[0]; pv.position.copy(o.getWorldPosition(new V3())); pv.quaternion.copy(o.getWorldQuaternion(new THREE.Quaternion())); }
    else { const b = new THREE.Box3(); for (const o of this.sel) b.expandByObject(o); b.getCenter(pv.position); pv.quaternion.identity(); }
    pv.scale.set(1, 1, 1); pv.updateMatrixWorld(true);
    const onlySpawns = this.sel.every((o) => o.userData.spawn);
    if (onlySpawns && this.mode !== 'translate') this.setMode('translate');
    tc.showY = !onlySpawns;
    tc.attach(pv);
  },
  pickables() {
    const list = mapItems().filter((o) => o.visible && !o.isLight);
    for (const m of this.markers) list.push(m);
    return list;
  },
  pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
    const roots = this.pickables(), hits = rc.intersectObjects(roots, true);
    for (const h of hits) {
      let o = h.object, vis = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis) continue;
      while (o.parent && o.parent !== mapGroup && o.parent !== this.group) o = o.parent;
      if (o.userData.lightOf) o = o.userData.lightOf;
      if (o.userData.eid || o.userData.spawn) return { o, point: h.point };
    }
    return null;
  },
  rayPoint(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera); rc.far = 120;
    const vis = env.filter((m) => { for (let p = m; p; p = p.parent) if (!p.visible) return false; return true; });
    const h = rc.intersectObjects(vis, false)[0];
    if (h) return h.point.clone();
    const t = rc.ray.origin.y > 0 && rc.ray.direction.y < 0 ? -rc.ray.origin.y / rc.ray.direction.y : 6;
    return rc.ray.origin.clone().addScaledVector(rc.ray.direction, Math.min(t, 40)).setY(MAP.floorY || 0);
  },

  /* ---------- operations ---------- */
  remove() {
    const list = this.sel.filter((o) => !o.userData.spawn);
    if (!list.length) { if (this.sel.length) toast('Spawn points can be moved but not deleted.', 'warn'); return; }
    this.pushUndo(JSON.stringify(this.E));
    const addIdx = [];
    for (const o of list) {
      if (o.userData.addIdx != null) addIdx.push(o.userData.addIdx);
      else { this.E.objects[o.userData.eid] = { del: 1 }; removeItem(o); }
    }
    this.sel = this.sel.filter((o) => !list.includes(o));
    if (addIdx.length) {
      // drop added objects and renumber what's left: easiest and safest by rebuilding from the edit list
      this.E.added = this.E.added.filter((_, i) => !addIdx.includes(i));
      this.select([]); this.dirty = true; this.rebuild(false); this.status();
      toast(`Deleted ${list.length} object${list.length > 1 ? 's' : ''}.`);
      return;
    }
    this.select([]); this.afterChange();
    toast(`Deleted ${list.length} object${list.length > 1 ? 's' : ''}.`);
  },
  duplicate() {
    const list = this.sel.filter((o) => !o.userData.spawn);
    if (!list.length) return;
    this.pushUndo(JSON.stringify(this.E));
    const made = [], byId = new Map(mapItems().map((o) => [o.userData.eid, o])), off = this.snap ? 0.5 : 0.4;
    for (const o of list) {
      const rec = o.userData.addIdx != null ? this.copy(this.E.added[o.userData.addIdx]) : { t: 'clone', src: o.userData.eid };
      const t = itemTransform(o); t.p[0] = edNum(t.p[0] + off, 4); t.p[2] = edNum(t.p[2] + off, 4);
      Object.assign(rec, t);
      const n = spawnAdded(rec, byId);
      if (!n) continue;
      this.E.added.push(rec); n.userData.addIdx = this.E.added.length - 1; n.userData.eid = 'add:' + n.userData.addIdx;
      made.push(n);
    }
    this.afterChange(); this.select(made);
  },
  dropToFloor() {
    const list = this.sel.filter((o) => !o.userData.spawn); if (!list.length) return;
    this.pushUndo(JSON.stringify(this.E));
    for (const o of list) {
      const b = new THREE.Box3().setFromObject(o), own = new Set(); o.traverse((c) => own.add(c));
      const rc = new THREE.Raycaster(new V3((b.min.x + b.max.x) / 2, b.min.y + 0.02, (b.min.z + b.max.z) / 2), new V3(0, -1, 0));
      const h = rc.intersectObjects(env.filter((m) => !own.has(m) && m.visible), false)[0];
      const y = h ? h.point.y : (MAP.floorY || 0);
      o.position.y += y - b.min.y; o.updateMatrixWorld(true); this.record(o);
    }
    this.afterChange();
  },
  resetSelected() {
    const list = this.sel.filter((o) => !o.userData.spawn && o.userData.addIdx == null && this.E.objects[o.userData.eid]);
    const spawns = this.sel.some((o) => o.userData.spawn) && this.E.spawn;
    if (!list.length && !spawns) { toast('Nothing to reset: the selection is unchanged.'); return; }
    this.pushUndo(JSON.stringify(this.E));
    for (const o of list) delete this.E.objects[o.userData.eid];
    if (spawns) delete this.E.spawn;
    this.dirty = true; this.rebuild(false); this.status();
  },
  addRecord(rec, at) {
    this.pushUndo(JSON.stringify(this.E));
    const o = spawnAdded(rec, new Map());
    if (!o) { this.undoS.pop(); toast('That model is missing.', 'bad'); return; }
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new V3());
    let p = at;
    if (!p) { const r = renderer.domElement.getBoundingClientRect(); p = this.rayPoint(r.left + r.width / 2, r.top + r.height / 2); }
    o.position.x += p.x - c.x; o.position.z += p.z - c.z; o.position.y += p.y - b.min.y;
    if (this.snap) { o.position.x = Math.round(o.position.x * 4) / 4; o.position.z = Math.round(o.position.z * 4) / 4; }
    o.updateMatrixWorld(true); refreshItem(o);
    Object.assign(rec, itemTransform(o));
    this.E.added.push(rec); o.userData.addIdx = this.E.added.length - 1; o.userData.eid = 'add:' + o.userData.addIdx;
    this.afterChange(); this.select([o]);
  },
  addBlock(at) {
    const n = (id, d) => clamp(parseFloat($(id).value) || d, 0.05, 40);
    const tex = $('#edBlkTex').value;
    this.addRecord({ t: 'block', size: [n('#edBlkW', 1), n('#edBlkH', 1), n('#edBlkD', 1)], color: $('#edBlkCol').value, tex: tex || undefined }, at);
  },
  checkReach() {
    const sel = this.sel.map((o) => this.selKey(o));
    this.rebuild(false);
    this.reach = navReach(); this.drawReach();
    const r = this.reach;
    if (r.pct >= 100) toast(`Every area is reachable (${r.total} nav points).`, 'good');
    else toast(`${r.total - r.reach} of ${r.total} nav points can't be reached from the spawn (red dots). AI can't search there.`, 'warn');
    this.select(sel.map((k) => this.findKey(k)).filter(Boolean)); this.inspector();
  },
  drawReach() {
    if (!this.group) return;
    if (this.reachMesh) { this.group.remove(this.reachMesh); this.reachMesh.geometry.dispose(); this.reachMesh = null; }
    const lost = this.reach?.lost || []; if (!lost.length) return;
    const g = new THREE.SphereGeometry(0.16, 10, 8), m = new THREE.MeshBasicMaterial({ color: 0xff4d6a, depthTest: false });
    const im = new THREE.InstancedMesh(g, m, lost.length), mt = new THREE.Matrix4();
    lost.forEach((n, i) => im.setMatrixAt(i, mt.makeTranslation(n.x, 0.25, n.z)));
    im.renderOrder = 998; this.reachMesh = im; this.group.add(im);
  },

  /* ---------- save / load ---------- */
  async save() {
    const id = this.mapId, e = editsEmpty(this.E) ? null : this.copy(this.E);
    if (this.writable) {
      MapEdits.setShipped(id, e); MapEdits.clearLocal(id);
      const r = await mcNative.editsSave(typeof MAP_EDITS_SHIPPED !== 'undefined' ? MAP_EDITS_SHIPPED : {});
      if (!r.ok) { toast('Save failed: ' + r.error, 'bad'); return; }
      toast('Saved into the game files (mapedits.js). It ships with the next build.', 'good');
    } else {
      MapEdits.saveLocal(id, e);
      toast('Saved on this PC. Rounds you host use this map for everyone.', 'good');
    }
    this.dirty = false; this.status(); this.changes();
  },
  resetMap() {
    this.ask('Reset this map?', 'Removes every edit and goes back to the original map. You can still undo before saving.', () => {
      this.pushUndo(JSON.stringify(this.E)); this.E = blankEdits(); this.dirty = true; this.rebuild(false); this.status();
    }, 'Reset map', null, { force: true, noSave: true });
  },
  cleanMissing() {
    if (!this.missing?.length) return;
    this.pushUndo(JSON.stringify(this.E));
    for (const k of this.missing) delete this.E.objects[k];
    this.dirty = true; this.rebuild(false); this.status();
  },
  async exportEdits() {
    const text = JSON.stringify({ peperhideMapEdits: 1, map: this.mapId, edits: this.E }, null, 1), name = `peperhide-${this.mapId}-edits.json`;
    if (window.mcNative?.editsExport) { const r = await mcNative.editsExport(name, text); if (r.ok) toast('Exported to ' + r.file, 'good'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
  },
  async importEdits() {
    let text = null;
    if (window.mcNative?.editsImport) { const r = await mcNative.editsImport(); if (!r.ok) return; text = r.text; }
    else text = await new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => i.files[0] ? i.files[0].text().then(res) : res(null); i.click(); });
    if (!text) return;
    try {
      const d = JSON.parse(text); if (!d.edits || !MAPS[d.map]) throw new Error('not a peperhide map edit file');
      this.pushUndo(JSON.stringify(this.E));
      if (d.map !== this.mapId) { this.mapId = d.map; $('#edMap').value = d.map; this.undoS = []; }
      this.E = { ...blankEdits(), ...d.edits }; this.dirty = true; this.rebuild(true); this.status();
      toast(`Imported edits for ${MAPS[d.map].name}.`, 'good');
    } catch (err) { toast('Import failed: ' + err.message, 'bad'); }
  },
  switchMap(id) {
    if (id === this.mapId) return;
    const go = () => { this.mapId = id; this.E = this.copy(MapEdits.get(id)) || blankEdits(); this.undoS = []; this.redoS = []; this.dirty = false; this.rebuild(true); this.status(); };
    if (this.dirty) this.ask('Switch maps?', 'Your unsaved changes to this map will be lost.', go, 'Switch', () => { $('#edMap').value = this.mapId; });
    else go();
  },

  /* ---------- play test ---------- */
  playtest(kind) {
    MapEdits.temp = { id: this.mapId, edits: this.copy(this.E) };
    G.fromEditor = { solo: { ...G.solo } };
    G.solo = { kind, map: this.mapId, diff: G.solo.diff || 'normal' };
    this.deselect(); scene.remove(this.tc); scene.remove(this.group); scene.remove(this.pivot);
    $('#editor').classList.add('hidden'); document.body.classList.remove('in-editor');
    $('#quitBtn').textContent = 'Back to editor'; $('#menuBtn').textContent = 'Editor';
    MAP.editsKey = 'stale';                     // rebuild so nav, zones and hide spots match the edits
    camera.fov = SETTINGS.fov; camera.far = 160; camera.updateProjectionMatrix();
    G.phase = 'menu';
    G.startSolo();
  },
  resume() {
    const f = G.fromEditor; G.fromEditor = null;
    if (f) G.solo = f.solo;
    MapEdits.temp = null;
    $('#quitBtn').textContent = 'Leave'; $('#menuBtn').textContent = 'Menu';
    G.clearRound(); UI.hud(false); UI.hubHud(false); UI.screen(null);
    if (document.pointerLockElement) document.exitPointerLock();
    G.phase = 'editor'; this.on = true;
    document.body.classList.add('in-editor'); $('#editor').classList.remove('hidden');
    const cam = { pos: this.cam.pos.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch };
    this.rebuild(true);
    Object.assign(this.cam, cam);
    this.status();
  },

  /* ---------- per-frame ---------- */
  update(dt) {
    const k = this.keys, c = this.cam;
    if (this.look) {
      const sp = (k.ShiftLeft || k.ShiftRight ? 16 : 5.5) * dt;
      const fwd = new V3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
      const right = new V3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      if (k.KeyW) c.pos.addScaledVector(fwd, sp); if (k.KeyS) c.pos.addScaledVector(fwd, -sp);
      if (k.KeyD) c.pos.addScaledVector(right, sp); if (k.KeyA) c.pos.addScaledVector(right, -sp);
      if (k.KeyE || k.Space) c.pos.y += sp; if (k.KeyQ || k.ControlLeft) c.pos.y -= sp;
    }
    camera.position.copy(c.pos);
    camera.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    for (const b of this.boxes) b.update();
    for (const m of this.markers) if (m.userData.lightOf) m.position.copy(m.userData.lightOf.getWorldPosition(new V3()));
    this.thumbTick();
  },

  /* ---------- helpers in the scene ---------- */
  makeMarkers() {
    for (const m of this.markers) { this.group.remove(m); m.traverse((c) => { c.geometry?.dispose(); if (c.material?.map) c.material.map.dispose(); c.material?.dispose(); }); }
    this.markers = [];
    const mk = (color, label, spawn, idx, x, z) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      body.position.y = 0.03;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), new THREE.MeshBasicMaterial({ color }));
      pole.position.y = 0.75;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 16), new THREE.MeshBasicMaterial({ color }));
      arrow.position.y = 1.62; arrow.rotation.x = Math.PI;
      const tex = canvasTex(256, 64, (gg, w, h) => { gg.fillStyle = 'rgba(10,14,22,.82)'; gg.beginPath(); gg.roundRect(4, 6, w - 8, h - 12, 14); gg.fill(); gg.fillStyle = '#fff'; gg.font = '600 26px Segoe UI, system-ui, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(label, w / 2, h / 2 + 1); });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(1.6, 0.4, 1); sp.position.y = 2.1; sp.renderOrder = 997;
      g.add(body, pole, arrow, sp); g.position.set(x, 0, z);
      g.userData.spawn = spawn; g.userData.idx = idx;
      this.group.add(g); this.markers.push(g);
    };
    mk(0x38e0a0, 'Player spawn', 'player', 0, MAP.playerSpawn[0], MAP.playerSpawn[1]);
    (MAP.hunterSpawns || []).forEach(([x, z], i) => mk(0xff5468, 'Hunter ' + (i + 1), 'hunter', i, x, z));
    // lamps without a fixture mesh get a small handle so they can be picked
    for (const o of mapItems()) if (o.isPointLight) {
      const h = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffe08a, wireframe: true }));
      h.userData.lightOf = o; h.position.copy(o.position); this.group.add(h); this.markers.push(h);
    }
  },

  /* ---------- model thumbnails (rendered lazily, a few per frame) ---------- */
  thumbTick() {
    if (!this.thumbQ.length) return;
    if (!this.tScene) {
      this.tScene = new THREE.Scene();
      this.tScene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.9));
      const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(3, 5, 4); this.tScene.add(d);
      this.tCam = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
      this.tRT = new THREE.WebGLRenderTarget(112, 112); this.tBuf = new Uint8Array(112 * 112 * 4);
      this.tCanvas = document.createElement('canvas'); this.tCanvas.width = this.tCanvas.height = 112;
    }
    const S = 112, g = this.tCanvas.getContext('2d'), img = g.createImageData(S, S);
    const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), shadows = renderer.shadowMap.enabled;
    renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = false;
    for (let n = 0; n < 4 && this.thumbQ.length; n++) {
      const key = this.thumbQ.shift(); if (this.thumbs[key] || !PROTO[key]) continue;
      const o = PROTO[key].obj.clone(true); this.tScene.add(o);
      const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new V3()), s = b.getSize(new V3()), r = Math.max(s.x, s.y, s.z) || 1;
      this.tCam.position.set(c.x + r * 1.25, c.y + r * 0.95, c.z + r * 1.6); this.tCam.lookAt(c);
      renderer.setRenderTarget(this.tRT); renderer.clear(); renderer.render(this.tScene, this.tCam);
      renderer.readRenderTargetPixels(this.tRT, 0, 0, S, S, this.tBuf); renderer.setRenderTarget(null);
      this.tScene.remove(o);
      for (let y = 0; y < S; y++) img.data.set(this.tBuf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      g.putImageData(img, 0, 0);
      this.thumbs[key] = this.tCanvas.toDataURL('image/png');
      const el = document.querySelector(`#edGrid [data-key="${CSS.escape(key)}"] i`); if (el) el.style.backgroundImage = `url(${this.thumbs[key]})`;
    }
    renderer.setClearColor(prevClear, prevA); renderer.shadowMap.enabled = shadows;
  },

  /* ---------- UI ---------- */
  setMode(m) { this.mode = m; this.tc?.setMode(m); $$('#edMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); },
  status() {
    const src = MapEdits.source(this.mapId), el = $('#edStatus');
    el.className = 'ed-status ' + (this.dirty ? 'dirty' : 'clean');
    el.textContent = this.dirty ? 'Unsaved changes' : src === 'none' ? 'Original map' : src === 'local' ? 'Saved on this PC' : 'Saved in game files';
    $('#edUndo').disabled = !this.undoS.length; $('#edRedo').disabled = !this.redoS.length;
  },
  label(o) {
    if (o.userData.spawn === 'player') return ['Player spawn', 'Where hiders start'];
    if (o.userData.spawn === 'hunter') return ['Hunter spawn ' + (o.userData.idx + 1), 'Hunters wait here until the gate opens'];
    if (o.userData.key) { const [p, n] = o.userData.key.split(':'); return [edNice(n), (ED_PACKS[p] || p) + ' model']; }
    if (o.isPointLight) return ['Light', 'Point light'];
    if (OBJ_PHYS.get(o)?.light) return ['Lamp', 'Ceiling light'];
    if (o.isMesh) {
      const g = o.geometry.parameters || {}, t = o.geometry.type.replace('Geometry', '').replace('Buffer', '');
      if (t === 'Box') { const dims = [g.width, g.height, g.depth].map((v) => edNum(v * 1, 2)); return [o.userData.edCeil ? 'Ceiling' : dims[1] >= 2 && Math.min(dims[0], dims[2]) <= 0.25 ? 'Wall' : 'Block', dims.join(' × ') + ' m']; }
      if (t === 'Plane') return [o.userData.edCeil ? 'Ceiling' : Math.abs(o.rotation.x + Math.PI / 2) < 0.01 ? 'Floor / rug' : 'Panel', 'Plane ' + edNum(g.width, 2) + ' × ' + edNum(g.height, 2) + ' m'];
      return [edNice(t), 'Shape'];
    }
    return [o.type, ''];
  },
  inspector() {
    const box = $('#edInspector'); if (!box) return;
    if (!this.sel.length) { box.innerHTML = this.mapPanel(); this.wireMapPanel(); return; }
    const o = this.sel[0], multi = this.sel.length > 1;
    const [name, sub] = multi ? [`${this.sel.length} objects`, 'Moved together'] : this.label(o);
    const added = !multi && o.userData.addIdx != null, block = added && this.E.added[o.userData.addIdx]?.t === 'block';
    const changed = !multi && !added && !o.userData.spawn && !!this.E.objects[o.userData.eid];
    const vec = (id, lbl, step) => `<div class="ed-vec"><label>${lbl}</label>${['x', 'y', 'z'].map((a) => `<span class="ax ${a}"><b>${a.toUpperCase()}</b><input type="number" step="${step}" data-f="${id}" data-a="${a}"></span>`).join('')}</div>`;
    box.innerHTML = `
      <div class="ed-card">
        <div class="ed-title"><b>${esc(name)}</b><small>${esc(sub)}${added ? ' · added' : changed ? ' · edited' : ''}</small></div>
        ${multi ? '' : vec('p', 'Position', 0.05) + (o.userData.spawn ? '' : vec('r', 'Rotation', 5) + vec('s', 'Scale', 0.05))}
        ${block ? `<div class="ed-row"><label>Colour</label><input type="color" id="edSelCol" value="${esc(this.E.added[o.userData.addIdx].color || '#d9d4c7')}"></div>` : ''}
        <div class="ed-actions">
          ${o.userData.spawn && !multi ? '' : `<button class="ed-btn" id="edDup">${edIco('copy')}Duplicate</button><button class="ed-btn" id="edDrop">${edIco('floor')}Drop to floor</button>`}
          <button class="ed-btn" id="edReset" ${changed || (o.userData.spawn && this.E.spawn) || multi ? '' : 'disabled'}>${edIco('reset')}Reset</button>
          ${o.userData.spawn && !multi ? '' : `<button class="ed-btn danger" id="edDel">${edIco('trash')}Delete</button>`}
        </div>
      </div>
      ${multi ? '' : `<div class="ed-id" title="Editor id">${esc(this.selKey(o))}</div>`}`;
    this.inspectorValues();
    box.querySelectorAll('input[data-f]').forEach((inp) => inp.addEventListener('change', () => this.fromInputs()));
    $('#edDup')?.addEventListener('click', () => this.duplicate());
    $('#edDrop')?.addEventListener('click', () => this.dropToFloor());
    $('#edDel')?.addEventListener('click', () => this.remove());
    $('#edReset')?.addEventListener('click', () => this.resetSelected());
    $('#edSelCol')?.addEventListener('change', (e) => {
      this.pushUndo(JSON.stringify(this.E)); this.E.added[o.userData.addIdx].color = e.target.value;
      if (!this.E.added[o.userData.addIdx].tex) o.material.color.set(e.target.value);
      this.afterChange();
    });
  },
  inspectorValues() {
    if (this.sel.length !== 1) return;
    const o = this.sel[0], set = (f, a, v) => { const i = document.querySelector(`#edInspector input[data-f="${f}"][data-a="${a}"]`); if (i && document.activeElement !== i) i.value = v; };
    for (const a of ['x', 'y', 'z']) { set('p', a, edNum(o.position[a])); set('r', a, edDeg(o.rotation[a])); set('s', a, edNum(o.scale[a])); }
  },
  fromInputs() {
    const o = this.sel[0]; if (!o) return;
    const v = (f, a) => parseFloat(document.querySelector(`#edInspector input[data-f="${f}"][data-a="${a}"]`)?.value);
    this.pushUndo(JSON.stringify(this.E));
    for (const a of ['x', 'y', 'z']) {
      if (!isNaN(v('p', a))) o.position[a] = v('p', a);
      if (!o.userData.spawn) { if (!isNaN(v('r', a))) o.rotation[a] = THREE.MathUtils.degToRad(v('r', a)); if (!isNaN(v('s', a)) && v('s', a) !== 0) o.scale[a] = v('s', a); }
    }
    if (o.userData.spawn) o.position.y = 0;
    o.updateMatrixWorld(true); this.record(o); this.afterChange();
  },
  mapPanel() {
    const e = this.E, moved = Object.values(e.objects).filter((t) => !t.del).length, del = Object.values(e.objects).filter((t) => t.del).length;
    const r = this.reach, B = MAP.bounds;
    return `
      <div class="ed-card">
        <div class="ed-title"><b>${esc(MAP.name)}</b><small>${edNum(B.x1 - B.x0, 1)} × ${edNum(B.z1 - B.z0, 1)} m · ${mapItems().length} objects</small></div>
        <p class="ed-empty">Click an object to select it. Shift+click adds to the selection. Drag a model from the left onto the map to place it.</p>
        <div class="ed-stats"><span><b>${moved}</b>edited</span><span><b>${e.added.length}</b>added</span><span><b>${del}</b>deleted</span></div>
        ${e.spawn ? '<p class="ed-empty small">Spawn points moved.</p>' : ''}
        <button class="ed-btn wide" id="edReach">${edIco('globe')}Check AI reachability</button>
        ${r ? `<div class="ed-reach ${r.pct >= 100 ? 'ok' : 'bad'}">${r.pct >= 100 ? 'All ' + r.total + ' nav points reachable' : (r.total - r.reach) + ' of ' + r.total + ' nav points unreachable'}</div>` : ''}
      </div>`;
  },
  wireMapPanel() { $('#edReach')?.addEventListener('click', () => this.checkReach()); },
  changes() {
    const box = $('#edChanges'); if (!box) return;
    const miss = this.missing || [], src = MapEdits.source(this.mapId);
    box.innerHTML = `
      <div class="ed-card">
        <div class="ed-title"><b>Saving</b><small>${this.writable ? 'Developer copy: Save writes mapedits.js, which ships with the next build.' : 'Saves stay on this PC. When you host, players get your version of the map.'}</small></div>
        <div class="ed-kv"><span>This map</span><b>${src === 'none' ? 'Original' : src === 'local' ? 'Edited on this PC' : 'Edited (game files)'}</b></div>
        ${miss.length ? `<div class="ed-warn">${miss.length} edit${miss.length > 1 ? 's' : ''} no longer match an object (the map code changed).<button class="ed-btn" id="edClean">Remove them</button></div>` : ''}
        <div class="ed-actions col">
          <button class="ed-btn" id="edExport">Export edits…</button>
          <button class="ed-btn" id="edImport">Import edits…</button>
          <button class="ed-btn danger" id="edResetMap">${edIco('reset')}Reset map to original</button>
        </div>
      </div>
      <div class="ed-card">
        <div class="ed-title"><b>Shortcuts</b></div>
        <dl class="ed-keys">
          <dt>Right mouse + WASD</dt><dd>Fly (Q/E down, up; Shift faster)</dd><dt>Wheel / middle drag</dt><dd>Zoom / pan</dd>
          <dt>W E R</dt><dd>Move, rotate, scale</dd><dt>X</dt><dd>World / local axes</dd><dt>Hold Ctrl</dt><dd>Snap while dragging</dd>
          <dt>F</dt><dd>Frame selection</dd><dt>End</dt><dd>Drop to floor</dd><dt>Ctrl+D</dt><dd>Duplicate</dd>
          <dt>Delete</dt><dd>Delete</dd><dt>Ctrl+Z / Ctrl+Y</dt><dd>Undo / redo</dd><dt>Ctrl+S</dt><dd>Save</dd>
        </dl>
      </div>`;
    $('#edClean')?.addEventListener('click', () => this.cleanMissing());
    $('#edExport').onclick = () => this.exportEdits();
    $('#edImport').onclick = () => this.importEdits();
    $('#edResetMap').onclick = () => this.resetMap();
  },
  renderGrid() {
    const q = ($('#edSearch').value || '').trim().toLowerCase(), grid = $('#edGrid');
    const keys = Object.keys(PROTO).filter((k) => {
      const [p, n] = k.split(':');
      return (this.cat === 'all' || p === this.cat) && (!q || n.toLowerCase().includes(q) || edNice(n).toLowerCase().includes(q));
    }).sort((a, b) => a.split(':')[1].localeCompare(b.split(':')[1]));
    grid.innerHTML = keys.map((k) => `<button class="ed-tile" draggable="true" data-key="${esc(k)}" title="${esc(edNice(k.split(':')[1]))}"><i style="${this.thumbs[k] ? `background-image:url(${this.thumbs[k]})` : ''}"></i><span>${esc(edNice(k.split(':')[1]))}</span></button>`).join('') || '<p class="ed-empty">No models match.</p>';
    this.thumbQ = keys.filter((k) => !this.thumbs[k]);
  },
  renderCats() {
    const packs = [...new Set(Object.keys(PROTO).map((k) => k.split(':')[0]))];
    $('#edCats').innerHTML = ['all', ...packs].map((p) => `<button data-c="${p}" class="${p === this.cat ? 'on' : ''}">${p === 'all' ? 'All' : ED_PACKS[p] || p}</button>`).join('');
  },
  ask(title, text, ok, okLabel = 'Leave', cancel, opt = {}) {
    if (!this.dirty && !opt.force) { ok(); return; }
    const m = $('#edModal');
    m.innerHTML = `<div class="ed-dialog"><h3>${esc(title)}</h3><p>${esc(text)}</p><div class="ed-actions end"><button class="ed-btn" data-r="cancel">Cancel</button>${opt.noSave ? '' : '<button class="ed-btn" data-r="save">Save first</button>'}<button class="ed-btn danger" data-r="ok">${esc(okLabel)}</button></div></div>`;
    m.classList.remove('hidden');
    m.onclick = async (e) => {
      const r = e.target.closest('button')?.dataset.r; if (!r) return;
      m.classList.add('hidden');
      if (r === 'cancel') { cancel?.(); return; }
      if (r === 'save') await this.save();
      ok();
    };
  },

  /* ---------- wiring ---------- */
  wire() {
    if (this.wired) return; this.wired = true;
    $$('#editor [data-edico]').forEach((el) => el.insertAdjacentHTML('afterbegin', edIco(el.dataset.edico)));
    $('#edMap').innerHTML = MAP_ORDER.map((id) => `<option value="${id}">${esc(MAPS[id].name)}</option>`).join('');
    $('#edMap').onchange = (e) => this.switchMap(e.target.value);
    $('#edMode').onclick = (e) => { const b = e.target.closest('button'); if (b) this.setMode(b.dataset.m); };
    $('#edSpace').onclick = () => { this.space = this.space === 'world' ? 'local' : 'world'; this.tc.setSpace(this.space); $('#edSpace').lastChild.textContent = this.space === 'world' ? 'World' : 'Local'; };
    $('#edSnap').onclick = () => { this.snap = !this.snap; this.applySnap(this.snap); $('#edSnap').classList.toggle('on', this.snap); };
    $('#edCeil').onclick = () => { this.hideCeil = !this.hideCeil; $('#edCeil').classList.toggle('on', this.hideCeil); for (const o of mapItems()) if (o.userData.edCeil) o.visible = !this.hideCeil; this.sel = this.sel.filter((o) => o.visible); this.select(this.sel); };
    $('#edUndo').onclick = () => this.undo(); $('#edRedo').onclick = () => this.redo();
    $('#edSave').onclick = () => this.save();
    $('#edExit').onclick = () => this.exit();
    $('#edTest').onclick = (e) => { e.stopPropagation(); $('#edTestMenu').classList.toggle('hidden'); };
    $('#edTestMenu').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $('#edTestMenu').classList.add('hidden'); this.playtest(b.dataset.k); };
    addEventListener('click', () => $('#edTestMenu')?.classList.add('hidden'));
    $('#edTabs').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#edTabs button').forEach((x) => x.classList.toggle('on', x === b));
      for (const id of ['models', 'blocks', 'changes']) $('#ed-' + id).classList.toggle('hidden', id !== b.dataset.t);
    };
    $('#edSearch').oninput = () => this.renderGrid();
    $('#edCats').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; this.cat = b.dataset.c; this.renderCats(); this.renderGrid(); };
    $('#edGrid').onclick = (e) => { const b = e.target.closest('.ed-tile'); if (b) this.addRecord({ t: 'prop', key: b.dataset.key }); };
    $('#edGrid').addEventListener('dragstart', (e) => { const b = e.target.closest('.ed-tile'); if (b) { e.dataTransfer.setData('text/x-ph-model', b.dataset.key); e.dataTransfer.effectAllowed = 'copy'; } });
    $('#edBlkTex').innerHTML = '<option value="">Plain colour</option>' + ED_TEX.filter((k) => TEX[k] && TEX[k].isTexture).map((k) => `<option value="${k}">${edNice(k)}</option>`).join('');
    $('#edAddBlock').onclick = () => this.addBlock();
    $('#edBlockTile').addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-ph-block', '1'); e.dataTransfer.effectAllowed = 'copy'; });
    this.renderCats(); this.renderGrid(); this.setMode(this.mode);

    const cv = renderer.domElement;
    cv.addEventListener('dragover', (e) => { if (this.on) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    cv.addEventListener('drop', (e) => {
      if (!this.on) return; e.preventDefault();
      const key = e.dataTransfer.getData('text/x-ph-model'), p = this.rayPoint(e.clientX, e.clientY);
      if (key) this.addRecord({ t: 'prop', key }, p); else if (e.dataTransfer.getData('text/x-ph-block')) this.addBlock(p);
    });
    let down = null;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.on) return;
      if (e.button === 2) { this.look = true; try { cv.requestPointerLock()?.catch?.(() => { }); } catch { /* ignore */ } return; }
      if (e.button === 1) { this.pan = true; e.preventDefault(); return; }
      if (e.button === 0) down = { x: e.clientX, y: e.clientY, gizmo: this.tc && this.tc.axis !== null };
    });
    addEventListener('pointerup', (e) => {
      if (!this.on) return;
      if (e.button === 2) { this.look = false; if (document.pointerLockElement) document.exitPointerLock(); return; }
      if (e.button === 1) { this.pan = false; return; }
      if (e.button !== 0 || !down) return;
      const d = down; down = null;
      if (d.gizmo || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || e.target !== cv) return;
      const h = this.pick(e);
      if (h) this.select([h.o], e.shiftKey || e.ctrlKey); else if (!e.shiftKey) this.deselect();
    });
    addEventListener('mousemove', (e) => {
      if (!this.on) return;
      if (this.look) { this.cam.yaw -= e.movementX * 0.0032; this.cam.pitch = clamp(this.cam.pitch - e.movementY * 0.0032, -1.55, 1.55); }
      else if (this.pan) {
        const s = 0.012 * Math.max(1, this.cam.pos.y / 4), right = new V3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
        this.cam.pos.addScaledVector(right, -e.movementX * s); this.cam.pos.y += e.movementY * s;
      }
    });
    cv.addEventListener('wheel', (e) => {
      if (!this.on) return;
      const c = this.cam, fwd = new V3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
      c.pos.addScaledVector(fwd, -Math.sign(e.deltaY) * Math.max(0.6, Math.min(4, c.pos.y * 0.25)));
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (!this.on) return;
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      this.keys[e.code] = true;
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') { if (!this.look) this.applySnap(!this.snap); }
      if (this.look) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
      if (ctrl && e.code === 'KeyD') { e.preventDefault(); this.duplicate(); return; }
      if (ctrl) return;
      if (e.code === 'KeyW') this.setMode('translate');
      else if (e.code === 'KeyE') this.setMode('rotate');
      else if (e.code === 'KeyR') this.setMode('scale');
      else if (e.code === 'KeyX') $('#edSpace').click();
      else if (e.code === 'KeyF') this.focus();
      else if (e.code === 'End') this.dropToFloor();
      else if (e.code === 'Delete' || e.code === 'Backspace') this.remove();
      else if (e.code === 'Escape') { if (!$('#edModal').classList.contains('hidden')) $('#edModal').classList.add('hidden'); else this.deselect(); }
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (this.on && (e.code === 'ControlLeft' || e.code === 'ControlRight')) this.applySnap(this.snap);
    });
    addEventListener('blur', () => { this.keys = {}; this.look = false; this.pan = false; });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) this.look = false; });
  },
  focus() {
    if (!this.sel.length) { this.frameMap(); return; }
    const b = new THREE.Box3(); for (const o of this.sel) b.expandByObject(o);
    const c = b.getCenter(new V3()), r = Math.max(0.8, b.getSize(new V3()).length() * 0.9);
    const back = new V3(Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), -Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch));
    this.cam.pos.copy(c).addScaledVector(back, r * 1.6);
  },
};

if (window.mcNative?.onOpenEditor) mcNative.onOpenEditor(() => { if (!MapEditor.on && G.phase === 'menu') MapEditor.enter(); });
