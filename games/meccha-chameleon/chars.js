'use strict';
/* Characters: the rigged player doll (rig.js), builds, poses + procedural animation, paintable skin, faces,
   hunter avatars, profile + progression, 3D preview. */

const TS = 512;

/* ================= rig data ================= */
const RIG = (() => {
  const D = RIG_DATA;
  const bytes = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const F = (b) => new Float32Array(bytes(b).buffer);
  const pos = F(D.pos), nrm = F(D.nrm), uv = F(D.uv), sw = F(D.sw), si = new Uint16Array(bytes(D.si)), idx = new Uint16Array(bytes(D.idx).buffer);
  const NAME = { hips: 'Bone', sp1: 'Bone.003', sp2: 'Bone.001', sp3: 'Bone.004', chest: 'Bone.002', upper: 'Bone.005', neck: 'Bone.006', head: 'Bone.011', armL: 'Bone.007', foreL: 'Bone.008', armR: 'Bone.009', foreR: 'Bone.010', legL: 'Bone.013', shinL: 'Bone.014', legR: 'Bone.015', shinR: 'Bone.016' };
  const B = {};
  for (const k in NAME) B[k] = D.bones.findIndex((b) => b.name === NAME[k]);
  const attrs = {
    normal: new THREE.BufferAttribute(nrm, 3), uv: new THREE.BufferAttribute(uv, 2),
    skinIndex: new THREE.Uint16BufferAttribute(si, 4), skinWeight: new THREE.BufferAttribute(sw, 4), index: new THREE.BufferAttribute(idx, 1),
  };
  const parents = D.bones.map((b) => b.parent);
  const order = []; const seen = new Set();
  const visit = (i) => { if (seen.has(i)) return; if (parents[i] >= 0) visit(parents[i]); seen.add(i); order.push(i); };
  D.bones.forEach((_, i) => visit(i));
  // texel density (px per rig unit) so brush radii stay the same size in the world
  let uvArea = 0, area = 0;
  const a = new V3(), b = new V3(), c = new V3();
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    uvArea += Math.abs((uv[i1 * 2] - uv[i0 * 2]) * (uv[i2 * 2 + 1] - uv[i0 * 2 + 1]) - (uv[i2 * 2] - uv[i0 * 2]) * (uv[i1 * 2 + 1] - uv[i0 * 2 + 1])) / 2;
  }
  return { D, pos, uv, sw, si, idx, B, NAME, attrs, parents, order, count: pos.length / 3, texelsPerUnit: Math.sqrt(uvArea * TS * TS / area) };
})();
const CHAM_H = 0.8;                       // standing height (m) of a normal chameleon
const HUNTER_H = 1.78;
/* Old brush/dot sizes were tuned for ~118 px per metre. */
const PSCALE = RIG.texelsPerUnit / CHAM_H / 118;

