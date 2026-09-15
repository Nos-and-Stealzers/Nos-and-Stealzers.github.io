/* Access gate ("cloak").
 *
 * On every visit the site pretends to be a Securly content-filter redirect and
 * will actually send the visitor to securly.com — UNLESS they hold the secret
 * combo Ctrl + Shift + L continuously for 6 seconds, which unlocks the real
 * site for the rest of the browser session.
 *
 * Design goals:
 *  - Runs as the very first script in <head>, dependency-free, so it gates
 *    before any real content can paint.
 *  - The whole screen looks like a genuine "redirecting to your filter" page.
 *  - There is NO visible button or link into the site; the hold is the only way.
 *  - Once unlocked it records the pass in sessionStorage, so navigating between
 *    pages in the same tab doesn't re-gate. A new tab / relaunch re-gates.
 */
(function () {
  "use strict";

  var DECOY_URL = "https://www.securly.com/";
  var REQUIRED_HOLD_MS = 6000;   // continuous hold needed to unlock
  var REDIRECT_AFTER_MS = 6500;  // bounce a passive visitor to the decoy
  var SS_KEY = "ach:gate";
  var SS_VALUE = "open";

  /* Already unlocked this tab session? Then do nothing at all. */
  try {
    if (window.sessionStorage.getItem(SS_KEY) === SS_VALUE) return;
  } catch (e) { /* storage blocked — gate anyway */ }

  var doc = document;
  var root = doc.documentElement;

  /* Hide the real page immediately. A head <style> keeps <body> invisible while
     the gate is locked; the gate overlay re-shows itself as a descendant. */
  root.setAttribute("data-gate", "locked");
  var css = doc.createElement("style");
  css.textContent =
    'html[data-gate="locked"] body{visibility:hidden!important;}' +
    '#access-gate{visibility:visible!important;}' +
    '#access-gate{position:fixed;inset:0;z-index:2147483647;display:flex;' +
    'align-items:center;justify-content:center;flex-direction:column;' +
    'background:#ffffff;color:#2b3440;font-family:system-ui,-apple-system,' +
    '"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;' +
    'padding:24px;}' +
    '#access-gate .ag-brand{font-size:34px;font-weight:800;letter-spacing:-0.5px;' +
    'color:#00b0a6;margin-bottom:6px;}' +
    '#access-gate .ag-brand span{color:#8a9099;font-weight:600;}' +
    '#access-gate .ag-title{font-size:17px;font-weight:600;margin:10px 0 4px;}' +
    '#access-gate .ag-sub{font-size:13px;color:#6b7280;max-width:34ch;line-height:1.5;}' +
    '#access-gate .ag-spin{width:34px;height:34px;margin:22px 0 4px;border:3px solid #e5e7eb;' +
    'border-top-color:#00b0a6;border-radius:50%;animation:ag-rot 0.9s linear infinite;}' +
    '@keyframes ag-rot{to{transform:rotate(360deg);}}' +
    '#access-gate .ag-bar{margin-top:20px;width:260px;max-width:70vw;height:4px;' +
    'background:#eceef1;border-radius:2px;overflow:hidden;}' +
    '#access-gate .ag-bar i{display:block;height:100%;width:0;background:#00b0a6;' +
    'transition:width 0.12s linear;}' +
    '#access-gate .ag-foot{position:absolute;bottom:20px;font-size:11px;color:#9aa1ab;}';
  (doc.head || root).appendChild(css);

  function buildOverlay() {
    if (doc.getElementById("access-gate")) return;
    var g = doc.createElement("div");
    g.id = "access-gate";
    g.setAttribute("role", "status");
    g.innerHTML =
      '<div class="ag-brand">securly<span>.</span></div>' +
      '<div class="ag-spin"></div>' +
      '<div class="ag-title">Redirecting to your content filter…</div>' +
      '<div class="ag-sub">This site is being checked against your school\'s ' +
      'web filtering policy. Please wait while we route your request.</div>' +
      '<div class="ag-bar"><i id="ag-bar-fill"></i></div>' +
      '<div class="ag-foot">Securly Filter · verifying policy</div>';
    (doc.body || root).appendChild(g);
  }

  if (doc.body) buildOverlay();
  else doc.addEventListener("DOMContentLoaded", buildOverlay);

  /* --------------------------------------------------------------- combo --- */

  var down = { ctrl: false, shift: false, l: false };
  var holdMs = 0;
  var sinceLoad = 0;
  var settled = false;

  function held() { return down.ctrl && down.shift && down.l; }

  function onKey(e, isDown) {
    var k = e.key;
    if (e.keyCode === 17 || k === "Control") down.ctrl = isDown;
    else if (e.keyCode === 16 || k === "Shift") down.shift = isDown;
    else if (e.keyCode === 76 || k === "l" || k === "L") down.l = isDown;
    else return;
    /* Keep the browser's own Ctrl+Shift+L shortcuts from stealing it. */
    if (held()) { try { e.preventDefault(); } catch (x) {} }
  }

  window.addEventListener("keydown", function (e) { onKey(e, true); }, true);
  window.addEventListener("keyup", function (e) { onKey(e, false); }, true);
  /* Losing focus (alt-tab, clicking the address bar) drops the keys. */
  window.addEventListener("blur", function () { down.ctrl = down.shift = down.l = false; });

  function unlock() {
    if (settled) return;
    settled = true;
    try { window.sessionStorage.setItem(SS_KEY, SS_VALUE); } catch (e) {}
    root.removeAttribute("data-gate");
    var g = doc.getElementById("access-gate");
    if (g) g.parentNode.removeChild(g);
  }

  function bounce() {
    if (settled) return;
    settled = true;
    try { window.location.replace(DECOY_URL); }
    catch (e) { window.location.href = DECOY_URL; }
  }

  var timer = window.setInterval(function () {
    if (settled) { window.clearInterval(timer); return; }
    sinceLoad += 100;

    if (held()) {
      holdMs += 100;
      var fill = doc.getElementById("ag-bar-fill");
      if (fill) fill.style.width = Math.min(100, (holdMs / REQUIRED_HOLD_MS) * 100) + "%";
      if (holdMs >= REQUIRED_HOLD_MS) { window.clearInterval(timer); unlock(); }
    } else {
      holdMs = 0;
      var f2 = doc.getElementById("ag-bar-fill");
      if (f2) f2.style.width = "0%";
      /* Not making progress and past the grace window -> off to the decoy. */
      if (sinceLoad >= REDIRECT_AFTER_MS) { window.clearInterval(timer); bounce(); }
    }
  }, 100);
})();
