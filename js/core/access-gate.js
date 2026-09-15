/* Access gate ("cloak").
 *
 * On every visit the site pretends to be a Securly content-filter redirect and
 * actually sends a passive visitor on to securly.com. The ONLY way in is to
 * hold one of the secret combos continuously for 6 seconds:
 *
 *     Ctrl+L   Shift+L   Ctrl+P   Shift+P   Ctrl+Z   Shift+Z
 *
 * i.e. (Ctrl or Shift) together with (L, P, or Z). Unlocking marks the tab
 * session so navigating between pages doesn't re-gate; a new tab re-gates.
 *
 * It runs as the very first script in <head>, dependency-free, and also
 * disguises the browser tab itself (title + favicon) so a glance at the tab
 * never reveals the real site while the gate is up.
 */
(function () {
  "use strict";

  var DECOY_URL = "https://www.securly.com/";
  var REQUIRED_HOLD_MS = 6000;   // continuous hold needed to unlock
  var REDIRECT_AFTER_MS = 7000;  // a passive visitor is bounced after this
  var SS_KEY = "ach:gate";
  var SS_VALUE = "open";

  /* Already unlocked this tab session? Do nothing at all. */
  try {
    if (window.sessionStorage.getItem(SS_KEY) === SS_VALUE) return;
  } catch (e) { /* storage blocked — gate anyway */ }

  var doc = document;
  var root = doc.documentElement;

  /* -------- disguise the tab (title + favicon) while the gate is up -------- */

  var realTitle = doc.title;
  try { doc.title = "Redirecting…"; } catch (e) {}

  /* A neutral shield/lock favicon (green) so the tab icon reads as a filter,
     not the arcade. Data-URI so it needs no network and applies instantly. */
  var DECOY_ICON =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="6" fill="#00b0a6"/>' +
      '<path d="M16 5l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V8l8-3z" ' +
      'fill="#fff"/><path d="M12.5 16.2l2.6 2.6 4.6-5" stroke="#00b0a6" ' +
      'stroke-width="2" fill="none" stroke-linecap="round" ' +
      'stroke-linejoin="round"/></svg>'
    );
  var savedIcons = [];
  function swapFavicon() {
    var links = doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
    for (var i = 0; i < links.length; i++) {
      savedIcons.push([links[i], links[i].getAttribute("href")]);
      links[i].setAttribute("href", DECOY_ICON);
    }
    var l = doc.createElement("link");
    l.rel = "icon";
    l.type = "image/svg+xml";
    l.href = DECOY_ICON;
    l.setAttribute("data-gate-icon", "1");
    (doc.head || root).appendChild(l);
  }
  swapFavicon();

  /* -------------------------- hide + overlay ------------------------------ */

  root.setAttribute("data-gate", "locked");
  var css = doc.createElement("style");
  css.textContent =
    'html[data-gate="locked"] body{visibility:hidden!important;}' +
    '#access-gate{visibility:visible!important;}' +
    '#access-gate{position:fixed;inset:0;z-index:2147483647;display:flex;' +
    'align-items:center;justify-content:center;flex-direction:column;' +
    'background:#f6f8fa;color:#2b3440;font-family:system-ui,-apple-system,' +
    '"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;padding:24px;}' +
    '#access-gate .ag-card{width:440px;max-width:92vw;background:#fff;' +
    'border:1px solid #e5e7eb;border-radius:12px;padding:30px 28px 26px;' +
    'box-shadow:0 10px 30px rgba(20,30,50,.08);}' +
    '#access-gate .ag-brand{font-size:30px;font-weight:800;letter-spacing:-0.5px;' +
    'color:#00b0a6;}' +
    '#access-gate .ag-brand span{color:#8a9099;}' +
    '#access-gate .ag-host{font-family:ui-monospace,Menlo,Consolas,monospace;' +
    'font-size:12px;color:#6b7280;background:#f2f4f7;border:1px solid #e5e7eb;' +
    'border-radius:6px;padding:6px 8px;margin:16px 0 4px;word-break:break-all;}' +
    '#access-gate .ag-spin{width:30px;height:30px;margin:18px auto 6px;' +
    'border:3px solid #e5e7eb;border-top-color:#00b0a6;border-radius:50%;' +
    'animation:ag-rot 0.8s linear infinite;}' +
    '@keyframes ag-rot{to{transform:rotate(360deg);}}' +
    '#access-gate .ag-step{font-size:13px;color:#4b5563;min-height:18px;margin-top:4px;}' +
    '#access-gate .ag-bar{margin:16px auto 0;width:300px;max-width:78%;height:5px;' +
    'background:#eceef1;border-radius:3px;overflow:hidden;}' +
    '#access-gate .ag-bar i{display:block;height:100%;width:0;background:#00b0a6;' +
    'transition:width 0.14s linear;}' +
    '#access-gate .ag-foot{margin-top:22px;font-size:11px;color:#9aa1ab;}';
  (doc.head || root).appendChild(css);

  function buildOverlay() {
    if (doc.getElementById("access-gate")) return;
    var g = doc.createElement("div");
    g.id = "access-gate";
    g.setAttribute("role", "status");
    g.innerHTML =
      '<div class="ag-card">' +
      '<div class="ag-brand">securly<span>.</span></div>' +
      '<div class="ag-host" id="ag-host">resolving filter.securly.com …</div>' +
      '<div class="ag-spin"></div>' +
      '<div class="ag-step" id="ag-step">Checking this site against your policy…</div>' +
      '<div class="ag-bar"><i id="ag-bar-fill"></i></div>' +
      '</div>' +
      '<div class="ag-foot">Securly Filter · District content policy enforced</div>';
    (doc.body || root).appendChild(g);
  }
  if (doc.body) buildOverlay();
  else doc.addEventListener("DOMContentLoaded", buildOverlay);

  /* Staged "redirect" chatter so it reads as a real filter check, not a pause.
     Purely cosmetic; the real timing is the redirect/hold logic below. */
  var STEPS = [
    "Checking this site against your policy…",
    "Contacting filter.securly.com…",
    "Verifying district content policy…",
    "Applying safe-browsing rules…",
    "Redirecting you to your filter…"
  ];
  var HOSTS = [
    "resolving filter.securly.com …",
    "connecting to 34.120.—.— :443 …",
    "TLS handshake · filter.securly.com …",
    "HTTP 302 · Location: www.securly.com …",
    "following redirect → www.securly.com …"
  ];
  var stepIdx = 0;
  var stepTimer = window.setInterval(function () {
    stepIdx = Math.min(stepIdx + 1, STEPS.length - 1);
    var s = doc.getElementById("ag-step");
    var h = doc.getElementById("ag-host");
    if (s) s.textContent = STEPS[stepIdx];
    if (h) h.textContent = HOSTS[stepIdx];
    if (stepIdx >= STEPS.length - 1) window.clearInterval(stepTimer);
  }, 1300);

  /* --------------------------------------------------------------- combo --- */

  var mod = { ctrl: false, shift: false };
  var letter = { l: false, p: false, z: false };
  var holdMs = 0;
  var sinceLoad = 0;
  var settled = false;

  function comboHeld() {
    return (mod.ctrl || mod.shift) && (letter.l || letter.p || letter.z);
  }

  function onKey(e, isDown) {
    var handled = false;
    if (e.keyCode === 17 || e.key === "Control") { mod.ctrl = isDown; handled = true; }
    else if (e.keyCode === 16 || e.key === "Shift") { mod.shift = isDown; handled = true; }
    else {
      var k = (e.key || "").toLowerCase();
      if (k === "l" || e.keyCode === 76) { letter.l = isDown; handled = true; }
      else if (k === "p" || e.keyCode === 80) { letter.p = isDown; handled = true; }
      else if (k === "z" || e.keyCode === 90) { letter.z = isDown; handled = true; }
    }
    if (!handled) return;
    /* Stop the browser's own Ctrl+P (print) / Ctrl+L (address bar) etc. from
       hijacking the combo while the gate is up. */
    if (comboHeld()) { try { e.preventDefault(); } catch (x) {} }
  }

  window.addEventListener("keydown", function (e) { onKey(e, true); }, true);
  window.addEventListener("keyup", function (e) { onKey(e, false); }, true);
  window.addEventListener("blur", function () {
    mod.ctrl = mod.shift = false; letter.l = letter.p = letter.z = false;
  });

  function restoreTab() {
    try { doc.title = realTitle; } catch (e) {}
    var mine = doc.querySelectorAll('link[data-gate-icon="1"]');
    for (var i = 0; i < mine.length; i++) mine[i].parentNode.removeChild(mine[i]);
    for (var j = 0; j < savedIcons.length; j++) {
      if (savedIcons[j][1] != null) savedIcons[j][0].setAttribute("href", savedIcons[j][1]);
    }
  }

  function unlock() {
    if (settled) return;
    settled = true;
    window.clearInterval(stepTimer);
    try { window.sessionStorage.setItem(SS_KEY, SS_VALUE); } catch (e) {}
    root.removeAttribute("data-gate");
    var g = doc.getElementById("access-gate");
    if (g) g.parentNode.removeChild(g);
    restoreTab();
  }

  function bounce() {
    if (settled) return;
    settled = true;
    var s = doc.getElementById("ag-step");
    if (s) s.textContent = "Redirecting you to your filter…";
    try { window.location.replace(DECOY_URL); }
    catch (e) { window.location.href = DECOY_URL; }
  }

  var timer = window.setInterval(function () {
    if (settled) { window.clearInterval(timer); return; }
    sinceLoad += 100;

    if (comboHeld()) {
      holdMs += 100;
      var fill = doc.getElementById("ag-bar-fill");
      if (fill) fill.style.width = Math.min(100, (holdMs / REQUIRED_HOLD_MS) * 100) + "%";
      if (holdMs >= REQUIRED_HOLD_MS) { window.clearInterval(timer); unlock(); }
    } else {
      holdMs = 0;
      var f2 = doc.getElementById("ag-bar-fill");
      if (f2) f2.style.width = "0%";
      if (sinceLoad >= REDIRECT_AFTER_MS) { window.clearInterval(timer); bounce(); }
    }
  }, 100);
})();
