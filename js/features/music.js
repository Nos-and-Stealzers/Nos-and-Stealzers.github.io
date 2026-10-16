/* Campus Music: a built-in music player over a free library.

   Every track is public domain or Creative Commons, streamed from the
   Internet Archive (its search and metadata APIs are CORS-enabled and need
   no key). Netlabel releases, Kevin MacLeod's game-friendly catalogue,
   classical recordings and more, all free to play.

   This file is the engine and the mini-player that rides along on every
   page. What's playing, where you were in it, the queue, likes, recents and
   your playlists live on this device, so music picks up where it left off
   when you move between pages. music.html is the full player.

   window.Music
     search(q, {station, page}) -> Promise<{ items, total }>   (releases)
     album(id)                  -> Promise<{ id, title, artist, cover, license, tracks }>
     playTracks(tracks, i)      play a list, starting at i
     enqueue(tracks) / playNext(track)
     toggle(), next(), prev(), seek(sec), setVolume(v), toggleShuffle(), cycleRepeat()
     state() / current()
     likes(), isLiked(id), toggleLike(track), recent()
     playlists(), createPlaylist(name), renamePlaylist(id, name), deletePlaylist(id),
     addToPlaylist(id, tracks), removeFromPlaylist(id, trackId)
   Fires "music:change" on document whenever anything changes. */
