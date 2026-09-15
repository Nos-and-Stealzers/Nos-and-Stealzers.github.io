/* Access gate ("cloak") — cloak domains only.
 *
 * Runs as the first <head> script on every page, but only does anything on the
 * cloak domains (securlyfex.online / securlyfex.site and their www forms). On
 * the real domain (arcadecampushub.online) or localhost it does nothing, so the
 * arcade behaves normally there.
 *
 * On a cloak domain it does two things:
 *
 *  1. DISGUISE (always, every page): sets the tab title + favicon to look like
 *     Securly, so anyone scrolling the browser history sees a string of Securly
 *     entries on a "securly…" URL — never "Arcade Campus Hub". The actual page
 *     content underneath is the normal arcade; the games still look and play
 *     like the games. The disguise is only skin-deep (tab + history).
 *
 *  2. GATE (until unlocked this tab session): hides the page behind a
 *     convincing "redirecting to your content filter" screen and actually
 *     sends a passive visitor on to securly.com. The ONLY way in is holding
 *     one of these combos for 6 seconds:
 *
 *         Ctrl+L  Shift+L  Ctrl+P  Shift+P  Ctrl+Z  Shift+Z
 *
 *     Once unlocked, the tab session is marked so navigating between pages
 *     doesn't re-gate (but each page is still disguised). A new tab re-gates.
 */
(function () {
  "use strict";

  /* Only these domains cloak. endsWith covers apex + www. */
  var CLOAK_SUFFIXES = ["securlyfex.online", "securlyfex.site", "securly.site"];
  var host = String(location.hostname || "").toLowerCase();
  var onCloak = CLOAK_SUFFIXES.some(function (s) {
    return host === s || host === "www." + s || host.indexOf(s) === host.length - s.length;
  });
  if (!onCloak) return;   // real domain / localhost: behave like a normal arcade

  var DECOY_URL = "https://www.securly.com/";
  var DISGUISE_TITLE = "Securly | Student Safety";
  var REQUIRED_HOLD_MS = 6000;   // continuous hold to unlock
  var REDIRECT_AFTER_MS = 7000;  // a passive visitor is bounced after this
  var SS_KEY = "ach:gate";
  var SS_VALUE = "open";

  var doc = document;
  var root = doc.documentElement;

  /* ---------- disguise the tab (title + favicon) on EVERY cloak page ------- */

  try { doc.title = DISGUISE_TITLE; } catch (e) {}

  /* Green Securly-style shield favicon, data-URI so it applies instantly and
     needs no network. */
  var DECOY_ICON =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="6" fill="#00b0a6"/>' +
      '<path d="M16 5l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V8l8-3z" fill="#fff"/>' +
      '<path d="M12.5 16.2l2.6 2.6 4.6-5" stroke="#00b0a6" stroke-width="2" ' +
      'fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );
  function applyFavicon() {
    var links = doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
    for (var i = 0; i < links.length; i++) links[i].setAttribute("href", DECOY_ICON);
    if (!doc.querySelector('link[data-gate-icon="1"]')) {
      var l = doc.createElement("link");
      l.rel = "icon"; l.type = "image/svg+xml"; l.href = DECOY_ICON;
      l.setAttribute("data-gate-icon", "1");
      (doc.head || root).appendChild(l);
    }
  }
  applyFavicon();
  /* Keep the disguise even if page scripts set their own title/favicon later. */
  function guardTitle() {
    if (doc.title !== DISGUISE_TITLE) { try { doc.title = DISGUISE_TITLE; } catch (e) {} }
  }
  window.setInterval(guardTitle, 1000);
  if (doc.addEventListener) {
    doc.addEventListener("DOMContentLoaded", function () { applyFavicon(); guardTitle(); });
  }

  /* Already unlocked this tab session? Show the real arcade content, keep the
     Securly disguise on the tab/history, and stop here — no overlay, no
     redirect. This is the "on the games" state: games work, history stays
     Securly. */
  var unlocked = false;
  try { unlocked = window.sessionStorage.getItem(SS_KEY) === SS_VALUE; } catch (e) {}
  if (unlocked) return;

  /* ------------------------------- gate ----------------------------------- */

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
    '#access-gate .ag-brand{font-size:30px;font-weight:800;letter-spacing:-0.5px;color:#00b0a6;}' +
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

  /* Staged "redirect" chatter so it reads as a real filter check. Cosmetic. */
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
  var holdMs = 0, sinceLoad = 0, settled = false;

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
    if (comboHeld()) { try { e.preventDefault(); } catch (x) {} }
  }
  window.addEventListener("keydown", function (e) { onKey(e, true); }, true);
  window.addEventListener("keyup", function (e) { onKey(e, false); }, true);
  window.addEventListener("blur", function () {
    mod.ctrl = mod.shift = false; letter.l = letter.p = letter.z = false;
  });

  function unlock() {
    if (settled) return;
    settled = true;
    window.clearInterval(stepTimer);
    try { window.sessionStorage.setItem(SS_KEY, SS_VALUE); } catch (e) {}
    root.removeAttribute("data-gate");
    var g = doc.getElementById("access-gate");
    if (g) g.parentNode.removeChild(g);
    /* Title + favicon stay disguised on purpose — history keeps reading Securly
       while the arcade is fully usable underneath. */
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
