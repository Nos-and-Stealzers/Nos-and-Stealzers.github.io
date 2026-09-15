/* motion-fx.js — pointer-reactive 3D depth for game cards and the hero.
 *
 * The site's signature interaction: cards tilt toward the cursor in real 3D
 * (CSS perspective + rotateX/Y) with a soft light that tracks the pointer, and
 * the cover art lifts on a nearer plane than the label — so a wall of games
 * reads like physical cards under glass instead of flat rectangles.
 *
 * Rules that keep it from being the "AI-generated motion" trap:
 *  - Pure transforms + opacity, GPU-composited, rAF-throttled: no layout, no
 *    paint on move. Fine on a school Chromebook.
 *  - Fully gated. If Settings has motion off or lite on, or the OS asks for
 *    reduced motion, or the device has no fine pointer (touch), it does
 *    nothing at all — the cards stay exactly as they were.
 *  - Event-delegated: one set of listeners for the whole page, and it keeps
 *    working for cards added later (search-as-you-type, load-more).
 *
 * Dependency-free; safe to load on every page.
 */
(function () {
  "use strict";

  var root = document.documentElement;

  function motionOff() {
    if (root.getAttribute("data-motion") === "off") return true;
    if (root.getAttribute("data-lite") === "on") return true;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      /* Touch / coarse pointers get no tilt — it only makes sense with a
         hovering cursor, and avoids jank on phones. */
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
    } catch (e) {}
    return false;
  }

  var MAX_TILT = 7;          // degrees; subtle, not a novelty toy
  var active = null;         // the card currently under the pointer
  var frame = 0;
  var pending = null;

  function tiltTargets(el) {
    /* Which elements accept the effect and how strong. */
    if (el.classList.contains("tile")) return { el: el, art: el.querySelector(".tile-art"), max: MAX_TILT };
    if (el.classList.contains("marquee")) return { el: el, art: el.querySelector(".marquee-art"), max: 4 };
    return null;
  }

  function apply(t, ev) {
    var r = t.el.getBoundingClientRect();
    var px = (ev.clientX - r.left) / r.width;    // 0..1
    var py = (ev.clientY - r.top) / r.height;    // 0..1
    var rx = (0.5 - py) * t.max * 2;
    var ry = (px - 0.5) * t.max * 2;

    t.el.style.transform =
      "perspective(760px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" +
      ry.toFixed(2) + "deg) translateZ(0)";
    /* Cover art floats a plane nearer than the body text. */
    if (t.art) t.art.style.transform = "translateZ(26px) scale(1.05)";
    /* Light source follows the cursor. */
    t.el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
    t.el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    t.el.classList.add("fx-tilt");
  }

  function reset(t) {
    if (!t || !t.el) return;
    t.el.style.transform = "";
    if (t.art) t.art.style.transform = "";
    t.el.classList.remove("fx-tilt");
  }

  function onMove(ev) {
    if (motionOff()) return;
    var card = ev.target.closest && ev.target.closest(".tile, .marquee");
    if (!card) { if (active) { reset(active); active = null; } return; }

    var t = tiltTargets(card);
    if (!t) return;
    if (active && active.el !== t.el) reset(active);
    active = t;

    pending = ev;
    if (frame) return;
    frame = window.requestAnimationFrame(function () {
      frame = 0;
      if (active && pending) apply(active, pending);
    });
  }

  function onLeave(ev) {
    if (!active) return;
    var to = ev.relatedTarget;
    if (to && active.el.contains(to)) return;
    reset(active);
    active = null;
  }

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerout", onLeave, { passive: true });
  /* Clear any stuck tilt if the setting is toggled or the tab is hidden. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && active) { reset(active); active = null; }
  });
})();
