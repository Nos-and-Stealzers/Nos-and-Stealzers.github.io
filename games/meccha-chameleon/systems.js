'use strict';
/* Round systems layered on game.js:
   - Stick:   wall and ceiling sticking with any pose, flush to the surface, wrap round corners.
   - Buried:  "your body is buried too much" check; flashes the body red for everyone.
   - Spawns:  spread-out hider spawns, hunter pen spots, drop-in intro, gate countdown sign.
   - Cues:    on-screen direction arcs for whistles, chirps, footsteps and pings.
   - Seeker:  hunter tag charges, hit markers, sonar ping wave, hunter team marks. */

const _sv1 = new V3(), _sv2 = new V3(), _UP = new V3(0, 1, 0);

/* ======================= wall + ceiling stick ======================= */
const Stick = {
  REACH: 0.75,
  surfaceNormal(h) {
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    return n;
  },
  /** Find a wall (or ceiling with up=true) next to the chameleon. */
  probe(P, dirs, up = false) {
    const c = P.center();
    if (up) {
      P.root.updateMatrixWorld(true);
      const top = c.clone(); top.y = new THREE.Box3().setFromObject(P.mesh).max.y - 0.05;
      const h = envHit(top, _UP, 0.7);
      if (!h || !h.face) return null;
      const n = this.surfaceNormal(h); if (n.y > -0.7) return null;
      return { kind: 'ceil', point: h.point.clone(), n: new V3(0, -1, 0) };
    }
    let best = null;
    for (const d of dirs) {
      if (!d || d.lengthSq() < 1e-6) continue;
      const dir = d.clone().setY(0).normalize();
      const h = envHit(c, dir, this.REACH + P.halfDepth());
      if (!h || !h.face) continue;
      const n = this.surfaceNormal(h); n.y = 0;
      if (n.lengthSq() < 0.5) continue;
      n.normalize(); if (n.dot(dir) > 0) n.negate();
      if (!best || h.distance < best.d) best = { kind: 'wall', point: h.point.clone(), n, d: h.distance };
    }
    return best;
  },
  /** A wall in the way of a sideways move along the surface (rays from the body's middle and its ends). */
  ahead(P, dir, step) {
    P.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(P.mesh), c = b.getCenter(new V3()), sz = b.getSize(new V3());
    const half = Math.abs(dir.x) * sz.x / 2 + Math.abs(dir.z) * sz.z / 2;
    const offs = P.stick?.kind === 'ceil' ? [0] : [-sz.y * 0.3, 0, sz.y * 0.3];
    for (const oy of offs) {
      const o = c.clone(); o.y += oy;
      const h = envHit(o, dir, half + step + 0.03);
      if (h && h.face) { const n = this.surfaceNormal(h); if (Math.abs(n.y) < 0.6 && n.dot(dir) < -0.3) return h; }
    }
    return null;
  },
  dirsFor(P) {
    const cam = new V3(-Math.sin(G.ctrl.yaw), 0, -Math.cos(G.ctrl.yaw)), body = new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const mv = P.lastMove ? P.lastMove.clone() : null;
    return [mv, cam, body, body.clone().negate()];
  },
  /** Push the body along the surface normal until it only just touches the surface. */
  flush(P) {
    const st = P.stick; if (!st) return;
    P.root.updateMatrixWorld(true);
    const pos = P.rig.pickGeo.attributes.position, m = P.mesh.matrixWorld;
    let minD = 1e9, minY = 1e9, topY = -1e9;
    for (let i = 0; i < pos.count; i++) {
      _sv1.fromBufferAttribute(pos, i).applyMatrix4(m);
      const d = _sv2.copy(_sv1).sub(st.point).dot(st.n);
      if (d < minD) minD = d; if (_sv1.y < minY) minY = _sv1.y; if (_sv1.y > topY) topY = _sv1.y;
    }
    if (minD < 1e8) P.root.position.addScaledVector(st.n, 0.012 - minD);
    const floor = MAP.floorY || 0;
    if (st.kind === 'wall') {
      const low = minY + st.n.y * (0.012 - minD);
      if (low < floor + 0.004) P.root.position.y += floor + 0.004 - low;
      const ceil = Math.min(MAP.ceilH ?? 99, st.ceilY ?? 99);
      const high = topY + st.n.y * (0.012 - minD);
      if (high > ceil - 0.01) P.root.position.y -= high - (ceil - 0.01);
      st.bottom = Math.max(low, floor + 0.004);
      st.top = Math.min(high, ceil - 0.01);
    }
    P.body.vy = 0;
  },
  tiltFor(P, kind) { return kind === 'ceil' ? Math.PI : lyingPose(P.pose) ? Math.PI / 2 : 0; },
  orient(P) {
    const st = P.stick; if (!st) return;
    if (st.kind === 'wall') P.yaw = Math.atan2(st.n.x, st.n.z);
    P.setOrient(this.tiltFor(P, st.kind), st.kind === 'wall' ? st.roll || 0 : 0, st.n);
    this.flush(P);
  },
  attach(P, hit) {
    if (!hit) return false;
    if (P.emote) P.emote = null;
    if (hit.kind === 'wall' && POSES[P.pose].move) P.setPose('flat', true);
    if (hit.kind === 'ceil' && (POSES[P.pose].move || !lyingPose(P.pose))) P.setPose('lie', true);
    P.stick = { kind: hit.kind, n: hit.n.clone(), point: hit.point.clone(), roll: 0 };
    if (hit.kind === 'wall') { P.root.position.x = hit.point.x + hit.n.x * 0.3; P.root.position.z = hit.point.z + hit.n.z * 0.3; }
    else P.root.position.y = hit.point.y - P.dims.y - 0.02;
    P.body.vy = 0; P.body.onGround = true; P.autoCrouch = false;
    this.orient(P);
    if (hit.kind === 'wall') { const out = Math.atan2(hit.n.x, hit.n.z); if (Math.abs(angDiff(out, G.ctrl.yaw)) > 1.25) G.ctrl.yaw = out; }
    else G.ctrl.pitch = -0.3;
    Sound.thud(); dustPuff(hit.point, 3, 0.8);
    P.rebake(); UI.refreshBars?.(); UI.prompts?.();
    return true;
  },
  /** Space in the air next to a wall, Space while walking into a wall, or Space up a wall into the ceiling. */
  tryAttach(P, fromGround) {
    const dirs = fromGround ? [P.lastMove, new V3(-Math.sin(G.ctrl.yaw), 0, -Math.cos(G.ctrl.yaw))] : this.dirsFor(P);
    const hit = this.probe(P, dirs);
    if (!hit) return false;
    if (fromGround && hit.d > 0.35 + P.halfDepth()) return false;
    if (fromGround) P.root.position.y += 0.25;
    return this.attach(P, hit);
  },
  release(P, hop) {
    const st = P.stick; if (!st) return;
    P.stick = null;
    P.setOrient(0, 0);
    if (st.kind === 'wall') { P.root.position.addScaledVector(st.n, 0.12); }
    else { P.root.position.y = Math.min(P.root.position.y, st.point.y - CHAM_H - 0.05); }
    P.setPose('stand', true);
    P.body.vy = hop ? 1.6 : 0; P.body.onGround = false;
    P.rebake(); UI.refreshBars?.(); UI.prompts?.();
  },
  /** Keep the follow camera on the open side of the wall (or under the ceiling) instead of inside it. */
  camClamp(P, dt) {
    const st = P.stick, c = G.ctrl;
    if (st.kind === 'ceil') { if (c.pitch > -0.12) c.pitch = lerp(c.pitch, -0.3, Math.min(1, dt * 8)); return; }
    const out = Math.atan2(st.n.x, st.n.z), off = angDiff(out, c.yaw), lim = 1.25;
    if (Math.abs(off) > lim) c.yaw = out + Math.sign(off) * lim;
  },
  /** A pose picked while stuck re-fits to the surface instead of dropping you. */
  repose(P) { if (P.stick) { P.setPose(P.pose, true); this.orient(P); P.rebake(); } },
  rollBy(P, a) {
    const st = P.stick; if (!st) return false;
    if (st.kind === 'wall') { st.roll = (st.roll || 0) + a; this.orient(P); }
    else { P.yaw += a; P.applyOrient(); this.flush(P); }
    P.rebake(); return true;
  },
  update(P, dt, free) {
    const st = P.stick;
    P.body.vy = 0; P.body.onGround = true;
    if (!free) return;
    const up = keys.Space || keys.KeyW, down = keys.KeyS || crouchHeld();
    let side = 0; if (keys.KeyA) side -= 1; if (keys.KeyD) side += 1;
    if (st.kind === 'wall') {
      const vy = (up ? 1 : 0) - (down ? 1 : 0);
      if (vy) {
        const before = P.root.position.y;
        P.root.position.y += vy * 1.15 * dt;
        this.flush(P);
        if (vy > 0) {
          const c = this.probe(P, null, true);
          if (c && c.point.y - (st.top ?? 0) < 0.12) { this.attach(P, c); toast('On the ceiling · WASD crawl · Shift drop'); return; }
        }
        if (vy < 0 && st.bottom <= (MAP.floorY || 0) + 0.006 && Math.abs(P.root.position.y - before) < 1e-4) { this.release(P, false); return; }
      }
      if (side) {
        const camR = new V3(Math.cos(G.ctrl.yaw), 0, -Math.sin(G.ctrl.yaw));
        const t = new V3().crossVectors(_UP, st.n).normalize();
        const s = Math.sign(camR.dot(t)) || 1;
        const old = P.root.position.clone(), oldN = st.n.clone(), oldPt = st.point.clone();
        const md = t.clone().multiplyScalar(side * s);
        const wallAhead = this.ahead(P, md, 0.95 * dt);
        if (wallAhead) {
          // inside corner: step onto the wall in front
          const n2 = this.surfaceNormal(wallAhead); n2.y = 0;
          if (n2.lengthSq() > 0.5) { n2.normalize(); if (n2.dot(md) > 0) n2.negate(); st.n.copy(n2); st.point.copy(wallAhead.point); st.roll = 0; this.orient(P); }
          return;
        }
        P.root.position.addScaledVector(md, 0.95 * dt);
        const hit = this.probe(P, [st.n.clone().negate()]);
        if (hit && hit.n.dot(oldN) > 0.2) {
          const turned = hit.n.dot(oldN) < 0.985;
          st.n.copy(hit.n); st.point.copy(hit.point);
          if (turned) this.orient(P); else this.flush(P);
        } else { P.root.position.copy(old); st.n.copy(oldN); st.point.copy(oldPt); }
      }
    } else {
      if (crouchHeld()) { this.release(P, false); return; }
      let mx = 0, mz = 0; if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; mx = side;
      if (mx || mz) {
        const y = G.ctrl.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
        const vx = fx * -mz + rx * mx, vz = fz * -mz + rz * mx, l = Math.hypot(vx, vz);
        const old = P.root.position.clone(), md = new V3(vx / l, 0, vz / l);
        if (this.ahead(P, md, 0.8 * dt)) return;
        P.root.position.addScaledVector(md, 0.8 * dt);
        const c = this.probe(P, null, true);
        if (!c) P.root.position.copy(old); else { st.point.copy(c.point); this.flush(P); }
      }

    }
  },
};