/* ================= builds (same doll, different proportions) ================= */
const SHAPES = {
  classic: { label: 'Classic', desc: 'The original doll' },
  slim: { label: 'Slim', desc: 'Thin and a bit taller', thick: { all: 0.78 }, len: { legL: 1.1, shinL: 1.1, legR: 1.1, shinR: 1.1 } },
  chunky: { label: 'Chunky', desc: 'Wide body', thick: { hips: 1.3, sp1: 1.4, sp2: 1.45, sp3: 1.45, chest: 1.35, upper: 1.22, legL: 1.22, legR: 1.22, shinL: 1.12, shinR: 1.12, armL: 1.15, armR: 1.15, foreL: 1.12, foreR: 1.12 } },
  bighead: { label: 'Big head', desc: 'All brain', uni: { head: 1.55 } },
  stubby: { label: 'Stubby', desc: 'Short legs, short arms', len: { legL: 0.68, shinL: 0.68, legR: 0.68, shinR: 0.68, armL: 0.8, foreL: 0.8, armR: 0.8, foreR: 0.8 }, uni: { head: 1.22 } },
};
const RIGGEO = {};
function rigGeo(build) {
  if (RIGGEO[build]) return RIGGEO[build];
  const S = SHAPES[build] || SHAPES.classic, R = RIG, bones = R.D.bones, nb = bones.length;
  const head = bones.map((b) => new V3(...b.head)), tail = bones.map((b) => new V3(...b.tail));
  const dir = bones.map((_, i) => tail[i].clone().sub(head[i]).normalize());
  const semantic = {}; for (const k in R.B) semantic[R.B[k]] = k;
  const thick = (i) => (S.thick ? S.thick[semantic[i]] ?? S.thick.all ?? 1 : 1);
  const len = (i) => (S.len ? S.len[semantic[i]] ?? 1 : 1);
  const uni = (i) => (S.uni ? S.uni[semantic[i]] ?? 0 : 0);
  const newHead = new Array(nb);
  const M = (i, v, out) => {     // affine map of bone i applied to rest point v
    const d = out.copy(v).sub(head[i]);
    const u = uni(i);
    if (u) d.multiplyScalar(u);
    else { const k = thick(i), L = len(i), ax = d.dot(dir[i]); d.multiplyScalar(k).addScaledVector(dir[i], ax * (L - k)); }
    return d.add(newHead[i]);
  };
  const tmp = new V3();
  for (const i of R.order) newHead[i] = R.parents[i] >= 0 ? M(R.parents[i], head[i], new V3()) : head[i].clone();
  const newTail = bones.map((_, i) => M(i, tail[i], new V3()));
  const P = new Float32Array(R.pos.length), v = new V3(), acc = new V3();
  for (let k = 0; k < R.count; k++) {
    v.fromArray(R.pos, k * 3); acc.set(0, 0, 0);
    for (let j = 0; j < 4; j++) { const w = R.sw[k * 4 + j]; if (w > 0) acc.addScaledVector(M(R.si[k * 4 + j], v, tmp), w); }
    acc.toArray(P, k * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  for (const k of ['normal', 'uv', 'skinIndex', 'skinWeight']) geo.setAttribute(k, R.attrs[k]);
  geo.setIndex(R.attrs.index);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  // head metrics (for faces and accessories)
  const hb = R.B.head, hbb = new THREE.Box3();
  for (let k = 0; k < R.count; k++) {
    let w = 0; for (let j = 0; j < 4; j++) if (R.si[k * 4 + j] === hb) w += R.sw[k * 4 + j];
    if (w > 0.6) hbb.expandByPoint(v.fromArray(P, k * 3));
  }
  const hc = hbb.getCenter(new V3()), hs = hbb.getSize(new V3());
  const dirs = newHead.map((h, i) => newTail[i].clone().sub(h).normalize());
  return (RIGGEO[build] = { geo, heads: newHead, tails: newTail, dirs, headCenter: hc, headR: Math.min(hs.x, hs.y) / 2, headSize: hs });
}

/* ================= poses ================= */
/* Limb directions are given for the doll's left (+X) side in its parent frame (chest for arms, hips for legs);
   the right side mirrors them unless armR/legR is set. Front is +Z, up is +Y. */
const PI = Math.PI;
const STAND = { arm: [[0.3, -1, 0.04], [0.2, -1, 0.14]], leg: [[0.06, -1, 0], [0.05, -1, -0.04]] };
const POSES = {
  stand: { label: 'Stand', key: '1', move: true, ...STAND },
  crouch: { label: 'Crouch', key: '2', move: true, speed: 0.5, bend: 0.5, head: [-0.35, 0], arm: [[0.3, -0.55, 0.75], [0.05, -0.35, 1]], leg: [[0.2, -0.3, 1], [0.08, -1, -0.35]] },
  sit: { label: 'Sit', key: '3', bend: 0.05, arm: [[0.32, -0.95, 0.25], [0.12, -0.25, 1]], leg: [[0.12, -0.04, 1], [0.08, -1, 0.1]] },
  curl: { label: 'Ball', key: '4', bend: 1.05, head: [0.55, 0], arm: [[0.2, -0.3, 1], [-0.75, -0.25, 0.6]], leg: [[0.1, 0.4, 1], [0.04, -1, -0.2]] },
  lie: { label: 'Lie', key: '5', root: [-PI / 2, 0, 0], arm: [[0.25, -1, 0], [0.16, -1, 0]], leg: [[0.06, -1, 0], [0.04, -1, 0]] },
  prone: { label: 'Face down', key: '6', root: [PI / 2, 0, 0], arm: [[0.45, 1, -0.05], [0.25, 1, -0.05]], leg: [[0.07, -1, 0], [0.05, -1, 0]] },
  side: { label: 'Side', key: '7', root: [0, 0, PI / 2], bend: 0.25, arm: [[0.1, -0.4, 0.95], [-0.2, 0.2, 1]], armR: [[-0.2, 1, 0.1], [0.4, 0.6, 0.6]], leg: [[0.05, -0.8, 0.6], [0.02, -1, -0.15]], legR: [[-0.02, -1, 0.15], [0, -1, -0.15]] },
  flat: { label: 'Flat', key: '8', wall: true, arm: [[0.11, -1, -0.04], [0.07, -1, -0.03]], leg: [[0.025, -1, 0], [0.02, -1, 0]] },
  star: { label: 'Star', key: '9', wall: true, arm: [[1, 0.75, 0], [1, 0.9, 0]], leg: [[0.48, -1, 0], [0.42, -1, 0]] },
  reach: { label: 'Hands up', key: '0', arm: [[0.22, 1, 0], [0.12, 1, 0.04]], leg: STAND.leg },
  tpose: { label: 'T-pose', arm: [[1, 0, 0], [1, 0, 0]], leg: STAND.leg },
  kneel: { label: 'Kneel', bend: 0.08, arm: [[0.3, -0.7, 0.55], [0.1, -0.9, 0.5]], leg: [[0.12, -0.15, 1], [0.06, -1, 0.05]], legR: [[-0.1, -1, 0.05], [-0.03, -0.02, -1]] },
  thinker: { label: 'Thinker', bend: 0.35, head: [0.2, 0], arm: [[0.25, -0.7, 0.6], [0.05, -0.3, 1]], armR: [[-0.2, -0.75, 0.7], [-0.05, 1, 0.25]], leg: [[0.12, -0.04, 1], [0.08, -1, 0.1]] },
  tuck: { label: 'Tuck', bend: 0.85, head: [0.7, 0], arm: [[0.18, -0.55, 0.85], [-0.6, -0.45, 0.7]], leg: [[0.1, 0.55, 1], [0.04, -1, -0.25]] },
  slant: { label: 'Slanted', root: [-0.95, 0, 0], arm: [[0.2, -1, 0.02], [0.12, -1, 0.02]], leg: [[0.05, -1, 0], [0.04, -1, 0]] },
  backbend: { label: 'Backbend', root: [-0.55, 0, 0], bend: -1.1, head: [-0.8, 0], arm: [[0.35, 0.85, -0.45], [0.15, 0.6, -0.8]], leg: [[0.12, -0.6, 0.8], [0.06, -1, -0.15]] },
  plank: { label: 'Plank', root: [PI / 2, 0, 0], arm: [[0.25, 0.15, 1], [0.15, 1, 0.1]], leg: [[0.05, -1, 0], [0.04, -1, 0]] },
  wave: { label: 'Wave', emote: true, ...STAND },
  dance: { label: 'Dance', emote: true, ...STAND },
  cheer: { label: 'Cheer', emote: true, ...STAND },
  clap: { label: 'Clap', emote: true, ...STAND },
  shrug: { label: 'Shrug', emote: true, ...STAND },
};
const POSE_ORDER = ['stand', 'crouch', 'sit', 'curl', 'lie', 'prone', 'side', 'flat', 'star', 'reach', 'tpose', 'kneel', 'thinker', 'tuck', 'slant', 'backbend', 'plank'];
/* Pose wheel pages (hold R/G, point, release; click to change page). */
const POSE_PAGES = [
  { name: 'Poses', list: ['stand', 'crouch', 'sit', 'curl', 'lie', 'prone', 'side', 'kneel'] },
  { name: 'Shapes', list: ['flat', 'star', 'slant', 'backbend', 'tuck', 'plank', 'reach', 'tpose', 'thinker'] },
  { name: 'Emotes', list: ['wave', 'dance', 'cheer', 'clap', 'shrug'] },
];
/** Poses that lie on the floor: stuck to a wall they turn so the side that was on the floor touches the wall. */
const lyingPose = (p) => { const r = POSES[p]?.root; return !!r && (Math.abs(r[0]) > 0.5 || Math.abs(r[2]) > 0.5); };
const SIZES = { petite: [0.72, 0.72], normal: [1, 1], plump: [1.32, 1.04] };

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _x = new V3(1, 0, 0), _lean = new THREE.Quaternion();
const mirror = (d) => [-d[0], d[1], d[2]];
const rotX = (d, a) => new V3(...d).applyAxisAngle(_x, a);
function poseTargets(G, def, anim = {}) {
  const B = RIG.B, q = G.dirs.map(() => new THREE.Quaternion());
  const bend = (def.bend || 0) + (anim.breath || 0) + (anim.bend || 0), twist = (def.twist || 0) + (anim.twist || 0), side = (def.side || 0) + (anim.side || 0);
  for (const n of ['sp1', 'sp2', 'sp3', 'chest', 'upper']) q[B[n]].setFromEuler(_e.set(bend / 5, twist / 5, side / 5));
  const hp = (def.head ? def.head[0] : 0) + (anim.headP || 0), hy = (def.head ? def.head[1] : 0) + (anim.headY || 0);
  q[B.neck].setFromEuler(_e.set(hp * 0.4, hy * 0.4, 0)); q[B.head].setFromEuler(_e.set(hp * 0.6, hy * 0.6, 0));
  const limb = (u, l, dU, dL) => {
    const a = dU.isVector3 ? dU : new V3(...dU), b = dL.isVector3 ? dL : new V3(...dL);
    q[B[u]].setFromUnitVectors(G.dirs[B[u]], a.normalize());
    _q2.setFromUnitVectors(G.dirs[B[l]], b.normalize());
    q[B[l]].copy(q[B[u]]).invert().multiply(_q2);
  };
  let aL = def.arm, aR = def.armR || def.arm.map(mirror), lL = def.leg, lR = def.legR || def.leg.map(mirror);
  if (anim.override) ({ aL = aL, aR = aR, lL = lL, lR = lR } = anim.override(aL, aR, lL, lR));
  const w = anim.walkAmt || 0;
  if (w > 0.001) {
    const ph = anim.walk || 0, s = Math.sin(ph);
    const kL = w * (0.12 + 0.75 * Math.max(0, Math.sin(ph + 1.9))), kR = w * (0.12 + 0.75 * Math.max(0, Math.sin(ph + 1.9 + PI)));
    const tL = rotX(lL[0], -s * 0.6 * w), tR = rotX(lR[0], s * 0.6 * w);
    limb('legL', 'shinL', tL, tL.clone().applyAxisAngle(_x, kL));
    limb('legR', 'shinR', tR, tR.clone().applyAxisAngle(_x, kR));
    if (!anim.armsFixed) {
      const sa = s * 0.55 * w;
      limb('armL', 'foreL', rotX(aL[0], sa), rotX(aL[1], sa - 0.25 * w));
      limb('armR', 'foreR', rotX(aR[0], -sa), rotX(aR[1], -sa - 0.25 * w));
    } else { limb('armL', 'foreL', aL[0], aL[1]); limb('armR', 'foreR', aR[0], aR[1]); }
  } else {
    limb('armL', 'foreL', aL[0], aL[1]); limb('armR', 'foreR', aR[0], aR[1]);
    limb('legL', 'shinL', lL[0], lL[1]); limb('legR', 'shinR', lR[0], lR[1]);
  }
  const r = def.root || [0, 0, 0];
  const root = new THREE.Quaternion().setFromEuler(_e.set(r[0], r[1], r[2]));
  return { q, root };
}
/* Emotes and hunter actions drive limbs over time. */
function emoteAnim(kind, t) {
  if (kind === 'wave') return { override: (aL, aR, lL, lR) => ({ aL: [[0.55, 0.9, 0.15], [Math.sin(t * 9) * 0.7, 1, 0.2]] }), armsFixed: true };
  if (kind === 'cheer') { const u = Math.abs(Math.sin(t * 6)); return { override: () => ({ aL: [[0.4, 1, 0], [0.2 + u * 0.3, 1, 0]], aR: [[-0.4, 1, 0], [-0.2 - u * 0.3, 1, 0]] }), bounce: u * 0.12 }; }
  if (kind === 'clap') { const u = Math.abs(Math.sin(t * 9)); return { override: () => ({ aL: [[0.3, -0.2, 1], [-0.25 - u * 0.5, 0.15, 1]], aR: [[-0.3, -0.2, 1], [0.25 + u * 0.5, 0.15, 1]] }), armsFixed: true, bounce: u * 0.02 }; }
  if (kind === 'shrug') { const u = Math.min(1, t * 3) * (t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) * 3)); return { headP: -0.15 * u, headY: 0.25 * u, override: () => ({ aL: [[0.75, -0.6 + u * 0.4, 0.1], [0.55, 0.6 * u, 0.45]], aR: [[-0.75, -0.6 + u * 0.4, 0.1], [-0.55, 0.6 * u, 0.45]] }), armsFixed: true }; }
  if (kind === 'dance') {
    const s = Math.sin(t * 7);
    return { side: s * 0.35, twist: Math.sin(t * 3.5) * 0.4, headY: s * 0.3, bounce: Math.abs(Math.cos(t * 7)) * 0.06,
      override: () => ({ aL: [[0.9, s * 0.8, 0.3], [0.5, 1, 0.3]], aR: [[-0.9, -s * 0.8, 0.3], [-0.5, 1, 0.3]] }) };
  }
  return {};
}

