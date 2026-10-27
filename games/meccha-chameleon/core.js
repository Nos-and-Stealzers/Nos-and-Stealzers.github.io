'use strict';
/* Core engine: renderer, settings, texture library, map-building helpers, collision, navigation, map loader. */

const V3 = THREE.Vector3;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let seedState = 20260610;
function setSeed(n) { seedState = n | 0; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
function srand() {
  seedState = (seedState + 0x6D2B79F5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const sr = (a, b) => a + srand() * (b - a);
const spick = (a) => a[Math.floor(srand() * a.length)];

/* ---------- settings ---------- */
const SETTINGS = Object.assign({ sens: 1, vol: 0.6, fov: 72, quality: 'high', invertY: false, music: true }, JSON.parse(localStorage.getItem('mc_settings') || '{}'));
function saveSettings() { localStorage.setItem('mc_settings', JSON.stringify(SETTINGS)); }

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
function applyQuality() {
  const q = SETTINGS.quality;
  renderer.setPixelRatio(q === 'low' ? 0.75 : q === 'medium' ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = q !== 'low';
  renderer.setSize(innerWidth, innerHeight);
}
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
applyQuality();
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151a26);
const camera = new THREE.PerspectiveCamera(SETTINGS.fov, innerWidth / innerHeight, 0.05, 160);
scene.add(camera);
addEventListener('resize', () => { applyQuality(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const hemi = new THREE.HemisphereLight(0xfff3df, 0x6e5e4e, 0.6);
const amb = new THREE.AmbientLight(0xffffff, 0.16);
const sun = new THREE.DirectionalLight(0xfff0dc, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(hemi, amb, sun, sun.target);

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  c._data = g.getImageData(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function shade(hex, amt) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, amt); return '#' + c.getHexString(); }
function speckle(g, w, h, density, alpha) {
  const n = w * h * density;
  for (let i = 0; i < n; i++) {
    g.fillStyle = srand() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    g.fillRect((srand() * w) | 0, (srand() * h) | 0, 1 + ((srand() * 2) | 0), 1 + ((srand() * 2) | 0));
  }
}
function wainscot(g, w, h, meters, color, line, rail, wallH = 3.2) {
  const y = h * (1 - meters / wallH);
  g.fillStyle = color; g.fillRect(0, y, w, h - y);
  g.strokeStyle = line; g.lineWidth = 4;
  for (let i = 0; i < 2; i++) g.strokeRect(i * w / 2 + 14, y + 22, w / 2 - 28, h - y - 52);
  g.fillStyle = rail; g.fillRect(0, y - 6, w, 12);
  g.fillStyle = shade(color, -0.12); g.fillRect(0, h - 20, w, 20);
}
function tiles(g, x0, y0, w, h, size, colors, grout, gw = 3) {
  g.fillStyle = grout; g.fillRect(x0, y0, w, h);
  for (let y = y0; y < y0 + h; y += size) for (let x = x0; x < x0 + w; x += size) {
    g.fillStyle = spick(colors); g.fillRect(x + gw / 2, y + gw / 2, size - gw, Math.min(size, y0 + h - y) - gw);
  }
}
function planks(g, w, h, rows, palette, seam) {
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -sr(0, 120);
    while (x < w) {
      const len = sr(90, 180);
      g.fillStyle = spick(palette); g.fillRect(x, r * rh, len, rh);
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const yy = r * rh + sr(4, rh - 4); g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + sr(-3, 3), x + len * .6, yy + sr(-3, 3), x + len, yy); g.stroke(); }
      g.fillStyle = seam; g.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = seam; g.fillRect(0, r * rh, w, 2);
  }
}
function bricks(g, w, h, bw, bh, palette, mortar, gap = 3) {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  for (let y = 0, r = 0; y < h; y += bh, r++) for (let x = (r % 2) * -bw / 2; x < w; x += bw) { g.fillStyle = spick(palette); g.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap); }
}
function sprinkles(g, w, h, n, cols) {
  for (let i = 0; i < n; i++) { g.save(); g.translate(sr(0, w), sr(0, h)); g.rotate(sr(0, 3.14)); g.fillStyle = spick(cols); g.fillRect(-4, -1.5, 8, 3); g.restore(); }
}
const SPRINK = ['#ff5d8f', '#ffd43b', '#4dabf7', '#69db7c', '#ffffff', '#b197fc', '#ff922b'];

setSeed(20260610);
const TEX = {};
/* --- mansion --- */
TEX.wallLiving = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#ece1c6'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 256 / 6) { g.fillStyle = '#4f9a94'; g.fillRect(x + 6, 0, 16, h); g.fillStyle = '#d4a94f'; g.fillRect(x + 29, 0, 3, h); }
  speckle(g, w, h, 0.3, 0.035);
  wainscot(g, w, h, 1.0, '#7b4a2c', '#5b331c', '#e8d6b0');
});
TEX.wallKitchen = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#f4e7c8'; g.fillRect(0, 0, w, h);
  for (let y = 10; y < h * 0.5; y += 48) for (let x = (y / 48 % 2) * 24; x < w; x += 48) { g.fillStyle = '#d9a441'; g.beginPath(); g.arc(x + 12, y + 12, 3, 0, 7); g.fill(); }
  const y = h * (1 - 1.4 / 3.2);
  tiles(g, 0, y, w, h - y, 32, ['#f2c94c', '#f5d36a', '#efc23c'], '#fbf6e9');
  g.fillStyle = '#d9832b'; g.fillRect(0, y - 8, w, 10);
});
TEX.wallLibrary = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#2e5a45'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3e7359'; g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  g.fillStyle = '#c9a54c';
  for (let y = 16; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.beginPath(); g.arc(x + (y / 32 % 2 ? 16 : 0), y, 2.4, 0, 7); g.fill(); }
  speckle(g, w, h, 0.3, 0.04);
  wainscot(g, w, h, 1.1, '#4a2c1a', '#2f1a0e', '#6b4226');
});
TEX.wallHall = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#eee1c9'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(156,59,59,.55)';
  for (let y = 0; y < h; y += 40) for (let x = 0; x < w; x += 32) {
    const ox = (y / 40 % 2) * 16;
    g.beginPath(); g.moveTo(x + ox, y + 6); g.lineTo(x + ox + 7, y + 16); g.lineTo(x + ox, y + 26); g.lineTo(x + ox - 7, y + 16); g.closePath(); g.fill();
  }
  wainscot(g, w, h, 0.9, '#f6f2ea', '#d8d1c3', '#c9bfac');
});
TEX.wallBed = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#f4b9c6'; g.fillRect(0, 0, w, h);
  for (let y = 18; y < h; y += 42) for (let x = 18; x < w; x += 42) {
    const cx = x + ((y / 42) % 2 ? 21 : 0) + sr(-3, 3), cy = y + sr(-3, 3);
    g.fillStyle = '#7fbf8a'; g.beginPath(); g.ellipse(cx + 8, cy + 8, 6, 3, 0.6, 0, 7); g.fill();
    g.fillStyle = '#fff6f8';
    for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4, 0, 7); g.fill(); }
    g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
  }
  g.fillStyle = '#fbf7f2'; g.fillRect(0, h - 20, w, 20);
});
TEX.wallBath = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#e9f3f9'; g.fillRect(0, 0, w, h);
  const y = h * (1 - 1.5 / 3.2);
  tiles(g, 0, y, w, h - y, 24, ['#4fa3d1', '#5cb2de', '#4697c4'], '#f4f8fb');
  g.fillStyle = '#2f6f99'; g.fillRect(0, y - 6, w, 8);
});
TEX.wallPlay = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#ffd84d'; g.fillRect(0, 0, w, h);
  const cols = ['#ff5d5d', '#4d8dff', '#3ccf6e', '#a66bff', '#ff9f43'];
  for (let y = 20; y < h - 60; y += 44) for (let x = 20; x < w; x += 44) { g.fillStyle = spick(cols); g.beginPath(); g.arc(x + ((y / 44) % 2 ? 22 : 0), y, 11, 0, 7); g.fill(); }
  const by = h * (1 - 1.0 / 3.2);
  ['#ff5d5d', '#ff9f43', '#ffe14d', '#3ccf6e', '#4d8dff', '#a66bff'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, by + i * 7, w, 7); });
  g.fillStyle = '#4d8dff'; g.fillRect(0, h - 20, w, 20);
});
TEX.wallGarage = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#9b9ea5'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1.2, 0.07);
  g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2;
  for (let y = 0; y < h; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 34 % 2) * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke(); } }
  const y = h - 40;
  for (let x = -40; x < w; x += 24) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 52, y); g.lineTo(x + 40, y); g.fill(); }
});
TEX.wallDining = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#7a1f2b'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(214,170,92,.42)';
  for (let y = 0; y < h; y += 52) for (let x = 0; x < w; x += 42) {
    const cx = x + ((y / 52) % 2 ? 21 : 0), cy = y + 26;
    g.beginPath(); g.moveTo(cx, cy - 16); g.bezierCurveTo(cx + 12, cy - 8, cx + 12, cy + 8, cx, cy + 16); g.bezierCurveTo(cx - 12, cy + 8, cx - 12, cy - 8, cx, cy - 16); g.fill();
    g.fillRect(cx - 1, cy - 22, 2, 44);
  }
  speckle(g, w, h, 0.25, 0.04);
  wainscot(g, w, h, 1.05, '#f1e9da', '#d8cdb8', '#c4b69c');
});
TEX.wallSun = canvasTex(256, 410, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#cfeee4'); grd.addColorStop(1, '#a9d9c6'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 6; i++) { g.save(); g.translate(sr(0, w), sr(0, h * 0.6)); g.rotate(-0.6); g.fillRect(0, 0, 80, 8); g.restore(); }
  g.strokeStyle = '#f7f7f2'; g.lineWidth = 7;
  for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h * 0.72; y += 70) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const y = h * 0.74; g.fillStyle = '#e9e2d3'; g.fillRect(0, y, w, h - y); bricksLow(g, y, w, h);
});
function bricksLow(g, y0, w, h) { g.strokeStyle = 'rgba(120,90,60,.35)'; g.lineWidth = 2; for (let y = y0; y < h; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = ((y - y0) / 18 % 2) * 22; x < w; x += 44) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 18); g.stroke(); } } }
TEX.wallOffice = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#26354f'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = '#2d3e5b'; g.fillRect(x, 0, 16, h); }
  speckle(g, w, h, 0.25, 0.04);
  wainscot(g, w, h, 1.0, '#5a3a22', '#3d2615', '#6e4a2c');
});
TEX.ripple = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${sr(150, 210) | 0},${sr(190, 230) | 0},255,.35)`; g.lineWidth = sr(1, 3); g.beginPath(); const y = sr(0, h), x = sr(0, w); g.ellipse(x, y, sr(10, 40), sr(2, 6), 0, 0, 7); g.stroke(); } });
TEX.terraTile = canvasTex(256, 256, (g, w, h) => tiles(g, 0, 0, w, h, 64, ['#c77a52', '#bf7049', '#cc8460', '#b9693f'], '#e8d8c0', 4));
TEX.poolTile = canvasTex(256, 256, (g, w, h) => { tiles(g, 0, 0, w, h, 16, ['#f6f8f7', '#eef3f2', '#f1f5f4'], '#c9d6d4', 2); speckle(g, w, h, 0.15, 0.03); });
TEX.poolBlue = canvasTex(256, 256, (g, w, h) => tiles(g, 0, 0, w, h, 16, ['#5ec2d9', '#55b8d0', '#66c9df'], '#9fe0ee', 2));
TEX.factoryWall = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#ffb3cf'; g.fillRect(0, 0, w, h);
  for (let x = -h; x < w; x += 36) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  g.fillStyle = '#ff6fae'; g.fillRect(0, h - 40, w, 40); g.fillStyle = '#fff'; for (let x = 8; x < w; x += 24) { g.beginPath(); g.arc(x, h - 20, 6, 0, 7); g.fill(); }
});
TEX.picnic = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#fff4ef'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(224,49,73,.75)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 32, h); for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 32); });
TEX.modernWall = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#1b1d24'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.25, 0.03); g.fillStyle = '#2a2d36'; g.fillRect(0, h - 14, w, 14); });
TEX.shopWall = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#f7efe1'; g.fillRect(0, 0, w, h); g.fillStyle = '#ef6f6c'; g.fillRect(0, h * 0.62, w, 10); g.fillStyle = '#3fb7a6'; g.fillRect(0, h * 0.62 + 10, w, 6); speckle(g, w, h, 0.2, 0.03); g.fillStyle = '#d9cdb6'; g.fillRect(0, h - 16, w, 16); });
TEX.cistern = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#6b6156'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 26) for (let x = ((y / 26) % 2) * 26; x < w; x += 52) { g.fillStyle = spick(['#756a5e', '#62584d', '#7d7164', '#5a5148']); g.fillRect(x + 2, y + 2, 48, 22); } g.fillStyle = 'rgba(40,70,55,.45)'; g.fillRect(0, h * 0.78, w, h * 0.22); speckle(g, w, h, 0.6, 0.06); });
TEX.wood = canvasTex(256, 256, (g, w, h) => planks(g, w, h, 8, ['#a86b3c', '#b47744', '#9c6234', '#b98050', '#a56838'], 'rgba(60,30,10,.55)'));
TEX.woodDark = canvasTex(256, 256, (g, w, h) => planks(g, w, h, 8, ['#6b4024', '#5e381f', '#734628', '#62391f'], 'rgba(25,10,3,.6)'));
TEX.woodLight = canvasTex(256, 256, (g, w, h) => planks(g, w, h, 8, ['#d8b484', '#cfa877', '#e0bd8e', '#c99f6c'], 'rgba(90,60,30,.35)'));
TEX.checker = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#2d2d33' : '#f1ede4'; g.fillRect(x * 64, y * 64, 64, 64); } speckle(g, w, h, 0.25, 0.04); });
TEX.parquet = canvasTex(256, 256, (g) => {
  const pal = ['#8a5a32', '#94633a', '#7d5029', '#9b6a40'];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const horiz = (i + j) % 2 === 0;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = spick(pal);
      if (horiz) g.fillRect(i * 64, j * 64 + k * 16, 64, 16); else g.fillRect(i * 64 + k * 16, j * 64, 16, 64);
      g.strokeStyle = 'rgba(40,20,5,.45)'; g.lineWidth = 1.5;
      if (horiz) g.strokeRect(i * 64, j * 64 + k * 16, 64, 16); else g.strokeRect(i * 64 + k * 16, j * 64, 16, 64);
    }
  }
});
TEX.carpet = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#b6a3d8'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1.6, 0.06); });
TEX.bathFloor = canvasTex(256, 256, (g, w, h) => tiles(g, 0, 0, w, h, 32, ['#f4f6f8', '#eef1f4'], '#c3ccd5', 3));
TEX.mats = canvasTex(256, 256, (g) => {
  const cols = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b'];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const c = cols[(x + y * 2) % 4]; g.fillStyle = c; g.fillRect(x * 128, y * 128, 128, 128);
    g.fillStyle = shade(c, -0.08); g.fillRect(x * 128 + 10, y * 128 + 10, 108, 108);
    g.fillStyle = c; g.fillRect(x * 128 + 14, y * 128 + 14, 100, 100);
    g.fillStyle = cols[(x + y * 2 + 1) % 4]; g.beginPath(); g.arc(x * 128 + 128, y * 128 + 64, 13, 0, 7); g.fill();
    g.fillStyle = cols[(x + y * 2 + 2) % 4]; g.beginPath(); g.arc(x * 128 + 64, y * 128 + 128, 13, 0, 7); g.fill();
  }
});
TEX.concrete = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8e9197'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2, 0.06); g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); });
TEX.rugLiving = canvasTex(256, 180, (g, w, h) => {
  g.fillStyle = '#a8323a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8c27a'; g.fillRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#1f3b5c'; g.fillRect(16, 16, w - 32, h - 32);
  g.fillStyle = '#a8323a'; g.fillRect(24, 24, w - 48, h - 48);
  g.fillStyle = '#1f3b5c'; g.beginPath(); g.moveTo(w / 2, 34); g.lineTo(w - 50, h / 2); g.lineTo(w / 2, h - 34); g.lineTo(50, h / 2); g.closePath(); g.fill();
  g.fillStyle = '#e8c27a'; g.beginPath(); g.moveTo(w / 2, 58); g.lineTo(w - 86, h / 2); g.lineTo(w / 2, h - 58); g.lineTo(86, h / 2); g.closePath(); g.fill();
  g.fillStyle = '#a8323a'; g.beginPath(); g.arc(w / 2, h / 2, 14, 0, 7); g.fill();
  speckle(g, w, h, 0.8, 0.05);
});
TEX.runner = canvasTex(512, 64, (g, w, h) => {
  g.fillStyle = '#22325a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c99a3c'; g.fillRect(0, 4, w, 4); g.fillRect(0, h - 8, w, 4);
  for (let x = 16; x < w; x += 32) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 10, 32); g.lineTo(x, 46); g.lineTo(x - 10, 32); g.closePath(); g.fill(); }
  speckle(g, w, h, 0.5, 0.05);
});
TEX.rugRound = canvasTex(256, 256, (g, w, h) => {
  ['#6a1f2b', '#c99a3c', '#25523e', '#6a1f2b', '#c99a3c', '#25523e', '#6a1f2b'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(128, 128, 128 - i * 18, 0, 7); g.fill(); });
  speckle(g, w, h, 0.6, 0.05);
});
TEX.rugPink = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ff9fb6'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff1f4'; for (let y = 8; y < h; y += 24) g.fillRect(0, y, w, 8); });
TEX.books = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4e321d'; g.fillRect(0, 0, w, h);
  const rows = 5, rh = h / rows;
  const pal = ['#a83232', '#2e5c8a', '#2f7a4b', '#c8a032', '#6b3fa0', '#d9643a', '#1f2f4a', '#8b5a2b', '#e8dcc0', '#3f8f8f'];
  for (let r = 0; r < rows; r++) {
    let x = 8; const base = r * rh + rh - 6;
    g.fillStyle = '#2b1a0e'; g.fillRect(4, r * rh + 4, w - 8, rh - 10);
    while (x < w - 12) {
      const bw = sr(7, 17), bh = sr(rh * 0.6, rh * 0.86);
      if (srand() < 0.08) { x += bw; continue; }
      const c = spick(pal); g.fillStyle = c; g.fillRect(x, base - bh, bw - 1, bh);
      g.fillStyle = shade(c, 0.15); g.fillRect(x + 1, base - bh + 5, bw - 3, 3);
      if (srand() < 0.5) { g.fillStyle = '#e2c26a'; g.fillRect(x + 1, base - bh * 0.4, bw - 3, 2); }
      x += bw;
    }
    g.fillStyle = '#6b4426'; g.fillRect(0, base, w, 6);
  }
});
TEX.cabinets = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.strokeStyle = '#c9c3b6'; g.lineWidth = 3; g.strokeRect(i * 64 + 5, 6, 54, h - 12); g.fillStyle = '#8a8f99'; g.fillRect(i * 64 + (i % 2 ? 10 : 50), h / 2 - 8, 4, 16); }
});
TEX.quilt = canvasTex(256, 256, (g) => {
  const pal = ['#ffd1dc', '#c9e4ff', '#fff2b3', '#d4f5d0', '#e7d4ff', '#ffc9a8', '#ffffff'];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const c = spick(pal); g.fillStyle = c; g.fillRect(x * 32, y * 32, 32, 32);
    if (srand() < 0.4) { g.fillStyle = shade(c, -0.12); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x * 32 + 8 + (k % 2) * 16, y * 32 + 8 + (k > 1) * 16, 3, 0, 7); g.fill(); } }
    g.strokeStyle = 'rgba(120,90,110,.5)'; g.setLineDash([3, 3]); g.strokeRect(x * 32 + 2, y * 32 + 2, 28, 28); g.setLineDash([]);
  }
});
TEX.brick = canvasTex(256, 256, (g, w, h) => { bricks(g, w, h, 64, 24, ['#a4442e', '#b34f36', '#94392a', '#ad5a3c'], '#d8cfc2'); speckle(g, w, h, 0.5, 0.06); });
TEX.wardrobe = canvasTex(128, 256, (g, w, h) => {
  planks(g, w, h, 1, ['#8a5a36'], 'rgba(0,0,0,.2)');
  g.strokeStyle = '#5a3820'; g.lineWidth = 4; g.strokeRect(6, 6, w / 2 - 9, h - 12); g.strokeRect(w / 2 + 3, 6, w / 2 - 9, h - 12);
  g.fillStyle = '#d9b45a'; g.beginPath(); g.arc(w / 2 - 10, h / 2, 4, 0, 7); g.arc(w / 2 + 10, h / 2, 4, 0, 7); g.fill();
});
TEX.jars = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#d7c4a1'; g.fillRect(0, 0, w, h);
  const pal = ['#e85d3f', '#f2c94c', '#7fb069', '#8c5e3c', '#f7f3e8', '#d14d72'];
  for (let r = 0; r < 4; r++) {
    const base = (r + 1) * 64 - 8; g.fillStyle = '#9c7a4f'; g.fillRect(0, base, w, 8);
    for (let x = 8; x < w - 20; x += 30) { const c = spick(pal); const jh = sr(28, 48); g.fillStyle = c; g.fillRect(x, base - jh, 22, jh); g.fillStyle = '#b8b8b8'; g.fillRect(x - 1, base - jh - 5, 24, 6); }
  }
});
TEX.toyShelf = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const pal = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#b197fc'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { g.fillStyle = spick(pal); g.fillRect(c * 85 + 8, r * 85 + 30, 70, 50); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(c * 85 + 28, r * 85 + 40, 30, 6); }
});
TEX.globe = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#3a7dc9'; g.fillRect(0, 0, w, h); g.fillStyle = '#6fb35a'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(sr(0, w), sr(20, h - 20), sr(10, 30), sr(6, 18), sr(0, 3), 0, 7); g.fill(); } });
TEX.teepee = canvasTex(256, 256, (g, w, h) => {
  const pal = ['#fff7ea', '#ff7a7a', '#fff7ea', '#3fb7a6'];
  for (let i = 0; i < 8; i++) { g.fillStyle = pal[i % 4]; g.fillRect(i * 32, 0, 32, h); }
  g.fillStyle = '#ffcf4d'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 190); g.lineTo(x + 8, 176); g.lineTo(x + 16, 190); g.fill(); }
});
TEX.hazard = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#222'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5c518'; for (let x = -128; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
TEX.clock = canvasTex(128, 256, (g, w, h) => {
  planks(g, w, h, 1, ['#5e3418'], 'rgba(0,0,0,.2)');
  g.fillStyle = '#f5ecd5'; g.beginPath(); g.arc(64, 56, 40, 0, 7); g.fill(); g.strokeStyle = '#2b1a0e'; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.moveTo(64, 56); g.lineTo(64, 28); g.moveTo(64, 56); g.lineTo(84, 64); g.stroke();
  g.fillStyle = '#c9a54c'; g.beginPath(); g.arc(64, 170, 18, 0, 7); g.fill(); g.fillRect(62, 96, 4, 74);
});
TEX.towel = canvasTex(64, 128, (g, w, h) => { for (let y = 0; y < h; y += 16) { g.fillStyle = (y / 16) % 2 ? '#ffffff' : '#ff8fa3'; g.fillRect(0, y, w, 16); } });
TEX.leaves = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3f8a3a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 120; i++) { g.fillStyle = spick(['#2f6e2c', '#56a64c', '#3a7f36', '#6fbf5e']); g.beginPath(); g.ellipse(sr(0, w), sr(0, h), sr(4, 10), sr(2, 5), sr(0, 3), 0, 7); g.fill(); } });
TEX.crate = canvasTex(128, 128, (g, w, h) => { planks(g, w, h, 4, ['#c49a5c', '#b88d50', '#d1a86a'], 'rgba(60,30,10,.4)'); g.strokeStyle = '#7d5a2c'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke(); });
TEX.pegboard = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#c89f6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a6a40';
  for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  g.fillStyle = '#d33'; g.fillRect(30, 30, 50, 10); g.fillStyle = '#333'; g.fillRect(100, 20, 8, 60); g.fillStyle = '#2a6'; g.fillRect(150, 40, 60, 14);
});
TEX.paintings = [];
for (let i = 0; i < 14; i++) {
  TEX.paintings.push(canvasTex(160, 120, (g, w, h) => {
    const pals = [['#f2e3c6', '#e85d3f', '#2e5c8a', '#f2c94c', '#1f2f4a'], ['#1c2b3a', '#3fb7a6', '#ff7a7a', '#ffcf4d', '#ffffff'], ['#d8e7d0', '#5a8f4e', '#2f4a2a', '#e8c27a', '#a83232'], ['#ffd1dc', '#a66bff', '#4dabf7', '#ffffff', '#ff5d5d'], ['#101820', '#f2aa4c', '#ef6f6c', '#4f86c6', '#e6e6e6']];
    const p = pals[i % pals.length];
    g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
    if (i % 3 === 0) { g.fillStyle = p[1]; g.beginPath(); g.arc(w * .65, h * .35, 22, 0, 7); g.fill(); g.fillStyle = p[2]; g.beginPath(); g.moveTo(0, h); g.lineTo(w * .35, h * .45); g.lineTo(w * .7, h); g.fill(); g.fillStyle = p[3]; g.beginPath(); g.moveTo(w * .4, h); g.lineTo(w * .75, h * .55); g.lineTo(w, h); g.fill(); }
    else if (i % 3 === 1) for (let k = 0; k < 9; k++) { g.fillStyle = spick(p.slice(1)); if (srand() < .5) g.fillRect(sr(0, w), sr(0, h), sr(14, 60), sr(10, 50)); else { g.beginPath(); g.arc(sr(0, w), sr(0, h), sr(6, 26), 0, 7); g.fill(); } }
    else { for (let k = 0; k < 6; k++) { g.strokeStyle = spick(p.slice(1)); g.lineWidth = sr(4, 14); g.beginPath(); g.moveTo(sr(0, w), sr(0, h)); g.bezierCurveTo(sr(0, w), sr(0, h), sr(0, w), sr(0, h), sr(0, w), sr(0, h)); g.stroke(); } }
  }));
}
/* --- backrooms --- */
TEX.brWall = canvasTex(256, 410, (g, w, h) => {
  g.fillStyle = '#c9b65c'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? 'rgba(120,100,30,.10)' : 'rgba(255,240,170,.08)'; g.fillRect(x, 0, 16, h); }
  g.strokeStyle = 'rgba(110,92,30,.16)'; g.lineWidth = 2;
  for (let y = 10; y < h; y += 26) for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 8); g.stroke(); }
  for (let i = 0; i < 5; i++) { const x = sr(0, w), y = sr(h * 0.4, h), r = sr(10, 40); const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(90,70,20,.22)'); gr.addColorStop(1, 'rgba(90,70,20,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  speckle(g, w, h, 0.5, 0.04);
  g.fillStyle = '#8f7d3a'; g.fillRect(0, h - 14, w, 14);
});
TEX.brCarpet = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#a5945a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2.2, 0.07);
  for (let i = 0; i < 3; i++) { const x = sr(0, w), y = sr(0, h), r = sr(20, 50); const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(70,55,20,.25)'); gr.addColorStop(1, 'rgba(70,55,20,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
});
TEX.brCeil = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ddd3a0'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1, 0.05); g.strokeStyle = '#a99d68'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); } });
/* --- sewer --- */
TEX.sewerWall = canvasTex(256, 410, (g, w, h) => {
  bricks(g, w, h, 48, 22, ['#5e4c40', '#66523f', '#574639', '#6d5a48', '#4f4034'], '#2e2621', 3);
  const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, 'rgba(60,90,40,0)'); gr.addColorStop(1, 'rgba(60,90,40,.6)'); g.fillStyle = gr; g.fillRect(0, h * 0.7, w, h * 0.3);
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(30,40,20,.25)'; g.fillRect(sr(0, w), sr(0, h * 0.6), sr(2, 5), sr(30, 120)); }
  speckle(g, w, h, 0.8, 0.06);
});
TEX.sewerFloor = canvasTex(256, 256, (g, w, h) => {
  tiles(g, 0, 0, w, h, 64, ['#6d685d', '#635f55', '#76705f', '#5d594f'], '#3a3731', 5);
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(40,60,60,.35)'; g.beginPath(); g.ellipse(sr(0, w), sr(0, h), sr(10, 30), sr(6, 16), sr(0, 3), 0, 7); g.fill(); }
  speckle(g, w, h, 0.8, 0.06);
});
TEX.water = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2f5c50'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(160,220,200,.18)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { const y = sr(0, h), x = sr(0, w); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 6, x + 40, y); g.stroke(); }
});
TEX.rust = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = spick(['#8f5a33', '#5e3920', '#a0673a', '#4d4a46']); g.beginPath(); g.arc(sr(0, w), sr(0, h), sr(2, 9), 0, 7); g.fill(); } });
TEX.pipe = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#4f6b73'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = '#3b5258'; g.fillRect(x, 0, 6, h); } speckle(g, w, h, 1, 0.08); });
TEX.grate = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#1a1c1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a5e62'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 8, h); g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8); });
TEX.barrel = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#2f6db4'; g.fillRect(0, 0, w, h); g.fillStyle = '#25579a'; g.fillRect(0, 20, w, 8); g.fillRect(0, h - 28, w, 8); g.fillStyle = '#f5c518'; g.beginPath(); g.moveTo(64, 46); g.lineTo(80, 76); g.lineTo(48, 76); g.fill(); });
TEX.graffiti = [0, 1, 2, 3].map((k) => canvasTex(256, 160, (g, w, h) => {
  bricks(g, w, h, 48, 22, ['#5e4c40', '#66523f', '#574639', '#6d5a48'], '#2e2621', 3);
  const cols = [['#ff4fa3', '#33e1ff', '#ffe14d'], ['#7bff5a', '#ff7a1a', '#ffffff'], ['#b14dff', '#ffd23f', '#00e0b0'], ['#ff3b3b', '#ffffff', '#2f8cff']][k];
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.font = `900 ${64 - k * 6}px Impact, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = ['HIDE', 'MECCHA', 'BOO!', 'SEEK'][k];
  g.lineWidth = 14; g.strokeStyle = cols[1]; g.strokeText(word, w / 2, h / 2);
  g.fillStyle = cols[0]; g.fillText(word, w / 2, h / 2);
  for (let i = 0; i < 6; i++) { g.fillStyle = cols[2]; g.beginPath(); g.arc(sr(20, w - 20), sr(10, h - 10), sr(3, 7), 0, 7); g.fill(); }
}));
/* --- sugarland --- */
TEX.candyFloor = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#ff9cc4' : '#ffe3ef'; g.fillRect(x * 64, y * 64, 64, 64); } sprinkles(g, w, h, 40, SPRINK); });
TEX.mint = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#a6ecd2'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9fff6'; for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) { g.beginPath(); g.arc(x + (y / 32 % 2) * 16, y, 5, 0, 7); g.fill(); } });
TEX.cane = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8283f'; for (let x = -128; x < w + 128; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 18, h); g.lineTo(x + 18 + h, 0); g.lineTo(x + h, 0); g.fill(); } g.fillStyle = '#5ed39b'; for (let x = -128 + 26; x < w + 128; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 5, h); g.lineTo(x + 5 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
TEX.chocolate = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3e2416'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = '#5a3420'; g.fillRect(x * 64 + 5, y * 64 + 5, 54, 54); g.fillStyle = '#6e4129'; g.fillRect(x * 64 + 9, y * 64 + 9, 46, 6); g.fillStyle = '#4a2b1a'; g.fillRect(x * 64 + 9, y * 64 + 51, 46, 4); } });
TEX.wafer = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#e0ae62'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c38c43'; g.lineWidth = 3; for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } g.fillStyle = '#fff1e6'; for (let y = 60; y < h; y += 110) g.fillRect(0, y, w, 12); });
TEX.frostPink = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ff9cc6'; g.fillRect(0, 0, w, h); sprinkles(g, w, h, 70, SPRINK); });
TEX.frostMint = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8ee6c3'; g.fillRect(0, 0, w, h); sprinkles(g, w, h, 70, SPRINK); });
TEX.frostBlue = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#9cc8ff'; g.fillRect(0, 0, w, h); sprinkles(g, w, h, 70, SPRINK); });
TEX.frostChoc = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6b3d25'; g.fillRect(0, 0, w, h); sprinkles(g, w, h, 70, SPRINK); });
TEX.swirl = canvasTex(256, 256, (g, w, h) => {
  const cols = ['#ff5d8f', '#ffffff', '#ffd43b', '#ffffff', '#4dabf7', '#ffffff', '#69db7c', '#ffffff'];
  for (let i = 0; i < 64; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 128, i / 64 * Math.PI * 2 + i * 0.12, (i + 1) / 64 * Math.PI * 2 + i * 0.12 + 0.12); g.fill(); }
});
TEX.cookie = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#b8743c'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1.4, 0.08); g.strokeStyle = '#ffffff'; g.lineWidth = 6; for (let y of [40, h - 40]) { g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + (x / 16 % 2 ? 8 : -8)); g.stroke(); } g.fillStyle = '#ff5d8f'; for (let x = 32; x < w; x += 64) { g.beginPath(); g.arc(x, h / 2, 10, 0, 7); g.fill(); } });
TEX.wrapper = canvasTex(128, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#ffd1e3' : '#ff8fbf'; g.fillRect(x, 0, 16, h); } });
TEX.gingerRoof = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 24) for (let x = (y / 24 % 2) * 16; x < w; x += 32) { g.fillStyle = spick(['#ff5d8f', '#69db7c', '#4dabf7', '#ffd43b']); g.beginPath(); g.arc(x + 8, y + 12, 9, 0, 7); g.fill(); } });
/* --- gallery --- */
TEX.galleryWall = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.2, 0.02); g.fillStyle = '#d9d4ca'; g.fillRect(0, h - 16, w, 16); });
TEX.darkWall = canvasTex(256, 410, (g, w, h) => { g.fillStyle = '#23262f'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.4, 0.03); g.fillStyle = '#15171c'; g.fillRect(0, h - 16, w, 16); });
TEX.terrazzo = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e7e2d8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 220; i++) { g.fillStyle = spick(['#c9a27a', '#8a8f99', '#d46a5a', '#5c7d8a', '#ffffff', '#2d2d33']); g.beginPath(); g.ellipse(sr(0, w), sr(0, h), sr(1.5, 5), sr(1, 3.5), sr(0, 3), 0, 7); g.fill(); } });
TEX.marble = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,120,130,.35)'; for (let i = 0; i < 14; i++) { g.lineWidth = sr(0.5, 2.5); g.beginPath(); g.moveTo(sr(0, w), 0); g.bezierCurveTo(sr(0, w), sr(0, h), sr(0, w), sr(0, h), sr(0, w), h); g.stroke(); } });

