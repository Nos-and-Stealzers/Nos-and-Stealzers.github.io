'use strict';
/* Server Manager window: shows and controls every server in servers.json. */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAPN = { mansion: 'Mansion', backrooms: 'Backrooms', sewer: 'Sewer', sugar: 'Sugarland', gallery: 'Art Gallery' };
let last = null, editing = false;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 4000); }
function up(ms) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; }
function rank(a) { return a.startsWith('100.') ? 1 : a.startsWith('172.') || a.startsWith('192.168.56.') ? 0 : 2; }

function render(st) {
  last = st;
  const ips = st.ips.filter((i) => rank(i.address) > 0).sort((a, b) => rank(b.address) - rank(a.address));
  const run = st.servers.filter((s) => s.state === 'running'), players = run.reduce((n, s) => n + (s.info ? s.info.players : 0), 0);
  $('#sum').textContent = `${run.length}/${st.servers.length} running · ${players} playing`;
  $('#autoStart').checked = !!st.cfg.autoStart;
  $('#list').innerHTML = st.cfg.servers.map((c, i) => {
    const s = st.servers[i], inf = s.info;
    const meta = s.state === 'running'
      ? `<span>Players <b>${inf.players}/${inf.max}</b></span><span>Map <b>${MAPN[inf.map] || inf.map}</b></span><span>Status <b>${inf.inGame ? 'Round in progress' : 'In lobby'}</b></span><span>Up <b>${up(s.uptime)}</b></span>${c.password ? '<span><b>Password</b> on</span>' : ''}`
      : `<span>Port <b>${c.port}</b></span><span>Max <b>${c.max}</b></span><span>${c.enabled === false ? 'Disabled' : s.state === 'starting' ? 'Starting…' : 'Stopped'}</span>`;
    return `<div class="card">
      <span class="dot ${s.state}"></span><h2>${esc(c.name)}</h2>
      <div class="actions">${s.state === 'running' || s.state === 'error' ? `<button class="danger" data-stop="${i}">Stop</button>` : `<button data-start="${i}" ${c.enabled === false ? 'disabled' : ''}>Start</button>`}</div>
      <div class="meta">${meta}</div>
      ${s.error ? `<div class="err">${esc(s.error)}</div>` : ''}
      ${s.state === 'running' ? `<div class="addr">${ips.map((ip) => `<code>${ip.address}:${c.port}</code>`).join('')}<code>127.0.0.1:${c.port}</code></div>` : ''}
      <details ${detailsOpen.has(i) ? 'open' : ''} data-i="${i}"><summary>Log</summary><pre>${esc(s.log.join('\n') || 'Nothing yet.')}</pre></details>
    </div>`;
  }).join('') || '<p class="hint">No servers configured. Use Edit servers to add one.</p>';
}
const detailsOpen = new Set();
document.addEventListener('toggle', (e) => { const d = e.target; if (d.tagName === 'DETAILS') { if (d.open) detailsOpen.add(+d.dataset.i); else detailsOpen.delete(+d.dataset.i); } }, true);

async function refresh() { if (!editing) render(await mcServers.status()); }
$('#list').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  b.disabled = true;
  if (b.dataset.start != null) render(await mcServers.start(+b.dataset.start));
  if (b.dataset.stop != null) render(await mcServers.stop(+b.dataset.stop));
});
$('#startAll').onclick = async () => render(await mcServers.startAll());
$('#stopAll').onclick = async () => render(await mcServers.stopAll());
$('#autoStart').onchange = async (e) => { const r = await mcServers.save({ ...last.cfg, autoStart: e.target.checked }); if (!r.ok) toast(r.error); else render(r.status); };

function row(c) {
  return `<tr><td><input type="checkbox" class="en" ${c.enabled === false ? '' : 'checked'}></td><td><input class="nm" maxlength="40" value="${esc(c.name)}"></td><td><input class="pt" type="number" value="${c.port}"></td><td><input class="mx" type="number" min="2" max="24" value="${c.max}"></td><td><input class="pw" type="password" value="${esc(c.password || '')}" placeholder="none"></td><td><button class="ghost rm">Remove</button></td></tr>`;
}
$('#editBtn').onclick = () => { editing = true; $('#edit').hidden = false; $('#list').hidden = true; $('#rows').innerHTML = last.cfg.servers.map(row).join(''); };
$('#cancelEdit').onclick = () => { editing = false; $('#edit').hidden = true; $('#list').hidden = false; refresh(); };
$('#addRow').onclick = () => {
  const ports = [...document.querySelectorAll('#rows .pt')].map((i) => +i.value);
  const n = document.querySelectorAll('#rows tr').length + 1;
  $('#rows').insertAdjacentHTML('beforeend', row({ name: `Meccha Server ${n}`, port: Math.max(7776, ...ports) + 1, max: 15 }));
};
$('#rows').addEventListener('click', (e) => { if (e.target.closest('.rm')) e.target.closest('tr').remove(); });
$('#openCfg').onclick = () => mcServers.openConfig();
$('#saveEdit').onclick = async () => {
  const servers = [...document.querySelectorAll('#rows tr')].map((tr) => ({ enabled: tr.querySelector('.en').checked, name: tr.querySelector('.nm').value.trim(), port: +tr.querySelector('.pt').value, max: +tr.querySelector('.mx').value, password: tr.querySelector('.pw').value }));
  const r = await mcServers.save({ autoStart: last.cfg.autoStart, servers });
  if (!r.ok) { toast(r.error); return; }
  editing = false; $('#edit').hidden = true; $('#list').hidden = false; render(r.status);
};

refresh(); setInterval(refresh, 1500);
