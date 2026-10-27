'use strict';
/* Meccha Chameleon: simulation. Sound, AI camouflage, hunters, sessions (solo / party / online), abilities,
   the walkable lobby hub, network sync, effects, input and the main loop. UI lives in ui.js. */

/* ================= sound ================= */
const Sound = (() => {
  let ac = null, master = null;
  const init = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = SETTINGS.vol; master.connect(ac.destination);
  };
  const out = (pos) => {
    if (!pos) return master;
    const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(master); return p;
  };
  const osc = (type, f0, f1, t0, dur, vol, dest) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  const noise = (t0, dur, vol, freq, dest) => {
    const len = Math.max(1, (ac.sampleRate * dur) | 0), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(dest); s.start(t0);
  };
  const ok = () => !!ac;
  return {
    init,
    setVolume(v) { if (master) master.gain.value = v; },
    listener(cam) {
      if (!ac) return;
      const l = ac.listener, p = cam.position;
      const f = new V3(0, 0, -1).applyQuaternion(cam.quaternion), u = new V3(0, 1, 0).applyQuaternion(cam.quaternion);
      if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z; }
      else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    },
    whistle(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('sine', 1250, 2100, t, 0.2, 0.32, d); osc('sine', 2100, 1150, t + 0.22, 0.32, 0.32, d); },
    chirp(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('sine', 2600, 3400, t, 0.07, 0.22, d); osc('sine', 2800, 3600, t + 0.1, 0.07, 0.2, d); },
    ping(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('sine', 1400, 380, t, 0.55, 0.28, d); osc('sine', 1400, 380, t + 0.18, 0.5, 0.1, d); },
    bonk(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); osc('triangle', 240, 70, t, 0.25, 0.5, d); noise(t, 0.1, 0.5, 900, d); },
    thud() { if (!ok()) return; osc('sine', 140, 60, ac.currentTime, 0.12, 0.25, master); },
    swoosh(pos) { if (!ok()) return; noise(ac.currentTime, 0.18, 0.25, 600, out(pos)); },
    shoot() { if (!ok()) return; const t = ac.currentTime; noise(t, 0.08, 0.35, 1400, master); osc('square', 320, 120, t, 0.09, 0.08, master); },
    splatHit(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); noise(t, 0.16, 0.6, 500, d); osc('sine', 180, 90, t, 0.12, 0.2, d); },
    pop(pos) { if (!ok()) return; const t = ac.currentTime, d = out(pos); noise(t, 0.35, 0.7, 1800, d); osc('sine', 500, 1500, t, 0.18, 0.3, d); },
    horn() { if (!ok()) return; const t = ac.currentTime; [196, 247, 294].forEach((f, i) => osc('sawtooth', f, f, t + i * 0.03, 0.7, 0.09, master)); },
    tick() { if (!ok()) return; osc('square', 1100, null, ac.currentTime, 0.04, 0.05, master); },
    click() { if (!ok()) return; osc('sine', 720, null, ac.currentTime, 0.05, 0.08, master); },
    hover() { if (!ok()) return; osc('sine', 1200, null, ac.currentTime, 0.025, 0.03, master); },
    splat() { if (!ok()) return; noise(ac.currentTime, 0.05, 0.12, 2800, master); },
    jump() { if (!ok()) return; osc('sine', 280, 620, ac.currentTime, 0.14, 0.12, master); },
    boing() { if (!ok()) return; osc('triangle', 180, 900, ac.currentTime, 0.35, 0.22, master); },
    ready(on) { if (!ok()) return; const t = ac.currentTime; (on ? [660, 990] : [660, 440]).forEach((f, i) => osc('triangle', f, null, t + i * 0.08, 0.14, 0.14, master)); },
    alert(pos) { if (!ok()) return; osc('square', 700, 1400, ac.currentTime, 0.14, 0.12, out(pos)); },
    chat() { if (!ok()) return; osc('sine', 880, 1320, ac.currentTime, 0.08, 0.08, master); },
    win() { if (!ok()) return; const t = ac.currentTime; [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, null, t + i * 0.12, 0.3, 0.2, master)); },
    lose() { if (!ok()) return; const t = ac.currentTime; [392, 330, 262].forEach((f, i) => osc('triangle', f, null, t + i * 0.16, 0.35, 0.2, master)); },
    levelup() { if (!ok()) return; const t = ac.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => osc('sine', f, null, t + i * 0.07, 0.4, 0.16, master)); },
  };
})();

function textSprite(text, bg = '#3ad49c', fg = '#06261a', scale = 0.55) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = '600 44px Segoe UI, system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 44; c.width = w; c.height = 72;
  g.font = '600 44px Segoe UI, system-ui, sans-serif';
  g.fillStyle = bg; const r = 30; g.beginPath(); g.moveTo(r, 4); g.arcTo(w - 4, 4, w - 4, 68, r); g.arcTo(w - 4, 68, 4, 68, r); g.arcTo(4, 68, 4, 4, r); g.arcTo(4, 4, w - 4, 4, r); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 38);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(scale * w / 72, scale, 1); s.renderOrder = 10;
  return s;
}

/* ================= AI camouflage & hiding spots ================= */
const rcBody = new THREE.Raycaster();
const SKILLS = {
  sloppy: { grid: [18, 26], dot: 7.5, noise: 30, vps: 1, miss: 0.75 },
  medium: { grid: [30, 44], dot: 4.4, noise: 14, vps: 2, miss: 0.2 },
  good: { grid: [42, 60], dot: 3.3, noise: 6, vps: 3, miss: 0 },
};
function ndcRect(bb, cam) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const v = new V3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    v.applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -0.12) return null;
    v.applyMatrix4(cam.projectionMatrix);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, y0, x1, y1 };
}
/* Renders a body with its UVs encoded as colour (12 bits per axis) so autoCamo can read UVs per pixel. */
const UVPASS = (() => {
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec2 q = floor(clamp(vUv, 0.0, 1.0) * 4095.0 + 0.5); float uh = floor(q.x / 16.0), ul = q.x - uh * 16.0, vh = floor(q.y / 16.0), vl = q.y - vh * 16.0; gl_FragColor = vec4(uh / 255.0, (ul * 16.0 + vl) / 255.0, vh / 255.0, 1.0); }',
    side: THREE.DoubleSide,
  });
  const sc = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; sc.add(mesh);
  const rts = {};
  return { scene: sc, mesh, target(w, h) { const k = w + 'x' + h; return rts[k] || (rts[k] = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })); } };
})();
function autoCamo(ch, skillKey) {
  const S = SKILLS[skillKey] || SKILLS.medium;
  ch.root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ch.mesh), c = bb.getCenter(new V3());
  const near = envNear(c, 10);
  let acc = [0, 0, 0], n = 0, rough = 0.85;
  const dirs = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, d = new V3(Math.sin(a), 0, Math.cos(a));
    const h = envHit(c, d, 14), free = h ? h.distance : 14;
    dirs.push({ d, free, a });
    if (h && h.distance < 2.5) { const col = surfaceColor(h); acc = acc.map((v, k) => v + col[k]); n++; }
  }
  const down = envHit(c, new V3(0, -1, 0), 5);
  if (down) { const col = surfaceColor(down); acc = acc.map((v, k) => v + col[k] * 3); n += 3; }
  if (n) ch.fill(`rgb(${acc[0] / n | 0},${acc[1] / n | 0},${acc[2] / n | 0})`);
  dirs.sort((p, q) => q.free - p.free);
  const chosen = [];
  for (const d of dirs) { if (chosen.every((o) => Math.abs(angDiff(o.a, d.a)) > 0.75)) chosen.push(d); if (chosen.length >= S.vps) break; }
  chosen.reverse();
  const vc = new THREE.PerspectiveCamera(50, 1, 0.05, 60), ndc = new THREE.Vector2();
  const size = bb.getSize(new V3()), tpm = RIG.texelsPerUnit / (CHAM_H * SIZES[ch.size][0]);
  const maxDim = Math.max(size.x, size.y, size.z);
  UVPASS.mesh.geometry = ch.mesh.geometry; UVPASS.mesh.matrix.copy(ch.mesh.matrixWorld);
  for (const vp of chosen) {
    const low = size.y < 0.8;
    const V = c.clone().addScaledVector(vp.d, Math.max(1.5, Math.min(vp.free - 0.4, low ? 3 : 4.5)));
    V.y = Math.max(1.6, c.y + 0.6);
    vc.position.copy(V); vc.lookAt(c); vc.updateMatrixWorld(); vc.clearViewOffset(); vc.updateProjectionMatrix();
    const r = ndcRect(bb, vc); if (!r) continue;
    const [gx, gy] = S.grid;
    const cell = maxDim / Math.min(gx, gy);
    const dot = Math.max(S.dot, cell * tpm * 0.75 / PSCALE);
    // GPU pass: which body UV is under each grid cell from this viewpoint
    const FW = gx * 2 / (r.x1 - r.x0), FH = gy * 2 / (r.y1 - r.y0);
    vc.setViewOffset(FW, FH, (r.x0 + 1) / 2 * FW, (1 - r.y1) / 2 * FH, gx, gy);
    const rt = UVPASS.target(gx, gy), buf = new Uint8Array(gx * gy * 4);
    renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(UVPASS.scene, vc);
    renderer.readRenderTargetPixels(rt, 0, 0, gx, gy, buf); renderer.setRenderTarget(null); renderer.setClearColor(scene.background || 0x000000, 1);
    vc.clearViewOffset(); vc.updateProjectionMatrix();
    const minD = V.distanceTo(c) - maxDim * 0.6, uv = new THREE.Vector2();
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const k = (j * gx + i) * 4; if (buf[k + 3] < 200) continue;
      uv.set((buf[k] * 16 + (buf[k + 1] >> 4)) / 4095, (buf[k + 2] * 16 + (buf[k + 1] & 15)) / 4095);
      ndc.set(lerp(r.x0, r.x1, (i + 0.5) / gx), lerp(r.y0, r.y1, (j + 0.5) / gy));
      rcBody.setFromCamera(ndc, vc); rcBody.far = 70;
      const hits = rcBody.intersectObjects(near, false);
      const h2 = hits.find((h) => h.distance > minD); if (!h2) continue;
      const col = surfaceColor(h2), nz = S.noise;
      ch.paintDot(uv, [col[0] + rand(-nz, nz), col[1] + rand(-nz, nz), col[2] + rand(-nz, nz)], dot);
      if (vp === chosen[chosen.length - 1] && i === gx >> 1 && j === gy >> 1) rough = h2.object.material.roughness ?? 0.85;
    }
  }
  if (Math.random() < S.miss) {
    const g = ch.ctx; g.fillStyle = WHITE;
    g.beginPath(); g.ellipse(rand(0.1, 0.9) * TS, rand(0.1, 0.9) * TS, rand(16, 30), rand(20, 36), rand(0, 3), 0, 7); g.fill();
  }
  ch.mat.roughness = rough;
  ch.flush(); ch.tex.needsUpdate = true;
}
function snapToWall(P, maxDist = 1.4) {
  const c = P.root.position.clone(); c.y += 0.6;
  let best = null;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, h = envHit(c, new V3(Math.sin(a), 0, Math.cos(a)), maxDist);
    if (h && h.face && (!best || h.distance < best.distance)) best = h;
  }
  if (!best) return false;
  const n = best.face.normal.clone().transformDirection(best.object.matrixWorld); n.y = 0;
  if (n.lengthSq() < 0.1) return false; n.normalize();
  const depth = P.halfDepth();
  P.root.position.x = best.point.x + n.x * (depth + 0.02);
  P.root.position.z = best.point.z + n.z * (depth + 0.02);
  P.setYaw(Math.atan2(n.x, n.z));
  return true;
}
const FLOOR_POSES = ['lie', 'prone', 'side', 'curl', 'crouch', 'kneel', 'curl'];
function findSpot(ch, taken) {
  const zones = ZONES.filter((z) => !z.hunters), hs = MAP.hunterSpawns;
  for (let tries = 0; tries < 500; tries++) {
    const zn = pick(zones), roll = Math.random();
    let s = null;
    if (roll < 0.5) {
      const x = rand(zn.x0 + 0.5, zn.x1 - 0.5), z = rand(zn.z0 + 0.5, zn.z1 - 0.5);
      if (!freeAt(x, z, 0.22, 0.9)) continue;
      const pose = Math.random() < 0.3 ? 'star' : 'flat';
      ch.root.position.set(x, 0, z); ch.setPose(pose, true);
      if (!snapToWall(ch, 2.5)) continue;
      s = { x: ch.root.position.x, y: 0, z: ch.root.position.z, yaw: ch.yaw, pose };
      if (!freeAt(s.x, s.z, 0.1, 0.85)) continue;
      if (pose === 'star') { const sd = new V3(Math.cos(s.yaw), 0, -Math.sin(s.yaw)); if (!freeAt(s.x + sd.x * 0.3, s.z + sd.z * 0.3, 0.08, 0.8) || !freeAt(s.x - sd.x * 0.3, s.z - sd.z * 0.3, 0.08, 0.8)) continue; }
    } else if (roll < 0.78) {
      const ts = tops.filter((t) => t.zone === zn.id && t.w > 0.7 && t.d > 0.5);
      if (!ts.length) continue;
      const t = pick(ts), long = Math.max(t.w, t.d) > 1.6;
      s = { x: t.x + rand(-1, 1) * Math.max(0, t.w / 2 - (long && t.w > t.d ? 0.8 : 0.4)), y: t.y, z: t.z + rand(-1, 1) * Math.max(0, t.d / 2 - (long && t.d >= t.w ? 0.8 : 0.35)), yaw: long ? (t.w > t.d ? Math.PI / 2 : 0) + (Math.random() < 0.5 ? Math.PI : 0) : rand(0, 6.28), pose: long ? pick(['lie', 'prone', 'side']) : pick(['curl', 'sit', 'thinker', 'curl']) };
      if (!freeAt(s.x, s.z, 0.22, 0.6, t.y + 0.01)) continue;
    } else if (roll < 0.86) {
      const us = unders.filter((u) => u.zone === zn.id && u.h > 0.45);
      if (!us.length) continue;
      const u = pick(us);
      s = { x: u.x + rand(-0.25, 0.25) * u.w, y: 0, z: u.z + rand(-0.25, 0.25) * u.d, yaw: rand(0, 6.28), pose: u.h > 0.62 ? pick(['curl', 'sit', 'crouch']) : pick(['curl', 'lie']) };
      if (!freeAt(s.x, s.z, 0.2, 0.4)) continue;
    } else if (roll < 0.95) {
      s = { x: rand(zn.x0 + 0.9, zn.x1 - 0.9), y: 0, z: rand(zn.z0 + 0.9, zn.z1 - 0.9), yaw: rand(0, 6.28), pose: pick(FLOOR_POSES) };
      if (!freeAt(s.x, s.z, 0.45, 0.8)) continue;
    } else {
      const sp = (MAP.specials || []).filter((p) => p.zone === zn.id);
      if (!sp.length) continue;
      s = { ...pick(sp), yaw: rand(0, 6.28) };
    }
    if (taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 3)) continue;
    if (hs.some(([hx, hz]) => Math.hypot(hx - s.x, hz - s.z) < 4)) continue;
    if (zoneAt(s.x, s.z)?.hunters) continue;
    return s;
  }
  const [px, pz] = MAP.playerSpawn;
  return { x: px + rand(-3, 3), y: 0, z: pz + rand(-3, 3), yaw: 0, pose: 'curl' };
}