/* ---------- map helpers ---------- */
const mapGroup = new THREE.Group(); scene.add(mapGroup);
const env = [];          // static meshes (raycasts, eyedropper)
const colliders = [];    // Box3 list
const tops = [];         // flat surfaces to hide on
const unders = [];       // gaps under tables a chameleon can crawl into
let ZONES = [], NODES = [], MAP = null, gateBox = null, gateMesh = null;

function tm(key, rx = 1, ry = 1, rough = 0.85, metal = 0) {
  const base = typeof key === 'string' ? TEX[key] : key;
  const t = base.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); t.updateMatrix();
  return new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: metal });
}
const cm = (hex, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
function reg(m, o = {}) { m.castShadow = o.cast !== false; m.receiveShadow = true; mapGroup.add(m); env.push(m); return m; }
function addCollider(x0, y0, z0, x1, y1, z1) { const b = new THREE.Box3(new V3(x0, y0, z0), new V3(x1, y1, z1)); colliders.push(b); return b; }
function addTop(x, z, w, d, y) { const zn = zoneAt(x, z); tops.push({ x, z, w, d, y, zone: zn ? zn.id : null }); }
function box(x, z, w, d, h, mat, o = {}) {
  const y = o.y || 0;
  const m = reg(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), o);
  m.position.set(x, y + h / 2, z);
  if (o.ry) { m.rotation.y = o.ry; }
  if (o.collide !== false) {
    if (o.ry && Math.abs(Math.sin(o.ry)) > 0.7) m.userData.box = addCollider(x - d / 2, y, z - w / 2, x + d / 2, y + h, z + w / 2);
    else m.userData.box = addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  }
  if (o.top) addTop(x, z, w, d, y + h);
  return m;
}
function cyl(x, z, rt, rb, h, mat, o = {}) {
  const y = o.y || 0;
  const m = reg(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, 1, !!o.open), mat), o);
  m.position.set(x, y + h / 2, z);
  const r = Math.max(rt, rb);
  if (o.collide) addCollider(x - r * 0.85, y, z - r * 0.85, x + r * 0.85, y + h, z + r * 0.85);
  if (o.top) addTop(x, z, rt * 1.4, rt * 1.4, y + h);
  return m;
}
function sph(x, y, z, r, mat, o = {}) {
  const m = reg(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat), o);
  m.position.set(x, y, z);
  if (o.scale) m.scale.set(...o.scale);
  if (o.collide) { const s = o.scale || [1, 1, 1]; addCollider(x - r * s[0] * .85, y - r * s[1], z - r * s[2] * .85, x + r * s[0] * .85, y + r * s[1], z + r * s[2] * .85); }
  return m;
}
function plane(x, y, z, w, h, mat, rx = 0, ry = 0, o = {}) {
  const m = reg(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), { cast: false, ...o });
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ');
  return m;
}
function floorPlane(x0, z0, x1, z1, mat, y = 0) { const p = plane((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, z1 - z0, mat, -Math.PI / 2, 0); p.receiveShadow = true; return p; }
const FACING = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
function painting(x, z, facing, w, h, idx, y = 1.65, frameCol = '#b8923e') {
  const ry = FACING[facing], off = 0.025;
  const nx = { e: 1, w: -1 }[facing] || 0, nz = { s: 1, n: -1 }[facing] || 0;
  const frame = reg(new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.04), cm(frameCol, 0.5, 0.3)), { cast: false });
  frame.position.set(x + nx * off, y, z + nz * off); frame.rotation.y = ry;
  return plane(x + nx * (off + 0.021), y, z + nz * (off + 0.021), w, h, tm(TEX.paintings[idx % TEX.paintings.length], 1, 1, 0.7), 0, ry);
}
function decal(x, y, z, w, h, tex, facing, rough = 0.9) {
  const ry = FACING[facing], nx = { e: 1, w: -1 }[facing] || 0, nz = { s: 1, n: -1 }[facing] || 0;
  return plane(x + nx * 0.012, y, z + nz * 0.012, w, h, tm(tex, 1, 1, rough), 0, ry);
}
let lampCount = 0;
function lamp(x, z, color = 0xffe2b8, intensity = 0.55, o = {}) {
  const y = o.y ?? (MAP.ceilH - 0.35);
  const l = new THREE.PointLight(color, intensity, o.dist || 13, 2);
  l.position.set(x, y, z); mapGroup.add(l); lampCount++;
  if (o.fixture !== false) {
    const geo = o.fixture === 'bulb' ? new THREE.SphereGeometry(0.1, 12, 8) : o.fixture === 'panel' ? new THREE.BoxGeometry(1.2, 0.04, 0.6) : new THREE.CylinderGeometry(0.28, 0.18, 0.12, 20);
    const fix = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o.fixColor || 0xfff4dc }));
    fix.position.set(x, o.fixture === 'bulb' ? y : MAP.ceilH - 0.07, z); mapGroup.add(fix);
  }
  return l;
}
function glowPanel(x, z, w = 1.2, d = 0.6, color = 0xfffbe6) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, MAP.ceilH - 0.02, z); mapGroup.add(m); return m;
}
/** Axis-aligned wall segment from (x0,z0) to (x1,z1). */
function wallSeg(x0, z0, x1, z1, matFn, o = {}) {
  const t = o.t || 0.2, h = o.h || MAP.wallH, y = o.y || 0;
  const horiz = Math.abs(z1 - z0) < 0.001;
  const L = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  if (L < 0.02) return null;
  const mat = typeof matFn === 'function' ? matFn(L) : matFn;
  if (horiz) return box((x0 + x1) / 2, z0, L + (o.cap ? t : 0), t, h, mat, { y, cast: true });
  return box(x0, (z0 + z1) / 2, t, L + (o.cap ? t : 0), h, mat, { y, cast: true });
}
/** Rooms with per-room wallpaper and door gaps on shared walls. */
function buildShell(rooms, doors, o = {}) {
  const T = 0.1, H = MAP.wallH, DW = o.doorW || 1.8, DH = o.doorH || 2.3;
  for (const r of rooms) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (r.floor) floorPlane(r.x0, r.z0, r.x1, r.z1, tm(r.floor, w / (r.floorScale || 2), d / (r.floorScale || 2), 0.8));
    const wm = (L) => tm(r.wall, L / 2, 1, 0.9);
    const seg = (axis, line, a0, a1, inset) => {
      const gaps = doors.filter((dd) => dd.a === axis && Math.abs(dd.line - line) < 0.01 && dd.at > a0 && dd.at < a1)
        .map((dd) => [dd.at - (dd.w || DW) / 2, dd.at + (dd.w || DW) / 2]).sort((p, q) => p[0] - q[0]);
      let s = a0; const pieces = [];
      for (const [g0, g1] of gaps) { pieces.push([s, g0]); s = g1; }
      pieces.push([s, a1]);
      const c = line + inset;
      for (const [p0, p1] of pieces) {
        const L = p1 - p0; if (L < 0.02) continue;
        if (axis === 'h') box((p0 + p1) / 2, c, L, T, H, wm(L)); else box(c, (p0 + p1) / 2, T, L, H, wm(L));
      }
      for (const [g0, g1] of gaps) {
        if (axis === 'h') box((g0 + g1) / 2, c, g1 - g0, T, H - DH, wm(g1 - g0), { y: DH });
        else box(c, (g0 + g1) / 2, T, g1 - g0, H - DH, wm(g1 - g0), { y: DH });
      }
    };
    seg('h', r.z0, r.x0, r.x1, T / 2); seg('h', r.z1, r.x0, r.x1, -T / 2);
    seg('v', r.x0, r.z0, r.z1, T / 2); seg('v', r.x1, r.z0, r.z1, -T / 2);
  }
  const fm = cm(o.frame || '#f3eee4', 0.6);
  for (const dd of doors) {
    const W = dd.w || DW;
    if (o.frame === false) continue;
    if (dd.a === 'h') {
      box(dd.at - W / 2 - 0.04, dd.line, 0.08, 0.3, DH, fm, { collide: false });
      box(dd.at + W / 2 + 0.04, dd.line, 0.08, 0.3, DH, fm, { collide: false });
      box(dd.at, dd.line, W + 0.16, 0.3, 0.08, fm, { y: DH - 0.02, collide: false });
    } else {
      box(dd.line, dd.at - W / 2 - 0.04, 0.3, 0.08, DH, fm, { collide: false });
      box(dd.line, dd.at + W / 2 + 0.04, 0.3, 0.08, DH, fm, { collide: false });
      box(dd.line, dd.at, 0.3, W + 0.16, 0.08, fm, { y: DH - 0.02, collide: false });
    }
  }
  return doors.map((dd) => (dd.a === 'h' ? [dd.at, dd.line] : [dd.line, dd.at]));
}
function zoneAt(x, z) {
  for (const r of ZONES) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

/* ---------- surface colour sampling ---------- */
const _uv = new THREE.Vector2();
function surfaceColor(hit) {
  const o = hit.object, m = o.material;
  if (o.isInstancedMesh && hit.instanceId != null && o.instanceColor) { const c = new THREE.Color(); o.getColorAt(hit.instanceId, c); return [c.r * 255, c.g * 255, c.b * 255]; }
  if (m.map && hit.uv && m.map.image && m.map.image._data) {
    _uv.copy(hit.uv); m.map.updateMatrix(); m.map.transformUv(_uv);
    const d = m.map.image._data;
    const x = clamp(Math.floor(_uv.x * d.width), 0, d.width - 1), y = clamp(Math.floor(_uv.y * d.height), 0, d.height - 1);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = (x + dx + d.width) % d.width, yy = clamp(y + dy, 0, d.height - 1), i = (yy * d.width + xx) * 4;
      r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; n++;
    }
    return [r / n * m.color.r, g / n * m.color.g, b / n * m.color.b];
  }
  return [m.color.r * 255, m.color.g * 255, m.color.b * 255];
}
const rcEnv = new THREE.Raycaster();
function envHit(origin, dir, far = 60, list = env) {
  rcEnv.set(origin, dir); rcEnv.far = far;
  return rcEnv.intersectObjects(list, false)[0] || null;
}
const _envBoxes = new Map();
function envNear(p, radius) {
  const out = [];
  for (const m of env) {
    let b = _envBoxes.get(m);
    if (!b) { b = new THREE.Box3().setFromObject(m); _envBoxes.set(m, b); }
    if (b.distanceToPoint(p) < radius) out.push(m);
  }
  return out;
}