/* ======================= buried check ======================= */
const Buried = {
  DIRS: [new V3(1, 0, 0), new V3(-1, 0, 0), new V3(0, 1, 0), new V3(0, -1, 0), new V3(0, 0, 1), new V3(0, 0, -1)],
  rc: new THREE.Raycaster(),
  idx: null,
  samples() {
    if (this.idx) return this.idx;
    const n = RIG.count, out = [], step = Math.max(1, Math.floor(n / 44));
    for (let i = 0; i < n; i += step) out.push(i);
    return (this.idx = out);
  },
  /** Share of body sample points sitting more than 3.5 cm inside solid map geometry (0..1). */
  check(c) {
    if (!c || !c.root.visible || !MAP) return 0;
    c.root.updateMatrixWorld(true);
    const pos = c.rig.pickGeo.attributes.position, m = c.mesh.matrixWorld, ctr = c.center();
    const near = envNear(ctr, Math.max(1.2, c.dims.length()));
    if (!near.length) return 0;
    const sides = new Map();
    for (const o of near) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of ms) if (!sides.has(mm)) { sides.set(mm, mm.side); mm.side = THREE.DoubleSide; } }
    let inside = 0, total = 0;
    const rc = this.rc, p = new V3(), nrm = new V3(), one = [null];
    const boxes = near.map((o) => _envBoxes.get(o) || new THREE.Box3().setFromObject(o));
    try {
      for (const i of this.samples()) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m); total++;
        // inside = every ray out of the point leaves through a back face of the same mesh (closed shapes only)
        let hit = false;
        for (let k = 0; k < near.length && !hit; k++) {
          if (!boxes[k].containsPoint(p)) continue;
          one[0] = near[k];
          let ok = true, depth = 1e9;
          for (const d of this.DIRS) {
            rc.set(p, d); rc.far = 3;
            const h = rc.intersectObjects(one, false)[0];
            if (!h || !h.face) { ok = false; break; }
            nrm.copy(h.face.normal).transformDirection(h.object.matrixWorld);
            if (nrm.dot(d) <= 0) { ok = false; break; }
            depth = Math.min(depth, h.distance);
          }
          if (ok && depth > 0.035) hit = true;
        }
        if (hit) inside++;
      }
    } finally { for (const [mm, sd] of sides) mm.side = sd; }
    return total ? inside / total : 0;
  },
  /** Local hider: warn early, flash once really buried (shared through the state sync). */
  tick(P, dt) {
    if (!P || P.caught || !playing()) { if (P && P.buried) P.setBuried(false); UI.buried?.(0, false); return; }
    this.t = (this.t || 0) - dt;
    if (this.t > 0) return;
    this.t = 0.2;
    const moving = P.speed > 0.3;
    const f = this.check(P);
    P.buriedFrac = f;
    if (f >= 0.18) P.buriedT = (P.buriedT || 0) + 0.2; else if (f < 0.1) P.buriedT = 0;
    const on = (P.buriedT || 0) >= 0.4 || (P.buried && f >= 0.1);
    if (on !== !!P.buried) {
      P.setBuried(on);
      if (on) { Sound.alert?.(null); if (G.phase === 'hunt') feed('You are flashing: hunters can see you', 'bad'); }
    }
    UI.buried?.(f, on, moving);
  },
};