/* ================= hunters ================= */
const VW = 128, VH = 96;
/* Chameleons used to be 1.3 m tall; detection is pixel-area based, so scale it back up for the smaller body. */
const AREA_COMP = (1.3 / CHAM_H) ** 2;
const visRT = new THREE.WebGLRenderTarget(VW, VH);
const visCam = new THREE.PerspectiveCamera(78, VW / VH, 0.1, 30);
const bufA = new Uint8Array(VW * VH * 4), bufB = new Uint8Array(VW * VH * 4);

class Hunter {
  constructor({ id, name, avatar, ai = false, local = false, x = 0, z = 0, y = 0 }) {
    this.id = id; this.name = name; this.avatar = avatar; this.ai = ai; this.local = local; this.color = avatar.color;
    this.pos = new V3(x, y, z); this.yaw = 0; this.look = 0; this.pitch = -0.15;
    this.state = 'wait'; this.path = []; this.sus = new Map(); this.focus = null;
    this.lookT = 0.12 + Math.random() * 0.2; this.scanT = 0; this.stuckT = 0; this.repathT = 0; this.swing = 0; this.confused = 0; this.t = Math.random() * 10; this.markT = 0; this.pingCD = rand(12, 25);
    this.body = { pos: this.pos, r: 0.3, h: 1.8, vy: 0 };
    this.visited = {}; this.target = null; this.spd = 0; this.animLast = this.pos.clone();
    this.model = buildHunterModel(avatar);
    this.group = this.model.group; this.tool = this.model.tool;
    this.mark = textSprite('?', '#ffcc4d', '#2b2000', 0.5); this.mark.position.y = 2.35; this.mark.visible = false; this.group.add(this.mark);
    this.markBang = textSprite('!', '#ff5d6c', '#ffffff', 0.55); this.markBang.position.y = 2.35; this.markBang.visible = false; this.group.add(this.markBang);
    this.nameTag = textSprite(name, 'rgba(15,18,26,.75)', '#ffffff', 0.26); this.nameTag.position.y = 2.08; this.nameTag.visible = !ai; this.group.add(this.nameTag);
    scene.add(this.group); this.sync();
  }
  sync() { this.group.position.copy(this.pos); this.group.rotation.y = this.yaw; }
  dispose() { scene.remove(this.group); this.model.mat.dispose(); this.model.rig.dispose(); }
  eye() { return new V3(this.pos.x, this.pos.y + 1.55, this.pos.z); }
  doSwing() { this.swing = 0.35; }
  animTool(dt) {
    if (this.swing > 0) this.swing -= dt;
    if (this.markT > 0) this.markT -= dt;
    const d = Math.hypot(this.pos.x - this.animLast.x, this.pos.z - this.animLast.z) / Math.max(dt, 1e-4);
    this.spd = lerp(this.spd, Math.min(d, 8), Math.min(1, dt * 8)); this.animLast.copy(this.pos);
    if (this.group.visible) this.model.anim(dt, this.spd, Math.max(0, this.swing));
  }
  puppet(dt) {
    if (this.target) {
      const k = Math.min(1, dt * 12);
      this.pos.x = lerp(this.pos.x, this.target.x, k); this.pos.z = lerp(this.pos.z, this.target.z, k); this.pos.y = lerp(this.pos.y, this.target.y || 0, k);
      this.yaw += angDiff(this.yaw, this.target.yaw) * k;
    }
    this.animTool(dt);
    if (this.ai) { this.mark.visible = this.state === 'investigate' || this.markT > 0; this.markBang.visible = this.state === 'chase'; }
    this.sync();
  }
  goTo(x, z) { this.path = route(this.pos.x, this.pos.z, x, z); }
  pickGoal() {
    const zones = ZONES.filter((z) => !z.hunters);
    const zs = zones.slice().sort((a, b) => ((this.visited[a.id] ?? -99) + rand(0, 25)) - ((this.visited[b.id] ?? -99) + rand(0, 25)));
    const zn = zs[0], p = pick(zn.pts);
    this.goTo(p[0] + rand(-0.4, 0.4), p[1] + rand(-0.4, 0.4));
    this.visited[zn.id] = G.t; this.state = 'patrol';
  }
  moveToward(x, z, speed, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const step = Math.min(d, speed * dt);
    this.pos.x += dx / d * step; this.pos.z += dz / d * step;
    collideBody(this.body, dt, false);
    let ground = 0; for (const c of colliders) if (c.max.y <= this.pos.y + STEP && c.max.y > ground && overlapsXZ(this.pos, 0.18, c)) ground = c.max.y;
    this.pos.y = lerp(this.pos.y, ground, Math.min(1, dt * 10));
    this.yaw += angDiff(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    return d;
  }
  hear(p) {
    if (this.state === 'chase' || this.state === 'wait') return;
    this.goTo(p.x + rand(-2.5, 2.5), p.z + rand(-2.5, 2.5));
    this.state = 'patrol'; this.markT = 1.2;
  }
  update(dt, targets) {
    this.t += dt;
    this.animTool(dt);
    if (this.state === 'wait') { this.look = this.yaw; this.sync(); return; }
    if (this.confused > 0) { this.confused -= dt; this.look = this.yaw + Math.sin(this.t * 7) * 0.8; this.sync(); return; }
    this.pingCD -= dt;
    this.lookT -= dt;
    if (this.lookT <= 0) { const dtLook = 0.25 - this.lookT; this.lookT = 0.25; this.perceive(targets, dtLook); }
    for (const t of targets) {
      const tp = t.root.position;
      if (Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z) < 0.5 + t.body.r && Math.abs(tp.y - this.pos.y) < 1.5) this.sus.set(t, Math.max(this.sus.get(t) || 0, 1.15));
    }
    let best = null, bs = 0;
    for (const t of targets) { const s = this.sus.get(t) || 0; if (s > bs) { bs = s; best = t; } }
    if (best && bs >= 1) { if (this.state !== 'chase') { this.state = 'chase'; this.focus = best; this.repathT = 0; Sound.alert(this.eye()); } }
    else if (best && bs >= 0.35 && this.state !== 'chase') { this.state = 'investigate'; this.focus = best; }
    if ((this.state === 'chase' || this.state === 'investigate') && (!this.focus || this.focus.caught || !targets.includes(this.focus))) { this.focus = null; this.pickGoal(); }
    this.mark.visible = this.state === 'investigate' || this.markT > 0; this.markBang.visible = this.state === 'chase';
    const D = G.D;
    if (this.state === 'chase') {
      const tp = this.focus.root.position;
      this.repathT -= dt;
      if (this.repathT <= 0) { this.goTo(tp.x, tp.z); this.repathT = 0.6; }
      this.follow(dt, D.huntSpeed * 1.35 * (G.overtime ? 1.2 : 1));
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      this.faceTo(this.focus.center(), dt);
      if (d < 1.35 && Math.abs(tp.y - this.pos.y) < 2.2 && this.swing <= 0) { this.doSwing(); G.hostTag(this.focus.id, this.id); this.sus.delete(this.focus); this.focus = null; this.state = 'scan'; this.scanT = 1.5; }
    } else if (this.state === 'investigate') {
      const c = this.focus.center(), tp = this.focus.root.position, d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      if (d > 2.4) { this.repathT -= dt; if (this.repathT <= 0) { this.goTo(tp.x, tp.z); this.repathT = 1; } this.follow(dt, D.huntSpeed * 0.55, 2.4); }
      this.faceTo(c, dt);
      if ((this.sus.get(this.focus) || 0) < 0.15) { this.focus = null; this.pickGoal(); }
    } else if (this.state === 'patrol') {
      if (!this.path.length) { this.state = 'scan'; this.scanT = rand(1.6, 3.2) * (G.overtime ? 0.6 : 1); } else this.follow(dt, D.huntSpeed * (G.overtime ? 1.25 : 1));
      this.look = this.yaw + Math.sin(this.t * 1.3 + this.id.length) * 0.6; this.pitch = -0.18 + Math.sin(this.t * 0.8) * 0.12;
    } else if (this.state === 'scan') {
      this.scanT -= dt; this.look = this.yaw + Math.sin(this.t * 1.7) * 1.2; this.pitch = -0.25 + Math.sin(this.t * 1.1) * 0.2;
      if (this.pingCD <= 0 && G.phase === 'hunt') { this.pingCD = rand(26, 40); G.emit({ e: 'ping', id: this.id, x: this.pos.x, y: this.pos.y, z: this.pos.z }); }
      if (this.scanT <= 0) this.pickGoal();
    }
    if (this.state === 'patrol' || this.state === 'chase') {
      this.stuckT = this.pos.distanceTo(this.lastP || this.pos) < 0.6 * dt ? this.stuckT + dt : 0;
      this.lastP = this.pos.clone();
      if (this.stuckT > 1.5) { this.stuckT = 0; if (this.state === 'patrol') this.pickGoal(); else this.path.shift(); }
    }
    this.sync();
  }
  follow(dt, speed, stopAt = 0) {
    if (!this.path.length) return;
    const n = this.path[0], last = this.path.length === 1;
    const d = this.moveToward(n.x, n.z, speed, dt);
    if (d < (last ? Math.max(0.3, stopAt) : 0.45)) this.path.shift();
  }
  faceTo(p, dt) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, want = Math.atan2(dx, dz);
    this.look += angDiff(this.look, want) * Math.min(1, dt * 6);
    this.pitch = lerp(this.pitch, Math.atan2(p.y - (this.pos.y + 1.55), Math.hypot(dx, dz)), Math.min(1, dt * 5));
    if (this.state !== 'patrol') this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 4);
  }
  /** Fair vision: render the view with and without hiders, suspicion = colour difference inside each target. */
  perceive(targets, dt) {
    visCam.position.copy(this.eye()); visCam.rotation.set(this.pitch, this.look + Math.PI, 0, 'YXZ'); visCam.updateMatrixWorld();
    const cand = [];
    for (const t of targets) {
      if (t.root.position.distanceTo(this.pos) > 18) continue;
      const r = ndcRect(new THREE.Box3().setFromObject(t.mesh), visCam);
      if (!r || r.x1 < -1 || r.x0 > 1 || r.y1 < -1 || r.y0 > 1) continue;
      cand.push([t, r]);
    }
    const seen = new Set(), gains = new Map();
    if (cand.length) {
      const hiddenH = []; for (const h of G.hunters) if (h.group.visible) { h.group.visible = false; hiddenH.push(h); }
      const fxHidden = []; for (const s of G.fxHide) if (s.visible) { s.visible = false; fxHidden.push(s); }
      renderer.setRenderTarget(visRT);
      renderer.render(scene, visCam); renderer.readRenderTargetPixels(visRT, 0, 0, VW, VH, bufA);
      const hid = []; for (const c of G.hiders) if (c.root.visible) { c.root.visible = false; hid.push(c); }
      renderer.render(scene, visCam); renderer.readRenderTargetPixels(visRT, 0, 0, VW, VH, bufB);
      for (const c of hid) c.root.visible = true; for (const h of hiddenH) h.group.visible = true; for (const s of fxHidden) s.visible = true;
      renderer.setRenderTarget(null);
      const D = G.D;
      for (const [t, r] of cand) {
        const px0 = clamp(Math.floor((r.x0 * 0.5 + 0.5) * VW), 0, VW - 1), px1 = clamp(Math.ceil((r.x1 * 0.5 + 0.5) * VW), 0, VW - 1);
        const py0 = clamp(Math.floor((r.y0 * 0.5 + 0.5) * VH), 0, VH - 1), py1 = clamp(Math.ceil((r.y1 * 0.5 + 0.5) * VH), 0, VH - 1);
        let s = 0, vis = 0;
        for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
          const i = (y * VW + x) * 4;
          const dr = (bufA[i] - bufB[i]) / 255, dg = (bufA[i + 1] - bufB[i + 1]) / 255, db = (bufA[i + 2] - bufB[i + 2]) / 255;
          const d = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
          if (d > 0.012) vis++;
          if (d > 0.06) s += d - 0.06;
        }
        if (vis < 2) continue;
        seen.add(t);
        let gain = s * D.K * dt * AREA_COMP;
        if (t.speed > 0.4) gain += D.motion * dt * Math.min(1, vis * AREA_COMP / 30);
        gains.set(t, gain);
        this.sus.set(t, (this.sus.get(t) || 0) + gain);
      }
    }
    for (const [t, v] of this.sus) if (!seen.has(t)) this.sus.set(t, Math.max(0, v - 0.1 * dt));
    return gains;
  }
}

