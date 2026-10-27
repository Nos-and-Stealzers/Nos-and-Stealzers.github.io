'use strict';
/* Map definitions. Each map: bounds, zones (patrol/hide areas with nav points), spawns, gate, lighting, build(). */

const F = () => ({
  wood: cm('#8a5a36', 0.7), woodDark: cm('#4a2c1a', 0.7), woodLight: cm('#c9975e', 0.75), white: cm('#f4f2ec', 0.6),
  black: cm('#1d1f24', 0.4), steel: cm('#b9bfc8', 0.35, 0.6), red: cm('#b8323d', 0.95), green: cm('#3d6b4f', 0.95),
  leather: cm('#6e3b22', 0.55), cream: cm('#efe3c8', 0.95), terracotta: cm('#c4683f', 0.9), gold: cm('#c9a54c', 0.4, 0.5),
  blue: cm('#3d6fb0', 0.9), pink: cm('#ff8fb1', 0.9), yellow: cm('#ffd43b', 0.8), purple: cm('#8c6bd6', 0.9), teal: cm('#3fb7a6', 0.9),
});
function plant(x, z, s = 1) {
  cyl(x, z, 0.24 * s, 0.18 * s, 0.45 * s, cm('#c4683f', 0.9), { collide: true });
  sph(x, 0.45 * s + 0.38 * s, z, 0.42 * s, tm('leaves', 2, 1), { collide: true, scale: [1, 1.15, 1] });
}
function chair(x, z, face, mat) {
  box(x, z, 0.46, 0.46, 0.05, mat, { y: 0.44 });
  for (const [dx, dz] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) box(x + dx, z + dz, 0.05, 0.05, 0.44, mat, { collide: false });
  box(x, z - face * 0.21, 0.46, 0.05, 0.5, mat, { y: 0.49, collide: false });
}
function table(x, z, w, d, h, mat, legMat) {
  box(x, z, w, d, 0.06, mat, { y: h - 0.06, top: true });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(x + sx * (w / 2 - 0.08), z + sz * (d / 2 - 0.08), 0.07, 0.07, h - 0.06, legMat || mat, { collide: false });
}
function gridPts(x0, z0, x1, z1, step) {
  const out = [];
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) out.push([x, z]);
  return out;
}
function rotMesh(geo, mat, x, y, z, rx, ry, rz, o = {}) {
  const m = reg(new THREE.Mesh(geo, mat), o); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m;
}

