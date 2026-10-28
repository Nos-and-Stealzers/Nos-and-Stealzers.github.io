'use strict';
/* Map edits: changes made in the map editor, layered on top of the code-built maps in maps.js.
   Per map: { v: 1, objects: { eid: { p, q, s } | { del: 1 } }, added: [ { t, ... , p, q, s } ], spawn: { player, hunters } }
   An eid is "what the object is @ where the map code put it" (plus #n for exact duplicates), so edits keep pointing at
   the right object when unrelated parts of the map code change. Transforms are absolute (position, quaternion, scale).
   Layers: MAP_EDITS_SHIPPED (mapedits.js, ships with the game) and this PC's saved edits (localStorage). Online, the
   host sends its edits with the round so every client builds the same map. */

const MapEdits = {
  LS: 'ph_map_edits',
  local: (() => { try { return JSON.parse(localStorage.getItem('ph_map_edits') || '{}'); } catch { return {}; } })(),
  temp: null,
  shipped(id) { return (typeof MAP_EDITS_SHIPPED !== 'undefined' && MAP_EDITS_SHIPPED[id]) || null; },
  get(id) {
    if (this.temp && this.temp.id === id) return this.temp.edits;
    return this.local[id] || this.shipped(id);
  },
  source(id) { return this.local[id] ? 'local' : this.shipped(id) ? 'shipped' : 'none'; },
  saveLocal(id, e) {
    if (editsEmpty(e)) delete this.local[id]; else this.local[id] = e;
    localStorage.setItem(this.LS, JSON.stringify(this.local));
  },
  clearLocal(id) { delete this.local[id]; localStorage.setItem(this.LS, JSON.stringify(this.local)); },
  setShipped(id, e) {
    if (typeof MAP_EDITS_SHIPPED === 'undefined') return;
    if (editsEmpty(e)) delete MAP_EDITS_SHIPPED[id]; else MAP_EDITS_SHIPPED[id] = e;
  },
};
function editsEmpty(e) { return !e || (!Object.keys(e.objects || {}).length && !(e.added || []).length && !e.spawn); }
function editsKey(e) { return editsEmpty(e) ? '' : String(hashStr(JSON.stringify(e))); }
function blankEdits() { return { v: 1, objects: {}, added: [] }; }

const _r2 = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? 0 : r; };
function itemKind(o) {
  if (o.userData.key) return o.userData.key;
  if (o.isPointLight) return 'light';
  if (o.isMesh) return o.geometry.type.replace('BufferGeometry', '').replace('Geometry', '') || 'Mesh';
  return o.type;
}
function isEditable(o) { return !!o.userData.eid; }
function mapItems() { return mapGroup.children.filter(isEditable); }

/** Snapshot every top-level map object right after the map code ran: id, original matrix and physics. */
function snapshotItem(o) {
  const ph = physOf(o);
  o.updateMatrixWorld(true);
  ph.orig = o.matrixWorld.clone();
  ph.cols0 = ph.cols.map((b) => b.clone());
  ph.tops0 = ph.tops.map((t) => ({ ...t }));
  ph.unders0 = ph.unders.map((u) => ({ ...u }));
  ph.light0 = ph.light ? ph.light.position.clone() : null;
}
function assignEids() {
  const seen = new Map();
  for (const o of mapGroup.children) {
    if (o === _csMesh || o === gateMesh) continue;
    if (o.isLight && (!o.isPointLight || o.userData.hasFixture)) continue;
    const p = o.position, base = `${itemKind(o)}@${_r2(p.x)},${_r2(p.y)},${_r2(p.z)}`;
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    o.userData.eid = n ? `${base}#${n}` : base;
    snapshotItem(o);
  }
}

