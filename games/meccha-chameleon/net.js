'use strict';
/* Client networking: WebSocket to a Meccha server (embedded host, dedicated server, or a public Cloudflare room). */
const PUBLIC_API = 'https://meccha.stealzerslab.site';
const Net = {
  ws: null, id: null, hostId: null, connected: false, addr: '', server: null, handlers: {}, isPublic: false, ping: 0,
  on(t, fn) { this.handlers[t] = fn; },
  /** Accepts "host", "host:port", "ws://host:port" or a full "wss://host/path" URL. Returns the ws URL to open. */
  url(addr) {
    addr = String(addr || '').trim();
    if (!addr) return null;
    if (/^wss:\/\//i.test(addr)) return addr;
    const n = this.normalize(addr);
    return n ? 'ws://' + n : null;
  },
  normalize(addr) {
    addr = String(addr || '').trim().replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
    if (!addr) return null;
    if (!/:\d+$/.test(addr)) addr += ':7777';
    return addr;
  },
  connect(addr, password = '') {
    const u = this.url(addr);
    if (!u) return Promise.reject(new Error('Enter an address like 192.168.1.20:7777'));
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(u);
      this.ws = ws; this.addr = u; this.isPublic = u.startsWith('wss://');
      const timer = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch { } reject(new Error('Timed out connecting to ' + addr)); } }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 2, name: PROFILE.name, profile: publicProfile(), password }));
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') { this.id = m.id; this.hostId = m.hostId; this.connected = true; this.server = m.server; if (m.server?.public) this.isPublic = true; this.startPing(); if (!settled) { settled = true; clearTimeout(timer); resolve(m); } }
        else if (m.t === 'reject') { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(m.reason)); } else if (this.handlers.kicked) this.handlers.kicked(m.reason); }
        else if (m.t === 'pong') { this.ping = Math.round(performance.now() - m.at); return; }
        if (m.t === 'host') this.hostId = m.hostId;
        const h = this.handlers[m.t]; if (h) h(m);
      };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Could not reach ' + addr)); } };
      ws.onclose = () => { clearInterval(this.pingT); const was = this.connected; this.connected = false; if (was && this.handlers.closed) this.handlers.closed(); };
    });
  },
  startPing() { clearInterval(this.pingT); this.pingT = setInterval(() => this.send({ t: 'ping', at: performance.now() }), 3000); this.send({ t: 'ping', at: performance.now() }); },
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },
  relay(d) { this.send({ t: 'relay', d }); },
  to(id, d) { this.send({ t: 'to', to: id, d }); },
  close() { clearInterval(this.pingT); if (this.ws) { this.connected = false; try { this.ws.onclose = null; this.ws.close(); } catch { } } this.ws = null; this.id = null; this.hostId = null; this.isPublic = false; },
  get isHost() { return this.connected && this.id === this.hostId; },
};
/** Only the cosmetic parts of the profile go over the wire. */
function publicProfile() { return { tag: PROFILE.tag, cham: PROFILE.cham, hunter: PROFILE.hunter, level: levelInfo(PROFILE.xp).level }; }
async function fetchInfo(addr) {
  const a = Net.normalize(addr);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
  try { const r = await fetch('http://' + a + '/info', { signal: ctl.signal }); return { ...(await r.json()), host: a.split(':')[0], port: +a.split(':')[1] }; }
  catch { return null; } finally { clearTimeout(t); }
}
async function fetchPublic() {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetch(PUBLIC_API + '/servers', { signal: ctl.signal }); const j = await r.json(); return j.servers || []; }
  catch { return null; } finally { clearTimeout(t); }
}