/* =================== MANSION =================== */
MAPS.mansion = {
  id: 'mansion', name: 'Hide-and-Seek Mansion', desc: 'Wallpaper, rugs, bookshelves and a ball pit. The classic.', colors: ['#4f9a94', '#e8c27a'],
  bounds: { x0: 0, z0: 0, x1: 32, z1: 24 }, wallH: 3.2, ceilH: 3.2,
  zones: [
    { id: 'living', name: 'Living Room', x0: 0, z0: 0, x1: 12, z1: 10 },
    { id: 'kitchen', name: 'Kitchen', x0: 12, z0: 0, x1: 20, z1: 10 },
    { id: 'library', name: 'Library', x0: 20, z0: 0, x1: 32, z1: 10 },
    { id: 'hall', name: 'Hallway', x0: 0, z0: 10, x1: 32, z1: 14, pts: [[1.8, 12], [5, 12], [10, 12], [13, 12], [16, 12], [21, 12], [26, 12], [29, 12], [30.6, 12]] },
    { id: 'bedroom', name: 'Bedroom', x0: 0, z0: 14, x1: 10, z1: 24 },
    { id: 'bath', name: 'Bathroom', x0: 10, z0: 14, x1: 16, z1: 24 },
    { id: 'play', name: 'Playroom', x0: 16, z0: 14, x1: 26, z1: 24 },
    { id: 'garage', name: 'Garage', x0: 26, z0: 14, x1: 32, z1: 24, pts: [[29, 16.4], [28.2, 19.5], [29, 22]], hunters: true },
  ].map((z) => ({ ...z, pts: z.pts || gridPts(z.x0, z.z0, z.x1, z.z1, 1.8) })),
  playerSpawn: [16, 12], hunterSpawns: [[28, 17.2], [30, 17.2], [29, 20.5], [28, 22]], gate: { x: 29, z: 14, a: 'h' },
  light: { hemi: 0.6, amb: 0.16, sun: 0.5, sunPos: [-7, 30, -7] },
  specials: [{ x: 24.4, y: 0, z: 22.6, pose: 'curl', zone: 'play' }, { x: 17.5, y: 0, z: 22.4, pose: 'curl', zone: 'play' }, { x: 16, y: 0, z: 6.1, pose: 'curl', zone: 'kitchen' }, { x: 26, y: 0, z: 5.5, pose: 'curl', zone: 'library' }],
  build() {
    const f = F();
    const rooms = [
      { id: 'living', x0: 0, z0: 0, x1: 12, z1: 10, wall: 'wallLiving', floor: 'wood' },
      { id: 'kitchen', x0: 12, z0: 0, x1: 20, z1: 10, wall: 'wallKitchen', floor: 'checker' },
      { id: 'library', x0: 20, z0: 0, x1: 32, z1: 10, wall: 'wallLibrary', floor: 'parquet' },
      { id: 'hall', x0: 0, z0: 10, x1: 32, z1: 14, wall: 'wallHall', floor: 'woodDark' },
      { id: 'bedroom', x0: 0, z0: 14, x1: 10, z1: 24, wall: 'wallBed', floor: 'carpet' },
      { id: 'bath', x0: 10, z0: 14, x1: 16, z1: 24, wall: 'wallBath', floor: 'bathFloor' },
      { id: 'play', x0: 16, z0: 14, x1: 26, z1: 24, wall: 'wallPlay', floor: 'mats' },
      { id: 'garage', x0: 26, z0: 14, x1: 32, z1: 24, wall: 'wallGarage', floor: 'concrete' },
    ];
    const doors = [
      { a: 'h', line: 10, at: 10 }, { a: 'h', line: 10, at: 16 }, { a: 'h', line: 10, at: 26 },
      { a: 'v', line: 12, at: 5 }, { a: 'v', line: 20, at: 5 },
      { a: 'h', line: 14, at: 5 }, { a: 'h', line: 14, at: 13 }, { a: 'h', line: 14, at: 21 }, { a: 'h', line: 14, at: 29 },
      { a: 'v', line: 10, at: 19 },
    ];
    const extra = buildShell(rooms, doors);
    plane(16, 3.2, 12, 32, 24, cm('#f6f1e7', 1), Math.PI / 2, 0).castShadow = false;
    const T = (o) => (o ? o.userData.wb.max.y : 0);
    // living: sofa set on the rug, TV wall, fireplace, reading nook
    plane(6, 0.008, 4.6, 5.6, 4.0, tm('rugLiving', 1, 1, 1), -Math.PI / 2, 0);
    prop('f:loungeSofa', 6, 0.25, { ry: 's', az: 'min' });
    prop('f:pillowBlue', 5.3, 0.7, { y: 0.55, col: 'none', ry: 's' }); prop('f:pillow', 6.8, 0.7, { y: 0.55, col: 'none', ry: 's' });
    prop('f:loungeChair', 3.0, 4.0, { ry: 'e' }); prop('f:loungeChair', 9.0, 4.0, { ry: 'w' });
    const ct = prop('f:tableCoffeeGlass', 6, 3.3);
    prop('food:bowl-cereal', 5.6, 3.3, { y: T(ct), col: 'none' }); prop('f:books', 6.4, 3.2, { y: T(ct), col: 'none' }); prop('food:cup-coffee', 6.6, 3.5, { y: T(ct), col: 'none' });
    const tvc = prop('f:cabinetTelevisionDoors', 6, 9.95, { ry: 'n', az: 'max' });
    prop('f:televisionModern', 6, T(tvc) && 9.6, { ry: 'n', y: T(tvc), col: 'none' });
    prop('f:speaker', 3.7, 9.95, { ry: 'n', az: 'max' }); prop('f:speaker', 8.3, 9.95, { ry: 'n', az: 'max' });
    box(0.5, 5, 0.8, 2.4, 1.3, tm('brick', 1, 1)); box(0.91, 5, 0.02, 1.2, 0.8, cm('#151515', 1), { collide: false });
    box(0.55, 5, 1.0, 2.7, 0.12, f.woodDark, { y: 1.3, top: true });
    prop('f:lampRoundTable', 0.55, 4.0, { y: 1.42, col: 'none' }); prop('f:plantSmall2', 0.55, 6.0, { y: 1.42, col: 'none' });
    painting(0.1, 5, 'e', 1.4, 0.9, 0, 2.1);
    fillShelves(prop('f:bookcaseOpen', 11.95, 1.6, { ry: 'w', ax: 'max' })); fillShelves(prop('f:bookcaseOpen', 11.95, 2.7, { ry: 'w', ax: 'max' }));
    prop('f:loungeChairRelax', 10.8, 6.4, { ry: 'w' }); prop('f:lampRoundFloor', 11.5, 7.5);
    prop('f:loungeSofaOttoman', 2.4, 8.0);
    prop('f:pottedPlant', 0.7, 0.7); prop('f:pottedPlant', 11.3, 9.3); prop('f:pottedPlant', 0.7, 9.3);
    const sd = prop('f:sideTable', 9.4, 0.05, { ry: 's', az: 'min' }); prop('f:radio', 9.4, 0.3, { ry: 's', y: T(sd), col: 'none' });
    painting(6, 0.1, 's', 2.0, 1.0, 1, 2.25); painting(11.9, 4.6, 'w', 1.0, 0.8, 2);
    lamp(6, 5, 0xffe2b8, 0.6);
    // kitchen: counter run, fridge, dining table
    const counter = ['f:kitchenCabinet', 'f:kitchenSink', 'f:kitchenCabinetDrawer', 'f:kitchenStove', 'f:kitchenCabinetDrawer'];
    let cx = 12.05; const cTop = [];
    for (const k of counter) { const o = prop(k, cx, 0.02, { ry: 's', ax: 'min', az: 'min', top: true }); cTop.push(o); cx = o.userData.wb.max.x; }
    const ch = T(cTop[0]);
    prop('f:kitchenCabinetUpperDouble', 12.05, 0.02, { ry: 's', y: 1.95, col: 'none', ax: 'min', az: 'min' }); prop('f:hoodModern', (cTop[3].userData.wb.min.x + cTop[3].userData.wb.max.x) / 2, 0.02, { ry: 's', y: 1.95, col: 'none', az: 'min' });
    prop('f:kitchenCoffeeMachine', 12.6, 0.35, { ry: 's', y: ch, col: 'none' }); prop('f:toaster', 14.9, 0.4, { ry: 's', y: ch, col: 'none' });
    prop('f:kitchenMicrowave', cx - 0.5, 0.4, { ry: 's', y: ch, col: 'none' }); prop('f:kitchenBlender', 17.2, 0.4, { ry: 's', y: ch, col: 'none' });
    prop('f:kitchenFridgeLarge', 19.95, 0.02, { ry: 's', s: 0.78, ax: 'max', az: 'min' });
    const dt = prop('f:tableCloth', 16, 6.0, { ry: 'e' });
    for (const [x, z, r] of [[15.25, 5.15, 'e'], [15.25, 6.85, 'e'], [16.75, 5.15, 'w'], [16.75, 6.85, 'w']]) prop('f:chairCushion', x, z, { ry: r });
    prop('food:pizza', 16, 5.6, { y: T(dt), col: 'none' }); prop('food:apple', 15.9, 6.4, { y: T(dt), col: 'none' }); prop('food:glass', 16.2, 6.5, { y: T(dt), col: 'none' }); prop('food:bowl-soup', 15.8, 6.8, { y: T(dt), col: 'none' });
    prop('f:kitchenBar', 12.05, 8.6, { ry: 'e', ax: 'min' }); prop('f:stoolBar', 13.5, 8.2, { ry: 'w' }); prop('f:stoolBar', 13.5, 9.1, { ry: 'w' });
    prop('f:trashcan', 19.6, 9.5, { s: 0.42 });
    plane(17, 0.008, 2.2, 1.4, 0.6, tm('rugPink', 2, 1, 1), -Math.PI / 2, 0);
    painting(19.9, 6.5, 'w', 0.8, 0.6, 3);
    lamp(16, 4); lamp(16, 7.5, 0xfff0d0, 0.3);
    // library: tall shelves, reading table, desk
    for (const x of [21.2, 22.25, 23.3, 28.7, 29.75, 30.8]) fillShelves(prop('f:bookcaseOpen', x, 0.02, { ry: 's', az: 'min', tint: '#6b4428' }));
    box(31.6, 3.4, 0.6, 2.6, 2.6, tm('books', 1, 1, 0.9)); box(31.6, 7.2, 0.6, 2.6, 2.6, tm('books', 1, 1, 0.9));
    { const rug = reg(new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), tm('rugRound', 1, 1, 1)), { cast: false }); rug.rotation.x = -Math.PI / 2; rug.position.set(26, 0.008, 5.5); }
    const lt = prop('f:tableRound', 26, 5.5);
    prop('f:books', 25.7, 5.4, { y: T(lt), col: 'none' }); prop('f:lampSquareTable', 26.3, 5.7, { y: T(lt), col: 'none' });
    for (const [x, z, r] of [[24.7, 5.5, 'e'], [27.3, 5.5, 'w']]) prop('f:chairRounded', x, z, { ry: r });
    prop('f:loungeChairRelax', 21.2, 8.6, { ry: 'e' }); prop('f:loungeChairRelax', 30.6, 8.7, { ry: 'w' });
    const dk = prop('f:desk', 26, 0.02, { ry: 's', az: 'min' }); prop('f:chairDesk', 26, 2.2, { ry: 'n' });
    prop('f:laptop', 26, 0.7, { ry: 's', y: T(dk), s: 0.5, col: 'none' }); prop('f:lampSquareTable', 26.7, 0.5, { y: T(dk), col: 'none' });
    cyl(24.6, 9.3, 0.04, 0.2, 0.8, f.woodDark, { collide: true }); sph(24.6, 1.15, 9.3, 0.35, tm('globe', 1, 1, 0.5), {});
    prop('f:pottedPlant', 20.6, 9.4); prop('f:coatRackStanding', 31.4, 9.4);
    painting(20.1, 2.2, 'e', 1.0, 1.2, 4); painting(20.1, 7.4, 'e', 1.0, 1.2, 5);
    lamp(26, 5, 0xffe0b0, 0.65);
    // hall
    plane(16, 0.008, 12, 29, 1.4, tm('runner', 3, 1, 1), -Math.PI / 2, 0);
    painting(2.5, 10.1, 's', 1.2, 0.9, 6); painting(6.5, 10.1, 's', 1.0, 0.8, 7); painting(13, 10.1, 's', 1.4, 1.0, 8);
    painting(21, 10.1, 's', 1.6, 1.0, 1); painting(30.5, 10.1, 's', 1.0, 1.2, 3);
    painting(9, 13.9, 'n', 1.2, 0.9, 2); painting(17, 13.9, 'n', 1.4, 0.9, 5); painting(25, 13.9, 'n', 1.2, 0.9, 0);
    const st = prop('f:sideTableDrawers', 13, 10.1, { ry: 's', az: 'min' }); prop('f:plantSmall1', 13.4, 10.4, { y: T(st), col: 'none' }); prop('f:lampSquareTable', 12.6, 10.4, { y: T(st), col: 'none' });
    prop('f:benchCushion', 17, 13.95, { ry: 'n', az: 'max' }); prop('f:benchCushion', 8.5, 13.95, { ry: 'n', az: 'max' });
    box(31.65, 12, 0.5, 0.6, 2.2, tm('clock', 1, 1, 0.7));
    prop('f:pottedPlant', 0.6, 10.6); prop('f:pottedPlant', 0.6, 13.4); prop('f:coatRackStanding', 23.5, 10.5);
    prop('f:rugDoormat', 5, 13.4, { ry: 's' });
    for (const x of [5, 16, 27]) lamp(x, 12, 0xffe6c4, 0.4);
    // bedroom
    prop('f:bedDouble', 3.2, 23.95, { ry: 'n', s: 0.85, az: 'max' });
    prop('f:bear', 3.6, 22.6, { y: 0.8, s: 0.9, col: 'none', ry: 's' });
    prop('f:pillowLong', 3.2, 23.4, { y: 0.8, col: 'none', ry: 's' });
    const n1 = prop('f:cabinetBedDrawerTable', 1.15, 23.95, { ry: 'n', az: 'max' }), n2 = prop('f:cabinetBedDrawerTable', 5.25, 23.95, { ry: 'n', az: 'max' });
    prop('f:lampSquareTable', 1.15, 23.6, { y: T(n1), col: 'none' }); prop('f:plantSmall3', 5.25, 23.6, { y: T(n2), col: 'none' });
    prop('f:bookcaseClosedDoors', 9.95, 22.6, { ry: 'w', ax: 'max' }); fillShelves(prop('f:bookcaseOpenLow', 9.95, 20.9, { ry: 'w', ax: 'max' }));
    const desk = prop('f:desk', 7.6, 14.05, { ry: 's', az: 'min' }); prop('f:chairDesk', 7.6, 15.9, { ry: 'n' });
    prop('f:computerScreen', 7.6, 14.5, { ry: 's', y: T(desk), col: 'none' }); prop('f:computerKeyboard', 7.6, 14.95, { ry: 's', y: T(desk), col: 'none' }); prop('f:computerMouse', 8.1, 14.95, { ry: 's', y: T(desk), col: 'none' });
    prop('f:sideTableDrawers', 0.05, 16.5, { ry: 'e', ax: 'min' });
    prop('f:loungeSofaOttoman', 2.2, 19.0, { tint: '#ff9f43' });
    prop('f:cardboardBoxOpen', 4.6, 15.2, { ry: 0.3 }); prop('f:pillow', 5.4, 17.6, { ry: 1.2 });
    { const rug = reg(new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), tm('rugPink', 3, 3, 1)), { cast: false }); rug.rotation.x = -Math.PI / 2; rug.position.set(5, 0.008, 18.6); }
    prop('f:pottedPlant', 9.4, 14.6);
    painting(5, 23.9, 'n', 1.2, 0.8, 4); painting(0.1, 20, 'e', 1.0, 1.0, 6);
    lamp(5, 19);
    // bathroom
    prop('f:bathtub', 12.8, 23.95, { ry: 'n', s: 0.8, az: 'max' });
    prop('f:toiletSquare', 15.95, 20.6, { ry: 'w', s: 0.65, ax: 'max' });
    prop('f:bathroomSinkSquare', 10.05, 16.6, { ry: 'e', s: 0.85, ax: 'min' }); prop('f:bathroomMirror', 10.05, 16.6, { ry: 'e', y: 1.4, col: 'none', ax: 'min' });
    prop('f:washerDryerStacked', 15.95, 15.0, { ry: 'w', s: 0.8, ax: 'max' });
    prop('f:bathroomCabinetDrawer', 15.95, 23.0, { ry: 'w', s: 0.85, ax: 'max' });
    plane(14.6, 1.1, 23.89, 0.5, 0.9, tm('towel', 1, 1, 1), 0, Math.PI);
    plane(12.8, 0.008, 21.2, 1.2, 0.6, tm('rugPink', 2, 1, 1), -Math.PI / 2, 0);
    lamp(13, 19, 0xf0f6ff, 0.45);
    // playroom
    box(16.38, 17, 0.55, 2.4, 1.4, tm('toyShelf', 1, 1), { top: true });
    prop('f:tableCoffeeSquare', 19.2, 19.8, { tint: '#ffd43b' });
    prop('f:chairRounded', 18.2, 19.8, { ry: 'e', s: 0.75, tint: '#4d8dff' }); prop('f:chairRounded', 20.2, 19.8, { ry: 'w', s: 0.75, tint: '#ff5d5d' });
    const pitX0 = 22.5, pitX1 = 25.85, pitZ0 = 20.8, pitZ1 = 23.85;
    box((pitX0 + pitX1) / 2, pitZ0, pitX1 - pitX0, 0.12, 0.5, f.blue); box(pitX0, (pitZ0 + pitZ1) / 2, 0.12, pitZ1 - pitZ0, 0.5, f.blue);
    {
      const n = 260, inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.45 }), n);
      const m4 = new THREE.Matrix4(), col = new THREE.Color(), pal = [0xff5d5d, 0x4d8dff, 0x3ccf6e, 0xffd43b, 0xa66bff, 0xff9f43];
      for (let i = 0; i < n; i++) { m4.setPosition(sr(pitX0 + 0.2, pitX1 - 0.15), sr(0.1, 0.42), sr(pitZ0 + 0.2, pitZ1 - 0.15)); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.setHex(spick(pal))); }
      reg(inst);
    }
    { const t = reg(new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.3, 7, 1, true), tm('teepee', 1, 1, 1))); t.material.side = THREE.DoubleSide; t.position.set(17.5, 1.15, 22.4); }
    prop('toy:track-narrow-looping', 24.2, 16.4, { h: 1.6, ry: 'e', col: 'solid' });
    prop('toy:vehicle-racer', 22.4, 17.4, { s: 0.45, ry: 0.6 }); prop('toy:vehicle-monster-truck', 20.6, 22.4, { s: 0.5, ry: 2.2 }); prop('toy:vehicle-suv', 18.9, 15.5, { s: 0.45, ry: -0.4 });
    prop('hol:train-locomotive', 21.4, 23.4, { s: 1.4, ry: 'e' }); prop('hol:train-wagon', 20.4, 23.4, { s: 1.4, ry: 'e' }); prop('hol:train-tender', 19.6, 23.4, { s: 1.4, ry: 'e' });
    prop('f:bear', 17.0, 15.0, { s: 1.5, ry: 0.4 }); prop('hol:present-a-cube', 25.4, 19.4, { s: 1.3 }); prop('hol:present-b-round', 25.4, 18.4, { s: 1.1 });
    prop('plat:character-oobi', 22.6, 19.3, { h: 0.75, ry: 2.6 }); prop('plat:star', 18.5, 17.6, { h: 0.5, ry: 0.4 });
    painting(21, 23.9, 'n', 2.0, 1.1, 7); painting(25.9, 18, 'w', 1.2, 0.9, 8);
    lamp(21, 19, 0xfff4e0, 0.55);
    // garage
    plane(31.89, 1.7, 19, 2.2, 1.1, tm('pegboard', 1, 1), 0, -Math.PI / 2);
    prop('surv:workbench', 31.95, 19, { ry: 'w', s: 3.4, ax: 'max' });
    prop('surv:box-large', 26.9, 23.3, { s: 3 }); prop('surv:box-large', 27.9, 23.3, { s: 3 }); prop('surv:box', 27.4, 23.3, { s: 3, y: 0.75 });
    prop('surv:barrel', 30.9, 23.2, { s: 2.6 }); prop('f:washer', 31.95, 15.0, { ry: 'w', ax: 'max' }); prop('f:dryer', 31.95, 16.1, { ry: 'w', ax: 'max' });
    lamp(29, 19, 0xe8f0ff, 0.5);
    return extra;
  },
};