const _M = new THREE.Matrix4();
function rectXform(r0, r, D, yk) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ys = 0;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const v = new V3(r0.x + a * r0.w / 2, r0[yk], r0.z + b * r0.d / 2).applyMatrix4(D);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); ys += v.y / 4;
  }
  r.x = (x0 + x1) / 2; r.z = (z0 + z1) / 2; r.w = x1 - x0; r.d = z1 - z0; r[yk] = ys;
}
/** Re-fit colliders, hide-tops, crawl gaps and the lamp light of an item to its current transform. */
function refreshItem(o) {
  _envBoxes.clear();
  const ph = OBJ_PHYS.get(o);
  if (!ph || !ph.orig) return;
  o.updateMatrixWorld(true);
  const D = o.matrixWorld.clone().multiply(_M.copy(ph.orig).invert());
  if (ph.light && ph.light0) ph.light.position.copy(ph.light0).applyMatrix4(D);
  if (o.userData.key) {
    const wb = new THREE.Box3().setFromObject(o), h = wb.max.y - wb.min.y; o.userData.wb = wb;
    const cx = (wb.min.x + wb.max.x) / 2, cz = (wb.min.z + wb.max.z) / 2;
    for (const b of ph.cols) {
      if (o.userData.col === 'table') b.set(new V3(wb.min.x, wb.max.y - (o.userData.slab || Math.max(0.06, h * 0.12)), wb.min.z), wb.max.clone());
      else b.set(new V3(wb.min.x + 0.02, wb.min.y, wb.min.z + 0.02), new V3(wb.max.x - 0.02, wb.max.y, wb.max.z - 0.02));
    }
    for (const t of ph.tops) Object.assign(t, { x: cx, z: cz, w: (wb.max.x - wb.min.x) * 0.8, d: (wb.max.z - wb.min.z) * 0.8, y: wb.max.y });
    for (const u of ph.unders) Object.assign(u, { x: cx, z: cz, w: wb.max.x - wb.min.x, d: wb.max.z - wb.min.z, h: ph.cols[0] ? ph.cols[0].min.y : u.h });
  } else {
    ph.cols.forEach((b, i) => b.copy(ph.cols0[i]).applyMatrix4(D));
    ph.tops.forEach((t, i) => rectXform(ph.tops0[i], t, D, 'y'));
    ph.unders.forEach((u, i) => rectXform(ph.unders0[i], u, D, 'h'));
  }
  for (const t of [...ph.tops, ...ph.unders]) { const zn = zoneAt(t.x, t.z); t.zone = zn ? zn.id : null; }
}
function setItemTransform(o, t) {
  if (t.p) o.position.fromArray(t.p);
  if (t.q) o.quaternion.fromArray(t.q).normalize();
  if (t.s) o.scale.fromArray(t.s);
  refreshItem(o);
}
function itemTransform(o) {
  const f = (a, d) => a.map((v) => { const r = Math.round(v * d) / d; return r === 0 ? 0 : r; });
  return { p: f(o.position.toArray(), 1e4), q: f(o.quaternion.toArray(), 1e6), s: f(o.scale.toArray(), 1e4) };
}
function removeItem(o) {
  const ph = OBJ_PHYS.get(o);
  const drop = (list, items) => { for (const x of items) { const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); } };
  if (ph) {
    drop(colliders, ph.cols); drop(tops, ph.tops); drop(unders, ph.unders);
    if (ph.light) mapGroup.remove(ph.light);
  }
  o.traverse((c) => { const i = env.indexOf(c); if (i >= 0) env.splice(i, 1); });
  const k = _csList.indexOf(o); if (k >= 0) _csList.splice(k, 1);
  mapGroup.remove(o); _envBoxes.clear();
}
/** Copy any map object (walls, primitives, props, lamps) with its colliders and hide spots. */
function cloneItem(src) {
  const sp = OBJ_PHYS.get(src);
  const o = src.clone(true);
  o.userData = { ...src.userData }; delete o.userData.eid;
  o.traverse((c) => { if (c.isMesh) { c.userData.shared = true; env.push(c); } });
  mapGroup.add(o);
  const ph = physOf(o);
  if (sp) {
    ph.orig = sp.orig.clone();
    ph.cols0 = sp.cols0; ph.tops0 = sp.tops0; ph.unders0 = sp.unders0; ph.light0 = sp.light0;
    ph.cols = sp.cols0.map((b) => { const c = b.clone(); colliders.push(c); return c; });
    ph.tops = sp.tops0.map((t) => { const c = { ...t }; tops.push(c); return c; });
    ph.unders = sp.unders0.map((u) => { const c = { ...u }; unders.push(c); return c; });
    if (sp.light) { ph.light = sp.light.clone(); mapGroup.add(ph.light); }
  } else snapshotItem(o);
  if (src.userData.key && !src.userData.noShadow) _csList.push(o);
  return o;
}
/** Build an added object. Returns null when it can't be made (missing model or clone source). */
function spawnAdded(a, byId) {
  let o = null;
  _mapTrack = true; _lastMapObj = null;
  try {
    if (a.t === 'prop') o = prop(a.key, 0, 0, a.col ? { col: a.col } : {});
    else if (a.t === 'block') {
      const [w, h, d] = a.size || [1, 1, 1];
      o = box(0, 0, w, d, h, a.tex && TEX[a.tex] ? tm(a.tex, Math.max(1, w / 2), Math.max(1, h / 2), 0.85) : cm(a.color || '#d9d4c7', 0.8), { top: true });
    } else if (a.t === 'clone') { const src = byId.get(a.src); if (src) o = cloneItem(src); }
  } catch (e) { console.warn('map edit add', a, e); o = null; } finally { _mapTrack = false; _lastMapObj = null; }
  if (!o) return null;
  if (a.t !== 'clone') snapshotItem(o);
  setItemTransform(o, a);
  return o;
}
/** Apply one map's edits right after def.build(). Returns what happened (the editor shows missing ids). */
function applyMapEdits(e) {
  assignEids();
  const rep = { moved: 0, deleted: 0, added: 0, missing: [] };
  if (editsEmpty(e)) return rep;
  const byId = new Map(mapItems().map((o) => [o.userData.eid, o]));
  (e.added || []).forEach((a, i) => {
    const o = spawnAdded(a, byId);
    if (o) { o.userData.eid = 'add:' + i; o.userData.addIdx = i; rep.added++; } else rep.missing.push('add:' + i);
  });
  for (const [eid, t] of Object.entries(e.objects || {})) {
    const o = byId.get(eid);
    if (!o) { rep.missing.push(eid); continue; }
    if (t.del) { removeItem(o); rep.deleted++; } else { setItemTransform(o, t); rep.moved++; }
  }
  if (e.spawn) {
    if (e.spawn.player) MAP.playerSpawn = e.spawn.player.slice();
    if (e.spawn.hunters) MAP.hunterSpawns = e.spawn.hunters.map((h) => h.slice());
  }
  return rep;
}
/** Share of nav nodes reachable from the player spawn (AI hunters and hiders need 100%). */
function navReach() {
  if (!NODES.length || !MAP) return { reach: 0, total: 0, pct: 0 };
  const s = nearestNode(MAP.playerSpawn[0], MAP.playerSpawn[1]), seen = new Set([s]), q = [s];
  while (q.length) { const u = q.pop(); for (const v of u.edges) if (!seen.has(v)) { seen.add(v); q.push(v); } }
  return { reach: seen.size, total: NODES.length, pct: Math.round(seen.size / NODES.length * 1000) / 10, lost: NODES.filter((n) => !seen.has(n)) };
}