/* ======================= spawns ======================= */
const Spawns = {
  /** Up to n free spots around the map's hider spawn, all reachable from it without crossing a wall. */
  hiderSpots(n) {
    const [sx, sz] = MAP.playerSpawn, out = [];
    let cx = sx, cz = sz;
    if (!freeAt(cx, cz, 0.3, 1)) { const nn = nearestNode(cx, cz); if (nn) { cx = nn.x; cz = nn.z; } }
    const cand = [[cx, cz]];
    for (const [r, k] of [[1.1, 6], [2.0, 10], [2.9, 14], [3.8, 18]]) for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 + r; cand.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    for (const [x, z] of cand) {
      if (out.length >= n) break;
      if (!freeAt(x, z, 0.3, 1.0)) continue;
      if (!segClear(cx, cz, x, z, 0.2)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 0.95)) continue;
      out.push({ x, z, yaw: Math.atan2(x - cx, z - cz) || Math.PI });
    }
    while (out.length < n) out.push({ x: cx + rand(-0.4, 0.4), z: cz + rand(-0.4, 0.4), yaw: Math.PI });
    const toMid = this.toMapMiddle(cx, cz);
    out[0].yaw = toMid;
    return out;
  },
  toMapMiddle(x, z) {
    let best = null, bd = -1;
    for (const zn of ZONES) { if (zn.hunters) continue; const mx = (zn.x0 + zn.x1) / 2, mz = (zn.z0 + zn.z1) / 2, d = Math.hypot(mx - x, mz - z); if (d > bd) { bd = d; best = [mx, mz]; } }
    return best ? Math.atan2(best[0] - x, best[1] - z) : Math.PI;
  },
  /** Hunter pen spot i: the map's spot when it is free, otherwise the nearest free point near it. */
  hunterSpot(i) {
    const hs = MAP.hunterSpawns, [x, z] = hs[i % hs.length];
    if (freeAt(x, z, 0.32, 1.7)) return [x, z];
    for (let r = 0.4; r < 2.6; r += 0.4) for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (freeAt(px, pz, 0.32, 1.7)) return [px, pz]; }
    return [x, z];
  },
  gateYaw(x, z) { const g = MAP.gate; return g ? Math.atan2(g.x - x, g.z - z) : Math.atan2(MAP.playerSpawn[0] - x, MAP.playerSpawn[1] - z); },
  /** Pop-in + camera drop for the local hider. */
  intro(c) {
    G.intro = { t: 0, dur: 1.7 };
    for (const h of G.hiders) if (h.human && !h.isClone) { h.popT = 0; dustPuff(h.root.position, 5, 1.1); }
    Sound.pop?.(c.center());
  },
  tickPop(c, dt) {
    if (c.popT == null) return;
    c.popT += dt;
    const k = Math.min(1, c.popT / 0.45), e = 1 + Math.sin(k * Math.PI) * 0.18 * (1 - k);
    c.root.scale.setScalar(Math.max(0.05, k < 1 ? (0.25 + 0.75 * (1 - (1 - k) ** 3)) * e : 1));
    if (k >= 1) { c.root.scale.setScalar(1); c.popT = null; }
  },
  /** Camera for the drop-in intro: from high over the spawn down to the normal follow camera. */
  introCam(dt, target, want) {
    const I = G.intro; if (!I) return false;
    I.t += dt;
    const k = Math.min(1, I.t / I.dur), e = 1 - (1 - k) ** 3;
    const hi = target.clone().add(new V3(Math.sin(G.ctrl.yaw) * 4.5, 7.5, Math.cos(G.ctrl.yaw) * 4.5));
    camera.position.lerpVectors(hi, want, e);
    camera.lookAt(target);
    if (k >= 1) G.intro = null;
    return true;
  },
  /** Sign over the hunter gate counting down the prep time. */
  gateSign() {
    if (this.sign) { scene.remove(this.sign); this.sign.material.map.dispose(); this.sign.material.dispose(); this.sign = null; }
    if (!MAP.gate) return;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
    const tex = new THREE.CanvasTexture(cv);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const g = MAP.gate; s.position.set(g.x, (g.h || 2.3) + 0.55, g.z); s.scale.set(1.6, 0.5, 1); s.renderOrder = 5;
    s.userData = { cv, last: '' }; scene.add(s); this.sign = s;
  },
  tickSign() {
    const s = this.sign; if (!s) return;
    const txt = G.phase === 'prep' ? fmtTime(Math.max(0, Math.ceil(G.timer))) : G.phase === 'hunt' ? 'OPEN' : '';
    s.visible = !!txt;
    if (txt === s.userData.last) return; s.userData.last = txt;
    const g = s.userData.cv.getContext('2d'), w = 512, h = 160;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(12,15,24,.88)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 28); g.fill();
    g.strokeStyle = G.phase === 'hunt' ? '#ff5468' : '#ffd23f'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#9aa4b8'; g.font = '600 30px Bahnschrift, Segoe UI, sans-serif'; g.textAlign = 'center'; g.fillText(G.phase === 'hunt' ? 'HUNTERS' : 'HUNTERS RELEASED IN', w / 2, 52);
    g.fillStyle = G.phase === 'hunt' ? '#ff8b99' : '#ffd23f'; g.font = '800 68px Bahnschrift, Segoe UI, sans-serif'; g.fillText(txt, w / 2, 124);
    s.material.map.needsUpdate = true;
  },
};