/* =================== BACKROOMS =================== */
MAPS.backrooms = {
  id: 'backrooms', name: 'The Backrooms', desc: 'Endless yellow wallpaper and humming lights. Everything looks the same… which helps.', colors: ['#c9b65c', '#8f7d3a'],
  bounds: { x0: 0, z0: 0, x1: 36, z1: 28 }, wallH: 2.9, ceilH: 2.9,
  zones: [
    { id: 'a', name: 'Sector A', x0: 0, z0: 0, x1: 12, z1: 10 }, { id: 'b', name: 'Sector B', x0: 12, z0: 0, x1: 24, z1: 10 }, { id: 'c', name: 'Sector C', x0: 24, z0: 0, x1: 36, z1: 12 },
    { id: 'd', name: 'Sector D', x0: 0, z0: 10, x1: 12, z1: 20 }, { id: 'e', name: 'Sector E', x0: 12, z0: 10, x1: 24, z1: 20 }, { id: 'f', name: 'Sector F', x0: 24, z0: 12, x1: 36, z1: 22 },
    { id: 'g', name: 'Sector G', x0: 0, z0: 20, x1: 15, z1: 28 }, { id: 'h', name: 'Sector H', x0: 15, z0: 20, x1: 30, z1: 28 },
    { id: 'exit', name: 'Exit', x0: 30, z0: 22, x1: 36, z1: 28, hunters: true, pts: [[33, 25]] },
  ].map((z) => ({ ...z, pts: z.pts || gridPts(z.x0, z.z0, z.x1, z.z1, 3.4) })),
  playerSpawn: [17, 14], hunterSpawns: [[31.5, 24], [34.5, 24], [31.5, 26.5], [34.5, 26.5]], gate: { x: 33, z: 22, a: 'h' },
  light: { hemi: 0.95, sky: 0xfff4c2, ground: 0x8f7d3a, amb: 0.22, ambColor: 0xfff2b0, sun: 0.12, sunPos: [-1, 30, -1], bg: 0x2a2614, fog: [0xc9bb78, 9, 32] },
  build() {
    const W = (L) => tm('brWall', L / 2, 1, 0.92);
    floorPlane(0, 0, 36, 28, tm('brCarpet', 12, 9, 1));
    plane(18, 2.9, 14, 36, 28, tm('brCeil', 18, 14, 1), Math.PI / 2, 0).castShadow = false;
    const segs = [
      [0, 0, 36, 0], [0, 28, 36, 28], [0, 0, 0, 28], [36, 0, 36, 28],
      [30, 22, 32.1, 22], [33.9, 22, 36, 22], [30, 22, 30, 28],
      [6, 0, 6, 6], [0, 10, 4, 10], [6.8, 10, 10, 10], [10, 6, 10, 10], [13, 3, 13, 13], [13, 3, 19, 3],
      [17, 7, 24, 7], [24, 0, 24, 4], [20, 7, 20, 11], [20, 13.5, 20, 17], [27, 4, 27, 12], [27, 12, 31, 12], [33, 12, 36, 12],
      [4, 13, 4, 17], [4, 20, 4, 24], [4, 17, 9, 17], [8, 21, 8, 28], [13, 16, 13, 24], [13, 16, 17, 16], [17, 20, 25, 20],
      [24, 14, 24, 17], [24, 16, 28, 16], [28, 16, 28, 22], [20, 23, 20, 28], [24, 23, 27, 23], [31, 5, 34, 5], [31, 5, 31, 8],
      [8, 13, 10, 13], [16, 10, 16, 13], [9, 3, 9, 6],
    ];
    for (const [a, b, c, d] of segs) wallSeg(a, b, c, d, W, { t: 0.22, cap: true });
    const pillar = tm('brWall', 0.3, 1, 0.92);
    for (const [x, z] of [[3, 3], [17, 13], [9, 24], [31.5, 17], [22, 25], [21.5, 3.5], [34, 8.5]]) box(x, z, 0.55, 0.55, 2.9, pillar);
    // ceiling light panels (grid) + a handful of real lights
    for (let x = 2; x < 36; x += 4) for (let z = 2; z < 28; z += 4) if (srand() > 0.12) glowPanel(x, z, 1.2, 0.6, srand() < 0.08 ? 0xd9d2a0 : 0xfffbe2);
    for (const [x, z] of [[6, 5], [18, 5], [30, 6], [6, 16], [18, 16], [30, 17], [8, 25], [22, 25]]) lamp(x, z, 0xfff3c4, 0.42, { fixture: false, dist: 14 });
    // props
    const stain = cm('#7d6c3a', 1);
    for (let i = 0; i < 7; i++) { const s = reg(new THREE.Mesh(new THREE.CircleGeometry(sr(0.6, 1.4), 24), stain), { cast: false }); s.rotation.x = -Math.PI / 2; s.position.set(sr(2, 28), 0.006, sr(2, 26)); s.scale.set(1, sr(0.5, 1), 1); }
    // abandoned office junk
    for (const [x, z, s, y] of [[2, 26.5, 1.3, 0], [2.8, 26.7, 1, 0], [2.2, 26.4, 1, 0.68], [34.5, 1.5, 1.3, 0], [11.2, 1.0, 1.2, 0], [22.5, 26.8, 1.1, 0], [29.2, 13.0, 1.2, 0], [7.2, 11.2, 1.0, 0]]) prop(srand() < 0.5 ? 'f:cardboardBoxClosed' : 'f:cardboardBoxOpen', x, z, { s: s * 1.2, y, ry: sr(0, 1.5) });
    for (const [x, z, r] of [[15, 21.5, 2.2], [26, 9.5, -0.6], [2.4, 7.5, 0.9], [33.2, 15.5, 2.8]]) prop('f:chairDesk', x, z, { ry: r });
    for (const [x, z, r] of [[1.0, 1.4, 'e'], [18.4, 0.05, 's'], [35.0, 19.5, 'w'], [9.6, 18.8, 'w']]) { const d = prop('f:desk', x, z, { ry: r, az: r === 's' ? 'min' : undefined }); if (srand() < 0.6) prop('f:computerScreen', x, z, { ry: r, y: d.userData.wb.max.y, col: 'none' }); }
    prop('mkt:freezers-standing', 35.9, 4.5, { h: 1.9, ry: 'w', ax: 'max' }); prop('arc:vending-machine', 0.5, 13.7, { h: 1.9, ry: 'e' });
    prop('f:trashcan', 12.4, 15.2, { s: 0.4 }); prop('f:trashcan', 30.6, 1.0, { s: 0.4 }); prop('f:lampSquareFloor', 35.4, 11.4); prop('f:coatRackStanding', 4.6, 21.0);
    prop('plat:sign', 10.5, 15, { h: 0.6, ry: 0.8, tint: '#ffd43b' });
    // exit sign over gate
    const exit = canvasTex(128, 48, (g, w, h) => { g.fillStyle = '#0a2a14'; g.fillRect(0, 0, w, h); g.fillStyle = '#3dff7a'; g.font = '700 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 2); });
    const em = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: exit })); em.position.set(33, 2.55, 21.88); em.rotation.y = Math.PI; mapGroup.add(em);
    return [];
  },
};
function f_steel() { return cm('#b9bfc8', 0.35, 0.6); }