/* ================= rig instance ================= */
class RigInstance {
  constructor(build, material) {
    this.build = SHAPES[build] ? build : 'classic';
    this.G = rigGeo(this.build);
    const G = this.G, R = RIG;
    this.bones = G.heads.map((_, i) => { const b = new THREE.Bone(); b.name = R.D.bones[i].name; return b; });
    let root = null;
    for (const i of R.order) {
      const p = R.parents[i], b = this.bones[i];
      if (p >= 0) { b.position.copy(G.heads[i]).sub(G.heads[p]); this.bones[p].add(b); } else { b.position.copy(G.heads[i]); root = b; }
    }
    this.mesh = new THREE.SkinnedMesh(G.geo, material);
    this.mesh.add(root); this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.pickGeo = new THREE.BufferGeometry();
    this.pickGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(R.pos.length), 3));
    this.pickGeo.setAttribute('uv', R.attrs.uv); this.pickGeo.setIndex(R.attrs.index);
    this.rootQ = new THREE.Quaternion();
    this._S = this.bones.map(() => new THREE.Matrix4());
  }
  apply(T, k = 1) {
    if (k >= 1) { this.bones.forEach((b, i) => b.quaternion.copy(T.q[i])); this.rootQ.copy(T.root); }
    else { this.bones.forEach((b, i) => b.quaternion.slerp(T.q[i], k)); this.rootQ.slerp(T.root, k); }
  }
  /** Bake the current skeleton pose into pickGeo (mesh-local), for raycasts and bounds. */
  bake() {
    const m = this.mesh; m.updateMatrixWorld(true);
    const sk = m.skeleton, S = this._S;
    for (let i = 0; i < S.length; i++) S[i].multiplyMatrices(m.bindMatrixInverse, sk.bones[i].matrixWorld).multiply(sk.boneInverses[i]).multiply(m.bindMatrix);
    const src = this.G.geo.attributes.position.array, out = this.pickGeo.attributes.position.array, R = RIG;
    const v = new V3(), t = new V3(), acc = new V3();
    for (let k = 0; k < R.count; k++) {
      v.fromArray(src, k * 3); acc.set(0, 0, 0);
      for (let j = 0; j < 4; j++) { const w = R.sw[k * 4 + j]; if (w > 0) acc.addScaledVector(t.copy(v).applyMatrix4(S[R.si[k * 4 + j]]), w); }
      acc.toArray(out, k * 3);
    }
    this.pickGeo.attributes.position.needsUpdate = true;
    this.pickGeo.computeBoundingBox(); this.pickGeo.computeBoundingSphere();
  }
  boneOf(sem) { return this.bones[RIG.B[sem]]; }
  dispose() { this.pickGeo.dispose(); }
}