/* ================= game / session ================= */
const DIFF = {
  easy: { name: 'Easy', hunters: 2, K: 1 / 110, motion: 1.0, huntSpeed: 2.3, prep: 75, hunt: 150, aiHiders: 3, seekSkill: 'sloppy', seekCount: 4, seekTime: 240, hiderSkill: 'sloppy' },
  normal: { name: 'Normal', hunters: 2, K: 1 / 60, motion: 1.8, huntSpeed: 2.7, prep: 60, hunt: 180, aiHiders: 3, seekSkill: 'medium', seekCount: 5, seekTime: 240, hiderSkill: 'medium' },
  hard: { name: 'Hard', hunters: 3, K: 1 / 36, motion: 2.8, huntSpeed: 3.0, prep: 50, hunt: 180, aiHiders: 4, seekSkill: 'good', seekCount: 6, seekTime: 240, hiderSkill: 'good' },
};
const AB = { clones: 2, decoys: 2, tauntCD: 6, pingCD: 22, ammo: 3, ammoRecharge: 9 };
const PAINTBALL = '#ff2bd6';

const G = {
  phase: 'boot', t: 0, timer: 0, D: DIFF.normal, P: null,
  online: false, isHost: true, myId: 'me',
  hiders: [], hunters: [], my: null, myHunter: null, fp: null, fxHide: [],
  view: 'third', paint: false, paused: false,
  ctrl: { yaw: 0, pitch: 0.32, dist: 2.3 }, paintCam: { yaw: 0, pitch: 0.2, dist: 1.7 },
  stats: {}, ab: {}, specIdx: 0, fx: [], labels: [], balls: [], splats: [], rings: [], bubbles: [],
  solo: { kind: 'hide', map: 'mansion', diff: 'normal' }, party: null,
  lobby: { players: new Map(), settings: { map: 'mansion', mode: 'classic', hunters: 'auto', aiHunters: 1, aiHiders: 2, prep: 60, hunt: 180, diff: 'normal' }, chat: [], inGame: false },
  hub: null, ink: 100,
  sendT: 0, texT: 0, aiSendT: 0, timerSendT: 0,

  findCham(id) { return this.hiders.find((c) => c.id === id); },
  findHunter(id) { return this.hunters.find((h) => h.id === id); },
  targets() { return this.hiders.filter((c) => !c.caught && c.root.visible); },
  realHiders() { return this.hiders.filter((c) => !c.isClone); },

  clearRound() {
    clearHub();
    for (const c of this.hiders) c.dispose();
    for (const h of this.hunters) h.dispose();
    for (const f of this.fx) scene.remove(f.m);
    for (const l of this.labels) scene.remove(l.s);
    for (const b of this.balls) scene.remove(b.m);
    for (const s of this.splats) { scene.remove(s); s.material.dispose(); }
    for (const r of this.rings) scene.remove(r.m);
    for (const b of this.bubbles) b.s.parent?.remove(b.s);
    this.hiders = []; this.hunters = []; this.fx = []; this.labels = []; this.balls = []; this.splats = []; this.rings = []; this.bubbles = []; this.fxHide = [];
    this.my = null; this.myHunter = null; this.fp = null;
    this.paint = false; this.ink = 100; this.reveal = null; this.revealList = null; this.playerSus = 0;
    this.ab = { clones: AB.clones, decoys: AB.decoys, taunt: 0, ping: 0, ammo: AB.ammo, ammoT: 0 };
    this.stats = { taunts: 0, clonesFooled: 0, maxSus: 0, start: 0, finds: 0, splats: 0 };
    if (MAP) setGate(true);
    UI.paintPanel(false); toolVM.visible = false; UI.blind(false); UI.wheel(false);
  },

  /* ---------- round setup (shared by solo, party and online) ---------- */
  async buildPayload(players, cfg) {
    this.phase = 'loading'; UI.hubHud(false); UI.wheel(false);
    UI.loading(true, 'Loading ' + (MAPS[cfg.map]?.name || 'map') + '…');
    await nextFrame();
    clearHub(); disposeMenuDoll();
    if (!MAP || MAP.id !== cfg.map) loadMap(cfg.map);
    await nextFrame();
    const D = DIFF[cfg.diff] || DIFF.normal;
    const aiHiders = [], taken = [{ x: MAP.playerSpawn[0], z: MAP.playerSpawn[1] }];
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    if (cfg.aiHiders) UI.loading(true, 'Chameleons are painting themselves…');
    for (let i = 0; i < cfg.aiHiders; i++) {
      await nextFrame();
      const c = new Cham({ id: 'aih' + i + uid(), name: names[i % names.length], shape: pick(Object.keys(SHAPES)), eyes: pick(Object.keys(EYES)), color: TAG_COLORS[(i + 3) % TAG_COLORS.length] });
      if (Math.random() < 0.2) c.setSize('petite');
      const s = findSpot(c, taken); taken.push(s);
      c.root.position.set(s.x, s.y, s.z); c.setYaw(s.yaw); c.setPose(s.pose, true);
      if (POSES[s.pose].wall) snapToWall(c, 1.2);
      autoCamo(c, cfg.skill || D.hiderSkill);
      const p = c.root.position;
      aiHiders.push({ id: c.id, name: c.name, shape: c.shape, eyes: c.eyes, size: c.size, pose: c.pose, x: p.x, y: p.y, z: p.z, yaw: c.yaw, rough: c.mat.roughness, color: c.color, tex: c.texURL() });
      c.dispose();
    }
    const aiHunters = [];
    for (let i = 0; i < cfg.aiHunters; i++) aiHunters.push({ id: 'aiH' + i + uid(), name: `Hunter ${i + 1}`, avatar: randomHunterAvatar(i + Math.floor(Math.random() * 6)) });
    return { map: cfg.map, mode: cfg.mode || 'classic', cfg, players, aiHiders, aiHunters };
  },
  async setupRound(P) {
    this.phase = 'loading'; UI.hubHud(false); UI.wheel(false);
    UI.loading(true, 'Loading ' + (MAPS[P.map]?.name || 'map') + '…');
    await nextFrame();
    this.clearRound(); disposeMenuDoll();
    if (!MAP || MAP.id !== P.map) loadMap(P.map);
    this.P = P; this.D = DIFF[P.cfg.diff] || DIFF.normal;
    for (const a of P.aiHiders) {
      const c = new Cham({ id: a.id, name: a.name, shape: a.shape, eyes: a.eyes, color: a.color });
      c.size = a.size; c.setYaw(a.yaw); c.setPose(a.pose, true);
      c.root.position.set(a.x, a.y, a.z);
      c.mat.roughness = a.rough; c.loadTex(a.tex);
      this.hiders.push(c);
    }
    const hs = MAP.hunterSpawns; let hi = 0, ci = 0;
    for (const p of P.players) {
      const local = p.id === this.myId, prof = p.profile || PROFILE;
      if (p.role === 'hider') {
        const c = new Cham({ id: p.id, name: p.name, ownerId: p.id, local, human: true, color: prof.tag, shape: prof.cham?.shape, eyes: prof.cham?.eyes });
        const a = ci++ * 2.4, r = ci > 1 ? 1.4 : 0;
        c.root.position.set(MAP.playerSpawn[0] + Math.cos(a) * r, 0, MAP.playerSpawn[1] + Math.sin(a) * r);
        c.setYaw(Math.PI); if (local) this.my = c;
        if (P.partyHidden) c.root.visible = false;
        this.hiders.push(c);
      } else if (p.role === 'hunter') {
        const [x, z] = hs[hi++ % hs.length];
        const h = new Hunter({ id: p.id, name: p.name, avatar: prof.hunter || randomHunterAvatar(hi), ai: false, local, x, z });
        if (local) { this.myHunter = h; h.group.visible = false; this.fp = { pos: new V3(x, 0, z), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: Math.PI, pitch: 0 }; }
        this.hunters.push(h);
      }
    }
    for (const a of P.aiHunters) { const [x, z] = hs[hi++ % hs.length]; const h = new Hunter({ ...a, ai: true, x, z }); h.yaw = h.look = Math.atan2(MAP.playerSpawn[0] - x, MAP.playerSpawn[1] - z) + Math.PI; h.sync(); this.hunters.push(h); }
    this.view = this.my ? 'third' : this.fp ? 'first' : 'spec';
    this.ctrl.yaw = 0;
    toolVM.visible = false;
    if (this.fp) setToolVM(this.myHunter.avatar.tool);
    this.stats.start = 0;
    UI.loading(false); UI.screen(null); UI.hubHud(false);
    this.setPhase('prep', P.cfg.prep);
    UI.status();
    this.lastCount = null; this.overtime = false; this.lastStand = false;
    if (this.my) banner(MAPS[P.map].name, 'Chameleon', `Paint yourself and hide. Hunters are released in ${P.cfg.prep}s.`, 'hider', 3200);
    else if (this.fp) banner(MAPS[P.map].name, 'Hunter', 'Wait for the gate, then find every chameleon.', 'hunter', 3200);
    feed(`<b>${esc(MAPS[P.map].name)}</b> · ${P.mode === 'infection' ? 'Infection' : 'Classic'}`, 'sys');
    this.lock();
  },
  setPhase(p, time) {
    this.phase = p; this.timer = time; this.phaseLen = time;
    UI.hud(true);
    UI.blind(p === 'prep' && this.view === 'first' && !this.party);
    if (p === 'hunt') {
      setGate(false); Sound.horn();
      this.forcedT = this.P.mode === 'infection' ? 35 : 40;
      this.stats.start = this.t;
      if (this.isHost) for (const h of this.hunters) if (h.ai) h.pickGoal();
      if (this.paint) togglePaint();
      banner('', this.view === 'first' ? 'Hunt!' : 'Freeze!', this.view === 'first' ? 'Find them all.' : 'The hunters are coming.', this.view === 'first' ? 'hunter' : 'hider', 1600);
      feed('The gate is open', 'warn');
    }
    UI.refreshBars();
  },

  /* ---------- solo / party ---------- */
  async startSolo() {
    Sound.init();
    this.online = false; this.isHost = true; this.myId = 'me'; this.party = null;
    const s = this.solo, D = DIFF[s.diff];
    const me = { id: 'me', name: PROFILE.name, profile: PROFILE, role: s.kind === 'seek' ? 'hunter' : 'hider' };
    const cfg = s.kind === 'seek' ? { map: s.map, diff: s.diff, mode: 'classic', prep: 6, hunt: D.seekTime, aiHunters: 0, aiHiders: D.seekCount, skill: D.seekSkill }
      : s.kind === 'infection' ? { map: s.map, diff: s.diff, mode: 'infection', prep: D.prep, hunt: D.hunt + 60, aiHunters: 1, aiHiders: D.aiHiders + 2 }
        : { map: s.map, diff: s.diff, mode: 'classic', prep: D.prep, hunt: D.hunt, aiHunters: D.hunters, aiHiders: D.aiHiders };
    const P = await this.buildPayload([me], cfg);
    await this.setupRound(P);
  },
  async startParty(humans, ai, map, diff) {
    Sound.init();
    this.online = false; this.isHost = true; this.myId = 'me';
    const D = DIFF[diff];
    const players = [];
    for (let i = 0; i < humans; i++) players.push({ id: 'pp' + i, name: `Player ${i + 1}`, role: 'hider', profile: { ...PROFILE, tag: TAG_COLORS[i], cham: { shape: Object.keys(SHAPES)[i % 5], eyes: Object.keys(EYES)[i % 9] } } });
    players.push({ id: 'me', name: 'Seeker', role: 'none', profile: PROFILE });
    const P = await this.buildPayload(players, { map, diff, mode: 'classic', prep: D.prep + 15, hunt: D.seekTime, aiHunters: 0, aiHiders: ai, skill: D.seekSkill });
    P.partyHidden = true;
    this.party = { order: [], idx: 0 };
    await this.setupRound(P);
    this.party.order = this.hiders.filter((c) => c.human);
    this.handoff();
  },
  handoff() {
    const P = this.party;
    this.phase = 'handoff'; UI.hud(false); UI.blind(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (P.idx < P.order.length) UI.hand(`${P.order[P.idx].name}: your turn to hide`, `Everyone else look away. You get ${this.P.cfg.prep} seconds to paint and pose.`);
    else UI.hand('Seeker time!', 'Whoever is hunting takes the mouse now. Find every chameleon before time runs out.');
  },
  handGo() {
    UI.screen(null);
    const P = this.party;
    if (P.idx < P.order.length) {
      const c = this.my = P.order[P.idx]; c.local = true;
      c.root.visible = true; c.root.position.set(MAP.playerSpawn[0], 0, MAP.playerSpawn[1]); c.setYaw(Math.PI);
      this.view = 'third'; this.ctrl.yaw = 0; this.ink = 100;
      this.ab.clones = AB.clones; this.ab.decoys = AB.decoys;
      this.setPhase('prep', this.P.cfg.prep);
    } else {
      if (this.my) this.my.local = false;
      this.my = null;
      const [x, z] = MAP.hunterSpawns[0];
      const h = new Hunter({ id: 'me', name: 'Seeker', avatar: PROFILE.hunter, ai: false, local: true, x, z }); h.group.visible = false;
      this.hunters.push(h); this.myHunter = h;
      this.fp = { pos: new V3(x, 0, z), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: Math.PI, pitch: 0 };
      setToolVM(PROFILE.hunter.tool);
      this.view = 'first';
      this.setPhase('prep', 5);
    }
    this.lock();
  },
  finishPrep() {
    if (this.party && this.party.idx < this.party.order.length && this.view === 'third') {
      if (this.paint) togglePaint();
      if (this.my) { this.my.local = false; this.my.rebake(); }
      this.party.idx++; this.handoff(); return;
    }
    if (!this.isHost) return;
    this.emit({ e: 'phase', phase: 'hunt', timer: this.P.cfg.hunt });
  },

  /* ---------- events (host-authoritative where it matters) ---------- */
  emit(ev) { if (this.online) Net.relay({ k: 'ev', ev }); this.applyEvent(ev); },
  hostTag(targetId, byId) {
    if (!this.isHost || this.phase !== 'hunt') return;
    const t = this.findCham(targetId), by = this.findHunter(byId);
    if (!t || t.caught) return;
    if (by && !by.ai && Math.hypot(by.pos.x - t.root.position.x, by.pos.z - t.root.position.z) > 4.5) return;
    if (t.isClone) { this.emit({ e: 'clonehit', id: t.id, by: byId }); return; }
    this.emit({ e: 'caught', id: t.id, by: byId, at: this.t - this.stats.start });
    if (this.P.mode === 'infection') {
      const p = t.root.position;
      if (t.human) this.emit({ e: 'convert', pid: t.id, x: p.x, z: p.z });
      else this.emit({ e: 'aihunter', id: 'aiH' + uid(), name: t.name, avatar: randomHunterAvatar(this.hunters.length), x: p.x, z: p.z });
    }
    const left = this.realHiders().filter((c) => !c.caught).length;
    if (left === 0) setTimeout(() => this.hostEnd(), 900);
  },
  requestTag(targetId) {
    const by = this.myHunter ? this.myHunter.id : null;
    if (this.isHost) this.hostTag(targetId, by);
    else Net.to(Net.hostId, { k: 'tag', target: targetId, by });
  },
  hostEnd() {
    if (!this.isHost || this.phase === 'end') return;
    const list = this.realHiders().map((c) => ({ id: c.id, name: c.name, ok: !c.caught, at: c.caughtAt ?? null, human: c.human, by: c.caughtBy || null }));
    this.emit({ e: 'end', list, winner: list.some((x) => x.ok) ? 'hiders' : 'hunters' });
  },
  applyEvent(ev) {
    switch (ev.e) {
      case 'phase': this.setPhase(ev.phase, ev.timer); break;
      case 'caught': {
        const c = this.findCham(ev.id); if (!c || c.caught) break;
        c.caught = true; c.caughtAt = ev.at; c.caughtBy = ev.by; burst(c); Sound.pop(c.center()); c.root.visible = false;
        const by = this.findHunter(ev.by);
        floatLabel(`${c.name} found!`, c.center(), '#ff5d6c', '#fff');
        for (const h of this.hunters) h.sus.delete(c);
        if (by) by.doSwing();
        if (by && by === this.myHunter) this.stats.finds++;
        feed(`<b>${esc(by ? by.name : 'A hunter')}</b> found <b>${esc(c.name)}</b>`, 'bad');
        if (c === this.my) {
          if (this.P.mode !== 'infection') { banner(by ? by.name + ' found you' : 'Found', 'Caught!', 'Spectating. 1-9 to switch hunters.', 'hunter', 2000); Sound.lose(); this.view = 'spec'; this.specIdx = 0; if (this.paint) togglePaint(); UI.wheel(false); }
        } else if (by?.local) toast(`You found ${c.name}!`, 'good');
        {
          const alive = this.realHiders().filter((x) => !x.caught);
          if (alive.length === 1 && this.realHiders().length > 2 && !this.lastStand) {
            this.lastStand = true;
            banner('One chameleon left', alive[0] === this.my ? 'Last one standing' : alive[0].name, alive[0] === this.my ? 'It all comes down to you.' : 'Find them before time runs out!', alive[0] === this.my ? 'hider' : 'warn', 2400);
          }
        }
        UI.status(); break;
      }
      case 'clonehit': {
        const c = this.findCham(ev.id); if (!c || c.caught) break;
        c.caught = true; burst(c); Sound.pop(c.center()); c.root.visible = false;
        const by = this.findHunter(ev.by);
        if (by) { by.doSwing(); if (by.ai) { by.confused = 2.2; by.state = 'scan'; by.scanT = 1; by.focus = null; } }
        for (const h of this.hunters) h.sus.delete(c);
        feed(`<b>${esc(by ? by.name : 'A hunter')}</b> bonked a clone`, 'good');
        if (by?.local) toast('That was a clone!', 'warn');
        if (c.ownerId === this.myId) { this.stats.clonesFooled++; toast('Your clone fooled them! +40 XP', 'good'); }
        break;
      }
      case 'convert': {
        const prof = this.playerProfile(ev.pid);
        const h = new Hunter({ id: ev.pid + '_h', name: prof.name, avatar: prof.profile?.hunter || randomHunterAvatar(3), ai: false, local: ev.pid === this.myId, x: ev.x, z: ev.z });
        this.hunters.push(h);
        if (ev.pid === this.myId) {
          this.myHunter = h; h.group.visible = false; this.my = null;
          this.fp = { pos: new V3(ev.x, 0, ev.z), vy: 0, onGround: true, r: 0.3, h: 1.75, yaw: this.ctrl.yaw, pitch: 0 };
          setToolVM(h.avatar.tool); this.view = 'first'; if (this.paint) togglePaint(); UI.wheel(false);
          toast('You got infected! Now you hunt.', 'warn'); Sound.alert(null);
        }
        feed(`<b>${esc(prof.name)}</b> joined the hunters`, 'warn');
        break;
      }
      case 'aihunter': {
        const h = new Hunter({ id: ev.id, name: ev.name + ' (infected)', avatar: ev.avatar, ai: true, x: ev.x, z: ev.z });
        if (this.isHost) h.pickGoal();
        this.hunters.push(h); break;
      }
      case 'whistle': {
        const c = this.findCham(ev.id); if (!c || c.caught) break;
        const p = c.center(); Sound.whistle(p); noteSprite(p);
        if (this.isHost) for (const h of this.hunters) if (h.ai && h.pos.distanceTo(p) < 22 && Math.random() < (ev.chance ?? 0.6)) h.hear(p);
        break;
      }
      case 'decoy': {
        const p = new V3(ev.x, ev.y, ev.z); Sound.whistle(p); noteSprite(p, '#ffd43b');
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd43b })); m.position.copy(p); scene.add(m);
        this.fx.push({ m, v: new V3(), life: 3, still: true });
        if (this.isHost) for (const h of this.hunters) if (h.ai && h.pos.distanceTo(p) < 24 && Math.random() < 0.85) h.hear(p);
        break;
      }
      case 'ping': {
        const p = new V3(ev.x, ev.y || 0, ev.z); Sound.ping(p.clone().setY(1.5)); pingRing(p);
        let n = 0;
        for (const c of this.targets()) {
          if (c.root.position.distanceTo(p) > 8.5) continue;
          n++; setTimeout(() => { if (!c.caught) Sound.chirp(c.center()); }, 350 + Math.random() * 500);
          if (c === this.my) toast('Pinged! A hunter can hear you chirp.', 'warn');
          if (this.isHost) { const h = this.findHunter(ev.id); if (h && h.ai && Math.random() < 0.75) h.hear(c.root.position); }
        }
        const h = this.findHunter(ev.id);
        if (h?.local) toast(n ? `Ping: ${n} chirp${n === 1 ? '' : 's'} nearby. Listen!` : 'Ping: nothing nearby', n ? 'good' : '');
        break;
      }
      case 'pb': if (ev.by !== this.myId) spawnBall(new V3(...ev.p), new V3(...ev.v), false); break;
      case 'splat': {
        const c = this.findCham(ev.id); if (!c) break;
        splatOn(c, ev.uv, ev.col);
        if (c === this.my) toast('You got splatted with paint! Repaint fast.', 'bad');
        break;
      }
      case 'splatw': splatWall(new V3(...ev.p), new V3(...ev.n), ev.col); break;
      case 'clone': {
        if (this.findCham(ev.id)) break;
        const owner = this.findCham(ev.owner); if (!owner) break;
        const c = new Cham({ id: ev.id, name: owner.name + "'s clone", ownerId: owner.ownerId, color: owner.color, shape: owner.shape, eyes: owner.eyes });
        c.copyFrom(owner); c.isClone = true; c.setPose(ev.pose, true); c.root.position.set(ev.x, ev.y, ev.z); c.setYaw(ev.yaw);
        this.hiders.push(c); break;
      }
      case 'swing': { const h = this.findHunter(ev.id); if (h && !h.local) { h.doSwing(); Sound.swoosh(h.eye()); } break; }
      case 'end': this.showEnd(ev); break;
    }
  },
  playerProfile(pid) { return this.P?.players.find((x) => x.id === pid) || { name: 'Player', profile: {} }; },
  forcedTaunt() {
    const alive = this.realHiders().filter((c) => !c.caught);
    if (!alive.length) return;
    if (this.hunters.some((h) => !h.ai) || this.P.mode === 'infection') {
      const list = this.P.mode === 'infection' ? alive : [pick(alive)];
      list.forEach((c, i) => setTimeout(() => this.emit({ e: 'whistle', id: c.id, chance: 0.45 }), i * 400));
    } else alive.forEach((c, i) => setTimeout(() => this.emit({ e: 'whistle', id: c.id, chance: c.human ? 0.65 : 0.4 }), i * 450));
    toast('Forced taunt! Hiders whistle.', 'warn');
    feed('Forced taunt', 'warn');
  },
  showEnd(ev) {
    this.phase = 'end'; if (this.paint) togglePaint(); UI.wheel(false);
    if (document.pointerLockElement) document.exitPointerLock();
    UI.blind(false); toolVM.visible = false;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const surv = ev.list.filter((x) => x.ok);
    for (const x of surv) { const c = this.findCham(x.id); if (c) floatLabel(`${c.name} was here!`, c.center(), '#3ad49c', '#06261a', 999); }
    let title, text, won;
    const role = this.P.players.find((p) => p.id === this.myId)?.role;
    const me = ev.list.find((x) => x.id === this.myId);
    const xp = [['Played a round', 25]];
    if (role === 'hider' && me) {
      const huntLen = this.P.cfg.hunt, alive = me.ok ? huntLen : (me.at || 0);
      won = me.ok || ev.winner === 'hiders';
      const score = Math.round(alive * 10 + this.stats.taunts * 150 + this.stats.clonesFooled * 300);
      title = me.ok ? 'You survived!' : ev.winner === 'hiders' ? 'Caught, but your team survived' : 'The hunters win';
      text = `Score ${score} · taunts ${this.stats.taunts} · clones bonked ${this.stats.clonesFooled}` + (this.online ? '' : ` · closest call ${Math.round(clamp(this.stats.maxSus, 0, 1) * 100)}% attention`);
      xp.push(['Time hidden', Math.round(alive / 3)]);
      if (me.ok) xp.push(['Survived', 100]);
      if (ev.winner === 'hiders') xp.push(['Team win', 50]);
      if (this.stats.taunts) xp.push([`Taunts ×${this.stats.taunts}`, this.stats.taunts * 20]);
      if (this.stats.clonesFooled) xp.push([`Clones bonked ×${this.stats.clonesFooled}`, this.stats.clonesFooled * 40]);
      PROFILE.stats.survived += me.ok ? 1 : 0; PROFILE.stats.taunts += this.stats.taunts;
      PROFILE.stats.bestScore = Math.max(PROFILE.stats.bestScore, score);
      (me.ok ? Sound.win : Sound.lose)();
    } else {
      const found = ev.list.length - surv.length;
      won = ev.winner === 'hunters';
      title = ev.winner === 'hunters' ? (this.myHunter ? 'You found everyone!' : 'Hunters win') : `Found ${found} of ${ev.list.length}`;
      text = ev.winner === 'hunters' ? `Cleared in ${fmt(this.t - this.stats.start)}.` : 'Hit "Show hiding spots" to see where the survivors were.';
      if (this.stats.finds) xp.push([`Finds ×${this.stats.finds}`, this.stats.finds * 60]);
      if (this.stats.splats) xp.push([`Paint hits ×${this.stats.splats}`, this.stats.splats * 10]);
      if (won && this.myHunter) xp.push(['Hunter win', 80]);
      PROFILE.stats.found += this.stats.finds;
      (won === !!this.myHunter ? Sound.win : Sound.lose)();
    }
    PROFILE.stats.games++; if (won) PROFILE.stats.wins++;
    const gained = xp.reduce((a, [, v]) => a + v, 0), before = levelInfo(PROFILE.xp).level;
    PROFILE.xp += gained; saveProfile();
    const after = levelInfo(PROFILE.xp).level;
    const unlocks = [];
    for (const kind in UNLOCKS) for (const [k, l] of Object.entries(UNLOCKS[kind])) if (l > before && l <= after) unlocks.push(unlockName(kind, k));
    if (after > before) setTimeout(() => { Sound.levelup(); toast(`Level up! You are now level ${after}`, 'good'); }, 900);
    this.view = 'spec';
    this.revealList = surv.map((x) => this.findCham(x.id)).filter(Boolean);
    if (!this.revealList.length) this.revealList = this.realHiders();
    UI.end({ title, text, won, surv: surv.length, items: ev.list.map((x) => ({ name: x.name, ok: x.ok, txt: x.ok ? 'survived' : `found at ${fmt(x.at ?? 0)}` })), xp, gained, before, after, unlocks, online: this.online });
    if (this.online && this.isHost) Net.send({ t: 'lobby', lobby: { inGame: false } });
  },
  startReveal() {
    const list = this.revealList || [];
    if (!list.length) return;
    for (const c of list) c.root.visible = true;
    this.reveal = { list, i: 0, t: 0 };
    UI.screen(null);
  },
  updateReveal(dt) {
    const R = this.reveal, c = R.list[R.i];
    R.t += dt;
    const p = c.center();
    if (R.t <= dt) { let best = 0, bd = -1; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, h = envHit(p, new V3(Math.sin(a), 0, Math.cos(a)), 6), f = h ? h.distance : 6; if (f > bd) { bd = f; best = a; } } R.a0 = best; R.free = bd; }
    const a = R.a0 + Math.sin(R.t * 0.9) * 0.6, r = Math.min(3.2, R.free - 0.3);
    camera.position.set(p.x + Math.sin(a) * r, Math.max(1.2, p.y + 0.9), p.z + Math.cos(a) * r);
    camera.lookAt(p);
    if (R.t > 3.6) { R.i++; R.t = 0; if (R.i >= R.list.length) { this.reveal = null; for (const x of R.list) if (x.caught) x.root.visible = false; UI.screen('end'); } }
  },
  lock() { if (this.paint || this.phase === 'handoff' || UI.wheelOpen || UI.panelOpen) return; try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.(() => { }); } catch (e) { /* needs a user gesture */ } },
  toMenu() {
    if (this.online) { Net.close(); this.online = false; if (window.mcNative) mcNative.hostStop(); }
    this.clearRound(); this.phase = 'menu'; this.party = null;
    UI.hud(false); UI.hubHud(false); UI.screen('menu'); showMenuScene();
    if (document.pointerLockElement) document.exitPointerLock();
  },

  /* ---------- network sync ---------- */
  netTick(dt) {
    if (!this.online || !Net.connected) return;
    this.sendT -= dt; this.texT -= dt; this.aiSendT -= dt; this.timerSendT -= dt;
    const hub = this.phase === 'hub';
    this.keepT = (this.keepT || 0) - dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 10;
      const force = this.keepT <= 0; if (force) this.keepT = 1;
      if (this.my && !this.my.caught) {
        const c = this.my, p = c.root.position;
        const msg = { k: hub ? 'hst' : 'st', a: 'c', id: c.id, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], y: +c.yaw.toFixed(2), po: c.pose, sh: c.shape, sz: c.size, r: +c.mat.roughness.toFixed(2), m: +c.mat.metalness.toFixed(2), mv: c.speed > 0.4 ? 1 : 0, em: c.emote || 0, air: c.body.onGround ? 0 : 1 };
        if (hub) { msg.ready = this.hub.ready ? 1 : 0; msg.vote = this.hub.vote; msg.name = PROFILE.name; msg.eyes = c.eyes; msg.tag = PROFILE.tag; }
        const sig = JSON.stringify(msg);
        if (force || sig !== this.lastSig) { this.lastSig = sig; Net.relay(msg); }
      }
      if (this.myHunter && this.fp && !hub) {
        const p = this.fp.pos;
        const msg = { k: 'st', a: 'h', id: this.myHunter.id, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], y: +(this.fp.yaw + Math.PI).toFixed(2) };
        const sig = JSON.stringify(msg);
        if (force || sig !== this.lastHSig) { this.lastHSig = sig; Net.relay(msg); }
      }
    }
    if (this.my && this.my.texVer !== this.my.sentVer && this.texT <= 0) { this.texT = 0.6; this.my.sentVer = this.my.texVer; Net.relay({ k: hub ? 'htex' : 'tex', id: this.my.id, url: this.my.texURL() }); }
    if (hub) return;
    if (this.isHost && this.aiSendT <= 0) {
      this.aiSendT = 0.1;
      const list = this.hunters.filter((h) => h.ai).map((h) => [h.id, +h.pos.x.toFixed(2), +h.pos.y.toFixed(2), +h.pos.z.toFixed(2), +h.yaw.toFixed(2), h.state]);
      const sig = JSON.stringify(list);
      if (list.length && sig !== this.lastAiSig) { this.lastAiSig = sig; Net.relay({ k: 'ai', list }); }
    }
    if (this.isHost && this.timerSendT <= 0) { this.timerSendT = 1; Net.relay({ k: 'timer', t: this.timer, phase: this.phase }); }
  },
  onRelay(from, d) {
    const fromHost = from === Net.hostId;
    switch (d.k) {
      case 'start': if (fromHost) this.setupRound(d.P); break;
      case 'late': if (fromHost && (this.phase === 'hub' || this.phase === 'menu')) this.joinLate(d); break;
      case 'ev': if (fromHost || ['whistle', 'clone', 'swing', 'ping', 'pb', 'splat', 'splatw', 'decoy'].includes(d.ev.e)) this.applyEvent(d.ev); break;
      case 'tag': if (this.isHost) this.hostTag(d.target, d.by); break;
      case 'timer': if (fromHost && Math.abs(this.timer - d.t) > 0.6) this.timer = d.t; break;
      case 'ai': if (!fromHost) break; for (const [id, x, y, z, yaw, st] of d.list) { const h = this.findHunter(id); if (h) { h.target = { x, y, z, yaw }; if (h.state !== st && st === 'chase') Sound.alert(h.eye()); h.state = st; } } break;
      case 'st': {
        if (this.phase === 'hub') break;
        if (d.a === 'c') {
          const c = this.findCham(d.id); if (!c || c.local) break;
          applyRemoteCham(c, d);
        } else { const h = this.findHunter(d.id); if (h && !h.local) h.target = { x: d.p[0], y: d.p[1], z: d.p[2], yaw: d.y }; }
        break;
      }
      case 'tex': { const c = this.findCham(d.id); if (c && !c.local) c.loadTex(d.url); break; }
      case 'hst': hubRemote(from, d); break;
      case 'htex': { const o = this.hub?.others.get(from); if (o) o.cham.loadTex(d.url); else if (this.hub) this.hub.pendingTex.set(from, d.url); break; }
      case 'cd': if (fromHost && this.hub) { this.hub.cd = d.t; if (d.t != null && d.t <= 3 && d.t > 0) Sound.tick(); } break;
    }
  },
  /** Host: send the running round to someone who joined mid-round so they can spectate. */
  sendLate(id) {
    if (!this.isHost || !this.P || !(playing() || this.phase === 'end')) return;
    const caught = this.realHiders().filter((c) => c.caught).map((c) => c.id);
    const extra = this.hunters.filter((h) => !this.P.players.some((p) => p.id === h.id) && !this.P.aiHunters.some((a) => a.id === h.id)).map((h) => ({ id: h.id, name: h.name, avatar: h.avatar, ai: h.ai }));
    Net.to(id, { k: 'late', P: this.P, phase: this.phase === 'end' ? 'hunt' : this.phase, timer: this.timer, caught, extra });
  },
  async joinLate(d) {
    await this.setupRound(d.P);
    for (const id of d.caught) { const c = this.findCham(id); if (c) { c.caught = true; c.root.visible = false; } }
    for (const e of d.extra || []) if (!this.findHunter(e.id)) this.hunters.push(new Hunter({ ...e, x: MAP.playerSpawn[0], z: MAP.playerSpawn[1] }));
    this.view = 'spec';
    this.setPhase(d.phase, d.timer);
    UI.blind(false);
    toast('Round in progress. You are spectating until the next one.', 'warn');
    UI.status();
  },
  async hostStartOnline(mapOverride) {
    const L = this.lobby, s = L.settings, ids = [...L.players.keys()];
    if (!ids.length || this.starting) return;
    this.starting = true;
    try {
      const map = mapOverride || s.map;
      const want = s.hunters === 'auto' || !s.hunters ? Math.round(ids.length / 4) : +s.hunters;
      const nHunters = ids.length === 1 ? 0 : clamp(want, 1, ids.length - 1);
      const shuffled = ids.slice().sort(() => Math.random() - 0.5);
      const hunterIds = new Set(shuffled.slice(0, nHunters));
      const players = ids.map((id) => { const p = L.players.get(id); return { id, name: p.name, profile: p.profile, role: hunterIds.has(id) ? 'hunter' : 'hider' }; });
      const aiHunters = nHunters === 0 ? Math.max(1, s.aiHunters) : s.aiHunters;
      Net.send({ t: 'lobby', lobby: { inGame: true, map, mode: s.mode } });
      const P = await this.buildPayload(players, { map, diff: s.diff, mode: s.mode, prep: s.prep, hunt: s.hunt, aiHunters, aiHiders: s.aiHiders });
      Net.relay({ k: 'start', P });
      await this.setupRound(P);
    } finally { this.starting = false; }
  },
};
const nextFrame = () => new Promise((r) => setTimeout(r, 16));
function applyRemoteCham(c, d) {
  if (c.shape !== d.sh && SHAPES[d.sh]) c.setShape(d.sh);
  if (c.size !== d.sz && SIZES[d.sz]) c.setSize(d.sz);
  if (c.pose !== d.po && POSES[d.po]) c.setPose(d.po);
  if (d.em && c.emote !== d.em) c.setEmote(d.em); else if (!d.em && c.emote) c.emote = null;
  c.mat.roughness = d.r; c.mat.metalness = d.m;
  c.target = { x: d.p[0], y: d.p[1], z: d.p[2], yaw: d.y }; c.remoteMoving = d.mv; c.body.onGround = !d.air;
}
function unlockName(kind, k) {
  const label = { shape: SHAPES[k]?.label, eyes: EYES[k], hat: HATS[k], visor: VISORS[k], tool: TOOLS[k] }[kind];
  const what = { shape: 'body', eyes: 'face', hat: 'hat', visor: 'hunter face', tool: 'weapon' }[kind];
  return `${label} ${what}`;
}