/* =================== SEWER =================== */
MAPS.sewer = {
  id: 'sewer', name: 'Sewer', desc: 'Brick tunnels, pipes, graffiti and a slow green river. Dim and moody.', colors: ['#3c6b5e', '#6d5a48'],
  bounds: { x0: 0, z0: 0, x1: 40, z1: 24 }, wallH: 3.4, ceilH: 3.4,
  zones: [
    { id: 'tunnel', name: 'Main Tunnel', x0: 0, z0: 8, x1: 40, z1: 16, pts: [[3, 9.5], [10, 9.5], [17, 9.5], [24, 9.5], [31, 9.5], [37, 9.5], [3, 14.5], [10, 14.5], [17, 14.5], [24, 14.5], [31, 14.5], [6, 12], [20, 12], [34, 12]] },
    { id: 'pump', name: 'Pump Room', x0: 0, z0: 0, x1: 20, z1: 8, pts: [[4, 4], [10, 5.5], [16, 3], [16, 6.5]] },
    { id: 'storage', name: 'Storage', x0: 20, z0: 0, x1: 40, z1: 8, pts: [[24, 4], [30, 5.5], [36, 3], [36, 6.5]] },
    { id: 'junction', name: 'Junction', x0: 0, z0: 16, x1: 18, z1: 24, pts: [[4, 20], [9, 18.5], [14, 21], [9, 22.5]] },
    { id: 'overflow', name: 'Overflow', x0: 18, z0: 16, x1: 32, z1: 24, pts: [[22, 20], [25, 18.5], [29, 21], [25, 22.5]] },
    { id: 'maint', name: 'Maintenance', x0: 32, z0: 16, x1: 40, z1: 24, pts: [[36, 20]], hunters: true },
  ],
  playerSpawn: [20, 9.5], hunterSpawns: [[34.5, 19], [37.5, 19], [34.5, 22], [37.5, 22]], gate: { x: 36, z: 16, a: 'h' },
  light: { hemi: 0.42, sky: 0xa8d0b8, ground: 0x2a2f2a, amb: 0.14, ambColor: 0xc8e0d0, sun: 0.1, sunPos: [-2, 30, -2], bg: 0x0d1412, fog: [0x17221e, 10, 34] },
  build() {
    const rooms = [
      { id: 'tunnel', x0: 0, z0: 8, x1: 40, z1: 16, wall: 'sewerWall' },
      { id: 'pump', x0: 0, z0: 0, x1: 20, z1: 8, wall: 'sewerWall', floor: 'sewerFloor' },
      { id: 'storage', x0: 20, z0: 0, x1: 40, z1: 8, wall: 'sewerWall', floor: 'sewerFloor' },
      { id: 'junction', x0: 0, z0: 16, x1: 18, z1: 24, wall: 'sewerWall', floor: 'sewerFloor' },
      { id: 'overflow', x0: 18, z0: 16, x1: 32, z1: 24, wall: 'sewerWall', floor: 'sewerFloor' },
      { id: 'maint', x0: 32, z0: 16, x1: 40, z1: 24, wall: 'wallGarage', floor: 'concrete' },
    ];
    const doors = [{ a: 'h', line: 8, at: 10 }, { a: 'h', line: 8, at: 30 }, { a: 'h', line: 16, at: 9 }, { a: 'h', line: 16, at: 25 }, { a: 'h', line: 16, at: 36 }, { a: 'v', line: 20, at: 4 }, { a: 'v', line: 18, at: 20 }];
    const extra = buildShell(rooms, doors, { frame: '#4a4440', doorH: 2.4 });
    plane(20, 3.4, 12, 40, 24, tm('sewerWall', 20, 6, 1), Math.PI / 2, 0).castShadow = false;
    // channel + walkways
    floorPlane(0, 11, 40, 13, tm('sewerFloor', 20, 1, 0.9));
    box(20, 9.5, 40, 3, 0.3, tm('sewerFloor', 20, 1.5, 0.85), { top: true });
    box(20, 14.5, 40, 3, 0.3, tm('sewerFloor', 20, 1.5, 0.85), { top: true });
    const water = new THREE.MeshStandardMaterial({ map: TEX.water.clone(), color: 0xffffff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 });
    water.map.needsUpdate = true; water.map.repeat.set(16, 1); water.map.updateMatrix(); MAP.water = water.map;
    plane(20, 0.16, 12, 40, 2, water, -Math.PI / 2, 0);
    for (const x of [6, 20, 34]) box(x, 12, 1.6, 2.1, 0.3, tm('woodDark', 1, 1, 0.8), { top: true });
    // pipes along tunnel
    const pipeM = tm('pipe', 20, 1, 0.5, 0.4);
    for (const z of [8.32, 15.68]) rotMesh(new THREE.CylinderGeometry(0.2, 0.2, 40, 16), pipeM, 20, 2.65, z, 0, 0, Math.PI / 2);
    rotMesh(new THREE.CylinderGeometry(0.12, 0.12, 40, 12), tm('rust', 20, 1, 0.7, 0.3), 20, 3.05, 8.3, 0, 0, Math.PI / 2);
    for (const x of [3, 15, 27, 38]) { cyl(x, 8.35, 0.14, 0.14, 2.6, pipeM, {}); }
    for (const [x, z, f] of [[13, 8.1, 's'], [27, 15.9, 'n'], [5, 15.9, 'n'], [34, 8.1, 's']]) {
      const t = rotMesh(new THREE.TorusGeometry(0.28, 0.05, 8, 20), cm('#c0392b', 0.5, 0.3), x, 1.6, z + (f === 's' ? 0.08 : -0.08), 0, 0, 0); t.rotation.y = 0;
    }
    // ladders
    for (const [x, z, f] of [[18, 8.12, 's'], [2, 15.88, 'n']]) {
      const s = f === 's' ? 1 : -1;
      box(x - 0.25, z + s * 0.06, 0.05, 0.05, 3.3, f_steel(), { collide: false }); box(x + 0.25, z + s * 0.06, 0.05, 0.05, 3.3, f_steel(), { collide: false });
      for (let y = 0.5; y < 3.2; y += 0.35) box(x, z + s * 0.06, 0.5, 0.04, 0.04, f_steel(), { y, collide: false });
    }
    // graffiti and signs
    decal(8, 1.6, 8.1, 3, 1.9, TEX.graffiti[0], 's'); decal(25, 1.7, 15.9, 3.2, 2, TEX.graffiti[1], 'n'); decal(0.1, 1.7, 20, 3, 1.9, TEX.graffiti[2], 'e'); decal(31.9, 1.6, 20, 3, 1.9, TEX.graffiti[3], 'w');
    decal(36, 1.6, 0.1, 2.6, 1.7, TEX.graffiti[1], 's'); decal(1.5, 1.5, 0.1, 2.6, 1.7, TEX.graffiti[3], 's');
    // grates
    for (const [x, z] of [[4, 4], [14, 20], [28, 4]]) plane(x, 0.008, z, 1.2, 1.2, tm('grate', 1, 1, 0.5, 0.5), -Math.PI / 2, 0);
    // pump room machine
    box(9, 2, 4, 2.2, 1.6, cm('#5d7480', 0.5, 0.5), { top: true });
    cyl(7.5, 2, 0.6, 0.6, 2.2, tm('pipe', 4, 1, 0.5, 0.4), { collide: true, y: 0 });
    cyl(10.5, 2, 0.6, 0.6, 2.2, tm('rust', 3, 2, 0.6, 0.3), { collide: true });
    box(15, 0.4, 2.2, 0.5, 1.4, cm('#2e3a40', 0.5, 0.4));
    for (let i = 0; i < 6; i++) box(14.2 + i * 0.3, 0.15, 0.12, 0.02, 0.12, cm(['#ff4d4d', '#3dff7a', '#ffd23f'][i % 3], 0.3), { y: 1.0, collide: false });
    prop('surv:barrel', 1.9, 7.2, { s: 2.6 }); prop('surv:barrel', 2.75, 7.2, { s: 2.6 }); prop('surv:barrel-open', 3.6, 7.2, { s: 2.6 });
    prop('surv:workbench', 18.7, 1.2, { s: 3.2, ry: 'w' }); prop('surv:bucket', 17.6, 3.4, { s: 2.4 }); prop('surv:tool-shovel', 19.3, 4.2, { s: 3, ry: 1 });
    lamp(5, 4, 0xffd59a, 0.5, { fixture: 'bulb' }); lamp(14, 4, 0xffd59a, 0.45, { fixture: 'bulb' });
    // storage: shelving with crates
    for (const x of [24, 28, 32, 36]) {
      box(x, 0.45, 2.6, 0.7, 0.06, f_steel(), { y: 0.9, collide: false }); box(x, 0.45, 2.6, 0.7, 0.06, f_steel(), { y: 1.8, collide: false });
      addCollider(x - 1.3, 0, 0.1, x + 1.3, 2.4, 0.8);
      for (const sx of [-1.25, 1.25]) box(x + sx, 0.45, 0.06, 0.7, 2.4, f_steel(), { collide: false });
      for (let k = 0; k < 3; k++) box(x - 0.8 + k * 0.8, 0.45, 0.6, 0.5, 0.5, tm('crate', 1, 1), { y: srand() < 0.5 ? 0.96 : 1.86, collide: false });
    }
    prop('pir:crate', 30, 5.5, { h: 1.1 }); prop('pir:crate', 31.2, 5.8, { h: 0.9, ry: 0.4 }); prop('pir:crate-bottles', 30.4, 6.9, { h: 0.7 });
    for (const [x, z] of [[22, 7.0], [22.8, 7.1], [38.5, 7.0]]) prop('surv:barrel', x, z, { s: 2.6 });
    prop('surv:chest', 37.5, 2.6, { s: 2.6, ry: 'w' }); prop('pir:bottle-large', 25.6, 6.6, { h: 0.5 }); prop('pir:cannon-ball', 27.0, 7.0, { h: 0.3 });
    lamp(26, 4, 0xffd59a, 0.45, { fixture: 'bulb' }); lamp(35, 4, 0xffd59a, 0.45, { fixture: 'bulb' });
    // junction: big outlet pipes + waterfall
    rotMesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 24, 1, true), tm('rust', 3, 1, 0.6, 0.3), 9, 1.8, 23.3, Math.PI / 2, 0, 0).material.side = THREE.DoubleSide;
    plane(9, 0.9, 23.2, 1.2, 1.8, (() => { const m = tm('water', 1, 2, 0.1); m.transparent = true; m.opacity = 0.8; return m; })(), 0, Math.PI);
    box(9, 22.6, 3, 1.6, 0.25, cm('#3c6b5e', 0.15), { collide: false });
    for (const [x, z, r] of [[2, 17], [3, 17], [16, 23], [16, 22.2]]) prop('pir:crate', x, z, { h: 0.8, ry: sr(-0.2, 0.2) });
    prop('nat:log_stack', 4.5, 22.8, { s: 1.6 }); prop('surv:rock-a', 1.4, 21.4, { s: 2.2 }); prop('surv:rock-b', 12.6, 17.2, { s: 2 });
    box(15, 17.5, 2.4, 0.6, 1.2, cm('#3d4a52', 0.5, 0.5), { top: true });
    lamp(9, 19.5, 0xbfffd8, 0.45, { fixture: 'bulb' });
    // overflow: pallets and pipes
    for (const [x, z] of [[21, 22.6], [23.2, 22.6]]) { box(x, z, 1.8, 1.1, 0.15, tm('woodLight', 1, 1, 0.9), { top: true }); box(x, z, 1.4, 0.9, 0.7, tm('crate', 2, 1), { y: 0.15, top: true }); }
    for (const z of [17, 19, 21]) cyl(31.4, z, 0.25, 0.25, 3.4, pipeM, { collide: true });
    prop('surv:barrel', 28, 19, { s: 2.8 }); prop('pir:boat-row-small', 25, 17.4, { h: 0.7, ry: 'e' }); prop('surv:box-large-open', 19.2, 17.0, { s: 3 });
    lamp(25, 20, 0xffd59a, 0.45, { fixture: 'bulb' });
    // maintenance
    prop('surv:workbench-anvil', 39.4, 20, { s: 3, ry: 'w' }); lamp(36, 20, 0xe8f0ff, 0.45, { fixture: 'bulb' });
    // tunnel lights
    for (const x of [4, 13, 22, 31, 39]) lamp(x, 12, 0xffd59a, 0.5, { fixture: 'bulb', y: 3.0 });
    return extra;
  },
  tick(dt) { if (MAP.water) { MAP.water.offset.x += dt * 0.06; MAP.water.updateMatrix(); } },
};