/* ================= faces (projected onto the head through the UV atlas) ================= */
const EYES = { dots: 'Dots', happy: 'Happy', sleepy: 'Sleepy', sparkle: 'Sparkle', angry: 'Grumpy', derp: 'Derp', cool: 'Cool', cat: 'Cat', xx: 'Dizzy' };
function drawFaceCanvas(style, N) {
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const u = N / 2, ex = u * 0.34, ey = u * 0.95, my = u * 1.38;
  g.fillStyle = '#1b1d22'; g.strokeStyle = '#1b1d22'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = u * 0.07;
  const eye = (x, y, i) => {
    g.beginPath();
    if (style === 'happy') { g.arc(x, y + u * 0.08, u * 0.12, PI * 1.1, PI * 1.9); g.stroke(); }
    else if (style === 'sleepy') { g.moveTo(x - u * 0.12, y + u * 0.04); g.quadraticCurveTo(x, y + u * 0.12, x + u * 0.12, y + u * 0.04); g.stroke(); }
    else if (style === 'angry') { g.ellipse(x, y + u * 0.04, u * 0.08, u * 0.13, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(x - u * 0.15, y - u * 0.18 + (i ? u * 0.07 : 0)); g.lineTo(x + u * 0.15, y - u * 0.18 + (i ? 0 : u * 0.07)); g.stroke(); }
    else if (style === 'derp') { g.ellipse(x, y, i ? u * 0.07 : u * 0.12, i ? u * 0.1 : u * 0.17, 0, 0, 7); g.fill(); }
    else if (style === 'cool') { g.fillRect(x - u * 0.17, y - u * 0.09, u * 0.34, u * 0.17); }
    else if (style === 'cat') { g.ellipse(x, y, u * 0.1, u * 0.15, 0, 0, 7); g.fill(); g.fillStyle = '#f4f4f1'; g.beginPath(); g.ellipse(x, y, u * 0.025, u * 0.11, 0, 0, 7); g.fill(); g.fillStyle = '#1b1d22'; }
    else if (style === 'xx') { const r = u * 0.09; g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
    else { g.ellipse(x, y, u * 0.1, u * 0.16, 0, 0, 7); g.fill(); if (style === 'sparkle') { g.fillStyle = '#fff'; g.beginPath(); g.arc(x - u * 0.03, y - u * 0.06, u * 0.045, 0, 7); g.fill(); g.fillStyle = '#1b1d22'; } }
  };
  eye(u - ex, ey, 0); eye(u + ex, ey, 1);
  if (style === 'cool') g.fillRect(u - ex, ey - u * 0.03, ex * 2, u * 0.05);
  g.fillStyle = 'rgba(255,130,155,.55)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(u + s * ex * 1.45, ey + u * 0.25, u * 0.11, u * 0.07, 0, 0, 7); g.fill(); }
  g.strokeStyle = '#1b1d22'; g.lineWidth = u * 0.055; g.beginPath();
  if (style === 'angry') g.arc(u, my + u * 0.1, u * 0.09, 1.15 * PI, 1.85 * PI);
  else if (style === 'cat') { g.arc(u - u * 0.07, my - u * 0.04, u * 0.07, 0.1 * PI, 0.9 * PI); g.moveTo(u + u * 0.14, my - u * 0.04); g.arc(u + u * 0.07, my - u * 0.04, u * 0.07, 0.1 * PI, 0.9 * PI); }
  else if (style === 'xx' || style === 'derp') { g.ellipse(u, my, u * 0.07, u * 0.09, 0, 0, 7); }
  else g.arc(u, my - u * 0.06, u * 0.09, 0.15 * PI, 0.85 * PI);
  g.stroke();
  return g.getImageData(0, 0, N, N);
}
const FACE_CACHE = {};
function faceLayer(build, style) {
  const key = build + '|' + style;
  if (FACE_CACHE[key]) return FACE_CACHE[key];
  const G = rigGeo(build), R = RIG, P = G.geo.attributes.position.array, N = 192;
  const F = drawFaceCanvas(style, N);
  const hc = G.headCenter, hr = G.headR * 0.98;
  const layer = document.createElement('canvas'); layer.width = layer.height = TS;
  const lg = layer.getContext('2d'), img = lg.createImageData(TS, TS), out = img.data;
  const isHead = (k) => { let w = 0; for (let j = 0; j < 4; j++) if (R.si[k * 4 + j] === R.B.head) w += R.sw[k * 4 + j]; return w > 0.5; };
  const A = new V3(), Bv = new V3(), C = new V3();
  for (let t = 0; t < R.idx.length; t += 3) {
    const i0 = R.idx[t], i1 = R.idx[t + 1], i2 = R.idx[t + 2];
    if (!isHead(i0) || !isHead(i1) || !isHead(i2)) continue;
    A.fromArray(P, i0 * 3); Bv.fromArray(P, i1 * 3); C.fromArray(P, i2 * 3);
    const n = Bv.clone().sub(A).cross(C.clone().sub(A)).normalize();
    if (n.z < 0.15 || Math.max(A.z, Bv.z, C.z) < hc.z) continue;
    const ux = [R.uv[i0 * 2] * TS, R.uv[i1 * 2] * TS, R.uv[i2 * 2] * TS], uy = [(1 - R.uv[i0 * 2 + 1]) * TS, (1 - R.uv[i1 * 2 + 1]) * TS, (1 - R.uv[i2 * 2 + 1]) * TS];
    const x0 = Math.max(0, Math.floor(Math.min(...ux)) - 1), x1 = Math.min(TS - 1, Math.ceil(Math.max(...ux)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...uy)) - 1), y1 = Math.min(TS - 1, Math.ceil(Math.max(...uy)) + 1);
    const den = (uy[1] - uy[2]) * (ux[0] - ux[2]) + (ux[2] - ux[1]) * (uy[0] - uy[2]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const b0 = ((uy[1] - uy[2]) * (px - ux[2]) + (ux[2] - ux[1]) * (py - uy[2])) / den;
      const b1 = ((uy[2] - uy[0]) * (px - ux[2]) + (ux[0] - ux[2]) * (py - uy[2])) / den;
      const b2 = 1 - b0 - b1;
      if (b0 < -0.08 || b1 < -0.08 || b2 < -0.08) continue;
      const wx = A.x * b0 + Bv.x * b1 + C.x * b2, wy = A.y * b0 + Bv.y * b1 + C.y * b2;
      const fx = Math.floor((wx - (hc.x - hr)) / (2 * hr) * N), fy = Math.floor((1 - (wy - (hc.y - hr)) / (2 * hr)) * N);
      if (fx < 0 || fy < 0 || fx >= N || fy >= N) continue;
      const si = (fy * N + fx) * 4, di = (y * TS + x) * 4;
      if (F.data[si + 3] > out[di + 3]) { out[di] = F.data[si]; out[di + 1] = F.data[si + 1]; out[di + 2] = F.data[si + 2]; out[di + 3] = F.data[si + 3]; }
    }
  }
  lg.putImageData(img, 0, 0);
  return (FACE_CACHE[key] = layer);
}

/* ================= chameleon ================= */
const NAMES = ['Kiwi', 'Mango', 'Pickle', 'Basil', 'Mochi', 'Yuzu', 'Pesto', 'Taro', 'Olive', 'Sprout', 'Gumbo', 'Biscuit', 'Noodle', 'Tofu', 'Wasabi', 'Peanut'];
const TAG_COLORS = ['#3ad49c', '#ff7ab3', '#4da3ff', '#ffb057', '#b197fc', '#ffd43b', '#63e6be', '#ff8787', '#74c0fc', '#e599f7'];
const WHITE = '#f4f4f1';

class Cham {
  constructor({ id, name, ownerId = null, local = false, human = false, color = '#3ad49c', shape = 'classic', eyes = 'dots', parent = null }) {
    this.id = id || uid(); this.name = name; this.ownerId = ownerId; this.local = local; this.human = human; this.color = color;
    this.eyes = EYES[eyes] ? eyes : 'dots';
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = TS;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.anisotropy = 4;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85, metalness: 0 });
    this.pickMat = new THREE.MeshBasicMaterial({ visible: false });
    this.root = new THREE.Group(); (parent || scene).add(this.root);
    this.shape = SHAPES[shape] ? shape : 'classic'; this.size = 'normal'; this.pose = 'stand'; this.yaw = 0; this.emote = null; this.emoteT = 0;
    this.body = { pos: this.root.position, vy: 0, onGround: true, r: 0.15, h: CHAM_H };
    this.caught = false; this.isClone = false; this.painted = false; this.speed = 0; this.walkT = 0; this.walkAmt = 0; this.texVer = 0; this.t = Math.random() * 10;
    this.tilt = 0; this.roll = 0; this.rollAxis = new V3(0, 0, 1); this.buried = 0;
    this.root.rotation.order = 'YXZ';
    this.target = null; this.baseY = 0; this.curBaseY = 0; this.dims = new V3(0.4, CHAM_H, 0.3); this.bbCenter = new V3(0, CHAM_H / 2, 0);
    this.blank();
    this.rebuild();
  }
  blank() {
    const g = this.ctx; g.fillStyle = WHITE; g.fillRect(0, 0, TS, TS);
    g.drawImage(faceLayer(this.shape, this.eyes), 0, 0);
    this.tex.needsUpdate = true; this.painted = false; this.texVer++;
  }
  rebuild() {
    if (this.rig) { this.root.remove(this.rig.group); this.rig.dispose(); }
    this.rig = new RigInstance(this.shape, this.mat);
    this.rig.mesh.userData.chamSkin = this;
    this.mesh = new THREE.Mesh(this.rig.pickGeo, this.pickMat);
    this.mesh.userData.cham = this;
    this.rig.mesh.add(this.mesh);
    this.root.add(this.rig.group);
    this.applyPose(true);
  }
  scaleVec() { const [sx, sy] = SIZES[this.size]; return new V3(sx * CHAM_H, sy * CHAM_H, sx * CHAM_H); }
  /** Compute the target pose, bake it for picking and bounds, then (unless snap) blend the visible bones toward it. */
  applyPose(snap = false) {
    const def = POSES[this.pose] || POSES.stand, rig = this.rig;
    const T = poseTargets(rig.G, def, {});
    const keep = snap ? null : rig.bones.map((b) => b.quaternion.clone()), keepRoot = rig.rootQ.clone();
    rig.apply(T, 1);
    rig.group.quaternion.copy(rig.rootQ); rig.group.scale.copy(this.scaleVec()); rig.group.position.set(0, 0, 0);
    rig.bake();
    rig.group.updateMatrix();
    const bb = rig.pickGeo.boundingBox.clone().applyMatrix4(rig.group.matrix);
    this.baseY = -bb.min.y; this.dims = bb.getSize(new V3()); this.bbCenter = bb.getCenter(new V3()); this.bbCenter.y += this.baseY;
    this.body.h = this.dims.y;
    this.body.r = clamp(Math.min(this.dims.x, this.dims.z) / 2, 0.09, 0.24);
    if (def.wall) this.body.r = Math.min(this.body.r, 0.11);
    if (snap) { this.curBaseY = this.baseY; rig.group.position.y = this.baseY; }
    else { rig.bones.forEach((b, i) => b.quaternion.copy(keep[i])); rig.rootQ.copy(keepRoot); rig.group.quaternion.copy(keepRoot); }
    this.target_ = T;
    this.applyOrient();
  }
  setPose(p, snap = false) { if (!POSES[p] || POSES[p].emote) return; this.emote = null; if (p !== this.pose || snap) { this.pose = p; this.applyPose(snap); } }
  setEmote(kind) { this.emote = kind; this.emoteT = 0; if (this.pose !== 'stand') this.setPose('stand'); }
  setShape(s) {
    if (!SHAPES[s] || s === this.shape) return;
    const was = this.painted; this.shape = s;
    if (!was) this.blank();
    this.rebuild();
  }
  setSize(s) { if (SIZES[s]) { this.size = s; this.applyPose(); } }
  setYaw(y) { this.yaw = y; this.applyOrient(); }
  /** Root rotation: roll about the surface normal, then yaw, then tilt (wall-lying = PI/2, ceiling = PI). */
  applyOrient() {
    this.root.rotation.set(this.tilt, this.yaw, 0, 'YXZ');
    if (this.roll) this.root.quaternion.premultiply(_q1.setFromAxisAngle(this.rollAxis, this.roll));
  }
  setOrient(tilt, roll = 0, axis = null) { this.tilt = tilt; this.roll = roll; if (axis) this.rollAxis.copy(axis); this.applyOrient(); }
  /** "Buried" warning: flashes the body red so hunters can see someone pushed too far into the map. */
  setBuried(on) { this.buried = on ? 1 : 0; if (!on) { this.mat.emissive.setRGB(0, 0, 0); this.mat.emissiveIntensity = 1; } }
  halfDepth() { return this.dims.z / 2; }
  center() {
    if (this.tilt || this.roll) { this.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(this.mesh).getCenter(new V3()); }
    const c = this.bbCenter, s = Math.sin(this.yaw), co = Math.cos(this.yaw), p = this.root.position;
    return new V3(p.x + c.x * co + c.z * s, p.y + c.y, p.z - c.x * s + c.z * co);
  }
  animate(dt, moving) {
    this.t += dt;
    if (this.buried) {
      const slow = typeof SETTINGS !== 'undefined' && SETTINGS.calmFlash;
      const f = slow ? 0.45 + 0.35 * Math.sin(this.t * 3) : (Math.sin(this.t * 14) > -0.2 ? 1 : 0.15);
      this.mat.emissive.setRGB(1, 0.06, 0.08); this.mat.emissiveIntensity = f * 0.95;
    }
    const def = POSES[this.pose] || POSES.stand, rig = this.rig;
    const want = moving && def.move ? 1 : 0;
    this.walkAmt = lerp(this.walkAmt, want, Math.min(1, dt * 10));
    if (moving) this.walkT += dt * (def.speed ? 7 : 10.5) * (this.size === 'petite' ? 1.25 : 1) * (this.sprinting ? 1.45 : 1);
    if (moving && this.emote) this.emote = null;
    let anim = { walk: this.walkT, walkAmt: this.walkAmt, breath: Math.sin(this.t * 2.2) * 0.02 * (1 - this.walkAmt) };
    let bounce = 0;
    if (this.emote) { this.emoteT += dt; const e = emoteAnim(this.emote, this.emoteT); bounce = e.bounce || 0; anim = { ...anim, ...e }; if (this.emoteT > 4) this.emote = null; }
    if (!this.body.onGround && def.move) anim.override = (aL, aR, lL, lR) => ({ aL: [[0.7, 0.55, 0.1], [0.6, 0.8, 0.1]], aR: [[-0.7, 0.55, 0.1], [-0.6, 0.8, 0.1]], lL: [[0.1, -0.8, 0.5], [0.05, -1, -0.2]], lR: [[-0.1, -1, -0.15], [-0.05, -1, -0.3]] });
    const T = (this.walkAmt > 0.01 || anim.breath || this.emote || anim.override) ? poseTargets(rig.G, def, anim) : this.target_;
    const k = 1 - Math.exp(-dt * 14);
    rig.apply(T, k); rig.group.quaternion.copy(rig.rootQ);
    /* sprint lean + landing squash */
    this.lean = lerp(this.lean || 0, this.sprinting && moving ? 0.22 : moving ? 0.06 : 0, Math.min(1, dt * 8));
    if (this.lean > 0.002) rig.group.quaternion.premultiply(_lean.setFromAxisAngle(_x, this.lean));
    const air = !this.body.onGround;
    if (this.wasAir && !air && def.move) { this.squash = 0.22; this.landed = true; }
    this.wasAir = air;
    this.squash = Math.max(0, (this.squash || 0) - dt * 1.6);
    const sq = Math.sin(this.squash / 0.22 * Math.PI) * this.squash;
    if (sq > 0.001 || this.squashing) { const sv = this.scaleVec(); rig.group.scale.set(sv.x * (1 + sq * 0.5), sv.y * (1 - sq), sv.z * (1 + sq * 0.5)); this.squashing = sq > 0.001; }
    this.curBaseY = lerp(this.curBaseY, this.baseY, k);
    rig.group.position.y = this.curBaseY + Math.abs(Math.sin(this.walkT)) * (this.sprinting ? 0.05 : 0.035) * this.walkAmt + bounce;
  }
  rebake() { this.rig.bake(); }
  paintDot(uv, rgb, r, hit = null) {
    if (hit) return this.paintSurface(hit, rgb, r);
    const g = this.ctx, x = uv.x * TS, y = (1 - uv.y) * TS;
    g.fillStyle = Array.isArray(rgb) ? `rgb(${clamp(rgb[0], 0, 255) | 0},${clamp(rgb[1], 0, 255) | 0},${clamp(rgb[2], 0, 255) | 0})` : rgb;
    g.beginPath(); g.arc(x, y, Math.max(0.8, r * PSCALE), 0, 7); g.fill();
    this.painted = true; this.dirty = true;
  }
  // Rasterise the world-space footprint into each intersecting UV triangle.
  // An atlas-space circle paints unrelated limbs and skips skin across UV seams.
  paintSurface(hit, rgb, r) {
    const mesh = hit.object || this.mesh, geo = mesh.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, ix = geo.index;
    mesh.updateWorldMatrix(true, false);
    const world = this._brushWorld?.length === pos.count * 3 ? this._brushWorld : (this._brushWorld = new Float32Array(pos.count * 3));
    const v = new V3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); v.toArray(world, i * 3); }
    const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
    const radius = Math.max(0.002, r / 118), rr = radius * radius, p = hit.point;
    const tris = []; let minX = TS, minY = TS, maxX = -1, maxY = -1;
    for (let t = 0, count = ix ? ix.count : pos.count; t < count; t += 3) {
      const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
      const ax = world[a * 3], ay = world[a * 3 + 1], az = world[a * 3 + 2];
      const bx = world[b * 3], by = world[b * 3 + 1], bz = world[b * 3 + 2];
      const cx = world[c * 3], cy = world[c * 3 + 1], cz = world[c * 3 + 2];
      const dx = p.x - clamp(p.x, Math.min(ax, bx, cx), Math.max(ax, bx, cx));
      const dy = p.y - clamp(p.y, Math.min(ay, by, cy), Math.max(ay, by, cy));
      const dz = p.z - clamp(p.z, Math.min(az, bz, cz), Math.max(az, bz, cz));
      if (dx * dx + dy * dy + dz * dz > rr) continue;
      const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
      if ((aby * acz - abz * acy) * normal.x + (abz * acx - abx * acz) * normal.y + (abx * acy - aby * acx) * normal.z <= 0) continue;
      const x0 = uv.getX(a) * TS, y0 = (1 - uv.getY(a)) * TS;
      const x1 = uv.getX(b) * TS, y1 = (1 - uv.getY(b)) * TS, x2 = uv.getX(c) * TS, y2 = (1 - uv.getY(c)) * TS;
      const det = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0); if (Math.abs(det) < 1e-8) continue;
      const l = clamp(Math.floor(Math.min(x0, x1, x2)), 0, TS - 1), top = clamp(Math.floor(Math.min(y0, y1, y2)), 0, TS - 1);
      const right = clamp(Math.ceil(Math.max(x0, x1, x2)), 0, TS - 1), bottom = clamp(Math.ceil(Math.max(y0, y1, y2)), 0, TS - 1);
      tris.push({ ax, ay, az, abx, aby, abz, acx, acy, acz, x0, y0, x1, y1, x2, y2, det, l, top, right, bottom });
      minX = Math.min(minX, l); minY = Math.min(minY, top); maxX = Math.max(maxX, right); maxY = Math.max(maxY, bottom);
    }
    if (!tris.length) return;
    const img = this.ctx.getImageData(minX, minY, maxX - minX + 1, maxY - minY + 1), data = img.data;
    const col = Array.isArray(rgb) ? rgb : (() => { const c = new THREE.Color(rgb); return [c.r * 255, c.g * 255, c.b * 255]; })();
    let changed = false;
    for (const t of tris) {
      for (let y = t.top; y <= t.bottom; y++) for (let x = t.l; x <= t.right; x++) {
        const px = x + 0.5 - t.x0, py = y + 0.5 - t.y0;
        const b = (px * (t.y2 - t.y0) - py * (t.x2 - t.x0)) / t.det;
        const c = ((t.x1 - t.x0) * py - (t.y1 - t.y0) * px) / t.det;
        if (b < -1e-6 || c < -1e-6 || b + c > 1.000001) continue;
        const dx = t.ax + b * t.abx + c * t.acx - p.x, dy = t.ay + b * t.aby + c * t.acy - p.y, dz = t.az + b * t.abz + c * t.acz - p.z;
        if (dx * dx + dy * dy + dz * dz > rr) continue;
        const k = ((y - minY) * img.width + x - minX) * 4;
        data[k] = col[0]; data[k + 1] = col[1]; data[k + 2] = col[2]; data[k + 3] = 255; changed = true;
      }
    }
    if (changed) { this.ctx.putImageData(img, minX, minY); this.painted = true; this.dirty = true; }
  }
  fill(rgb) { this.ctx.fillStyle = rgb; this.ctx.fillRect(0, 0, TS, TS); this.painted = true; this.dirty = true; }
  flush() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; this.texVer++; } }
  avgColors(n = 6) {
    const d = this.ctx.getImageData(0, 0, TS, TS).data, out = [];
    for (let i = 0; i < n * 4 && out.length < n; i++) { const k = ((Math.random() * TS * TS) | 0) * 4; out.push(`rgb(${d[k]},${d[k + 1]},${d[k + 2]})`); }
    return out;
  }
  copyFrom(o) {
    this.shape = o.shape; this.size = o.size; this.pose = o.pose; this.yaw = o.yaw;
    this.ctx.drawImage(o.canvas, 0, 0); this.painted = true; this.tex.needsUpdate = true;
    this.mat.roughness = o.mat.roughness; this.mat.metalness = o.mat.metalness;
    this.tilt = o.tilt; this.roll = o.roll; this.rollAxis.copy(o.rollAxis);
    this.rebuild(); this.root.position.copy(o.root.position); this.applyPose(true);
  }
  texURL() { return this.canvas.toDataURL('image/webp', 0.85); }
  loadTex(url) {
    const img = new Image();
    img.onload = () => { this.ctx.drawImage(img, 0, 0, TS, TS); this.tex.needsUpdate = true; this.painted = true; };
    img.src = url;
  }
  dispose() { this.root.parent?.remove(this.root); this.tex.dispose(); this.mat.dispose(); this.rig.dispose(); }
}

