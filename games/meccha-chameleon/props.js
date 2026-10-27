'use strict';
/* Real 3D props. Models are CC0 packs by Kenney (kenney.nl), embedded as base64 GLB in models.js
   so the app runs from disk with no server. prop(key, x, z, opts) places one with colliders and hide-tops. */

const PROTO = {};                       // key -> { obj, box }
const PACK_SCALE = { f: 2.5, food: 0.6, surv: 2, mkt: 2.2, toy: 1, hol: 1.6, arc: 2.3, nat: 2, pir: 0.5, grave: 2, plat: 1 };
let modelsReady = false;

function b64buf(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
const PACK_TEX = {};
function packTexture(pack) {
  if (PACK_TEX[pack] !== undefined) return PACK_TEX[pack];
  const src = (typeof MODEL_TEX !== 'undefined') && MODEL_TEX[pack];
  if (!src) return (PACK_TEX[pack] = null);
  const img = new Image(); img.src = src;
  const t = new THREE.Texture(img); t.flipY = false; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    img._data = g.getImageData(0, 0, c.width, c.height); t.needsUpdate = true;
  };
  return (PACK_TEX[pack] = t);
}
async function loadModels() {
  if (modelsReady || typeof MODEL_SRC === 'undefined') { modelsReady = true; return; }
  const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const manager = new THREE.LoadingManager(); manager.setURLModifier((u) => (u.startsWith('data:') ? u : blank));
  const loader = new THREE.GLTFLoader(manager);
  const mats = new Map();
  for (const [key, [pack, b64]] of Object.entries(MODEL_SRC)) {
    try {
      const gltf = await new Promise((res, rej) => loader.parse(b64buf(b64), '', res, rej));
      const obj = gltf.scene, tex = packTexture(pack);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        const src = o.material, mk = pack + ':' + (src.name || '') + ':' + src.color.getHexString() + (src.map ? 'T' : '');
        let m = mats.get(mk);
        if (!m) {
          m = new THREE.MeshStandardMaterial({ color: src.color.clone().convertLinearToSRGB(), roughness: clamp(src.roughness ?? 0.8, 0.45, 0.95), metalness: Math.min(src.metalness ?? 0, 0.4) });
          if (src.map && tex) m.map = tex;
          m.name = src.name; mats.set(mk, m);
        }
        o.material = m; o.userData.shared = true;
        if (o.geometry) { o.geometry.userData.shared = true; o.geometry.computeBoundingBox(); }
      });
      obj.updateMatrixWorld(true);
      PROTO[key] = { obj, box: new THREE.Box3().setFromObject(obj), pack };
    } catch (e) { console.warn('model', key, e); }
  }
  modelsReady = true;
}

/** Collider style by model name: 'table' = only the top slab collides (you can crawl under it), 'none', else solid. */
function propCollider(key, h) {
  const n = key.split(':')[1];
  if (/^(table|desk|tableCloth|tableCross|tableGlass|tableRound)/.test(n) && !/Coffee/.test(n)) return 'table';
  if (/^(rug|floor|lamp(Wall|SquareCeiling)|ceilingFan|paneling|books|computer|televisionAntenna|bathroomMirror)/.test(n)) return 'none';
  if (h < 0.1) return 'none';
  return 'solid';
}
/**
 * Place a model. key 'pack:name'. opts: ry (radians or 'n','s','e','w'), s (scale multiplier on the pack scale), h (fit height in m),
 * y (base height), col ('solid'|'table'|'none'), top (bool), tint (hex colour), slab (table top thickness).
 */