/* =================== SUGARLAND =================== */
MAPS.sugar = {
  id: 'sugar', name: 'Sugarland', desc: 'An outdoor candy park: donuts, lollipops, cupcakes and a gingerbread house.', colors: ['#ff9cc6', '#8ee6c3'],
  bounds: { x0: 0, z0: 0, x1: 40, z1: 32 }, wallH: 3, ceilH: 30,
  zones: [
    { id: 'house', name: 'Gingerbread House', x0: 4, z0: 4, x1: 14, z1: 12, pts: [[7, 7], [11, 9]] },
    { id: 'nw', name: 'Donut Grove', x0: 0, z0: 12, x1: 14, z1: 22 }, { id: 'n', name: 'Lollipop Lane', x0: 14, z0: 0, x1: 28, z1: 10 },
    { id: 'ne', name: 'Cupcake Corner', x0: 28, z0: 0, x1: 40, z1: 12 }, { id: 'c', name: 'Cake Plaza', x0: 14, z0: 10, x1: 28, z1: 22 },
    { id: 'e', name: 'Gumdrop Garden', x0: 28, z0: 12, x1: 40, z1: 25 }, { id: 'sw', name: 'Chocolate Maze', x0: 0, z0: 22, x1: 18, z1: 32 },
    { id: 's', name: 'Ice Cream Row', x0: 18, z0: 22, x1: 33, z1: 32 },
    { id: 'pen', name: 'Candy Jar', x0: 33, z0: 25, x1: 40, z1: 32, hunters: true, pts: [[36.5, 28.5]] },
  ].map((z) => ({ ...z, pts: z.pts || gridPts(z.x0, z.z0, z.x1, z.z1, 2.4) })),
  playerSpawn: [21, 20.6], hunterSpawns: [[35, 27.5], [38, 27.5], [35, 30.5], [38, 30.5]], gate: { x: 36.5, z: 25, a: 'h' },
  light: { hemi: 0.58, sky: 0xffffff, ground: 0xffc0d8, amb: 0.12, sun: 0.62, sunColor: 0xfff6e8, sunPos: [-14, 30, -9], bg: 0xbfe3ff, fog: [0xffe0f0, 45, 110] },
  build() {
    floorPlane(-20, -20, 60, 52, tm('candyFloor', 40, 36, 0.7));
    floorPlane(0, 15, 40, 17, tm('mint', 20, 1, 0.8), 0.005); floorPlane(19.5, 0, 22.5, 32, tm('mint', 1.5, 16, 0.8), 0.005);
    const wafer = (L) => tm('wafer', L / 2, 1, 0.8);
    wallSeg(0, 0, 40, 0, wafer, { t: 0.4, cap: true }); wallSeg(0, 32, 40, 32, wafer, { t: 0.4, cap: true });
    wallSeg(0, 0, 0, 32, wafer, { t: 0.4, cap: true }); wallSeg(40, 0, 40, 32, wafer, { t: 0.4, cap: true });
    // candy jar pen
    const choc = (L) => tm('chocolate', L / 2, 1, 0.5);
    wallSeg(33, 25, 35.6, 25, choc, { h: 2.6, t: 0.3 }); wallSeg(37.4, 25, 40, 25, choc, { h: 2.6, t: 0.3 }); wallSeg(33, 25, 33, 32, choc, { h: 2.6, t: 0.3 });
    // gingerbread house
    MAP.wallH = 3;
    const extra = buildShell([{ id: 'house', x0: 4, z0: 4, x1: 14, z1: 12, wall: 'cookie', floor: 'woodLight' }], [{ a: 'h', line: 12, at: 9 }, { a: 'v', line: 14, at: 7 }], { frame: '#ffffff' });
    const roofM = tm('gingerRoof', 4, 2, 0.6);
    rotMesh(new THREE.BoxGeometry(10.8, 0.25, 5.4), roofM, 9, 4.25, 5.85, 0.62, 0, 0);
    rotMesh(new THREE.BoxGeometry(10.8, 0.25, 5.4), roofM, 9, 4.25, 10.15, -0.62, 0, 0);
    plane(9, 3.02, 8, 10, 8, cm('#fff1e6', 1), Math.PI / 2, 0).castShadow = false;
    table(9, 7, 2, 1.2, 0.75, tm('chocolate', 1, 1, 0.5));
    for (const [x, z] of [[7.6, 7], [10.4, 7]]) sph(x, 0.25, z, 0.35, cm('#ff5d8f', 0.4), { collide: true, scale: [1, 0.8, 1] });
    box(5, 10.5, 1.6, 2.2, 0.5, tm('frostBlue', 1, 1, 0.6), { top: true });
    box(13.2, 5, 1.4, 1.6, 1.1, tm('chocolate', 1, 1, 0.5), { top: true });
    painting(4.1, 7, 'e', 1.2, 0.9, 3); lamp(9, 8, 0xffe9c8, 0.55);
    // cake plaza
    cyl(21, 16, 3, 3.1, 1.1, tm('frostPink', 6, 1, 0.6), { collide: true, top: true });
    cyl(21, 16, 2.1, 2.2, 1.0, tm('frostMint', 5, 1, 0.6), { collide: true, y: 1.1, top: true });
    cyl(21, 16, 1.2, 1.3, 0.9, tm('frostBlue', 3, 1, 0.6), { collide: true, y: 2.1 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; cyl(21 + Math.cos(a) * 0.7, 16 + Math.sin(a) * 0.7, 0.06, 0.06, 0.5, cm('#fff', 0.5), { y: 3.0 }); sph(21 + Math.cos(a) * 0.7, 3.6, 16 + Math.sin(a) * 0.7, 0.07, new THREE.MeshBasicMaterial({ color: 0xffc94d }), { cast: false }); }
    // candy canes
    const caneM = tm('cane', 1, 4, 0.4);
    for (const [x, z, r] of [[16, 3], [26, 4], [2, 14, 1], [12, 19], [30, 14], [38, 18], [16, 27], [27, 23], [6, 30]]) {
      cyl(x, z, 0.16, 0.16, 3.4, caneM, { collide: true });
      const hook = reg(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 10, 20, Math.PI), caneM)); hook.position.set(x + 0.42, 3.4, z); hook.rotation.set(0, (x * 13) % 6, 0);
    }
    // donuts
    const donutMats = [tm('frostPink', 6, 1, 0.5), tm('frostChoc', 6, 1, 0.5), tm('frostBlue', 6, 1, 0.5)];
    for (const [x, z, k] of [[4, 15, 0], [8, 18.2, 1], [3.6, 19.6, 2], [11, 14.5, 2]]) {
      const d = reg(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.36, 16, 32), donutMats[k])); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.36, z);
      addCollider(x - 1.15, 0, z - 1.15, x + 1.15, 0.72, z + 1.15); addTop(x, z, 1.6, 1.6, 0.72);
    }
    { const d = reg(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.5, 16, 32), donutMats[0])); d.position.set(7, 1.7, 21.3); addCollider(5.3, 0, 20.8, 8.7, 3.4, 21.8); }
    // lollipops
    for (const [x, z] of [[15.5, 6.5], [24, 2.5], [25.5, 8], [17.5, 1.8]]) {
      cyl(x, z, 0.06, 0.06, 2.4, cm('#ffffff', 0.5), { collide: true });
      rotMesh(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 32), tm('swirl', 1, 1, 0.35), x, 2.7, z, Math.PI / 2, (x * 7) % 3, 0);
    }
    // cupcakes
    for (const [x, z, k] of [[31, 3, 0], [35, 6, 1], [37.5, 2.5, 2], [31.5, 9, 1]]) {
      cyl(x, z, 0.8, 0.6, 0.85, tm('wrapper', 4, 1, 0.8), { collide: true, top: true });
      sph(x, 1.05, z, 0.85, donutMats[k], { scale: [1, 0.55, 1] }); sph(x, 1.6, z, 0.16, cm('#e01e3c', 0.3), {});
    }
    // gumdrops
    const gd = ['#ff5d5d', '#ffd43b', '#69db7c', '#b197fc', '#4dabf7', '#ff922b'];
    for (let i = 0; i < 9; i++) {
      const x = sr(29.5, 39), z = sr(13, 24);
      if (Math.hypot(x - 30, z - 14) < 1.5 || Math.hypot(x - 38, z - 18) < 1.5) continue;
      const r = sr(0.5, 0.9), m = reg(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cm(spick(gd), 0.55)));
      m.position.set(x, 0, z); m.scale.y = 1.2; addCollider(x - r * .8, 0, z - r * .8, x + r * .8, r * 1.2, z + r * .8); addTop(x, z, r, r, r * 1.2);
    }
    // chocolate maze
    const cbar = tm('chocolate', 1.5, 0.6, 0.5);
    for (const [a, b, c, d] of [[3, 24, 9, 24], [12, 24, 12, 29], [6, 27, 6, 32], [9, 27, 15, 27], [15, 23, 15, 27], [2, 29, 4, 29]]) wallSeg(a, b, c, d, cbar, { h: 1.7, t: 0.45 });
    box(9, 30.5, 1.4, 0.9, 0.9, tm('frostChoc', 1, 1, 0.6), { top: true });
    // ice cream row
    for (const [x, z, k] of [[20, 25, 0], [23.5, 29, 1], [27, 25.5, 2], [30.5, 29.5, 0]]) {
      const c = reg(new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 20), tm('wafer', 1, 1, 0.8))); c.rotation.x = Math.PI; c.position.set(x, 0.8, z);
      addCollider(x - 0.45, 0, z - 0.45, x + 0.45, 2.2, z + 0.45);
      sph(x, 1.75, z, 0.6, donutMats[k], {}); sph(x, 2.3, z, 0.45, donutMats[(k + 1) % 3], {});
    }
    box(25, 31.3, 6, 0.8, 0.9, tm('frostMint', 3, 1, 0.6), { top: true });
    // benches
    for (const [x, z] of [[17, 13], [25, 19.5]]) box(x, z, 2, 0.6, 0.45, tm('wafer', 1, 0.3, 0.8), { top: true });
    // giant snacks: chameleons are tiny, the food is not
    const G = [['food:cake-birthday', 35.0, 15.6, 1.5], ['food:cupcake', 38.6, 21.4, 1.6], ['food:donut-sprinkles', 30.6, 21.2, 0.45], ['food:ice-cream', 22.5, 30.4, 2.2],
      ['food:pie', 10.8, 1.6, 0.35], ['food:sundae', 27.6, 29.6, 2.0], ['food:popsicle', 32.4, 27.8, 2.0], ['food:cookie-chocolate', 2.4, 3.0, 0.3], ['food:waffle', 13.5, 30.6, 0.2],
      ['food:pancakes', 28.8, 18.6, 0.4], ['food:lollypop', 18.2, 25.2, 2.4], ['food:muffin', 1.8, 17.0, 1.2], ['food:donut-chocolate', 26.4, 12.4, 0.55], ['food:candy-bar', 6.0, 26.2, 0.35],
      ['food:cherries', 33.8, 10.8, 1.0], ['food:strawberry', 29.2, 7.0, 1.0], ['food:whipped-cream', 17.6, 21.4, 1.0], ['food:frappe', 38.3, 9.4, 1.8], ['food:soda-can', 15.8, 9.2, 1.2], ['food:chocolate', 10.4, 25.6, 0.2]];
    for (const [k, x, z, h] of G) prop(k, x, z, { h, ry: sr(0, 6.28) });
    for (const [x, z] of [[24.6, 11.6], [12.6, 23.4], [36, 13.6]]) prop('hol:present-a-cube', x, z, { h: 0.9, ry: sr(0, 3) });
    for (const [x, z] of [[2.2, 9.5], [16.4, 13.4], [27.4, 16.0]]) prop('hol:gingerbread-man', x, z, { h: 1.6, ry: sr(-1, 1) });
    prop('hol:snowman-hat', 38.2, 13.4, { h: 2.0, ry: -2 }); prop('hol:nutcracker', 12.6, 14.0, { h: 2.2, ry: 0.5 });
    return [...extra, [1.4, 22.6], [1.4, 25.6], [4.5, 25.6]];
  },
};