/* ---------- collision ---------- */
function pushOut(p, r, b) {
  const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
  else {
    const l = p.x - b.min.x, rr = b.max.x - p.x, t = p.z - b.min.z, bt = b.max.z - p.z, m = Math.min(l, rr, t, bt);
    if (m === l) p.x = b.min.x - r; else if (m === rr) p.x = b.max.x + r; else if (m === t) p.z = b.min.z - r; else p.z = b.max.z + r;
  }
  return true;
}
function overlapsXZ(p, r, b) { const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z); return (p.x - cx) ** 2 + (p.z - cz) ** 2 < r * r; }
const STEP = 0.34;
function collideBody(body, dt, gravity = true) {
  const p = body.pos, B = MAP.bounds;
  for (let it = 0; it < 2; it++) for (const c of colliders) {
    if (c.max.y <= p.y + STEP || c.min.y >= p.y + body.h) continue;
    pushOut(p, body.r, c);
  }
  p.x = clamp(p.x, B.x0 + 0.15, B.x1 - 0.15); p.z = clamp(p.z, B.z0 + 0.15, B.z1 - 0.15);
  if (!gravity) return;
  body.vy -= 20 * dt;
  let ny = p.y + body.vy * dt;
  body.onGround = false;
  if (body.vy <= 0) {
    let ground = MAP.floorY || 0;
    for (const c of colliders) if (c.max.y <= p.y + STEP && c.max.y > ground && overlapsXZ(p, body.r * 0.6, c)) ground = c.max.y;
    if (ny <= ground) { ny = ground; body.vy = 0; body.onGround = true; }
  } else {
    for (const c of colliders) if (c.min.y >= p.y + body.h - 0.02 && ny + body.h > c.min.y && overlapsXZ(p, body.r * 0.8, c)) { ny = c.min.y - body.h; body.vy = 0; }
    if (ny + body.h > MAP.ceilH) { ny = MAP.ceilH - body.h; body.vy = 0; }
  }
  p.y = ny;
}
function freeAt(x, z, r, h, y0 = 0) {
  const B = MAP.bounds;
  if (x < B.x0 + 0.3 || z < B.z0 + 0.3 || x > B.x1 - 0.3 || z > B.z1 - 0.3) return false;
  for (const c of colliders) { if (c === gateBox || c.max.y <= y0 + STEP || c.min.y >= y0 + h) continue; if (overlapsXZ({ x, z }, r, c)) return false; }
  return true;
}