(function () {
  "use strict";

  if (window.Music) return;

  var IA = "https://archive.org";
  var STATE_KEY = "ach:music";
  var LIKES_KEY = "ach:music-likes";
  var RECENT_KEY = "ach:music-recent";
  var LISTS_KEY = "ach:music-playlists";
  var UI_KEY = "ach:music-ui";
  var ALBUM_CACHE = "ach:music-albums";
  var MAX_QUEUE = 400;

  /* Only items whose licence is public domain or Creative Commons. */
  var FREE = "(licenseurl:*publicdomain* OR licenseurl:*creativecommons*)";
  var AUDIO = "mediatype:audio";

  var STATIONS = [
    { id: "top",        label: "Top picks",       q: "collection:netlabels" },
    { id: "chill",      label: "Chill & lo-fi",   q: "collection:netlabels AND subject:(chill OR chillout OR lofi OR \"lo-fi\" OR downtempo OR chillhop)" },
    { id: "gaming",     label: "Game music",      q: "(creator:\"Kevin MacLeod\" OR subject:(\"video game\" OR \"game music\" OR soundtrack))" },
    { id: "electronic", label: "Electronic",      q: "collection:netlabels AND subject:(electronic OR techno OR house OR edm OR trance)" },
    { id: "chiptune",   label: "Chiptune & 8-bit", q: "subject:(chiptune OR 8bit OR \"8-bit\" OR chipmusic)" },
    { id: "hiphop",     label: "Hip-hop & beats", q: "collection:netlabels AND subject:(\"hip hop\" OR hiphop OR rap OR beats OR instrumental)" },
    { id: "rock",       label: "Rock & indie",    q: "collection:netlabels AND subject:(rock OR indie OR punk OR metal OR alternative)" },
    { id: "ambient",    label: "Ambient & focus", q: "collection:netlabels AND subject:(ambient OR drone OR meditation OR study OR focus)" },
    { id: "jazz",       label: "Jazz & blues",    q: "subject:(jazz OR blues OR swing)" },
    { id: "classical",  label: "Classical",       q: "subject:(classical OR piano OR orchestra OR symphony OR baroque)" },
    { id: "vintage",    label: "Vintage 78s",     q: "collection:78rpm" }
  ];

  /* ------------------------------------------------------------ storage */

  function readJSON(store, key, fallback) {
    try { return JSON.parse(store.getItem(key) || "null") || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* full or private mode */ }
  }
  var local = (function () { try { return window.localStorage; } catch (e) { return null; } })();
  var session = (function () { try { return window.sessionStorage; } catch (e) { return null; } })();
  function lget(k, f) { return local ? readJSON(local, k, f) : f; }
  function lset(k, v) { if (local) writeJSON(local, k, v); }

  /* ------------------------------------------------------------ library */

  function clean(q) {
    /* Lucene syntax characters out; what's left is plain words. */
    return String(q || "").replace(/[\\+\-!(){}\[\]^"~*?:\/&|<>=]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function coverOf(id) { return IA + "/services/img/" + encodeURIComponent(id); }

  function first(v) { return Array.isArray(v) ? v[0] : v; }

  function search(q, opts) {
    opts = opts || {};
    var page = Math.max(1, opts.page || 1);
    var rows = opts.rows || 24;
    var parts = [AUDIO, FREE];
    var words = clean(q);
    if (words) {
      var w = words.split(" ").map(function (x) { return x + "*"; }).join(" AND ");
      parts.push("(title:(" + w + ") OR creator:(" + w + ") OR subject:(" + w + "))");
    } else {
      var st = STATIONS.filter(function (s) { return s.id === (opts.station || "top"); })[0] || STATIONS[0];
      parts.push("(" + st.q + ")");
    }
    var url = IA + "/advancedsearch.php?q=" + encodeURIComponent(parts.join(" AND ")) +
      "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=downloads&fl[]=licenseurl&fl[]=year" +
      "&sort[]=downloads+desc&rows=" + rows + "&page=" + page + "&output=json";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("The music library didn't answer (" + r.status + ").");
      return r.json();
    }).then(function (d) {
      var res = (d && d.response) || {};
      return {
        total: res.numFound || 0,
        page: page,
        items: (res.docs || []).map(function (doc) {
          return {
            id: doc.identifier,
            title: String(first(doc.title) || doc.identifier).slice(0, 160),
            artist: String(first(doc.creator) || "Various artists").slice(0, 120),
            cover: coverOf(doc.identifier),
            license: String(first(doc.licenseurl) || ""),
            year: doc.year || "",
            plays: doc.downloads || 0
          };
        })
      };
    });
  }

  function seconds(len) {
    if (len == null) return 0;
    var s = String(len);
    if (s.indexOf(":") !== -1) {
      return s.split(":").reduce(function (acc, p) { return acc * 60 + (parseFloat(p) || 0); }, 0);
    }
    return parseFloat(s) || 0;
  }

  function prettyName(name) {
    return String(name).replace(/\.[^.]+$/, "").replace(/^[\d\s._-]+/, "").replace(/[_]+/g, " ").trim() || name;
  }

  var albumCache = (session && readJSON(session, ALBUM_CACHE, {})) || {};
  var albumWaits = {};

  function album(id) {
    if (albumCache[id]) return Promise.resolve(albumCache[id]);
    if (albumWaits[id]) return albumWaits[id];
    albumWaits[id] = fetch(IA + "/metadata/" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) throw new Error("Couldn't open that release (" + r.status + ").");
      return r.json();
    }).then(function (d) {
      var md = (d && d.metadata) || {};
      var files = (d && d.files) || [];
      var mp3 = files.filter(function (f) { return /\.mp3$/i.test(f.name || ""); });
      /* Prefer the full-quality MP3s; fall back to the 64kbps derivatives. */
      var best = mp3.filter(function (f) { return !/64Kbps|_sample/i.test((f.format || "") + f.name); });
      if (best.length) mp3 = best;
      mp3.sort(function (a, b) {
        var ta = parseInt(a.track, 10), tb = parseInt(b.track, 10);
        if (isFinite(ta) && isFinite(tb) && ta !== tb) return ta - tb;
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
      });
      var artist = String(first(md.creator) || "Various artists").slice(0, 120);
      var title = String(first(md.title) || id).slice(0, 160);
      var info = {
        id: id,
        title: title,
        artist: artist,
        cover: coverOf(id),
        license: String(first(md.licenseurl) || ""),
        year: String(first(md.year) || first(md.date) || "").slice(0, 4),
        description: String(first(md.description) || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
        tracks: mp3.slice(0, 200).map(function (f) {
          return {
            id: id + "/" + f.name,
            album: id,
            albumTitle: title,
            title: String(f.title || prettyName(f.name)).slice(0, 160),
            artist: String(f.artist || f.creator || artist).slice(0, 120),
            url: IA + "/download/" + encodeURIComponent(id) + "/" + String(f.name).split("/").map(encodeURIComponent).join("/"),
            cover: coverOf(id),
            length: seconds(f.length),
            license: String(first(md.licenseurl) || "")
          };
        })
      };
      albumCache[id] = info;
      var keys = Object.keys(albumCache);
      if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (k) { delete albumCache[k]; });
      if (session) writeJSON(session, ALBUM_CACHE, albumCache);
      return info;
    }).then(function (info) { delete albumWaits[id]; return info; }, function (err) { delete albumWaits[id]; throw err; });
    return albumWaits[id];
  }

  function licenseLabel(url) {
    url = String(url || "");
    if (/publicdomain\/zero/i.test(url)) return "CC0 · public domain";
    if (/publicdomain/i.test(url)) return "Public domain";
    var m = url.match(/licenses\/([a-z-]+)\/?([\d.]*)/i);
    if (m) return "CC " + m[1].toUpperCase() + (m[2] ? " " + m[2] : "");
    return "Free license";
  }

  /* --------------------------------------------------------- player state */

  var st = lget(STATE_KEY, {});
  var state = {
    queue: Array.isArray(st.queue) ? st.queue.slice(0, MAX_QUEUE) : [],
    index: typeof st.index === "number" ? st.index : -1,
    time: st.time || 0,
    playing: !!st.playing,
    volume: typeof st.volume === "number" ? st.volume : 0.8,
    muted: !!st.muted,
    shuffle: !!st.shuffle,
    repeat: st.repeat === "all" || st.repeat === "one" ? st.repeat : "off",
    order: Array.isArray(st.order) ? st.order : [],
    blocked: false,       // autoplay refused; waiting for a tap
    loading: false,
    errors: 0
  };
  if (state.index >= state.queue.length) state.index = state.queue.length ? 0 : -1;

  var audio = new Audio();
  audio.preload = "metadata";
  audio.volume = state.volume;
  audio.muted = state.muted;

  function persist() {
    lset(STATE_KEY, {
      queue: state.queue, index: state.index, time: audio.currentTime || state.time || 0,
      playing: state.playing, volume: state.volume, muted: state.muted,
      shuffle: state.shuffle, repeat: state.repeat, order: state.order
    });
  }

  var changeQueued = false;
  function changed() {
    if (changeQueued) return;
    changeQueued = true;
    window.requestAnimationFrame(function () {
      changeQueued = false;
      try { document.dispatchEvent(new CustomEvent("music:change", { detail: snapshot() })); } catch (e) {}
      drawMini();
    });
  }

  function current() { return state.queue[state.index] || null; }

  function snapshot() {
    return {
      track: current(), index: state.index, queue: state.queue,
      playing: state.playing && !audio.paused, wantPlaying: state.playing,
      time: audio.currentTime || state.time || 0,
      duration: isFinite(audio.duration) && audio.duration ? audio.duration : ((current() && current().length) || 0),
      volume: state.volume, muted: state.muted, shuffle: state.shuffle, repeat: state.repeat,
      blocked: state.blocked, loading: state.loading
    };
  }

  /* Shuffle is an order over queue positions, rebuilt when the queue changes,
     with the current track first so turning it on doesn't jump. */
  function rebuildOrder() {
    var n = state.queue.length;
    var rest = [];
    for (var i = 0; i < n; i++) if (i !== state.index) rest.push(i);
    for (var j = rest.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = rest[j]; rest[j] = rest[k]; rest[k] = t;
    }
    state.order = state.index >= 0 ? [state.index].concat(rest) : rest;
  }

  function load(i, autoplay, at) {
    var t = state.queue[i];
    if (!t) return;
    state.index = i;
    state.loading = true;
    state.blocked = false;
    audio.src = t.url;
    if (at) {
      var seekOnce = function () {
        audio.removeEventListener("loadedmetadata", seekOnce);
        try { audio.currentTime = at; } catch (e) {}
      };
      audio.addEventListener("loadedmetadata", seekOnce);
    }
    state.time = at || 0;
    remember(t);
    mediaSession(t);
    if (autoplay) play();
    persist();
    changed();
  }

  function play() {
    if (!current()) return Promise.resolve();
    if (!audio.src) { load(state.index, true, state.time); return Promise.resolve(); }
    state.playing = true;
    var p = audio.play();
    if (p && p.catch) {
      return p.then(function () {
        state.blocked = false;
        changed();
      }, function (err) {
        /* Autoplay policy: a page that wasn't clicked yet can't start sound. */
        if (err && err.name === "NotAllowedError") {
          state.blocked = true;
          changed();
        }
      });
    }
    changed();
    return Promise.resolve();
  }

  function pause() {
    state.playing = false;
    audio.pause();
    persist();
    changed();
  }

  function toggle() {
    if (!current()) return;
    if (audio.paused) play(); else pause();
  }

  function stepIndex(dir) {
    var n = state.queue.length;
    if (!n) return -1;
    if (state.shuffle) {
      if (state.order.length !== n) rebuildOrder();
      var pos = state.order.indexOf(state.index);
      var np = pos + dir;
      if (np >= n) { if (state.repeat !== "all") return -1; rebuildOrder(); return state.order[1] != null ? state.order[1] : state.order[0]; }
      if (np < 0) return state.order[0];
      return state.order[np];
    }
    var ni = state.index + dir;
    if (ni >= n) return state.repeat === "all" ? 0 : -1;
    if (ni < 0) return 0;
    return ni;
  }

  function next(auto) {
    if (auto && state.repeat === "one") { audio.currentTime = 0; play(); return; }
    var ni = stepIndex(1);
    if (ni === -1) {
      /* End of the queue. */
      pause();
      if (auto) { try { audio.currentTime = 0; } catch (e) {} }
      return;
    }
    load(ni, true);
  }

  function prev() {
    /* Like every music app: a few seconds in, "previous" restarts the track. */
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    var ni = stepIndex(-1);
    if (ni === -1) return;
    load(ni, true);
  }

  function seek(sec) {
    if (!current()) return;
    if (!audio.src) { load(state.index, false, sec); return; }
    try { audio.currentTime = Math.max(0, sec); } catch (e) {}
    state.time = sec;
    changed();
  }

  function setVolume(v) {
    state.volume = Math.max(0, Math.min(1, v));
    audio.volume = state.volume;
    if (state.volume > 0 && state.muted) { state.muted = false; audio.muted = false; }
    persist();
    changed();
  }
  function toggleMute() {
    state.muted = !state.muted;
    audio.muted = state.muted;
    persist();
    changed();
  }
  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle) rebuildOrder();
    persist();
    changed();
  }
  function cycleRepeat() {
    state.repeat = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
    persist();
    changed();
  }

  function sanitize(t) {
    return {
      id: String(t.id), album: String(t.album || ""), albumTitle: String(t.albumTitle || ""),
      title: String(t.title || "Untitled"), artist: String(t.artist || ""), url: String(t.url),
      cover: String(t.cover || ""), length: Number(t.length) || 0, license: String(t.license || "")
    };
  }

  function playTracks(tracks, i) {
    tracks = (tracks || []).filter(function (t) { return t && t.url; }).slice(0, MAX_QUEUE).map(sanitize);
    if (!tracks.length) return;
    state.queue = tracks;
    state.errors = 0;
    var start = Math.max(0, Math.min(i || 0, tracks.length - 1));
    state.index = start;
    if (state.shuffle) rebuildOrder();
    load(start, true);
  }

  function enqueue(tracks) {
    tracks = (tracks || []).filter(function (t) { return t && t.url; }).map(sanitize);
    if (!tracks.length) return;
    var wasEmpty = !state.queue.length;
    state.queue = state.queue.concat(tracks).slice(0, MAX_QUEUE);
    if (state.shuffle) rebuildOrder();
    if (wasEmpty) load(0, true);
    else { persist(); changed(); }
  }

  function playNext(track) {
    if (!track || !track.url) return;
    if (!state.queue.length) { playTracks([track], 0); return; }
    state.queue.splice(state.index + 1, 0, sanitize(track));
    state.queue = state.queue.slice(0, MAX_QUEUE);
    if (state.shuffle) rebuildOrder();
    persist();
    changed();
  }

  function removeAt(i) {
    if (i < 0 || i >= state.queue.length) return;
    var playingIt = i === state.index;
    state.queue.splice(i, 1);
    if (i < state.index) state.index--;
    if (!state.queue.length) { stop(); return; }
    if (playingIt) {
      state.index = Math.min(state.index, state.queue.length - 1);
      load(state.index, state.playing);
    }
    if (state.shuffle) rebuildOrder();
    persist();
    changed();
  }

  function jump(i) { if (state.queue[i]) load(i, true); }

  function stop() {
    audio.pause();
    audio.removeAttribute("src");
    try { audio.load(); } catch (e) {}
    state.queue = [];
    state.index = -1;
    state.playing = false;
    state.time = 0;
    state.blocked = false;
    persist();
    changed();
  }

  /* --------------------------------------------------- audio element events */

  var lastSave = 0;
  audio.addEventListener("timeupdate", function () {
    state.time = audio.currentTime;
    var now = Date.now();
    if (now - lastSave > 2000) { lastSave = now; persist(); }
    changed();
  });
  audio.addEventListener("playing", function () { state.loading = false; state.errors = 0; state.retried = null; changed(); });
  audio.addEventListener("waiting", function () { state.loading = true; changed(); });
  audio.addEventListener("canplay", function () { state.loading = false; changed(); });
  audio.addEventListener("pause", changed);
  audio.addEventListener("play", changed);
  audio.addEventListener("loadedmetadata", changed);
  audio.addEventListener("ended", function () { next(true); });
  audio.addEventListener("error", function () {
    if (!audio.getAttribute("src")) return;
    state.loading = false;
    /* One quiet retry of the same track first: archive.org hands out a
       different mirror on each request, and a resume-with-seek can trip. */
    var t = current();
    if (t && state.retried !== t.id) {
      state.retried = t.id;
      var at = audio.currentTime || state.time || 0;
      window.setTimeout(function () { if (current() === t) load(state.index, state.playing, at); }, 600);
      return;
    }
    state.errors++;
    if (state.errors >= 3) {
      pause();
      toast("Couldn't play these tracks. The library may be busy, try again in a moment.");
      state.errors = 0;
      return;
    }
    toast("Couldn't play that track, skipping…");
    window.setTimeout(function () { next(false); }, 900);
  });

  window.addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", function () { if (document.hidden) persist(); });

  function toast(msg) { if (window.UI && window.UI.toast) window.UI.toast(msg, 3200); }

  /* ------------------------------------------------------- media session */

  function mediaSession(t) {
    var ms = navigator.mediaSession;
    if (!ms || !t) return;
    try {
      ms.metadata = new window.MediaMetadata({
        title: t.title, artist: t.artist, album: t.albumTitle || "Campus Music",
        artwork: t.cover ? [{ src: t.cover, sizes: "180x180", type: "image/jpeg" }] : []
      });
    } catch (e) {}
  }
  if (navigator.mediaSession) {
    var ms = navigator.mediaSession;
    [["play", play], ["pause", pause], ["previoustrack", prev], ["nexttrack", function () { next(false); }],
     ["seekto", function (d) { if (d && d.seekTime != null) seek(d.seekTime); }]].forEach(function (h) {
      try { ms.setActionHandler(h[0], h[1]); } catch (e) {}
    });
  }

  /* ------------------------------------------------- likes, recents, lists */

  function likes() { return lget(LIKES_KEY, []); }
  function isLiked(id) { return likes().some(function (t) { return t.id === id; }); }
  function toggleLike(track) {
    if (!track) return false;
    var list = likes();
    var had = list.some(function (t) { return t.id === track.id; });
    list = had ? list.filter(function (t) { return t.id !== track.id; }) : [sanitize(track)].concat(list);
    lset(LIKES_KEY, list.slice(0, 1000));
    changed();
    return !had;
  }

  function recent() { return lget(RECENT_KEY, []); }
  function remember(t) {
    var list = recent().filter(function (x) { return x.id !== t.id; });
    list.unshift(Object.assign(sanitize(t), { at: Date.now() }));
    lset(RECENT_KEY, list.slice(0, 60));
  }
  function clearRecent() { lset(RECENT_KEY, []); changed(); }

  function playlists() { return lget(LISTS_KEY, []); }
  function savePlaylists(l) { lset(LISTS_KEY, l); changed(); }
  function createPlaylist(name) {
    var l = playlists();
    var p = { id: "pl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name).slice(0, 60), tracks: [], at: Date.now() };
    l.unshift(p);
    savePlaylists(l.slice(0, 100));
    return p;
  }
  function renamePlaylist(id, name) {
    savePlaylists(playlists().map(function (p) { if (p.id === id) p.name = String(name).slice(0, 60); return p; }));
  }
  function deletePlaylist(id) { savePlaylists(playlists().filter(function (p) { return p.id !== id; })); }
  function addToPlaylist(id, tracks) {
    var added = 0;
    savePlaylists(playlists().map(function (p) {
      if (p.id !== id) return p;
      (tracks || []).forEach(function (t) {
        if (!t || !t.url || p.tracks.some(function (x) { return x.id === t.id; })) return;
        p.tracks.push(sanitize(t));
        added++;
      });
      p.tracks = p.tracks.slice(0, 500);
      return p;
    }));
    return added;
  }
  function removeFromPlaylist(id, trackId) {
    savePlaylists(playlists().map(function (p) {
      if (p.id === id) p.tracks = p.tracks.filter(function (t) { return t.id !== trackId; });
      return p;
    }));
  }

  /* ---------------------------------------------------------- mini player */

  var mini = null;
  var ui = lget(UI_KEY, { collapsed: false });

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m >= 60) return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
  }

  function iconBtn(name, label, cls, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mp-btn" + (cls ? " " + cls : "");
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(window.UI.icon(name));
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(e); });
    return b;
  }

  function buildMini() {
    if (mini || !window.UI || !document.body) return;
    /* The full player page has its own controls. */
    if (document.body.dataset.page === "music") return;
    var el = window.UI.el;
    mini = el("div", "mplayer");
    mini.hidden = true;
    mini.setAttribute("role", "region");
    mini.setAttribute("aria-label", "Music player");

    var bar = el("div", "mp-progress");
    var fill = el("span", "mp-progress-fill");
    bar.appendChild(fill);
    bar.setAttribute("role", "slider");
    bar.setAttribute("aria-label", "Seek");
    bar.tabIndex = 0;
    function seekFromEvent(e) {
      var r = bar.getBoundingClientRect();
      var f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      var s = snapshot();
      if (s.duration) seek(f * s.duration);
    }
    var dragging = false;
    bar.addEventListener("pointerdown", function (e) { dragging = true; try { bar.setPointerCapture(e.pointerId); } catch (x) {} seekFromEvent(e); });
    bar.addEventListener("pointermove", function (e) { if (dragging) seekFromEvent(e); });
    bar.addEventListener("pointerup", function () { dragging = false; });
    bar.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { seek(audio.currentTime + 5); e.preventDefault(); }
      if (e.key === "ArrowLeft") { seek(audio.currentTime - 5); e.preventDefault(); }
    });
    mini.appendChild(bar);

    var row = el("div", "mp-row");
    var art = el("a", "mp-art");
    art.href = "music.html";
    art.title = "Open the music player";
    var img = document.createElement("img");
    img.alt = "";
    img.addEventListener("error", function () { img.style.visibility = "hidden"; });
    art.appendChild(img);
    art.appendChild(el("span", "mp-eq"));
    row.appendChild(art);

    var text = el("a", "mp-text");
    text.href = "music.html";
    var title = el("strong", "mp-title", "");
    var sub = el("span", "mp-sub", "");
    text.appendChild(title);
    text.appendChild(sub);
    row.appendChild(text);

    var ctl = el("div", "mp-ctl");
    var likeB = iconBtn("heart", "Like", "mp-like", function () {
      var t = current();
      if (t) toast(toggleLike(t) ? "Added to Liked songs" : "Removed from Liked songs");
    });
    var prevB = iconBtn("skipPrev", "Previous", "mp-prev", prev);
    var playB = iconBtn("play", "Play", "mp-play", function () {
      if (state.blocked) { play(); return; }
      toggle();
    });
    var nextB = iconBtn("skipNext", "Next", "mp-next", function () { next(false); });
    ctl.appendChild(likeB);
    ctl.appendChild(prevB);
    ctl.appendChild(playB);
    ctl.appendChild(nextB);
    row.appendChild(ctl);

    var vol = el("div", "mp-vol");
    var muteB = iconBtn("volume", "Mute", "mp-mute", toggleMute);
    var range = document.createElement("input");
    range.type = "range";
    range.min = "0"; range.max = "1"; range.step = "0.02";
    range.setAttribute("aria-label", "Volume");
    range.addEventListener("input", function () { setVolume(Number(range.value)); });
    vol.appendChild(muteB);
    vol.appendChild(range);
    row.appendChild(vol);

    var side = el("div", "mp-side");
    side.appendChild(iconBtn("minimize", "Collapse", "mp-collapse", function () {
      ui.collapsed = !ui.collapsed;
      lset(UI_KEY, ui);
      drawMini();
    }));
    side.appendChild(iconBtn("close", "Stop and close", "mp-close", stop));
    row.appendChild(side);
    mini.appendChild(row);

    var resume = el("button", "mp-resume");
    resume.type = "button";
    resume.appendChild(window.UI.icon("play"));
    resume.appendChild(el("span", null, "Tap to resume music"));
    resume.addEventListener("click", function () { play(); });
    mini.appendChild(resume);

    /* Collapsed: just the cover; click it to open back up. */
    mini.addEventListener("click", function (e) {
      if (!ui.collapsed) return;
      if (e.target.closest(".mp-play")) return;
      e.preventDefault();
      ui.collapsed = false;
      lset(UI_KEY, ui);
      drawMini();
    });

    mini._ = { fill: fill, img: img, title: title, sub: sub, playB: playB, likeB: likeB, muteB: muteB, range: range, bar: bar, prevB: prevB, nextB: nextB };
    document.body.appendChild(mini);
    drawMini();
  }

  var lastIcon = "";
  var lastMute = "";
  function drawMini() {
    if (!mini) return;
    var s = snapshot();
    var t = s.track;
    mini.hidden = !t;
    document.documentElement.classList.toggle("has-mplayer", !!t);
    if (!t) return;
    var x = mini._;
    mini.classList.toggle("is-collapsed", !!ui.collapsed);
    mini.classList.toggle("is-playing", !!s.playing);
    mini.classList.toggle("is-blocked", !!s.blocked);
    mini.classList.toggle("is-loading", !!s.loading && s.wantPlaying);
    if (x.img.getAttribute("src") !== t.cover) { x.img.style.visibility = ""; x.img.src = t.cover; }
    if (x.title.textContent !== t.title) x.title.textContent = t.title;
    var subText = t.artist + (t.albumTitle ? " · " + t.albumTitle : "");
    if (x.sub.textContent !== subText) x.sub.textContent = subText;
    x.fill.style.transform = "scaleX(" + (s.duration ? Math.min(1, s.time / s.duration) : 0) + ")";
    x.bar.setAttribute("aria-valuetext", fmt(s.time) + " of " + fmt(s.duration));
    var icon = s.playing ? "pause" : "play";
    if (icon !== lastIcon) {
      lastIcon = icon;
      x.playB.replaceChild(window.UI.icon(icon), x.playB.firstChild);
      x.playB.title = s.playing ? "Pause" : "Play";
      x.playB.setAttribute("aria-label", x.playB.title);
    }
    var liked = isLiked(t.id);
    x.likeB.classList.toggle("is-on", liked);
    x.likeB.setAttribute("aria-pressed", liked ? "true" : "false");
    var m = s.muted || !s.volume ? "volumeOff" : "volume";
    if (m !== lastMute) { lastMute = m; x.muteB.replaceChild(window.UI.icon(m), x.muteB.firstChild); }
    if (document.activeElement !== x.range) x.range.value = String(s.muted ? 0 : s.volume);
  }

  /* --------------------------------------------------------------- resume */

  /* Pick up where the last page left off. If the browser won't start sound
     before a click, the mini player says so and one tap resumes. */
  function boot() {
    buildMini();
    if (current() && state.playing) {
      load(state.index, true, state.time);
    } else if (current()) {
      changed();
    }
    /* Any first interaction on the page counts as permission to resume. */
    var unblock = function () {
      if (state.blocked && state.playing) play();
      document.removeEventListener("pointerdown", unblock, true);
      document.removeEventListener("keydown", unblock, true);
    };
    document.addEventListener("pointerdown", unblock, true);
    document.addEventListener("keydown", unblock, true);
  }

  window.Music = {
    stations: STATIONS,
    search: search,
    album: album,
    licenseLabel: licenseLabel,
    format: fmt,
    playTracks: playTracks,
    enqueue: enqueue,
    playNext: playNext,
    removeAt: removeAt,
    jump: jump,
    play: play,
    pause: pause,
    toggle: toggle,
    next: function () { next(false); },
    prev: prev,
    seek: seek,
    setVolume: setVolume,
    toggleMute: toggleMute,
    toggleShuffle: toggleShuffle,
    cycleRepeat: cycleRepeat,
    stop: stop,
    state: snapshot,
    current: current,
    likes: likes,
    isLiked: isLiked,
    toggleLike: toggleLike,
    recent: recent,
    clearRecent: clearRecent,
    playlists: playlists,
    createPlaylist: createPlaylist,
    renamePlaylist: renamePlaylist,
    deletePlaylist: deletePlaylist,
    addToPlaylist: addToPlaylist,
    removeFromPlaylist: removeFromPlaylist,
    clearQueue: function () {
      var t = current();
      if (!t) return;
      state.queue = [t];
      state.index = 0;
      if (state.shuffle) rebuildOrder();
      persist();
      changed();
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