/* =================== ART GALLERY =================== */
MAPS.gallery = {
  id: 'gallery', name: 'Art Gallery', desc: 'White walls and loud paintings. Press yourself flat into a masterpiece.', colors: ['#f3f1ec', '#ef6f6c'],
  bounds: { x0: 0, z0: 0, x1: 34, z1: 22 }, wallH: 4, ceilH: 4,
  zones: [
    { id: 'west', name: 'West Wing', x0: 0, z0: 0, x1: 10, z1: 11, pts: [[5, 3], [5, 8], [2.5, 5.5], [7.8, 5.5]] },
    { id: 'grand', name: 'Grand Hall', x0: 10, z0: 0, x1: 24, z1: 14, pts: [[13, 3], [17, 3], [21, 3], [13, 7], [21, 7], [13, 11], [17, 11.5], [21, 11]] },
    { id: 'east', name: 'East Wing', x0: 24, z0: 0, x1: 34, z1: 11, pts: [[29, 3], [29, 8], [26.5, 5.5], [31.8, 5.5]] },
    { id: 'dark', name: 'Dark Room', x0: 0, z0: 11, x1: 10, z1: 22, pts: [[5, 14], [5, 19], [2.5, 16.5], [7.5, 16.5]] },
    { id: 'sculpt', name: 'Sculpture Court', x0: 10, z0: 14, x1: 24, z1: 22, pts: [[13, 16.5], [17, 18], [21, 16.5], [13, 20.5], [21, 20.5]] },
    { id: 'storage', name: 'Storage', x0: 24, z0: 11, x1: 34, z1: 22, pts: [[29, 16.5]], hunters: true },
  ],
  playerSpawn: [17, 10.6], hunterSpawns: [[27, 15], [31, 15], [27, 19], [31, 19]], gate: { x: 29, z: 11, a: 'h' },
  light: { hemi: 0.72, sky: 0xffffff, ground: 0x8a8070, amb: 0.2, sun: 0.38, sunPos: [-5, 30, -6], bg: 0x161820 },
  build() {
    const rooms = [
      { id: 'west', x0: 0, z0: 0, x1: 10, z1: 11, wall: 'galleryWall', floor: 'woodLight' },
      { id: 'grand', x0: 10, z0: 0, x1: 24, z1: 14, wall: 'galleryWall', floor: 'terrazzo' },
      { id: 'east', x0: 24, z0: 0, x1: 34, z1: 11, wall: 'galleryWall', floor: 'woodLight' },
      { id: 'dark', x0: 0, z0: 11, x1: 10, z1: 22, wall: 'darkWall', floor: 'woodDark' },
      { id: 'sculpt', x0: 10, z0: 14, x1: 24, z1: 22, wall: 'galleryWall', floor: 'marble' },
      { id: 'storage', x0: 24, z0: 11, x1: 34, z1: 22, wall: 'wallGarage', floor: 'concrete' },
    ];
    const doors = [{ a: 'v', line: 10, at: 5.5, w: 2.4 }, { a: 'v', line: 24, at: 5.5, w: 2.4 }, { a: 'h', line: 11, at: 5 }, { a: 'h', line: 14, at: 17, w: 3 }, { a: 'h', line: 11, at: 29 }, { a: 'v', line: 10, at: 18 }];
    const extra = buildShell(rooms, doors, { frame: '#d9d4ca', doorH: 2.8 });
    plane(17, 4, 11, 34, 22, cm('#fbfaf7', 1), Math.PI / 2, 0).castShadow = false;
    let pi = 0; const P = (x, z, f, w, h, y) => painting(x, z, f, w, h, pi++, y, '#1d1f24');
    // west
    P(5, 0.1, 's', 3, 2, 2); P(0.1, 5.5, 'e', 2.4, 1.6, 2); P(9.9, 2, 'w', 1.4, 1.1, 1.8); P(9.9, 9, 'w', 1.4, 1.1, 1.8); P(2.5, 10.9, 'n', 1.6, 1.2, 1.8); P(7.5, 10.9, 'n', 1.6, 1.2, 1.8);
    box(5, 5.5, 2.2, 0.6, 0.45, cm('#2d2d33', 0.6), { top: true });
    // grand hall
    P(13, 0.1, 's', 2.4, 1.8, 2.2); P(17, 0.1, 's', 3.4, 2.4, 2.2); P(21, 0.1, 's', 2.4, 1.8, 2.2);
    P(13, 13.9, 'n', 2.2, 1.6, 2); P(21, 13.9, 'n', 2.2, 1.6, 2); P(10.1, 10.5, 'e', 1.6, 1.4, 2); P(23.9, 10.5, 'w', 1.6, 1.4, 2);
    for (const x of [14, 20]) box(x, 7, 0.6, 2.2, 0.45, cm('#2d2d33', 0.6), { top: true });
    for (const [x, z] of [[10.6, 0.6], [23.4, 0.6], [10.6, 13.4], [23.4, 13.4]]) prop('nat:statue_column', x, z, { h: 3.2 });
    prop('f:rugRectangle', 17, 3.0, { s: 1.8, ry: 0, col: 'none', tint: '#8a1c2b' });
    box(17, 7, 2.4, 2.4, 0.9, tm('marble', 1, 1, 0.3), { top: true });
    { const k = reg(new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.17, 100, 16), cm('#ef6f6c', 0.3, 0.4))); k.position.set(17, 1.75, 7); }
    // east
    P(29, 0.1, 's', 3, 2, 2); P(33.9, 5.5, 'w', 2.4, 1.6, 2); P(24.1, 2, 'e', 1.4, 1.1, 1.8); P(24.1, 9, 'e', 1.4, 1.1, 1.8); P(26.5, 10.9, 'n', 1.4, 1.2, 1.8); P(32, 10.9, 'n', 1.4, 1.2, 1.8);
    for (const [x, z] of [[27, 4], [31, 7]]) { box(x, z, 0.8, 0.8, 1.1, tm('marble', 1, 1, 0.3), { top: true }); sph(x, 1.5, z, 0.4, cm(spick(['#4f86c6', '#f2aa4c', '#3fb7a6']), 0.25, 0.3), {}); }
    // dark room: spotlit paintings
    for (const [x, z, f] of [[5, 21.9, 'n'], [0.1, 14, 'e'], [0.1, 19, 'e'], [9.9, 14, 'w']]) { P(x, z, f, 2, 1.4, 1.9); }
    for (const [x, z] of [[5, 20.6], [1.4, 14], [1.4, 19], [8.6, 14]]) lamp(x, z, 0xfff1d6, 0.55, { dist: 4.5, fixture: 'bulb', y: 3.6 });
    box(5, 16.5, 0.6, 2.2, 0.45, cm('#2d2d33', 0.6), { top: true });
    // sculpture court
    for (const [x, z, k] of [[13, 16.5, 0], [17, 18.5, 1], [21, 16.5, 2], [13.5, 20.5, 3], [20.5, 20.5, 4]]) {
      box(x, z, 0.9, 0.9, 1.0, tm('marble', 1, 1, 0.3), { top: true });
      const g = [new THREE.IcosahedronGeometry(0.42, 0), new THREE.TorusGeometry(0.35, 0.13, 12, 24), new THREE.ConeGeometry(0.35, 0.9, 5), new THREE.OctahedronGeometry(0.42, 0), new THREE.DodecahedronGeometry(0.4, 0)][k];
      const m = reg(new THREE.Mesh(g, cm(['#e6e6e6', '#c9a54c', '#2d2d33', '#4f86c6', '#ef6f6c'][k], 0.35, 0.3))); m.position.set(x, 1.5, z); m.rotation.set(0.3 * k, k, 0);
    }
    P(17, 21.9, 'n', 4, 2.4, 2.1); P(23.9, 18, 'w', 1.6, 1.2, 2);
    prop('f:pottedPlant', 10.6, 21.4); prop('f:pottedPlant', 23.4, 21.4); prop('f:pottedPlant', 10.6, 14.6); prop('f:pottedPlant', 23.4, 14.6);
    prop('nat:statue_head', 17, 15.6, { h: 2.4, ry: 's' });
    for (const [x, z] of [[11.2, 18.5], [22.8, 18.5]]) prop('nat:statue_column', x, z, { h: 2.6 });
    prop('nat:statue_obelisk', 17, 20.2, { h: 1.6 }); prop('nat:statue_ring', 15, 15.8, { h: 1.2, ry: 0.6 });
    // storage
    for (const [x, z] of [[33, 13], [33, 14], [32.9, 15], [26, 21], [27, 21]]) prop('pir:crate', x, z, { h: 0.9, ry: sr(-0.15, 0.15) });
    prop('nat:statue_block', 30.5, 13.4, { h: 1.0 }); prop('f:cardboardBoxClosed', 25.2, 12.2, { s: 1.4 }); prop('f:lampSquareFloor', 25.0, 17.0);
    box(31, 21.3, 2.4, 0.15, 1.6, tm(TEX.paintings[5], 1, 1, 0.7), { collide: false, ry: 0 });
    for (const [x, z] of [[5, 5.5], [13.5, 4], [20.5, 4], [13.5, 10.5], [20.5, 10.5], [29, 5.5], [17, 18]]) glowPanel(x, z, 2.2, 0.8, 0xffffff);
    for (const [x, z, i] of [[5, 5.5, 0.6], [17, 4, 0.55], [17, 10.5, 0.55], [29, 5.5, 0.6], [17, 18, 0.6], [29, 16.5, 0.45]]) lamp(x, z, 0xfffaf0, i, { fixture: false, dist: 14 });
    return extra;
  },
};
function f_gold() { return cm('#c9a54c', 0.4, 0.5); }