/* ================= lobby hub ================= */
function clearHub() {
  const H = G.hub; if (!H) return;
  for (const o of H.others.values()) o.cham.dispose();
  if (H.me) H.me.dispose();
  if (H.dummy) H.dummy.dispose();
  for (const b of G.bubbles) b.s.parent?.remove(b.s);
  G.bubbles = [];
  G.hub = null;
  if (G.phase === 'hub') { G.my = null; G.hiders = []; G.hunters = []; }
}
function enterHub() {
  G.clearRound(); disposeMenuDoll();
  if (!MAP || MAP.id !== 'lobby') loadMap('lobby');
  const H = MAPS.lobby.hub;
  const me = new Cham({ id: G.online ? Net.id : 'me', name: PROFILE.name, local: true, human: true, color: PROFILE.tag, shape: PROFILE.cham.shape, eyes: PROFILE.cham.eyes });
  me.root.position.set(MAP.playerSpawn[0] + rand(-1.5, 1.5), 0, MAP.playerSpawn[1] + rand(-1, 1)); me.setYaw(Math.PI);
  const dummy = new Hunter({ id: 'tester', name: 'Camo tester', avatar: { color: '#5b5f6b', hat: 'none', visor: 'goggles', tool: 'hammer' }, ai: true, x: H.dummy.x, z: H.dummy.z, y: 0.18 });
  dummy.yaw = dummy.look = H.dummy.yaw; dummy.pitch = -0.12; dummy.sync(); dummy.state = 'statue';
  G.hub = { me, dummy, others: new Map(), ready: false, vote: null, cd: null, cdT: 0, pendingTex: new Map(), testT: 0, testRate: 0, testShow: 0, voteKey: '', lastPad: null };
  G.my = me; G.hiders = [me]; G.hunters = [dummy];
  G.phase = 'hub'; G.view = 'third'; G.ctrl.yaw = 0; G.ctrl.pitch = 0.3; G.paused = false;
  G.D = DIFF.normal;
  UI.hud(false); UI.screen(null); UI.hubHud(true); UI.renderHub();
  MAPS.lobby.hub.setVotes({}, null);
  if (G.online && Net.isHost) pushLobby();
}
function hubRemote(from, d) {
  const H = G.hub; if (!H || G.phase !== 'hub') return;
  let o = H.others.get(from);
  const p = G.lobby.players.get(from);
  if (!o) {
    const c = new Cham({ id: from, name: d.name || p?.name || 'Player', human: true, color: d.tag || p?.profile?.tag, shape: d.sh, eyes: d.eyes });
    c.root.position.set(d.p[0], d.p[1], d.p[2]); c.setYaw(d.y);
    o = { cham: c, ready: false, vote: null, seen: 0, tag: null, tagKey: '' };
    H.others.set(from, o); G.hiders.push(c);
    const tex = H.pendingTex.get(from); if (tex) { c.loadTex(tex); H.pendingTex.delete(from); }
  }
  const c = o.cham;
  if (d.eyes && d.eyes !== c.eyes && !c.painted) { c.eyes = d.eyes; c.blank(); }
  applyRemoteCham(c, d);
  o.seen = G.t; c.root.visible = true;
  if (o.ready !== !!d.ready) { o.ready = !!d.ready; UI.renderHub(); }
  if (o.vote !== d.vote) { o.vote = d.vote; refreshVotes(); }
  const key = (d.name || '') + (o.ready ? '1' : '0');
  if (o.tagKey !== key) {
    if (o.tag) c.root.remove(o.tag);
    o.tag = textSprite((o.ready ? '✓ ' : '') + (d.name || 'Player'), o.ready ? '#3ad49c' : 'rgba(15,18,26,.75)', o.ready ? '#06261a' : '#fff', 0.24);
    o.tag.position.y = 1.65; c.root.add(o.tag); o.tagKey = key; c.name = d.name || c.name;
  }
}
function voteCounts() {
  const counts = {}, H = G.hub; if (!H) return counts;
  if (H.vote) counts[H.vote] = 1;
  for (const o of H.others.values()) if (o.vote && G.t - o.seen < 3) counts[o.vote] = (counts[o.vote] || 0) + 1;
  return counts;
}
function topVote() {
  const c = voteCounts(), ids = Object.keys(c);
  if (!ids.length) return null;
  const max = Math.max(...ids.map((k) => c[k]));
  return pick(ids.filter((k) => c[k] === max));
}
function refreshVotes() {
  const H = G.hub; if (!H) return;
  const c = voteCounts(), key = JSON.stringify(c) + H.vote;
  if (key === H.voteKey) return;
  H.voteKey = key; MAPS.lobby.hub.setVotes(c, H.vote); UI.renderHub();
}
function hubPlayers() {
  const H = G.hub, out = [];
  if (!G.online) return [{ id: 'me', name: PROFILE.name, ready: H.ready, me: true, host: true, tag: PROFILE.tag }];
  for (const [id, p] of G.lobby.players) {
    const o = H.others.get(id), me = id === Net.id;
    out.push({ id, name: p.name, tag: p.profile?.tag, me, host: id === Net.hostId, ready: me ? H.ready : !!(o && o.ready && G.t - o.seen < 3), inHub: me || !!(o && G.t - o.seen < 3) });
  }
  return out;
}
function updateHub(dt) {
  const H = G.hub, M = MAPS.lobby.hub, me = G.my;
  if (!H || !me) return;
  updateMyCham(dt);
  if (G.online && Net.isPublic && !Net.isHost) {
    const ho = H.others.get(Net.hostId), last = ho ? ho.seen : (H.since ??= G.t);
    H.claimT = (H.claimT || 0) - dt;
    if (G.t - last > 15 && H.claimT <= 0) { H.claimT = 5; Net.send({ t: 'claimhost' }); }
  }
  const p = me.root.position;
  const onReady = Math.hypot(p.x - M.readyPad.x, p.z - M.readyPad.z) < M.readyPad.r && p.y < 0.3;
  if (onReady !== H.ready) { H.ready = onReady; Sound.ready(onReady); UI.renderHub(); M.readyPad.mesh.material.color.set(onReady ? 0x3ad49c : 0x1f8f66); }
  for (const vp of M.votePads) {
    if (Math.hypot(p.x - vp.x, p.z - vp.z) < vp.r && p.y < 0.3 && H.vote !== vp.id) { H.vote = vp.id; Sound.click(); toast(`Voted for ${MAPS[vp.id].name}`, 'good'); refreshVotes(); }
  }
  for (const jp of M.jumpPads) if (me.body.onGround && Math.hypot(p.x - jp.x, p.z - jp.z) < jp.r && p.y < 0.2) { me.body.vy = 11.8; me.body.onGround = false; Sound.boing(); }
  for (const [id, o] of H.others) {
    const c = o.cham;
    if (G.t - o.seen > 3) { c.root.visible = false; continue; }
    if (c.target) {
      const k = Math.min(1, dt * 12), q = c.root.position;
      q.x = lerp(q.x, c.target.x, k); q.y = lerp(q.y, c.target.y, k); q.z = lerp(q.z, c.target.z, k);
      c.setYaw(c.yaw + angDiff(c.yaw, c.target.yaw) * k);
    }
    c.animate(dt, !!c.remoteMoving);
  }
  if (!G.online) { for (const k of H.others.keys()) H.others.delete(k); }
  // camo tester
  const D = H.dummy; D.animTool(dt);
  const dx = p.x - D.pos.x, dz = p.z - D.pos.z, dist = Math.hypot(dx, dz);
  const facing = (dx * Math.sin(D.yaw) + dz * Math.cos(D.yaw)) / Math.max(dist, 0.01);
  H.testShow = dist < 11 && facing > 0.35 ? Math.min(1, H.testShow + dt * 3) : Math.max(0, H.testShow - dt * 3);
  H.testT -= dt;
  if (H.testShow > 0.5 && H.testT <= 0) {
    H.testT = 0.25;
    D.look = D.yaw + clamp(Math.atan2(dx, dz) - D.yaw, -0.6, 0.6); D.pitch = Math.atan2(me.center().y - 1.73, dist);
    const gains = D.perceive([me], 0.25); D.sus.clear();
    const g = (gains.get(me) || 0) / 0.25;
    H.testRate = lerp(H.testRate, g, 0.5);
  }
  refreshVotes();
  // countdown (host or offline)
  const players = hubPlayers().filter((x) => x.inHub !== false), nReady = players.filter((x) => x.ready).length;
  const allReady = players.length > 0 && nReady === players.length;
  const majority = G.online && players.length >= 3 && nReady * 2 >= players.length;
  if (!G.online || Net.isHost) {
    const want = allReady ? (G.online ? 5 : 3) : majority ? 20 : null;
    if (want != null && H.cd != null && H.cd > want) { H.cd = want; if (G.online) Net.relay({ k: 'cd', t: H.cd }); }
    if (want != null && !G.starting) {
      if (H.cd == null) { H.cd = want; H.cdT = 0; if (G.online) Net.relay({ k: 'cd', t: H.cd }); Sound.tick(); }
      H.cdT += dt;
      if (H.cdT >= 1) {
        H.cdT -= 1; H.cd--;
        if (G.online) Net.relay({ k: 'cd', t: H.cd });
        if (H.cd > 0) Sound.tick();
        if (H.cd <= 0) { H.cd = null; hubStart(); return; }
      }
    } else if (H.cd != null) { H.cd = null; if (G.online) Net.relay({ k: 'cd', t: null }); }
  }
  updateCamera(dt);
  G.netTick(dt);
}
function hubStart() {
  const map = topVote() || (G.online ? G.lobby.settings.map : G.solo.map);
  if (G.online) { if (Net.isHost) G.hostStartOnline(map); }
  else { G.solo.map = map; G.startSolo(); }
}
function pushLobby() { if (G.online) Net.send({ t: 'lobby', lobby: { settings: G.lobby.settings, map: G.lobby.settings.map, mode: G.lobby.settings.mode } }); UI.renderHub(); }