/* ======================= direction cues ======================= */
const CUE_STYLE = { whistle: ['#ffd23f', 'Whistle'], chirp: ['#38e0a0', 'Chirp'], step: ['#dfe5f0', 'Steps'], ping: ['#b197fc', 'Ping'], hunter: ['#ff5468', 'Hunter'], mark: ['#4ea8ff', 'Mark'] };
const Cues = {
  list: [],
  add(p, kind, range = 30) {
    if (!p || !camera) return;
    const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
    if (d > range) return;
    const root = $('#cues'); if (!root) return;
    const el = document.createElement('div'); el.className = 'cue ' + kind;
    const [col, label] = CUE_STYLE[kind] || CUE_STYLE.step;
    el.style.setProperty('--c', col);
    el.innerHTML = `<i></i><span>${label}${d > 1.5 ? ` · ${Math.round(d)} m` : ''}</span>`;
    root.appendChild(el);
    this.list.push({ el, p: p.clone(), t: 0, life: kind === 'step' ? 1.3 : 2.4 });
    while (this.list.length > 10) { const o = this.list.shift(); o.el.remove(); }
    this.place(this.list[this.list.length - 1]);
  },
  place(c) {
    const f = new V3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const to = c.p.clone().sub(camera.position); to.y = 0;
    const a = Math.atan2(f.x * to.z - f.z * to.x, f.x * to.x + f.z * to.z);
    c.el.style.setProperty('--a', a + 'rad');
  },
  tick(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]; c.t += dt;
      this.place(c);
      c.el.style.opacity = String(Math.max(0, 1 - Math.max(0, c.t - c.life * 0.55) / (c.life * 0.45)));
      if (c.t > c.life) { c.el.remove(); this.list.splice(i, 1); }
    }
  },
  clear() { for (const c of this.list) c.el.remove(); this.list = []; },
};