/* ================= hunter avatars ================= */
const HUNTER_COLORS = ['#ff6b3d', '#3d8bff', '#b04dff', '#ff4d6d', '#2fbf71', '#ffb020', '#20c4d8', '#5b5f6b', '#1d1f26', '#f2f2f2'];
const HATS = { cap: 'Cap', beanie: 'Beanie', cowboy: 'Cowboy', chef: 'Chef', bunny: 'Bunny ears', tophat: 'Top hat', halo: 'Halo', crown: 'Crown', none: 'None' };
const VISORS = { visor: 'Visor', shades: 'Shades', goggles: 'Goggles', mask: 'Hero mask', none: 'Bare' };
const TOOLS = { hammer: 'Toy hammer', pan: 'Frying pan', baguette: 'Baguette', fish: 'Fish', plunger: 'Plunger', bat: 'Bat' };
function buildTool(kind) {
  const g = new THREE.Group();
  const M = (geo, col, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.5, metal = 0) => { const m = new THREE.Mesh(geo, cm(col, rough, metal)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  if (kind === 'pan') { M(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), '#3a2a20', 0, 0.21, 0); M(new THREE.CylinderGeometry(0.22, 0.2, 0.05, 24), '#2d2f33', 0, 0.62, 0, Math.PI / 2, 0, 0, 0.35, 0.6); }
  else if (kind === 'fish') { M(new THREE.SphereGeometry(0.14, 16, 10), '#5aa9d6', 0, 0.5, 0, 0, 0, 0, 0.3).scale.set(0.7, 2.4, 1); M(new THREE.ConeGeometry(0.13, 0.2, 3), '#3f7fb0', 0, 0.12, 0, Math.PI, 0, 0); M(new THREE.SphereGeometry(0.025, 8, 6), '#111', 0.06, 0.78, 0.09); }
  else if (kind === 'baguette') { M(new THREE.CapsuleGeometry(0.07, 0.75, 6, 12), '#d9a05b', 0, 0.42, 0, 0, 0, 0.05, 0.9); }
  else if (kind === 'bat') { M(new THREE.CylinderGeometry(0.08, 0.03, 0.85, 14), '#c9975e', 0, 0.42, 0, 0, 0, 0, 0.6); }
  else if (kind === 'plunger') { M(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 10), '#c9975e', 0, 0.31, 0); M(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#d23a3a', 0, 0.66, 0, Math.PI, 0, 0, 0.4); }
  else { M(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 10), '#c9975e', 0, 0.37, 0, 0, 0, 0, 0.6); M(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 16), '#ff4d6d', 0, 0.78, 0, 0, 0, Math.PI / 2); }
  return g;
}
/** Head accessories in head-radius units, origin at the head centre, +Z = face. */
function buildHeadGear(av) {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0, rough = 0.6, metal = 0) => { const m = new THREE.Mesh(geo, cm(color, rough, metal)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  const v = av.visor || 'visor';
  if (v === 'visor') { const m = add(new THREE.SphereGeometry(1.03, 28, 12, -0.95, 1.9, 1.25, 0.6), '#111318', 0, 0, 0, 0, 0, 0, 0.12, 0.7); m.material.side = THREE.DoubleSide; }
  else if (v === 'shades') { for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.55, 0.3, 0.1), '#0d0d10', s * 0.36, 0.08, 0.96, 0, s * 0.25, 0, 0.1, 0.5); add(new THREE.BoxGeometry(0.3, 0.07, 0.08), '#0d0d10', 0, 0.14, 1.02); }
  else if (v === 'goggles') { add(new THREE.TorusGeometry(1.02, 0.08, 8, 32), '#2b2b2b', 0, 0.12, 0, Math.PI / 2, 0, 0); for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18), '#a9e4ff', s * 0.36, 0.12, 0.92, Math.PI / 2, 0, s * 0.3, 0.1, 0.3); }
  else if (v === 'mask') { const m = add(new THREE.SphereGeometry(1.04, 28, 10, -1.1, 2.2, 1.3, 0.42), '#e03131', 0, 0, 0, 0, 0, 0, 0.5); m.material.side = THREE.DoubleSide; for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.13, 10, 8), '#ffffff', s * 0.36, 0.1, 1.0); }
  else { for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.12, 10, 8), '#111', s * 0.34, 0.1, 0.92); }
  const h = av.hat || 'cap';
  if (h === 'cap') { add(new THREE.SphereGeometry(1.06, 24, 12, 0, PI * 2, 0, PI / 2), '#20242c', 0, 0.15, 0); add(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20, 1, false, -PI / 2, PI), '#20242c', 0, 0.2, 0.55); }
  else if (h === 'tophat') { add(new THREE.CylinderGeometry(1.35, 1.35, 0.08, 28), '#151518', 0, 0.85, 0); add(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 24), '#151518', 0, 1.6, 0); add(new THREE.CylinderGeometry(0.81, 0.81, 0.22, 24), '#b8323d', 0, 1.0, 0); }
  else if (h === 'cowboy') { add(new THREE.CylinderGeometry(1.8, 1.8, 0.08, 28), '#8a5a2b', 0, 0.75, 0).scale.set(1, 1, 0.85); add(new THREE.CylinderGeometry(0.8, 0.95, 0.85, 20), '#8a5a2b', 0, 1.15, 0); }
  else if (h === 'beanie') { add(new THREE.SphereGeometry(1.07, 24, 12, 0, PI * 2, 0, PI / 2), '#e8590c', 0, 0.1, 0); add(new THREE.SphereGeometry(0.25, 10, 8), '#fff', 0, 1.2, 0); }
  else if (h === 'crown') { const c = add(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 8, 1, true), '#ffd43b', 0, 1.0, 0, 0, 0, 0, 0.3, 0.8); c.material.side = THREE.DoubleSide; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; add(new THREE.ConeGeometry(0.14, 0.34, 6), '#ffd43b', Math.cos(a) * 0.83, 1.42, Math.sin(a) * 0.83, 0, 0, 0, 0.3, 0.8); } }
  else if (h === 'bunny') { for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.2, 1.1, 4, 10), '#ffffff', s * 0.42, 1.55, 0, 0, 0, s * -0.15); }
  else if (h === 'chef') { add(new THREE.CylinderGeometry(0.85, 0.8, 0.9, 20), '#ffffff', 0, 1.1, 0); add(new THREE.SphereGeometry(1.0, 20, 12), '#ffffff', 0, 1.75, 0).scale.set(1, 0.6, 1); }
  else if (h === 'halo') { const m = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 10, 32), new THREE.MeshBasicMaterial({ color: '#ffe066' })); m.position.set(0, 1.55, 0); m.rotation.x = PI / 2; g.add(m); }
  return g;
}
const HOLD = { arm: [[0.35, -0.75, 0.55], [0.08, 0.05, 1]] };
function buildHunterModel(av) {
  const col = av.color || HUNTER_COLORS[0];
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05 });
  const rig = new RigInstance('classic', mat);
  rig.group.scale.setScalar(HUNTER_H);
  const G = rig.G, hb = rig.boneOf('head');
  const gear = buildHeadGear(av);
  gear.position.copy(G.headCenter).sub(G.heads[RIG.B.head]); gear.scale.setScalar(G.headR);
  hb.add(gear);
  /* field kit: backpack with a lit antenna and a badge, so hunters read as a uniformed team, not big chameleons */
  {
    const bb = rig.pickGeo.boundingBox || (rig.pickGeo.computeBoundingBox(), rig.pickGeo.boundingBox);
    const sp = rig.boneOf('sp3'), at = G.heads[RIG.B.sp3];
    const dark = new THREE.Color(col).multiplyScalar(0.45);
    const pack = new THREE.Group(); pack.position.set(-at.x, -at.y, -at.z); sp.add(pack);
    const m = (geo, c, x, y, z, rough = 0.7, metal = 0, basic = false) => { const o = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color: c }) : cm(c, rough, metal)); o.position.set(x, y, z); o.castShadow = true; pack.add(o); return o; };
    const backZ = bb.min.z - 0.075, cy = at.y + 0.02;
    m(new THREE.BoxGeometry(0.2, 0.21, 0.13), dark, 0, cy, backZ + 0.02, 0.8); m(new THREE.BoxGeometry(0.21, 0.04, 0.14), new THREE.Color(col).multiplyScalar(0.8), 0, cy + 0.1, backZ + 0.02, 0.6);
    m(new THREE.BoxGeometry(0.15, 0.07, 0.04), '#2a2d36', 0, cy - 0.05, backZ - 0.06, 0.6);
    m(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), '#1d1f26', 0.07, cy + 0.17, backZ, 0.4, 0.6);
    m(new THREE.SphereGeometry(0.014, 8, 6), '#ff4d4d', 0.07, cy + 0.255, backZ, 0, 0, true);
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.025, 0.24, 0.012), '#2a2d36', s * 0.07, cy + 0.01, bb.max.z * 0.85, 0.7);
    const badge = m(new THREE.CircleGeometry(0.03, 5), '#ffd23f', 0.05, cy + 0.06, bb.max.z + 0.004, 0.3, 0.6); badge.rotation.z = Math.PI / 2;
  }
  const tool = buildTool(av.tool || 'hammer');
  const fore = rig.boneOf('foreL');
  const hold = new THREE.Group(); hold.position.copy(G.tails[RIG.B.foreL]).sub(G.heads[RIG.B.foreL]).multiplyScalar(0.92);
  tool.scale.setScalar(0.85 / HUNTER_H); tool.position.y = -0.1 / HUNTER_H; hold.add(tool); fore.add(hold);
  const group = new THREE.Group(); group.add(rig.group);
  const def = { ...STAND, arm: HOLD.arm };
  let walkT = 0, walkAmt = 0, t = Math.random() * 10;
  const T0 = poseTargets(G, def, {}); rig.apply(T0, 1);
  rig.group.updateMatrix(); rig.bake();
  const minY = rig.pickGeo.boundingBox.min.y * HUNTER_H; rig.group.position.y = -minY;
  const anim = (dt, speed, swing) => {
    t += dt;
    walkAmt = lerp(walkAmt, clamp(speed / 3, 0, 1), Math.min(1, dt * 8)); walkT += dt * (5 + speed * 1.6);
    const a = { walk: walkT, walkAmt, breath: Math.sin(t * 2) * 0.02, armsFixed: true };
    if (swing > 0) {
      const p = 1 - swing / 0.35, up = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
      a.override = (aL, aR) => ({ aL: [[0.3, lerp(-0.4, 1, up), lerp(1, 0.25, up)], [0.05, lerp(-0.6, 0.6, up), lerp(1, -0.2, up)]], aR });
      a.bend = (1 - up) * 0.25;
    }
    rig.apply(poseTargets(G, def, a), 1 - Math.exp(-dt * 18));
  };
  return { group, tool, rig, anim, mat };
}