/* ================= menu scene (your doll on the club floor) ================= */
let menuDoll = null, menuT = 0, menuPoseT = 0, menuPoseI = 0;
const MENU_CYCLE = ['stand', 'wave', 'star', 'thinker', 'dance', 'crouch', 'reach', 'cheer', 'kneel'];
function disposeMenuDoll() { if (menuDoll) { menuDoll.dispose(); menuDoll = null; } }
function showMenuScene() {
  if (!MAP || MAP.id !== 'lobby') loadMap('lobby');
  disposeMenuDoll();
  menuDoll = new Cham({ name: PROFILE.name, shape: PROFILE.cham.shape, eyes: PROFILE.cham.eyes, color: PROFILE.tag });
  menuDoll.root.position.set(13.6, 0, 11.2); menuDoll.setYaw(0.35); menuDoll.setPose('stand', true);
  menuPoseT = 0; menuPoseI = 0;
}
function updateMenuScene(dt) {
  menuT += dt;
  if (!menuDoll) return;
  menuPoseT += dt;
  if (menuPoseT > 3.2) { menuPoseT = 0; menuPoseI = (menuPoseI + 1) % MENU_CYCLE.length; const k = MENU_CYCLE[menuPoseI]; if (POSES[k].emote) menuDoll.setEmote(k); else menuDoll.setPose(k); }
  menuDoll.animate(dt, false);
  const sw = Math.sin(menuT * 0.25) * 0.5;
  camera.position.set(13.75 + sw * 0.35, 0.62, 12.75); camera.lookAt(13.62 + sw * 0.05, 0.43, 11.2);
}