/* ======================= seeker tools ======================= */
const SEEK = { tags: 5, tagRegen: 12, pingR: 9, markLife: 9 };
const Seeker = {
  reset() { G.ab.tags = SEEK.tags; G.ab.tagT = 0; },
  tick(dt) {
    if (G.ab.tags == null) this.reset();
    if (G.ab.tags < SEEK.tags) { G.ab.tagT += dt; if (G.ab.tagT >= SEEK.tagRegen) { G.ab.tagT = 0; G.ab.tags++; } } else G.ab.tagT = 0;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i]; m.t += dt;
      const d = camera.position.distanceTo(m.p);
      m.s.scale.set(0.55 + d * 0.035, (0.55 + d * 0.035) * 0.5, 1);
      m.s.material.opacity = Math.min(1, (SEEK.markLife - m.t) / 1.2);
      if (m.t > SEEK.markLife) { scene.remove(m.s); m.s.material.map.dispose(); m.s.material.dispose(); this.marks.splice(i, 1); }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.t += dt;
      const k = Math.min(1, w.t / 0.9), r = 0.2 + k * SEEK.pingR;
      w.m.scale.setScalar(r); w.m.material.opacity = 0.22 * (1 - k);
      w.ring.scale.setScalar(r); w.ring.material.opacity = 0.75 * (1 - k);
      if (k >= 1) { scene.remove(w.m); scene.remove(w.ring); w.m.material.dispose(); w.ring.material.dispose(); this.waves.splice(i, 1); }
    }
  },
  /** Tagging costs a charge only on a miss into the map. A real find refills every charge. */
  onSwing(hitCham, hitEnv) {
    if (hitCham) { UI.hitMark?.('hit'); return true; }
    if (hitEnv) {
      G.ab.tags = Math.max(0, G.ab.tags - 1); UI.hitMark?.('miss');
      if (G.ab.tags === 0) toast(`Out of tags. Next one in ${Math.ceil(SEEK.tagRegen - G.ab.tagT)}s, or find someone.`, 'warn');
    }
    return false;
  },
  canSwing() { if (G.ab.tags == null) this.reset(); return G.ab.tags > 0; },
  refill() { G.ab.tags = SEEK.tags; G.ab.tagT = 0; },
  marks: [], waves: [],
  wave(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xb197fc, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false, side: THREE.BackSide }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ color: 0xc8b6ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; m.position.copy(p).setY(p.y + 0.8); ring.position.copy(p).setY((p.y || 0) + 0.04);
    m.renderOrder = 3; ring.renderOrder = 3; scene.add(m); scene.add(ring);
    G.fxHide.push(m, ring);
    this.waves.push({ m, ring, t: 0 });
  },
  mark(p, by) {
    const s = textSprite('?  CHECK', '#4ea8ff', '#04203d', 0.4);
    s.material.depthTest = false; s.material.transparent = true; s.renderOrder = 6; s.position.copy(p).add(new V3(0, 0.35, 0));
    scene.add(s); G.fxHide.push(s);
    this.marks.push({ s, p: p.clone(), t: 0, by });
    while (this.marks.length > 6) { const o = this.marks.shift(); scene.remove(o.s); }
  },
  clear() {
    for (const m of this.marks) scene.remove(m.s);
    for (const w of this.waves) { scene.remove(w.m); scene.remove(w.ring); }
    this.marks = []; this.waves = [];
  },
};
