/* Rendering helpers: tiles, list rows, flags, toasts, formatting. */
(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Crisp, self-explanatory inline SVG icons. Stroke-based, inherit color via
     currentColor, and scale with font-size (1em). Use these instead of Unicode
     glyphs, which render inconsistently across systems and read as gibberish. */
  var ICON_PATHS = {
    phone:      '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.3a1 1 0 0 1 1 1 11 11 0 0 0 .56 3.5 1 1 0 0 1-.25 1z"/>',
    video:      '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/>',
    camera:     '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/>',
    image:      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    screenshot: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5V3m8 2V3M3 10h18"/>',
    flag:       '<path d="M5 21V4m0 1h11l-2 4 2 4H5"/>',
    block:      '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    send:       '<path d="m4 12 16-8-6 16-3-6z"/><path d="m11 14 3-3"/>',
    mic:        '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
    micOff:     '<path d="M9 5a3 3 0 0 1 6 0v4m0 3a3 3 0 0 1-4.6 2.5M6 11a6 6 0 0 0 9 5.2M12 17v4M4 4l16 16"/>',
    screen:     '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/>',
    expand:     '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5"/>',
    hangup:     '<path d="M2.5 12.5c5-4.5 14-4.5 19 0l-2.3 2.6a1.4 1.4 0 0 1-1.7.2l-2.4-1.4a1.4 1.4 0 0 1-.7-1.2v-1.5c-2.4-.8-5-.8-7.4 0v1.5a1.4 1.4 0 0 1-.7 1.2L4 15.3a1.4 1.4 0 0 1-1.7-.2z"/>',
    chat:       '<path d="M4 5h16v11H8l-4 4z"/>',
    back:       '<path d="m14 5-7 7 7 7"/>',
    close:      '<path d="m5 5 14 14M19 5 5 19"/>',
    popout:     '<path d="M9 15 20 4M14 4h6v6M6 5H4v15h15v-2"/>',
    group:      '<circle cx="9" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.6"/><path d="M3.5 19c.6-3.4 3-5.2 5.5-5.2s4.9 1.8 5.5 5.2M14.8 14.3c2 .2 3.6 1.7 4.1 4.4"/>',
    plus:       '<path d="M12 5v14M5 12h14"/>',
    trash:      '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    copy:       '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    search:     '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    edit:       '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    info:       '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    userPlus:   '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c.7-3.8 3.2-5.8 6-5.8s5.3 2 6 5.8M19 8v6M16 11h6"/>',
    logout:     '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
    arrowDown:  '<path d="M12 5v14M6 13l6 6 6-6"/>',
    retry:      '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
    attach:     '<path d="m20 11.5-8.1 8.1a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
    crown:      '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    shield:     '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/>',
    shieldCheck:'<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    star:       '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    check:      '<path d="m5 12.5 4.5 4.5L19 7"/>',
    user:       '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.4 4-6.8 8-6.8s7.2 2.4 8 6.8"/>'
  };
  function icon(name, cls) {
    var span = document.createElement("span");
    span.className = "svg-ico" + (cls ? " " + cls : "");
    span.setAttribute("aria-hidden", "true");
    var p = ICON_PATHS[name] || "";
    span.innerHTML =
      '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + p + '</svg>';
    return span;
  }

  /* Rank / membership tags that sit to the right of a person's name.
     Returns a fragment (possibly empty) so callers can append unconditionally. */
  var ROLE_TAGS = {
    owner: { label: "Owner", icon: "crown", cls: "is-owner" },
    admin: { label: "Admin", icon: "shield", cls: "is-admin" },
    mod:   { label: "Mod",   icon: "shieldCheck", cls: "is-mod" }
  };
  function userTags(user, opts) {
    opts = opts || {};
    var frag = document.createDocumentFragment();
    if (!user) return frag;
    var r = ROLE_TAGS[user.role];
    if (r) {
      var t = el("span", "utag " + r.cls);
      t.title = r.label + " of Arcade Campus Hub";
      t.appendChild(icon(r.icon));
      if (!opts.compact) t.appendChild(el("span", "utag-l", r.label));
      else t.setAttribute("aria-label", r.label);
      frag.appendChild(t);
    }
    if (user.isPlus && !opts.noPlus) {
      var pl = el("span", "utag is-plus");
      pl.title = "Campus+ member";
      pl.appendChild(icon("star"));
      if (!opts.compact) pl.appendChild(el("span", "utag-l", "Campus+"));
      else pl.setAttribute("aria-label", "Campus+ member");
      frag.appendChild(pl);
    }
    if (user.state === "suspended" && opts.showState) {
      frag.appendChild(el("span", "utag is-bad", "Suspended"));
    }
    return frag;
  }

  function playHref(game) {
    return "play.html?id=" + encodeURIComponent(game.id);
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    if (seconds < 60) return seconds + "s";
    var m = Math.floor(seconds / 60);
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60);
    var rem = m % 60;
    return rem ? h + "h" + pad(rem) : h + "h";
  }

  function formatWhen(ts) {
    if (!ts) return "—";
    var min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return "now";
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    var day = Math.floor(hr / 24);
    if (day < 7) return day + "d ago";
    return new Date(ts).toLocaleDateString();
  }

  var RISK = {
    low:     { cls: "flag-good", label: "Stable" },
    medium:  { cls: "flag-warn", label: "Patchy" },
    high:    { cls: "flag-bad",  label: "Blocked often" },
    unknown: { cls: "",          label: "Untested" }
  };

  function riskFlag(game) {
    var meta = RISK[game.risk] || RISK.unknown;
    return el("span", "flag " + meta.cls, meta.label);
  }

  function riskLabel(game) {
    return (RISK[game.risk] || RISK.unknown).label;
  }

  function launchLabel(game) {
    return game.embeddable && !game.preferDirect ? "In-page" : "New tab";
  }

  /* The generated plate always goes down first. A harvested icon — usually a
     small square logo — sits on top, contained rather than cropped, so it reads
     as a badge over its own colour field. A 404 just leaves the plate. */
  function coverInto(host, game) {
    host.appendChild(window.Art.cover(game, { plain: !!game.art }));
    if (!game.art) return;

    var img = el("img", "badge");
    img.src = game.art;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", function () { img.remove(); });
    host.appendChild(img);
  }

  function starButton(game, className, onChange) {
    var b = el("button", className);
    b.type = "button";
    var on = window.Store.isFavorite(game.id);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", (on ? "Unpin " : "Pin ") + game.title);
    b.textContent = on ? "★" : "☆";
    b.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var now = window.Store.toggleFavorite(game.id);
      b.setAttribute("aria-pressed", now ? "true" : "false");
      b.setAttribute("aria-label", (now ? "Unpin " : "Pin ") + game.title);
      b.textContent = now ? "★" : "☆";
      toast(now ? "Pinned · " + game.title : "Unpinned · " + game.title);
      if (onChange) onChange(game, now);
    });
    return b;
  }

  /* opts: { no (index badge), desc (default true), onFavorite } */
  function tile(game, opts) {
    opts = opts || {};
    var root = el("article", "tile");
    root.dataset.gameId = game.id;

    var art = el("div", "tile-art");
    coverInto(art, game);
    if (opts.no) art.appendChild(el("span", "tile-no", pad(opts.no)));
    /* Self-hosted originals (served from this origin, no external repo) are the
       ones guaranteed to load — mark them so they stand apart from the CDN
       catalog. Flat corner label, not a chip, per the site's plain look. */
    if (game.platform === "local" && !game.host) {
      art.appendChild(el("span", "tile-tag", "Hosted here"));
    }
    art.appendChild(starButton(game, "tile-star", opts.onFavorite));
    root.appendChild(art);

    var hit = el("a", "tile-hit");
    hit.href = playHref(game);
    hit.tabIndex = -1;
    hit.setAttribute("aria-hidden", "true");
    root.appendChild(hit);

    var body = el("div", "tile-body");
    var name = el("div", "tile-name");
    var link = el("a", null, game.title);
    link.href = playHref(game);
    name.appendChild(link);
    body.appendChild(name);

    if (opts.desc !== false && game.description) {
      body.appendChild(el("p", "tile-desc", game.description));
    }

    var foot = el("div", "tile-foot");
    foot.appendChild(el("span", "tile-cat", game.categoryLabel));
    /* Say it on the card, not after the click. */
    foot.appendChild(game.unavailable
      ? el("span", "flag flag-bad", "Unavailable")
      : riskFlag(game));
    body.appendChild(foot);

    if (game.unavailable) root.classList.add("is-gone");

    root.appendChild(body);
    return root;
  }

  function row(game, index, opts) {
    opts = opts || {};
    var r = el("div", "row");
    r.dataset.gameId = game.id;

    r.appendChild(el("span", "idx", pad(index)));

    var name = el("span", "name");
    var link = el("a", null, game.title);
    link.href = playHref(game);
    name.appendChild(link);
    r.appendChild(name);

    r.appendChild(el("span", "cat", game.categoryLabel));

    var compat = el("span", "compat");
    compat.appendChild(riskFlag(game));
    r.appendChild(compat);

    var s = window.Store.statFor(game.id);
    r.appendChild(el("span", "plays", s.plays ? s.plays + "× " + formatDuration(s.seconds) : "—"));

    r.appendChild(starButton(game, "star", opts.onFavorite));
    return r;
  }

  function emptyBlock(opts) {
    var v = el("div", "void");
    v.appendChild(el("strong", null, opts.title || "Nothing here"));
    v.appendChild(el("p", null, opts.body || "Try a different filter."));
    if (opts.action) {
      var a = el("a", "btn btn-cta", opts.action.label);
      a.href = opts.action.href;
      v.appendChild(a);
    }
    return v;
  }

  /* Renders tiles into a container. Returns the count rendered. */
  function render(container, games, opts) {
    if (!container) return 0;
    opts = opts || {};
    container.innerHTML = "";

    if (!games.length) {
      container.appendChild(emptyBlock({
        title: opts.emptyTitle, body: opts.emptyBody, action: opts.emptyAction
      }));
      return 0;
    }

    var frag = document.createDocumentFragment();
    /* Entrance stagger plays on a container's first fill only. Re-renders
       (search-as-you-type, "load more", filter changes) mark the container
       done so cards swap in instantly instead of re-animating on every
       keystroke. */
    var animate = !container.dataset.rendered;
    games.forEach(function (game, i) {
      var node = tile(game, {
        no: opts.numbered ? i + 1 : 0,
        desc: opts.desc,
        onFavorite: opts.onFavorite
      });
      if (animate) node.style.setProperty("--i", i);
      else node.style.animation = "none";
      frag.appendChild(node);
    });
    container.dataset.rendered = "1";
    container.appendChild(frag);
    return games.length;
  }

  /* Renders the dense table view. */
  function renderList(container, games, opts) {
    if (!container) return 0;
    opts = opts || {};
    container.innerHTML = "";

    if (!games.length) {
      container.appendChild(emptyBlock({
        title: opts.emptyTitle, body: opts.emptyBody, action: opts.emptyAction
      }));
      return 0;
    }

    var head = el("div", "rows-head");
    ["#", "Title", "Category", "Compatibility", "You", ""].forEach(function (h) {
      head.appendChild(el("span", null, h));
    });
    container.appendChild(head);

    var frag = document.createDocumentFragment();
    games.forEach(function (game, i) {
      frag.appendChild(row(game, i + 1, opts));
    });
    container.appendChild(frag);
    return games.length;
  }

  /* ---- toasts ---- */

  var host = null;
  function toast(message, ms) {
    if (!host) {
      host = el("div", "toasts");
      document.body.appendChild(host);
    }
    var node = el("div", "toast", message);
    host.appendChild(node);
    window.setTimeout(function () { node.remove(); }, ms || 2100);
  }

  /* Chat attachments arrive differently per backend: the Node API serves a
     real URL, while PostgREST can only hand back base64 in a JSON row. The
     adapter attaches a `fetchData` loader in that case, so renderers set the
     source through here and don't have to care which backend is live. */
  function attachImage(img, image) {
    if (!image) return img;
    if (typeof image.fetchData === "function") {
      img.dataset.loading = "1";
      image.fetchData().then(function (src) {
        if (src) img.src = src;
        delete img.dataset.loading;
      }).catch(function () {
        img.remove();
      });
    } else {
      img.src = image.url;
    }
    return img;
  }

  /* ---- image lightbox ---- */

  function lightbox(src, alt) {
    var view = el("div", "shot-view");
    var img = el("img");
    img.src = src;
    img.alt = alt || "";
    view.appendChild(img);
    view.addEventListener("click", function () { view.remove(); });
    document.addEventListener("keydown", function esc(event) {
      if (event.key === "Escape") { view.remove(); document.removeEventListener("keydown", esc); }
    });
    document.body.appendChild(view);
  }

  /* Delegated once, so every chat image everywhere is zoomable without each
     renderer having to remember to wire it. */
  document.addEventListener("click", function (event) {
    var img = event.target.closest && event.target.closest("img.dock-img, img.chat-img");
    if (img) { event.preventDefault(); lightbox(img.src, img.alt); }
  });

  /* ---- url helpers ---- */

  function params() { return new URLSearchParams(window.location.search); }

  function setParams(map, replace) {
    var qs = new URLSearchParams(window.location.search);
    Object.keys(map).forEach(function (key) {
      var value = map[key];
      if (value === "" || value == null || value === false) qs.delete(key);
      else qs.set(key, value);
    });
    var next = window.location.pathname + (qs.toString() ? "?" + qs.toString() : "");
    if (replace) window.history.replaceState({}, "", next);
    else window.history.pushState({}, "", next);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      window.clearTimeout(t);
      t = window.setTimeout(function () { fn.apply(self, args); }, ms || 180);
    };
  }

  window.UI = {
    el: el,
    icon: icon,
    userTags: userTags,
    pad: pad,
    tile: tile,
    row: row,
    render: render,
    renderList: renderList,
    emptyBlock: emptyBlock,
    riskFlag: riskFlag,
    riskLabel: riskLabel,
    launchLabel: launchLabel,
    coverInto: coverInto,
    playHref: playHref,
    attachImage: attachImage,
    lightbox: lightbox,
    toast: toast,
    formatDuration: formatDuration,
    formatWhen: formatWhen,
    params: params,
    setParams: setParams,
    debounce: debounce
  };
})();