/* ================= effects ================= */
const fxGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
function burst(c) {
  const cols = c.avgColors(10), p = c.center();
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? '#ffffff' : pick(cols) }));
    m.position.copy(p); scene.add(m);
    G.fx.push({ m, v: new V3(rand(-3, 3), rand(1.5, 5.5), rand(-3, 3)), life: rand(0.7, 1.3) });
  }
}
function floatLabel(text, pos, bg, fg, life = 2.2) {
  const s = textSprite(text, bg, fg, 0.26); s.position.copy(pos).add(new V3(0, 0.9, 0)); scene.add(s);
  G.labels.push({ s, life, vy: life > 100 ? 0 : 0.35 });
}
function noteSprite(p, bg = '#ffffff') {
  const note = textSprite('♪', bg, '#222', 0.45); note.position.copy(p).add(new V3(0, 0.9, 0)); note.material.depthTest = true; scene.add(note);
  G.labels.push({ s: note, life: 1.6, vy: 0.5 });
}
function pingRing(p) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.06, p.z); scene.add(m);
  G.rings.push({ m, t: 0 }); G.fxHide.push(m);
}
const SPLAT_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#fff';
  g.beginPath(); g.arc(64, 64, 34, 0, 7); g.fill();
  for (let i = 0; i < 14; i++) { const a = Math.random() * 7, r = 30 + Math.random() * 26; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 4 + Math.random() * 9, 0, 7); g.fill(); }
  return new THREE.CanvasTexture(c);
})();
function splatWall(p, n, col) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: SPLAT_TEX, color: col, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
  m.position.copy(p).addScaledVector(n, 0.01); m.lookAt(p.clone().add(n)); m.rotateZ(Math.random() * 6);
  scene.add(m); G.splats.push(m);
  if (G.splats.length > 60) { const o = G.splats.shift(); scene.remove(o); o.material.dispose(); }
  Sound.splatHit(p);
}
function splatOn(c, uv, col) {
  const u = new THREE.Vector2(uv[0], uv[1]);
  c.paintDot(u, col, 14);
  for (let i = 0; i < 9; i++) c.paintDot(new THREE.Vector2(u.x + rand(-0.035, 0.035), u.y + rand(-0.035, 0.035)), col, rand(3, 7));
  c.flush(); Sound.splatHit(c.center());
}
const ballGeo = new THREE.SphereGeometry(0.07, 12, 8);
const rcBall = new THREE.Raycaster();
function spawnBall(p, v, own) {
  const m = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: PAINTBALL })); m.position.copy(p); scene.add(m);
  G.balls.push({ m, v, own, life: 3 }); G.fxHide.push(m);
}
function updateBalls(dt) {
  G.balls = G.balls.filter((b) => {
    b.life -= dt;
    const from = b.m.position.clone();
    b.v.y -= 9.8 * dt;
    const step = b.v.clone().multiplyScalar(dt), len = step.length();
    rcBall.set(from, step.clone().normalize()); rcBall.far = len + 0.07;
    const h = rcBall.intersectObjects([...env, ...G.targets().map((c) => c.mesh)], false)[0];
    if (h || b.life <= 0) {
      scene.remove(b.m);
      if (h && b.own) {
        const cham = h.object.userData.cham;
        if (cham) { G.stats.splats++; emitAny({ e: 'splat', id: cham.id, uv: [h.uv.x, h.uv.y], col: PAINTBALL }); toast('Splat! Something over there is not a wall…', 'good'); }
        else if (h.face) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); emitAny({ e: 'splatw', p: [h.point.x, h.point.y, h.point.z], n: [n.x, n.y, n.z], col: PAINTBALL }); }
      } else if (h && !h.object.userData.cham && h.face) { /* remote ball: the shooter sends the splat */ }
      return false;
    }
    b.m.position.add(step);
    return true;
  });
}
function updateFx(dt) {
  G.fx = G.fx.filter((f) => {
    f.life -= dt;
    if (!f.still) { f.v.y -= 12 * dt; f.m.position.addScaledVector(f.v, dt); if (f.m.position.y < 0.04) { f.m.position.y = 0.04; f.v.multiplyScalar(0.4); } f.m.rotation.x += dt * 8; }
    f.m.scale.setScalar(Math.max(0.01, Math.min(1, f.life * 2)));
    if (f.life <= 0) { scene.remove(f.m); f.m.material.dispose(); return false; }
    return true;
  });
  G.labels = G.labels.filter((l) => { l.life -= dt; l.s.position.y += l.vy * dt; if (l.life <= 0) { scene.remove(l.s); return false; } return true; });
  G.rings = G.rings.filter((r) => { r.t += dt; const s = 1 + r.t * 9; r.m.scale.set(s, s, 1); r.m.material.opacity = Math.max(0, 0.8 - r.t * 0.85); if (r.t > 0.95) { scene.remove(r.m); return false; } return true; });
  G.bubbles = G.bubbles.filter((b) => { b.life -= dt; if (b.life <= 0) { b.s.parent?.remove(b.s); return false; } return true; });
  updateBalls(dt);
}
function chatBubble(id, text) {
  const H = G.hub; if (!H) return;
  const c = id === (G.online ? Net.id : 'me') ? H.me : H.others.get(id)?.cham;
  if (!c) return;
  for (const b of G.bubbles) if (b.c === c) { b.s.parent?.remove(b.s); b.life = 0; }
  const s = textSprite(text.length > 38 ? text.slice(0, 36) + '…' : text, '#ffffff', '#1b1d22', 0.26); s.position.y = 1.95; c.root.add(s);
  G.bubbles.push({ s, c, life: 5 });
}