/* ================= profile + progression ================= */
const UNLOCKS = {
  shape: { classic: 1, slim: 1, chunky: 3, bighead: 5, stubby: 7 },
  eyes: { dots: 1, happy: 1, sleepy: 2, sparkle: 3, cat: 5, angry: 6, derp: 8, xx: 10, cool: 12 },
  hat: { cap: 1, beanie: 1, none: 1, cowboy: 2, chef: 4, bunny: 6, tophat: 8, halo: 10, crown: 14 },
  visor: { visor: 1, none: 1, shades: 3, goggles: 5, mask: 9 },
  tool: { hammer: 1, pan: 2, baguette: 4, fish: 6, plunger: 9, bat: 11 },
};
const xpForLevel = (l) => 120 + (l - 1) * 60;
function levelInfo(xp) {
  let l = 1, need = xpForLevel(1), x = xp;
  while (x >= need) { x -= need; l++; need = xpForLevel(l); }
  return { level: l, into: x, need };
}
const DEFAULT_PROFILE = { name: 'Player' + Math.floor(Math.random() * 900 + 100), tag: TAG_COLORS[0], xp: 0, stats: { games: 0, wins: 0, survived: 0, found: 0, taunts: 0, bestScore: 0 }, cham: { shape: 'classic', eyes: 'dots' }, hunter: { color: HUNTER_COLORS[0], hat: 'cap', visor: 'visor', tool: 'hammer' } };
const PROFILE = (() => {
  const p = JSON.parse(localStorage.getItem('mc_profile') || 'null');
  const out = p ? { ...DEFAULT_PROFILE, ...p, stats: { ...DEFAULT_PROFILE.stats, ...(p.stats || {}) }, cham: { ...DEFAULT_PROFILE.cham, ...(p.cham || {}) }, hunter: { ...DEFAULT_PROFILE.hunter, ...(p.hunter || {}) } } : JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  if (!SHAPES[out.cham.shape]) out.cham.shape = 'classic';
  if (!EYES[out.cham.eyes]) out.cham.eyes = 'dots';
  return out;
})();
function saveProfile() { localStorage.setItem('mc_profile', JSON.stringify(PROFILE)); }
saveProfile();
const myLevel = () => levelInfo(PROFILE.xp || 0).level;
const unlockLevel = (kind, key) => UNLOCKS[kind]?.[key] ?? 1;
const isUnlocked = (kind, key) => myLevel() >= unlockLevel(kind, key);
function sanitizeProfile() {
  const fix = (obj, field, kind, def) => { if (!isUnlocked(kind, obj[field])) obj[field] = def; };
  fix(PROFILE.cham, 'shape', 'shape', 'classic'); fix(PROFILE.cham, 'eyes', 'eyes', 'dots');
  fix(PROFILE.hunter, 'hat', 'hat', 'cap'); fix(PROFILE.hunter, 'visor', 'visor', 'visor'); fix(PROFILE.hunter, 'tool', 'tool', 'hammer');
}
sanitizeProfile(); saveProfile();
function randomHunterAvatar(i) { return { color: HUNTER_COLORS[i % HUNTER_COLORS.length], hat: Object.keys(HATS)[i % 8], visor: Object.keys(VISORS)[i % 4], tool: Object.keys(TOOLS)[i % 6] }; }