function prop(key, x, z, o = {}) {
  const P = PROTO[key];
  if (!P) { console.warn('missing model', key); return null; }
  const obj = P.obj.clone(true);
  const ry = typeof o.ry === 'string' ? FACING[o.ry] : (o.ry || 0);
  const size = P.box.getSize(new V3());
  const s = o.h ? o.h / size.y : (PACK_SCALE[P.pack] || 1) * (o.s || 1);
  obj.scale.setScalar(s); obj.rotation.y = ry;
  if (o.tint) obj.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.color.set(o.tint); c.userData.shared = false; } });
  mapGroup.add(obj); obj.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(obj), wc = wb.getCenter(new V3());
  let px = x - wc.x, pz = z - wc.z;
  if (o.ax === 'min') px = x - wb.min.x; else if (o.ax === 'max') px = x - wb.max.x;
  if (o.az === 'min') pz = z - wb.min.z; else if (o.az === 'max') pz = z - wb.max.z;
  obj.position.set(px, (o.y || 0) - wb.min.y, pz); obj.updateMatrixWorld(true);
  wb.setFromObject(obj);
  obj.traverse((c) => { if (c.isMesh) { env.push(c); if (o.noShadow) c.castShadow = false; } });
  const h = wb.max.y - wb.min.y, col = o.col || propCollider(key, h);
  let cbox = null;
  if (col === 'solid') cbox = addCollider(wb.min.x + 0.02, wb.min.y, wb.min.z + 0.02, wb.max.x - 0.02, wb.max.y, wb.max.z - 0.02);
  else if (col === 'table') {
    cbox = addCollider(wb.min.x, wb.max.y - (o.slab || Math.max(0.06, h * 0.12)), wb.min.z, wb.max.x, wb.max.y, wb.max.z);
    const zn = zoneAt((wb.min.x + wb.max.x) / 2, (wb.min.z + wb.max.z) / 2);
    unders.push({ x: (wb.min.x + wb.max.x) / 2, z: (wb.min.z + wb.max.z) / 2, w: wb.max.x - wb.min.x, d: wb.max.z - wb.min.z, h: cbox.min.y, zone: zn ? zn.id : null });
  }
  if (o.top ?? (col !== 'none' && h < 1.6)) addTop((wb.min.x + wb.max.x) / 2, (wb.min.z + wb.max.z) / 2, (wb.max.x - wb.min.x) * 0.8, (wb.max.z - wb.min.z) * 0.8, wb.max.y);
  obj.userData.box = cbox; obj.userData.wb = wb;
  return obj;
}
/** Row helper: place n copies along x or z. */
function propRow(key, x, z, n, dx, dz, o = {}) { const out = []; for (let i = 0; i < n; i++) out.push(prop(key, x + dx * i, z + dz * i, o)); return out; }

/** Find shelf surfaces inside a placed bookcase by raycasting down, then line them with book models. */
const _shelfRc = new THREE.Raycaster();
function fillShelves(obj, o = {}) {
  if (!obj) return;
  const wb = obj.userData.wb, meshes = []; obj.traverse((c) => c.isMesh && meshes.push(c));
  const cx = (wb.min.x + wb.max.x) / 2, cz = (wb.min.z + wb.max.z) / 2, wide = wb.max.x - wb.min.x > wb.max.z - wb.min.z;
  const span = (wide ? wb.max.x - wb.min.x : wb.max.z - wb.min.z) - 0.12, ys = [];
  let y = wb.max.y - 0.05;
  while (y > wb.min.y + 0.05) {
    _shelfRc.set(new V3(cx, y, cz), new V3(0, -1, 0)); _shelfRc.far = y - wb.min.y;
    const h = _shelfRc.intersectObjects(meshes, false)[0];
    if (!h) break;
    if (h.point.y < wb.max.y - 0.1 && wb.max.y - h.point.y > 0.15 && (!ys.length || ys[ys.length - 1] - h.point.y > 0.18)) ys.push(h.point.y);
    y = h.point.y - 0.03;
  }
  const cols = ['#b8323d', '#3d6fb0', '#3d6b4f', '#c9a54c', '#6e3b22', '#8c6bd6', '#efe3c8', '#2d2d33'];
  for (const sy of ys) {
    let t = -span / 2;
    while (t < span / 2 - 0.16) {
      if (srand() < (o.gap ?? 0.12)) { t += 0.12; continue; }
      const bx = wide ? cx + t + 0.09 : cx, bz = wide ? cz : cz + t + 0.09;
      const b = prop('f:books', bx, bz, { y: sy, col: 'none', top: false, ry: (wide ? 0 : Math.PI / 2) + (srand() < 0.5 ? Math.PI : 0), s: 0.75, noShadow: true });
      const bw = b ? Math.max(b.userData.wb.max.x - b.userData.wb.min.x, b.userData.wb.max.z - b.userData.wb.min.z) : 0.3;
      t += bw * (wide ? 1 : 1) + 0.02;
    }
  }
  return ys.length;
}