/* first-person tool view model */
let toolVM = new THREE.Group(); camera.add(toolVM); toolVM.visible = false;
function setToolVM(kind) {
  camera.remove(toolVM);
  toolVM = buildTool(kind || 'hammer');
  toolVM.position.set(0.34, -0.5, -0.6); toolVM.rotation.set(0.4, 0, -0.3);
  toolVM.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.depthTest = false; o.renderOrder = 20; } o.castShadow = false; });
  camera.add(toolVM); toolVM.visible = true;
}
let swingT = 0;

/* ================= input ================= */
const keys = {};
const mouse = { x: 0, y: 0, down: false, right: false, lastUV: null };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') { if (e.code === 'Escape') e.target.blur(); return; }
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (e.repeat && keys[e.code]) return;
  keys[e.code] = true; onKey(e);
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyR' && UI.wheelOpen && UI.wheelHold) { UI.wheel(false); G.lock(); }
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function playing() { return G.phase === 'prep' || G.phase === 'hunt'; }
function active() { return playing() || G.phase === 'hub'; }
function controllable() { return G.my && !G.my.caught && G.view === 'third' && active(); }
function onKey(e) {
  if (e.code === 'KeyT' && G.online && active()) { e.preventDefault(); UI.openChat(); return; }
  if (e.code === 'Tab' && G.phase === 'hub') { UI.hubPanel(!UI.panelOpen); return; }
  if (!active() || G.paused) return;
  const P = G.my;
  if (e.code === 'KeyF' && controllable()) { togglePaint(); e.preventDefault(); return; }
  if (e.code === 'Enter' && G.phase === 'prep' && (G.view === 'third' || (G.party && G.view === 'first'))) { if (G.party || !G.online || G.isHost) G.finishPrep(); return; }
  if (G.paint) {
    if (e.code === 'KeyB') UI.tool('brush'); if (e.code === 'KeyM') UI.tool('mimic'); if (e.code === 'KeyI') UI.tool('picker'); if (e.code === 'KeyG') UI.tool('fill');
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault(); return; }
    if (e.code === 'Escape') togglePaint();
  }
  if (G.view === 'first' && G.phase === 'hunt' && e.code === 'KeyE') { hunterPing(); return; }
  if (!controllable()) { if (G.view === 'spec' && /Digit[1-9]/.test(e.code)) G.specIdx = +e.code.slice(5) - 1; return; }
  if (e.code === 'KeyR') { UI.wheel(!UI.wheelOpen, true); return; }
  const pk = POSE_ORDER.find((k) => POSES[k].key && 'Digit' + POSES[k].key === e.code);
  if (pk) setPose(pk);
  if (e.code === 'KeyZ' && !e.ctrlKey) P.setYaw(P.yaw + Math.PI / 12);
  if (e.code === 'KeyX') P.setYaw(P.yaw - Math.PI / 12);
  if (G.phase === 'hub') { if (e.code === 'KeyG') { const em = pick(['wave', 'dance', 'cheer']); P.setEmote(em); } return; }
  if (e.code === 'KeyC') makeClone();
  if (e.code === 'KeyQ') taunt();
  if (e.code === 'KeyV') decoy();
}
function setPose(p) {
  const P = G.my; if (!P) return;
  if (POSES[p]?.emote) { P.setEmote(p); return; }
  P.setPose(p); if (POSES[p].wall) snapToWall(P); UI.refreshBars();
}
function emitAny(ev) { if (G.online) Net.relay({ k: 'ev', ev }); G.applyEvent(ev); }
function makeClone() {
  if (G.ab.clones <= 0) { toast('No clones left'); return; }
  const P = G.my, p = P.root.position;
  G.ab.clones--; UI.refreshBars();
  emitAny({ e: 'clone', id: 'cl' + uid(), owner: P.id, x: p.x, y: p.y, z: p.z, yaw: P.yaw, pose: P.pose });
  toast('Clone placed. Now sneak somewhere else!', 'good'); Sound.splat();
}
function taunt() {
  if (G.phase !== 'hunt') { toast('Taunts only count during the hunt'); return; }
  if (G.ab.taunt > 0) return;
  G.ab.taunt = AB.tauntCD; G.stats.taunts++;
  emitAny({ e: 'whistle', id: G.my.id, chance: 0.85 });
  toast('+20 XP taunt. They heard that…', 'warn');
}
function decoy() {
  if (G.phase !== 'hunt') { toast('Decoys work during the hunt'); return; }
  if (G.ab.decoys <= 0) { toast('No decoys left'); return; }
  const dir = new V3(); camera.getWorldDirection(dir);
  const h = envHit(camera.position, dir, 16);
  const p = h ? h.point.clone().addScaledVector(dir, -0.15) : camera.position.clone().addScaledVector(dir, 16);
  p.y = Math.max(0.2, p.y);
  G.ab.decoys--; UI.refreshBars();
  emitAny({ e: 'decoy', x: p.x, y: p.y, z: p.z });
  toast('Decoy thrown. Hunters will check it out.', 'good');
}
function hunterPing() {
  if (G.ab.ping > 0 || !G.fp) return;
  G.ab.ping = AB.pingCD;
  const p = G.fp.pos;
  emitAny({ e: 'ping', id: G.myHunter.id, x: p.x, y: p.y, z: p.z });
}
function shootPaint() {
  if (G.ab.ammo < 1) { toast('Out of paintballs. They recharge.'); return; }
  G.ab.ammo--; Sound.shoot();
  const dir = new V3(); camera.getWorldDirection(dir);
  const p = camera.position.clone().addScaledVector(dir, 0.5).add(new V3(0, -0.12, 0));
  const v = dir.multiplyScalar(19).add(new V3(0, 1.2, 0));
  spawnBall(p, v.clone(), true);
  if (G.online) Net.relay({ k: 'ev', ev: { e: 'pb', by: G.myId, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] } });
}
renderer.domElement.addEventListener('mousedown', (e) => {
  Sound.init();
  if (!active() || G.paint || UI.wheelOpen || UI.panelOpen) return;
  if (!document.pointerLockElement) { G.lock(); return; }
  if (G.view === 'first' && G.phase === 'hunt') { if (e.button === 0) bonk(); else if (e.button === 2) shootPaint(); }
});
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked && active() && !G.paint && !UI.chatOpen && !UI.wheelOpen && !UI.panelOpen) { G.paused = !G.online && G.phase !== 'hub'; UI.pause(true); }
  if (locked) { G.paused = false; UI.pause(false); }
});
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (document.pointerLockElement) {
    const s = 0.0022 * SETTINGS.sens, iy = SETTINGS.invertY ? -1 : 1;
    if (G.view === 'first' && G.fp) { G.fp.yaw -= e.movementX * s; G.fp.pitch = clamp(G.fp.pitch - e.movementY * s * iy, -1.5, 1.5); }
    else { G.ctrl.yaw -= e.movementX * s; G.ctrl.pitch = clamp(G.ctrl.pitch + e.movementY * s * iy, -0.45, 1.25); }
    return;
  }
  if (G.paint) {
    if (mouse.right) { G.paintCam.yaw -= e.movementX * 0.008; G.paintCam.pitch = clamp(G.paintCam.pitch + e.movementY * 0.006, -0.6, 1.3); }
    else if (mouse.down) paintAt(e, false);
  }
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!G.paint || !G.my) return;
  if (e.button === 2) { mouse.right = true; return; }
  if (e.button !== 0) return;
  mouse.down = true; mouse.lastUV = null;
  if (e.altKey || UI.curTool === 'picker') { pickColor(e); mouse.down = false; return; }
  if (UI.curTool === 'fill') { pushUndo(); G.my.fill(UI.color); G.my.flush(); Sound.splat(); mouse.down = false; return; }
  pushUndo(); paintAt(e, true);
});
addEventListener('pointerup', () => { mouse.down = false; mouse.right = false; mouse.lastUV = null; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  if (G.paint) G.paintCam.dist = clamp(G.paintCam.dist + Math.sign(e.deltaY) * 0.18, 0.8, 5);
  else if (G.view === 'third' || G.view === 'spec') G.ctrl.dist = clamp(G.ctrl.dist + Math.sign(e.deltaY) * 0.25, 1.0, 6);
}, { passive: true });