/* ---------- navigation ---------- */
let navCols = [];
function segClear(ax, az, bx, bz, r = 0.26, endTol = 0) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.2)), tMax = L > 0 ? Math.max(0, (L - endTol) / L) : 1;
  const cols = navCols.length ? navCols : colliders;
  for (let i = 0; i <= n; i++) {
    const t = i / n * tMax, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const c of cols) { if (c === gateBox || c.max.y <= STEP || c.min.y >= 1.8) continue; if (overlapsXZ({ x, z }, r, c)) return false; }
  }
  return true;
}
function buildNav(extraPts = []) {
  navCols = colliders.filter((c) => c !== gateBox && c.max.y > STEP && c.min.y < 1.8);
  NODES = [];
  const add = (x, z) => { if (freeAt(x, z, 0.28, 1.6) || NODES.length < 0) NODES.push({ x, z, edges: [] }); };
  for (const zn of ZONES) for (const [x, z] of zn.pts) add(x, z);
  for (const [x, z] of extraPts) NODES.push({ x, z, edges: [] });
  for (let i = 0; i < NODES.length; i++) for (let j = i + 1; j < NODES.length; j++) {
    const a = NODES[i], b = NODES[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 16) continue;
    if (segClear(a.x, a.z, b.x, b.z)) { a.edges.push(b); b.edges.push(a); }
  }
  for (const a of NODES) if (!a.edges.length) {
    let best = null, bd = 1e9;
    for (const b of NODES) { if (b === a) continue; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = b; } }
    if (best) { a.edges.push(best); best.edges.push(a); }
  }
}
function nearestNode(x, z) {
  let best = null, bd = 1e9;
  for (const n of NODES) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d > bd) continue;
    const dd = d + (segClear(x, z, n.x, n.z, 0.2, 0.3) ? 0 : 900);
    if (dd < bd) { bd = dd; best = n; }
  }
  return best;
}
function route(fx, fz, tx, tz) {
  if (segClear(fx, fz, tx, tz, 0.2, 0.7)) return [{ x: tx, z: tz }];
  const s = nearestNode(fx, fz), g = nearestNode(tx, tz);
  if (!s || !g) return [{ x: tx, z: tz }];
  const dist = new Map([[s, 0]]), prev = new Map(), open = [s], done = new Set();
  while (open.length) {
    open.sort((a, b) => dist.get(a) - dist.get(b));
    const u = open.shift(); if (done.has(u)) continue; done.add(u);
    if (u === g) break;
    for (const v of u.edges) {
      const nd = dist.get(u) + Math.hypot(u.x - v.x, u.z - v.z);
      if (nd < (dist.get(v) ?? 1e9)) { dist.set(v, nd); prev.set(v, u); open.push(v); }
    }
  }
  const path = []; let c = g;
  while (c) { path.unshift({ x: c.x, z: c.z }); c = prev.get(c); }
  path.push({ x: tx, z: tz });
  while (path.length > 1 && segClear(fx, fz, path[1].x, path[1].z, 0.22, path.length === 2 ? 0.7 : 0)) path.shift();
  return path;
}