/* ================= preview (separate renderer) ================= */
const Preview = (() => {
  let r = null, sc, cam, obj = null, cham = null, hunter = null, spin = 0, running = false, canvasSel = '#previewCanvas', poseT = 0, poseI = 0, last = 0, drag = null;
  function ensure() {
    const canvas = $(canvasSel);
    if (r && r.domElement === canvas) return;
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x4a5466, 0.85));
    const d = new THREE.DirectionalLight(0xffffff, 0.75); d.position.set(2, 4, 3); d.castShadow = true; d.shadow.mapSize.set(1024, 1024); sc.add(d);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshStandardMaterial({ color: 0x2a3142, roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; sc.add(fl);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.13, 64), new THREE.MeshBasicMaterial({ color: 0x3ad49c })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; sc.add(ring);
    cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    canvas.onpointerdown = (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => { if (drag != null) { spin += (e.clientX - drag) * 0.01; drag = e.clientX; } };
    canvas.onpointerup = () => { drag = null; };
  }
  function clear() { if (obj) { sc.remove(obj); obj = null; } if (cham) { cham.dispose(); cham = null; } hunter = null; }
  function showCham(shape, eyes, pose) {
    ensure(); clear();
    cham = new Cham({ name: 'preview', shape, eyes, parent: sc });
    cham.setPose(pose || 'stand', true);
    obj = cham.root; poseI = 0; poseT = 0;
    cam.position.set(0, 0.95, 4.2); cam.lookAt(0, 0.62, 0);
  }
  function showHunter(av) {
    ensure(); clear();
    hunter = buildHunterModel(av); obj = hunter.group; sc.add(obj);
    cam.position.set(0, 1.35, 5.2); cam.lookAt(0, 0.95, 0);
  }
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const cv = $(canvasSel), w = cv.clientWidth, h = cv.clientHeight;
    if (w && (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio()))) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    if (drag == null) spin += dt * 0.35;
    if (obj) obj.rotation.y = Math.sin(spin) * 0.8;
    if (cham) {
      poseT += dt;
      if (Preview.cycle && poseT > 2.6) { poseT = 0; poseI = (poseI + 1) % Preview.cycle.length; const p = Preview.cycle[poseI]; if (POSES[p].emote) cham.setEmote(p); else cham.setPose(p); }
      cham.animate(dt, false);
    }
    if (hunter) hunter.anim(dt, 0, 0);
    r.render(sc, cam); requestAnimationFrame(loop);
  }
  return {
    cycle: ['stand', 'wave', 'star', 'crouch', 'dance', 'thinker', 'reach', 'cheer'],
    showCham, showHunter,
    start(sel) { if (sel) canvasSel = sel; ensure(); if (!running) { running = true; last = 0; requestAnimationFrame(loop); } },
    stop() { running = false; },
    get cham() { return cham; },
  };
})();