/* ---------- painting ---------- */
const rcPaint = new THREE.Raycaster(), ndcV = new THREE.Vector2();
function evNdc(x, y) { ndcV.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); return ndcV; }
const undoStack = [];
function pushUndo() { const P = G.my; undoStack.push({ c: P, d: P.ctx.getImageData(0, 0, TS, TS) }); if (undoStack.length > 25) undoStack.shift(); }
function undo() { const u = undoStack.pop(); if (!u) return; u.c.ctx.putImageData(u.d, 0, 0); u.c.dirty = true; u.c.flush(); Sound.click(); }
function pickColor(e) {
  rcPaint.setFromCamera(evNdc(e.clientX, e.clientY), camera);
  const h = rcPaint.intersectObjects(env, false)[0]; if (!h) return;
  const c = surfaceColor(h);
  UI.setColor('#' + new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).getHexString(), true);
  if (h.object.material.roughness != null) UI.setRough(h.object.material.roughness);
  Sound.click();
}
function paintAt(e, first) {
  const P = G.my; if (!P) return;
  const size = UI.brush;
  if (UI.curTool === 'mimic') {
    if (G.ink <= 0) { if (first) toast('Out of mimic ink. Use the brush and eyedropper.'); return; }
    const rpx = 6 + size * 1.4;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * rpx;
      rcPaint.setFromCamera(evNdc(e.clientX + Math.cos(a) * r, e.clientY + Math.sin(a) * r), camera);
      const h1 = rcPaint.intersectObject(P.mesh, false)[0]; if (!h1) continue;
      const h2 = envHit(h1.point.clone().addScaledVector(rcPaint.ray.direction, 0.01), rcPaint.ray.direction, 40); if (!h2) continue;
      P.paintDot(h1.uv, surfaceColor(h2), 2.4 + size * 0.12);
      if (G.phase !== 'hub') G.ink = Math.max(0, G.ink - 0.012);
    }
    P.flush(); UI.refreshInk(); return;
  }
  rcPaint.setFromCamera(evNdc(e.clientX, e.clientY), camera);
  const h = rcPaint.intersectObject(P.mesh, false)[0];
  if (!h) { mouse.lastUV = null; return; }
  const uv = h.uv.clone();
  if (mouse.lastUV && Math.abs(mouse.lastUV.x - uv.x) < 0.06 && Math.abs(mouse.lastUV.y - uv.y) < 0.06) {
    const steps = Math.ceil(mouse.lastUV.distanceTo(uv) * TS / Math.max(1, size * PSCALE * 0.4));
    for (let i = 1; i <= steps; i++) P.paintDot(mouse.lastUV.clone().lerp(uv, i / steps), UI.color, size);
  } else P.paintDot(uv, UI.color, size);
  mouse.lastUV = uv;
  P.flush();
  if (first) Sound.splat();
}
function togglePaint() {
  if (!G.my) return;
  G.paint = !G.paint;
  if (G.paint) { G.my.setPose(G.my.pose === 'stand' || POSES[G.my.pose].move ? G.my.pose : G.my.pose); G.my.emote = null; G.my.rebake(); }
  UI.paintPanel(G.paint); UI.wheel(false);
  if (G.paint) { G.paintCam.yaw = G.ctrl.yaw; G.paintCam.pitch = 0.15; G.paintCam.dist = 1.7; if (document.pointerLockElement) document.exitPointerLock(); }
  else G.lock();
}

/* ---------- hunter bonk ---------- */
const rcBonk = new THREE.Raycaster();
function bonk() {
  if (swingT > 0) return;
  swingT = 0.32; Sound.swoosh(null);
  if (G.online) Net.relay({ k: 'ev', ev: { e: 'swing', id: G.myHunter.id } });
  rcBonk.setFromCamera(new THREE.Vector2(0, 0), camera); rcBonk.far = 3.3;
  const meshes = G.targets().map((c) => c.mesh);
  const h = rcBonk.intersectObjects([...env, ...meshes], false)[0];
  if (h && h.object.userData.cham) { Sound.bonk(h.point); G.requestTag(h.object.userData.cham.id); }
  else if (h) Sound.thud();
}

/* ================= update ================= */
function updateMyCham(dt) {
  const P = G.my;
  if (!P || P.caught) return;
  let moving = false;
  if (!G.paint && !UI.chatOpen && !UI.wheelOpen && !UI.panelOpen && !G.paused) {
    let mx = 0, mz = 0;
    if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    moving = !!(mx || mz);
    if (moving && !POSES[P.pose].move) { P.setPose('stand'); UI.refreshBars(); }
    if (moving) {
      const y = G.ctrl.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
      let vx = fx * -mz + rx * mx, vz = fz * -mz + rz * mx; const l = Math.hypot(vx, vz); vx /= l; vz /= l;
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 1.3 : 3.7) * (POSES[P.pose].speed || 1) * (P.size === 'petite' ? 0.85 : 1);
      P.root.position.x += vx * sp * dt; P.root.position.z += vz * sp * dt;
      P.setYaw(P.yaw + angDiff(P.yaw, Math.atan2(vx, vz)) * Math.min(1, dt * 12));
    }
    if (keys.Space && P.body.onGround && POSES[P.pose].move) { P.body.vy = 6.1; P.body.onGround = false; Sound.jump(); }
  }
  const wasMoving = P.wasMoving; P.wasMoving = moving;
  if (wasMoving && !moving) P.rebake();
  collideBody(P.body, dt, true);
  P.animate(dt, moving);
}
function updateFP(dt) {
  const f = G.fp; if (!f) return;
  let mx = 0, mz = 0;
  if (!UI.chatOpen) { if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1; }
  if (mx || mz) {
    const y = f.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const vx = fx * -mz + rx * mx, vz = fz * -mz + rz * mx, l = Math.hypot(vx, vz);
    const sp = keys.ShiftLeft ? 2 : 4.6;
    f.pos.x += vx / l * sp * dt; f.pos.z += vz / l * sp * dt;
  }
  if (keys.Space && f.onGround && !UI.chatOpen) { f.vy = 6.4; f.onGround = false; }
  collideBody(f, dt, true);
  camera.position.set(f.pos.x, f.pos.y + 1.6, f.pos.z);
  camera.rotation.set(f.pitch, f.yaw, 0, 'YXZ');
  if (swingT > 0) swingT -= dt;
  const s = swingT > 0 ? Math.sin((1 - swingT / 0.32) * Math.PI) : 0;
  const bob = (mx || mz) && f.onGround ? Math.sin(G.t * 10) * 0.015 : 0;
  toolVM.rotation.set(0.4 - s * 1.5, 0, -0.3); toolVM.position.set(0.34, -0.5 + bob, -0.6 - s * 0.1);
  if (G.myHunter) { G.myHunter.pos.copy(f.pos); G.myHunter.yaw = f.yaw + Math.PI; G.myHunter.sync(); }
  rcBonk.setFromCamera(new THREE.Vector2(0, 0), camera); rcBonk.far = 3.3;
  UI.crossHot(!!rcBonk.intersectObjects(env, false)[0]);
}
const camTarget = new V3();
function thirdCam(target, yaw, pitch, dist, dt, snap) {
  const dir = new V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const h = envHit(target, dir, dist + 0.3);
  const d = h ? Math.max(0.4, h.distance - 0.25) : dist;
  const want = target.clone().addScaledVector(dir, d);
  if (snap) camera.position.copy(want); else camera.position.lerp(want, Math.min(1, dt * 14));
  camera.lookAt(target);
}
function updateCamera(dt) {
  if (G.view === 'first') return;
  if (G.view === 'spec') {
    const hs = G.hunters.filter((h) => !h.local);
    if (hs.length) { const h = hs[G.specIdx % hs.length]; camTarget.set(h.pos.x, h.pos.y + 1.6, h.pos.z); thirdCam(camTarget, G.ctrl.yaw, G.ctrl.pitch, 4.5, dt); }
    else if (G.fp) camera.position.set(G.fp.pos.x, 1.6, G.fp.pos.z);
    return;
  }
  const P = G.my; if (!P) return;
  if (G.paint) thirdCam(P.center(), G.paintCam.yaw, G.paintCam.pitch, G.paintCam.dist, dt, true);
  else { camTarget.copy(P.root.position); camTarget.y += Math.max(0.32, Math.min(P.body.h, CHAM_H) * 0.95); thirdCam(camTarget, G.ctrl.yaw, G.ctrl.pitch, G.ctrl.dist, dt, false); }
}
let lastTickSec = -1, hudT = 0;
function update(dt) {
  G.t += dt;
  updateFx(dt);
  if (MAP && MAP.tick) MAP.tick(dt);
  if (G.phase === 'menu' || G.phase === 'boot') { updateMenuScene(dt); return; }
  if (G.phase === 'hub') { updateHub(dt); hudT -= dt; if (hudT <= 0) { hudT = 0.1; UI.hubTick(); } return; }
  if (G.phase === 'end') { if (G.reveal) G.updateReveal(dt); else updateCamera(dt); G.netTick(dt); return; }
  if (G.paused || !playing()) return;
  G.timer -= dt;
  if (G.ab.taunt > 0) G.ab.taunt -= dt;
  if (G.ab.ping > 0) G.ab.ping -= dt;
  if (G.ab.ammo < AB.ammo) { G.ab.ammoT += dt; if (G.ab.ammoT >= AB.ammoRecharge) { G.ab.ammoT = 0; G.ab.ammo++; } } else G.ab.ammoT = 0;
  const sec = Math.ceil(G.timer);
  if (sec <= 10 && sec !== lastTickSec && sec > 0) { lastTickSec = sec; Sound.tick(); }
  if (G.view === 'first') updateFP(dt); else updateMyCham(dt);
  for (const c of G.hiders) {
    if (!c.local && c.target) {
      const k = Math.min(1, dt * 12), p = c.root.position;
      p.x = lerp(p.x, c.target.x, k); p.y = lerp(p.y, c.target.y, k); p.z = lerp(p.z, c.target.z, k);
      c.setYaw(c.yaw + angDiff(c.yaw, c.target.yaw) * k);
      c.animate(dt, !!c.remoteMoving);
    } else if (!c.local) c.animate(dt, false);
    c.speed = c.lastPos ? c.root.position.distanceTo(c.lastPos) / Math.max(dt, 1e-4) : 0;
    c.lastPos = (c.lastPos || new V3()).copy(c.root.position);
  }
  if (G.phase === 'prep' && G.timer <= 3.2 && G.timer > 0) {
    const n = Math.ceil(G.timer);
    if (n !== G.lastCount) { G.lastCount = n; banner('Hunt starts in', String(n), '', 'count', 800); }
  }
  if (G.phase === 'hunt' && !G.overtime && G.timer <= 30 && G.phaseLen > 45) {
    G.overtime = true; banner('30 seconds left', 'Overtime', G.my && !G.my.caught ? 'Hunters move faster. Hold still!' : 'Hunters move faster. Finish the job!', 'warn', 2200); Sound.alert(null);
  }
  $('#timer').classList.toggle('overtime', G.phase === 'hunt' && !!G.overtime);
  if (G.isHost) {
    if (G.phase === 'prep' && G.timer <= 0) G.finishPrep();
    else if (G.phase === 'hunt') {
      G.forcedT -= dt;
      if (G.forcedT <= 0) { G.forcedT = G.P.mode === 'infection' ? 35 : 40; G.forcedTaunt(); }
      const targets = G.targets();
      for (const h of G.hunters) { if (h.ai) h.update(dt, targets); else if (!h.local) h.puppet(dt); }
      if (G.timer <= 0) G.hostEnd();
    } else for (const h of G.hunters) { if (h.ai) h.update(dt, []); else if (!h.local) h.puppet(dt); }
  } else for (const h of G.hunters) if (!h.local) h.puppet(dt);
  if (G.my && G.phase === 'hunt') {
    let s = 0; for (const h of G.hunters) s = Math.max(s, h.sus.get(G.my) || 0);
    G.playerSus = s; G.stats.maxSus = Math.max(G.stats.maxSus, s);
  }
  updateCamera(dt);
  G.netTick(dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; UI.tick(); }
}
function step(dt) {
  update(dt);
  for (const c of G.hiders) c.flush();
  Sound.listener(camera);
  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(frame); }
/* When the window is minimised or covered the browser stops animation frames. Keep the game and its networking
   ticking at 10 Hz without rendering so a host who alt-tabs doesn't freeze everyone else's round. */
setInterval(() => {
  const now = performance.now();
  if (now - last < 250 || G.phase === 'boot') return;
  let left = Math.min(2, (now - last) / 1000); last = now;
  while (left > 1e-4) { const dt = Math.min(0.05, left); left -= dt; update(dt); }
  for (const c of G.hiders) c.flush();
}, 100);

/* ================= map thumbnails (rendered once at boot) ================= */
const THUMB_CAM = {
  mansion: [9.5, 1.7, 13.5, 4, 1.0, 6],
  backrooms: [15, 1.6, 13.5, 8, 1.2, 6],
  sewer: [2, 1.8, 14.2, 14, 1.0, 10.5],
  sugar: [12, 2.4, 27, 21, 1.2, 16],
  gallery: [11, 1.7, 12.5, 20, 1.4, 3],
};
const THUMBS = {};
async function makeThumbs() {
  const W = 400, H = 225, rt = new THREE.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4);
  const cam = new THREE.PerspectiveCamera(62, W / H, 0.05, 160);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const img = g.createImageData(W, H);
  for (const id of [...MAP_ORDER, 'lobby']) {
    await nextFrame();
    loadMap(id);
    const t = id === 'lobby' ? [MAP.playerSpawn[0], 3.2, MAP.playerSpawn[1] + 6, MAP.playerSpawn[0], 1.2, MAP.playerSpawn[1] - 6] : THUMB_CAM[id] || [MAP.playerSpawn[0], 1.7, MAP.playerSpawn[1], MAP.bounds.x1 / 2, 1, MAP.bounds.z1 / 2];
    cam.position.set(t[0], t[1], t[2]); cam.lookAt(t[3], t[4], t[5]);
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(null);
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    THUMBS[id] = c.toDataURL('image/jpeg', 0.85);
  }
  rt.dispose();
}