/* ---------- gate ---------- */
function setGate(closed) {
  if (!gateMesh) return;
  if (closed) { gateMesh.visible = true; if (!colliders.includes(gateBox)) colliders.push(gateBox); }
  else { gateMesh.visible = false; const i = colliders.indexOf(gateBox); if (i >= 0) colliders.splice(i, 1); }
}

/* ---------- map loading ---------- */
const MAPS = {};
function disposeObj(o) {
  o.traverse((c) => {
    if (c.userData.shared) return;
    if (c.geometry) c.geometry.dispose();
    if (c.material) { const ms = Array.isArray(c.material) ? c.material : [c.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } }
  });
}
function loadMap(id) {
  const def = MAPS[id] || MAPS.mansion;
  for (const c of [...mapGroup.children]) { mapGroup.remove(c); disposeObj(c); }
  env.length = 0; colliders.length = 0; tops.length = 0; unders.length = 0; _envBoxes.clear(); navCols = []; lampCount = 0;
  gateBox = null; gateMesh = null;
  MAP = Object.assign({ wallH: 3.2, ceilH: 3.2, floorY: 0 }, def);
  ZONES = def.zones.map((z) => ({ ...z }));
  setSeed(hashStr(def.id));
  const L = def.light || {};
  hemi.color.set(L.sky ?? 0xfff3df); hemi.groundColor.set(L.ground ?? 0x6e5e4e); hemi.intensity = L.hemi ?? 0.6;
  amb.intensity = L.amb ?? 0.16; amb.color.set(L.ambColor ?? 0xffffff);
  sun.intensity = L.sun ?? 0.5; sun.color.set(L.sunColor ?? 0xfff0dc);
  const B = def.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, ext = Math.max(B.x1 - B.x0, B.z1 - B.z0) / 2 + 4;
  const sp = L.sunPos || [-7, 30, -7];
  sun.position.set(cx + sp[0], sp[1], cz + sp[2]); sun.target.position.set(cx, 0, cz);
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.background = new THREE.Color(L.bg ?? 0x151a26);
  scene.fog = L.fog ? new THREE.Fog(L.fog[0], L.fog[1], L.fog[2]) : null;
  const extra = def.build() || [];
  if (def.gate) {
    const g = def.gate, w = g.w || 1.8, h = g.h || 2.3;
    gateMesh = new THREE.Mesh(new THREE.BoxGeometry(g.a === 'h' ? w : 0.16, h, g.a === 'h' ? 0.16 : w), tm('hazard', 3, 4, 0.7));
    gateMesh.position.set(g.x, h / 2, g.z); gateMesh.castShadow = true; mapGroup.add(gateMesh);
    gateBox = g.a === 'h' ? new THREE.Box3(new V3(g.x - w / 2, 0, g.z - 0.08), new V3(g.x + w / 2, h, g.z + 0.08)) : new THREE.Box3(new V3(g.x - 0.08, 0, g.z - w / 2), new V3(g.x + 0.08, h, g.z + w / 2));
  }
  for (const z of ZONES) { const ok = z.pts.filter(([x, zz]) => freeAt(x, zz, 0.3, 1.6)); if (ok.length) z.pts = ok; }
  if (def.gate) {
    const g = def.gate;
    for (const d of [-1.3, 1.3]) { const x = g.a === 'h' ? g.x : g.x + d, z = g.a === 'h' ? g.z + d : g.z; if (freeAt(x, z, 0.3, 1.6)) extra.push([x, z]); }
  }
  buildNav(extra);
  setGate(true);
  return MAP;
}