const MAP_ORDER = ['mansion', 'backrooms', 'sewer', 'sugar', 'gallery'];

/* ================= Lobby hub (not a playable round map) ================= */
function signTex(title, sub, c1, c2, votes = 0, hot = false) {
  const t = canvasTex(512, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = '#12151d'; g.fillRect(0, 0, w, h);
    g.fillStyle = gr; g.fillRect(14, 14, w - 28, h - 120);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = -h; i < w; i += 34) { g.beginPath(); g.moveTo(i, 14); g.lineTo(i + 17, 14); g.lineTo(i + 17 - (h - 134), h - 106); g.lineTo(i - (h - 134), h - 106); g.fill(); }
    g.fillStyle = 'rgba(10,12,18,.55)'; g.fillRect(14, h - 170, w - 28, 64);
    g.fillStyle = '#fff'; g.font = '700 46px Segoe UI, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(title, 34, h - 138);
    g.fillStyle = hot ? '#3ad49c' : '#c9d1e0'; g.font = '600 34px Segoe UI, system-ui, sans-serif';
    g.fillText(votes ? `${votes} vote${votes === 1 ? '' : 's'}` : sub, 34, h - 55);
  });
  return t;
}
MAPS.lobby = {
  id: 'lobby', name: 'Chameleon Club', desc: 'The lobby.', colors: ['#3ad49c', '#4da3ff'], hub: true,
  bounds: { x0: 0, z0: 0, x1: 26, z1: 22 }, wallH: 5.5, ceilH: 5.5,
  zones: [{ id: 'club', name: 'Club', x0: 0, z0: 0, x1: 26, z1: 22, pts: gridPts(1, 6, 21, 21, 4) }],
  playerSpawn: [13, 15], hunterSpawns: [[13, 15]],
  light: { hemi: 0.62, sky: 0xffffff, ground: 0x7a6f9a, amb: 0.16, sun: 0.35, sunPos: [-6, 30, 8], bg: 0x161a26 },
  build() {
    if (!TEX.hubFloor) {
      TEX.hubFloor = canvasTex(256, 256, (g, w, h) => {
        const cols = ['#2a3350', '#313b5c'];
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = cols[(x + y) % 2]; g.fillRect(x * 64, y * 64, 64, 64); }
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
      });
      TEX.hubWall = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#23283a'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,.035)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 16, h);
        g.fillStyle = '#3ad49c'; g.fillRect(0, h * 0.78, w, 5); g.fillStyle = '#ff7ab3'; g.fillRect(0, h * 0.8, w, 3);
      });
      TEX.neon = canvasTex(1024, 192, (g, w, h) => {
        g.fillStyle = '#0d1018'; g.fillRect(0, 0, w, h);
        g.font = '800 120px Segoe UI, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = '#3ad49c'; g.shadowBlur = 30; g.fillStyle = '#b9ffe6'; g.fillText('MECCHA CLUB', w / 2, h / 2 + 6);
      });
    }
    const extra = buildShell([{ id: 'club', x0: 0, z0: 0, x1: 26, z1: 22, wall: 'hubWall', floor: 'hubFloor', floorScale: 4 }], [], { frame: false });
    plane(13, 5.5, 11, 26, 22, cm('#151926', 1), Math.PI / 2, 0).castShadow = false;
    const H = (this.hub = { votePads: [], jumpPads: [], signs: {} });
    const glow = (x, z, r, color, y = 0.012) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); mapGroup.add(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.08, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.002, z); mapGroup.add(ring);
      return m;
    };
    // ready pad
    H.readyPad = { x: 13, z: 10.5, r: 1.5, mesh: glow(13, 10.5, 1.5, 0x1f8f66) };
    { const s = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#fff'; g.font = '800 40px Segoe UI, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('READY UP', w / 2, h / 2); }); const p = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: s, transparent: true })); p.rotation.set(-Math.PI / 2, 0, 0); p.position.set(13, 0.02, 12.4); mapGroup.add(p); }
    // vote pads + signs
    MAP_ORDER.forEach((id, i) => {
      const m = MAPS[id], x = 3.6 + i * 4.7, z = 4.2;
      H.votePads.push({ id, x, z, r: 1.15, mesh: glow(x, z, 1.15, new THREE.Color(m.colors[1]).multiplyScalar(0.7).getHex()) });
      box(x - 1.2, 1.6, 0.1, 0.1, 2.2, f_steel(), { collide: false }); box(x + 1.2, 1.6, 0.1, 0.1, 2.2, f_steel(), { collide: false });
      const tex = signTex(m.name, 'Step here to vote', m.colors[0], m.colors[1]);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.625), new THREE.MeshBasicMaterial({ map: tex }));
      sign.position.set(x, 3.0, 1.62); mapGroup.add(sign);
      box(x, 1.58, 2.75, 0.06, 1.75, cm('#0d1018', 0.5), { y: 2.12, collide: false });
      H.signs[id] = sign;
    });
    H.setVotes = (counts, mine) => {
      for (const id of MAP_ORDER) {
        const m = MAPS[id], s = H.signs[id];
        s.material.map.dispose(); s.material.map = signTex(m.name, 'Step here to vote', m.colors[0], m.colors[1], counts[id] || 0, mine === id); s.material.needsUpdate = true;
      }
    };
    // neon sign
    { const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.31), new THREE.MeshBasicMaterial({ map: TEX.neon })); p.position.set(13, 4.75, 0.12); mapGroup.add(p); }
    // camo practice wall (west) + tester
    const swatchTex = ['wallLiving', 'brick', 'brWall', 'sewerWall', 'swirl', 'frostMint', 'graffiti', 'books', 'wallPlay'];
    swatchTex.forEach((k, i) => decal(0.11, 1.75, 6.5 + i * 1.6, 1.6, 3.4, Array.isArray(TEX[k]) ? TEX[k][0] : TEX[k], 'e', 0.9));
    box(0.35, 13.7, 0.5, 15, 0.12, cm('#0d1018', 0.6), { y: 3.45, collide: false });
    H.dummy = { x: 6.2, z: 13.7, yaw: -Math.PI / 2 };
    cyl(6.2, 13.7, 0.55, 0.6, 0.18, cm('#0d1018', 0.4), { collide: true, top: true });
    // mezzanine + stairs + jump pads (east)
    box(23.75, 11, 4.5, 11, 0.25, cm('#2d3550', 0.7), { y: 2.0, top: true });
    for (let z = 5.6; z <= 16.4; z += 1.8) box(21.55, z, 0.06, 0.06, 1, f_steel(), { y: 2.25, collide: false });
    box(21.55, 11, 0.06, 10.8, 0.06, cm('#3ad49c', 0.4), { y: 3.2, collide: false });
    addCollider(21.5, 2.25, 5.5, 21.6, 3.2, 16.5);
    for (let i = 0; i < 7; i++) box(23.75, 21.6 - i * 0.55, 4.5, 0.55, 0.3 * (i + 1), cm(i % 2 ? '#313b5c' : '#2a3350', 0.8), { top: true });
    for (const z of [8.5, 13.5]) { H.jumpPads.push({ x: 19.6, z, r: 0.75 }); glow(19.6, z, 0.75, 0xff8a3d, 0.015); }
    // podium (south)
    for (const [x, h, c] of [[13, 0.9, '#ffd43b'], [11.4, 0.6, '#c9d1e0'], [14.6, 0.4, '#e8a87c']]) box(x, 20, 1.6, 1.6, h, cm(c, 0.5, 0.2), { top: true });
    // lounge (south-west) + arcade cabinets
    prop('f:loungeDesignSofa', 3.5, 21.95, { ry: 'n', az: 'max', tint: '#ff7ab3' }); prop('f:tableCoffeeGlass', 3.5, 19.0);
    prop('arc:arcade-machine', 7.6, 21.95, { h: 1.9, ry: 'n', az: 'max' }); prop('arc:arcade-machine', 8.7, 21.95, { h: 1.9, ry: 'n', az: 'max' }); prop('arc:pinball', 10.2, 21.95, { h: 1.3, ry: 'n', az: 'max' });
    prop('arc:claw-machine', 0.05, 19.0, { h: 2.0, ry: 'e', ax: 'min' }); prop('arc:vending-machine', 0.05, 16.8, { h: 1.9, ry: 'e', ax: 'min' });
    prop('arc:air-hockey', 9.0, 18.4, { h: 0.9, ry: 'e' }); prop('arc:dance-machine', 25.9, 2.0, { h: 1.6, ry: 'w', ax: 'max' });
    // paint buckets
    ['#ff5d6c', '#ffd43b', '#3ad49c', '#4da3ff', '#b197fc'].forEach((c, i) => { cyl(16.5 + i * 0.75, 20.9, 0.3, 0.26, 0.5, cm('#d8dde6', 0.4, 0.5), { collide: true, top: true }); cyl(16.5 + i * 0.75, 20.9, 0.27, 0.27, 0.02, cm(c, 0.3), { y: 0.5, collide: false }); });
    for (const [x, z] of [[0.7, 0.7], [25.3, 0.7], [0.7, 21.3], [20.5, 0.8]]) prop('f:pottedPlant', x, z, { s: 1.3 });
    for (const [x, z] of [[6, 6], [13, 6], [20, 6], [6, 15], [13, 15], [18, 18]]) lamp(x, z, 0xfff3e0, 0.5, { dist: 12 });
    lamp(13, 10.5, 0x3ad49c, 0.6, { dist: 6, y: 2.5, fixture: false });
    return extra;
  },
};
