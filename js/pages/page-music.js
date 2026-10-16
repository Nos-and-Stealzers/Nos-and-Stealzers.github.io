/* Music page: the full player over window.Music (js/features/music.js).
   Discover stations and search releases, open a release to see its tracks,
   like songs, build playlists, and manage the queue. */
(function () {
  "use strict";

  function init() {
    var M = window.Music;
    var UI = window.UI;
    if (!M || !UI) return;
    var el = UI.el;
    function $(id) { return document.getElementById(id); }
    function D() { return window.Dialogs; }

    var view = $("mu-view");
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".mu-tab"));
    var tab = "discover";
    var station = "top";
    var query = "";
    var openAlbum = null;      // release id being shown
    var openList = null;       // playlist id being shown
    var page = 1;
    var seq = 0;

    /* ------------------------------------------------------- now playing */

    function setIcon(btn, name) {
      btn.innerHTML = "";
      btn.appendChild(UI.icon(name));
    }
    setIcon($("mu-shuffle"), "shuffle");
    setIcon($("mu-prev"), "skipPrev");
    setIcon($("mu-play"), "play");
    setIcon($("mu-next"), "skipNext");
    setIcon($("mu-repeat"), "repeat");
    setIcon($("mu-like"), "heart");
    setIcon($("mu-mute"), "volume");
    document.querySelector(".mu-search-ico").appendChild(UI.icon("search"));

    $("mu-shuffle").addEventListener("click", M.toggleShuffle);
    $("mu-prev").addEventListener("click", M.prev);
    $("mu-play").addEventListener("click", function () {
      if (!M.current()) { playStation(station); return; }
      if (M.state().blocked) M.play(); else M.toggle();
    });
    $("mu-next").addEventListener("click", M.next);
    $("mu-repeat").addEventListener("click", M.cycleRepeat);
    $("mu-like").addEventListener("click", function () {
      var t = M.current();
      if (t) UI.toast(M.toggleLike(t) ? "Added to Liked songs" : "Removed from Liked songs");
    });
    $("mu-mute").addEventListener("click", M.toggleMute);
    $("mu-volume").addEventListener("input", function (e) { M.setVolume(Number(e.target.value)); });
    var seeking = false;
    var seekEl = $("mu-seek");
    seekEl.addEventListener("input", function () {
      seeking = true;
      var s = M.state();
      $("mu-t-now").textContent = M.format(s.duration * seekEl.value / 1000);
    });
    seekEl.addEventListener("change", function () {
      var s = M.state();
      if (s.duration) M.seek(s.duration * seekEl.value / 1000);
      seeking = false;
    });

    var lastTrack = null, lastPlayIcon = "", lastMute = "";
    function drawNow() {
      var s = M.state();
      var t = s.track;
      var nowEl = $("mu-now");
      nowEl.classList.toggle("is-playing", !!s.playing);
      nowEl.classList.toggle("is-empty", !t);
      if (t !== lastTrack && (!t || !lastTrack || t.id !== lastTrack.id)) {
        lastTrack = t;
        var img = $("mu-now-img");
        if (t) {
          img.style.visibility = "";
          img.onerror = function () { img.style.visibility = "hidden"; };
          img.src = t.cover;
          $("mu-now-bg").style.backgroundImage = "url(\"" + t.cover.replace(/"/g, "") + "\")";
          $("mu-now-title").textContent = t.title;
          $("mu-now-sub").textContent = t.artist + (t.albumTitle ? " · " + t.albumTitle : "");
          var lic = $("mu-license");
          lic.innerHTML = "";
          lic.appendChild(el("span", "mu-lic-tag", M.licenseLabel(t.license)));
          var src = el("a", null, "Source on the Internet Archive");
          src.href = "https://archive.org/details/" + encodeURIComponent(t.album);
          src.target = "_blank";
          src.rel = "noopener noreferrer";
          lic.appendChild(src);
          document.title = t.title + " · " + t.artist + " — Music";
        } else {
          img.removeAttribute("src");
          $("mu-now-bg").style.backgroundImage = "";
          $("mu-now-title").textContent = "Pick something to play";
          $("mu-license").textContent = "";
          document.title = "Music — Arcade Campus Hub";
        }
        if (tab === "queue") drawView();
        markPlaying();
      }
      var pi = s.playing ? "pause" : "play";
      if (pi !== lastPlayIcon) {
        lastPlayIcon = pi;
        setIcon($("mu-play"), pi);
        $("mu-play").title = s.playing ? "Pause" : "Play";
        $("mu-play").setAttribute("aria-label", $("mu-play").title);
        markPlaying();
      }
      $("mu-play").classList.toggle("is-blocked", !!s.blocked);
      $("mu-shuffle").setAttribute("aria-pressed", s.shuffle ? "true" : "false");
      var rp = $("mu-repeat");
      rp.setAttribute("aria-pressed", s.repeat !== "off" ? "true" : "false");
      rp.classList.toggle("is-one", s.repeat === "one");
      rp.title = "Repeat: " + (s.repeat === "off" ? "off" : s.repeat === "all" ? "all" : "this song");
      rp.setAttribute("aria-label", rp.title);
      var liked = t && M.isLiked(t.id);
      $("mu-like").setAttribute("aria-pressed", liked ? "true" : "false");
      $("mu-like").disabled = !t;
      var mi = s.muted || !s.volume ? "volumeOff" : "volume";
      if (mi !== lastMute) { lastMute = mi; setIcon($("mu-mute"), mi); }
      if (document.activeElement !== $("mu-volume")) $("mu-volume").value = String(s.muted ? 0 : s.volume);
      if (!seeking) {
        seekEl.value = s.duration ? String(Math.round(1000 * s.time / s.duration)) : "0";
        $("mu-t-now").textContent = M.format(s.time);
      }
      seekEl.style.setProperty("--p", (seekEl.value / 10) + "%");
      $("mu-t-len").textContent = M.format(s.duration);
      seekEl.disabled = !t;
    }

    /* Highlight whichever row is the song playing right now. */
    function markPlaying() {
      var t = M.current();
      var s = M.state();
      Array.prototype.forEach.call(view.querySelectorAll(".mu-row"), function (r) {
        var on = !!t && r.dataset.id === t.id;
        r.classList.toggle("is-now", on);
        r.classList.toggle("is-playing", on && s.playing);
      });
    }

    document.addEventListener("music:change", drawNow);
    drawNow();

    /* ----------------------------------------------------------- helpers */

    function btn(label, iconName, onClick, cls) {
      var b = el("button", "btn btn-sm" + (cls ? " " + cls : ""));
      b.type = "button";
      if (iconName) b.appendChild(UI.icon(iconName));
      if (label) b.appendChild(el("span", null, label));
      b.addEventListener("click", onClick);
      return b;
    }
    function iconBtn(name, label, onClick, cls) {
      var b = el("button", "mu-ibtn" + (cls ? " " + cls : ""));
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.appendChild(UI.icon(name));
      b.addEventListener("click", function (e) { e.stopPropagation(); onClick(e, b); });
      return b;
    }
    function cover(src, cls) {
      var box = el("span", "mu-cover" + (cls ? " " + cls : ""));
      var img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () { img.style.visibility = "hidden"; });
      if (src) img.src = src;
      box.appendChild(img);
      return box;
    }
    function empty(title, body, action) {
      var box = el("div", "mu-empty");
      box.appendChild(UI.icon("music"));
      box.appendChild(el("strong", null, title));
      if (body) box.appendChild(el("p", null, body));
      if (action) box.appendChild(action);
      return box;
    }
    function loading(text) {
      var box = el("div", "mu-loading");
      box.appendChild(el("span", "mu-spinner"));
      box.appendChild(el("span", null, text || "Loading…"));
      return box;
    }

    /* A track list. Each row: number/equaliser, title, artist, length, and
       like / more actions. */
    function trackList(tracks, opts) {
      opts = opts || {};
      var list = el("ol", "mu-tracks");
      tracks.forEach(function (t, i) {
        var li = el("li", "mu-row");
        li.dataset.id = t.id;
        var main = el("button", "mu-row-main");
        main.type = "button";
        main.setAttribute("aria-label", "Play " + t.title);
        var n = el("span", "mu-row-n");
        n.appendChild(el("span", "mu-row-num", String(i + 1)));
        n.appendChild(el("span", "mu-row-eq", ""));
        var pl = el("span", "mu-row-play");
        pl.appendChild(UI.icon("play"));
        n.appendChild(pl);
        main.appendChild(n);
        if (opts.covers) main.appendChild(cover(t.cover, "is-row"));
        var names = el("span", "mu-row-names");
        names.appendChild(el("strong", null, t.title));
        names.appendChild(el("span", null, t.artist + (opts.covers && t.albumTitle ? " · " + t.albumTitle : "")));
        main.appendChild(names);
        main.appendChild(el("span", "mu-row-len", t.length ? M.format(t.length) : ""));
        main.addEventListener("click", function () {
          var cur = M.current();
          if (cur && cur.id === t.id) { M.toggle(); return; }
          if (opts.onPlay) opts.onPlay(i); else M.playTracks(tracks, i);
        });
        li.appendChild(main);

        var like = iconBtn("heart", "Like", function (e, b) {
          var on = M.toggleLike(t);
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
          if (opts.onUnlike && !on) opts.onUnlike(t);
        }, "mu-row-like");
        var liked = M.isLiked(t.id);
        like.classList.toggle("is-on", liked);
        like.setAttribute("aria-pressed", liked ? "true" : "false");
        li.appendChild(like);
        li.appendChild(iconBtn("plus", "More", function (e, b) { trackMenu(t, b, opts, i); }, "mu-row-more"));
        list.appendChild(li);
      });
      window.setTimeout(markPlaying, 0);
      return list;
    }

    /* Small action menu for a track. */
    var menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    document.addEventListener("pointerdown", function (e) {
      if (menu && !menu.contains(e.target) && !e.target.closest(".mu-row-more")) closeMenu();
    }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    window.addEventListener("scroll", closeMenu, { passive: true });

    function trackMenu(t, anchor, opts, i) {
      closeMenu();
      menu = el("div", "mu-menu");
      menu.setAttribute("role", "menu");
      function item(label, iconName, fn) {
        var b = el("button", "mu-menu-item");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.appendChild(UI.icon(iconName));
        b.appendChild(el("span", null, label));
        b.addEventListener("click", function () { closeMenu(); fn(); });
        menu.appendChild(b);
      }
      item("Play next", "skipNext", function () { M.playNext(t); UI.toast("Plays next"); });
      item("Add to queue", "queue", function () { M.enqueue([t]); UI.toast("Added to queue"); });
      item("Add to playlist…", "list", function () { pickPlaylist([t]); });
      if (t.album && !opts.inAlbum) item("Go to release", "music", function () { showAlbum(t.album); });
      if (opts.removeLabel) item(opts.removeLabel, "trash", function () { opts.onRemove(t, i); });
      if (window.ChatCore && window.ChatCore.pickFriends && window.Session && window.Session.user) {
        item("Send to a friend", "send", function () { sendToFriend(t); });
      }
      item("Copy link", "link", function () {
        var link = "https://archive.org/details/" + encodeURIComponent(t.album);
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
          .then(function () { UI.toast("Link copied"); })
          .catch(function () { window.prompt("Copy this link:", link); });
      });
      document.body.appendChild(menu);
      var r = anchor.getBoundingClientRect();
      var mw = menu.offsetWidth, mh = menu.offsetHeight;
      var x = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
      var y = r.bottom + 4;
      if (y + mh > window.innerHeight - 8) y = Math.max(8, r.top - mh - 4);
      menu.style.left = x + "px";
      menu.style.top = y + "px";
      var firstItem = menu.querySelector("button");
      if (firstItem) firstItem.focus();
    }

    /* Shares a song in a direct message, with a link that opens its release here. */
    function sendToFriend(t) {
      var API = window.API;
      window.ChatCore.pickFriends({ title: "Send to a friend", single: true }).then(function (pick) {
        if (!pick) return;
        var name = pick.usernames[0];
        return API.openThread(name).then(function (res) {
          var link = location.origin + location.pathname + "?album=" + encodeURIComponent(t.album);
          var text = "\u266A " + t.title + " \u2014 " + t.artist + " " + link;
          return API.send(res.threadId, text, null).then(function () {
            if (window.Realtime && window.Realtime.broadcast) window.Realtime.broadcast("realtime:thread:" + res.threadId, "msg", {});
            UI.toast("Sent to @" + name);
          });
        });
      }).catch(function (err) { UI.toast((err && err.message) || "Couldn't send that"); });
    }

    function pickPlaylist(tracks) {
      var dlg = D();
      if (!dlg) return;
      var s = dlg.sheet("Add to playlist");
      var box = el("div", "mu-pick");
      M.playlists().forEach(function (p) {
        var b = el("button", "mu-pick-row");
        b.type = "button";
        var art = el("span", "mu-pick-art");
        art.appendChild(UI.icon("music"));
        b.appendChild(art);
        var names = el("span", "mu-pick-names");
        names.appendChild(el("strong", null, p.name));
        names.appendChild(el("span", "dim", p.tracks.length + (p.tracks.length === 1 ? " song" : " songs")));
        b.appendChild(names);
        b.addEventListener("click", function () {
          s.close();
          var n = M.addToPlaylist(p.id, tracks);
          UI.toast(n ? "Added to " + p.name : "Already in " + p.name);
        });
        box.appendChild(b);
      });
      if (!M.playlists().length) box.appendChild(el("p", "dim", "You don't have any playlists yet."));
      s.body.appendChild(box);
      var mk = btn("New playlist", "plus", function () {
        s.close();
        newPlaylist().then(function (p) {
          if (!p) return;
          M.addToPlaylist(p.id, tracks);
          UI.toast("Added to " + p.name);
        });
      }, "btn-cta mu-pick-new");
      s.body.appendChild(mk);
    }

    function newPlaylist() {
      var dlg = D();
      var ask = dlg ? dlg.ask({ title: "New playlist", placeholder: "Playlist name", maxLength: 60, confirmLabel: "Create" })
        : Promise.resolve(window.prompt("Playlist name"));
      return ask.then(function (name) {
        name = String(name || "").trim();
        if (!name) return null;
        var p = M.createPlaylist(name);
        if (tab === "playlists" && !openList) drawView();
        return p;
      });
    }

    /* ------------------------------------------------------------ views */

    function setTab(t) {
      tab = t;
      openAlbum = null;
      openList = null;
      tabs.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
      drawView();
    }
    tabs.forEach(function (b) { b.addEventListener("click", function () { query = ""; setTab(b.dataset.tab); }); });

    function drawView() {
      closeMenu();
      if (openAlbum) return drawAlbum(openAlbum);
      if (openList) return drawPlaylist(openList);
      if (tab === "discover") return drawDiscover();
      if (tab === "liked") return drawLiked();
      if (tab === "playlists") return drawPlaylists();
      if (tab === "recent") return drawRecent();
      if (tab === "queue") return drawQueue();
    }

    function stationChips() {
      var row = el("div", "mu-stations");
      row.setAttribute("role", "list");
      M.stations.forEach(function (s) {
        var b = el("button", "mu-chip", s.label);
        b.type = "button";
        b.setAttribute("aria-pressed", !query && station === s.id ? "true" : "false");
        b.addEventListener("click", function () {
          station = s.id;
          query = "";
          $("mu-q").value = "";
          page = 1;
          drawDiscover();
        });
        row.appendChild(b);
      });
      return row;
    }

    function drawDiscover(append) {
      var my = ++seq;
      if (!append) {
        view.innerHTML = "";
        view.appendChild(stationChips());
        var head = el("div", "mu-sechead");
        var st = M.stations.filter(function (s) { return s.id === station; })[0];
        head.appendChild(el("h2", null, query ? "Results for “" + query + "”" : st.label));
        if (!query) {
          head.appendChild(btn("Play station", "play", function () { playStation(station); }, "btn-cta"));
        }
        view.appendChild(head);
        view.appendChild(el("div", "mu-grid"));
        page = 1;
      }
      var grid = view.querySelector(".mu-grid");
      var more = view.querySelector(".mu-more");
      if (more) more.remove();
      var spin = loading(query ? "Searching the library…" : "Loading releases…");
      view.appendChild(spin);
      M.search(query, { station: station, page: page }).then(function (res) {
        if (my !== seq) return;
        spin.remove();
        if (!res.items.length && page === 1) {
          view.appendChild(empty(query ? "No matches" : "Nothing here right now",
            query ? "Try another word, an artist, or a genre like \"piano\" or \"synthwave\"." : "Try another station."));
          return;
        }
        res.items.forEach(function (a) { grid.appendChild(albumCard(a)); });
        if (res.total > page * 24) {
          var m = btn("Load more", "arrowDown", function () { page++; drawDiscover(true); }, "mu-more");
          view.appendChild(m);
        }
      }).catch(function (err) {
        if (my !== seq) return;
        spin.remove();
        var retry = btn("Try again", "retry", function () { drawDiscover(); });
        view.appendChild(empty("Couldn't reach the music library", (err && err.message) || "Check your connection.", retry));
      });
    }

    /* A tile: cover (opens), a round play button over it, title + subtitle. */
    function card(art, title, sub, onOpen, onPlay, playLabel) {
      var c = el("div", "mu-card");
      var wrap = el("div", "mu-card-art");
      var open = el("button", "mu-card-open");
      open.type = "button";
      open.setAttribute("aria-label", "Open " + title);
      open.appendChild(art);
      open.addEventListener("click", onOpen);
      wrap.appendChild(open);
      if (onPlay) wrap.appendChild(iconBtn("play", playLabel || "Play " + title, onPlay, "mu-card-play"));
      c.appendChild(wrap);
      var names = el("button", "mu-card-names");
      names.type = "button";
      names.tabIndex = -1;
      names.appendChild(el("strong", null, title));
      names.appendChild(el("span", null, sub));
      names.addEventListener("click", onOpen);
      c.appendChild(names);
      return c;
    }

    function albumCard(a) {
      return card(cover(a.cover, "is-card"), a.title, a.artist + (a.year ? " · " + a.year : ""),
        function () { showAlbum(a.id); },
        function () {
          M.album(a.id).then(function (al) {
            if (!al.tracks.length) { UI.toast("No playable songs in that release"); return; }
            M.playTracks(al.tracks, 0);
          }).catch(function (err) { UI.toast(err.message); });
        });
    }

    /* A station plays a shuffled mix: songs from several of its top releases. */
    function playStation(id) {
      var st = M.stations.filter(function (s) { return s.id === id; })[0] || M.stations[0];
      UI.toast("Starting " + st.label + "…", 1800);
      var pageN = 1 + Math.floor(Math.random() * 3);
      M.search("", { station: st.id, page: pageN, rows: 30 }).then(function (res) {
        var picks = res.items.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 6);
        return Promise.all(picks.map(function (a) { return M.album(a.id).catch(function () { return null; }); }));
      }).then(function (albums) {
        var pool = [];
        (albums || []).forEach(function (al) {
          if (!al) return;
          var ts = al.tracks.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 5);
          pool = pool.concat(ts);
        });
        pool.sort(function () { return Math.random() - 0.5; });
        if (!pool.length) { UI.toast("That station is quiet right now. Try another."); return; }
        M.playTracks(pool, 0);
      }).catch(function (err) { UI.toast(err.message || "Couldn't start that station"); });
    }

    function showAlbum(id) {
      openAlbum = id;
      openList = null;
      drawView();
      view.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function backBtn(label, fn) {
      var b = btn(label, "back", fn, "btn-flat mu-back");
      return b;
    }

    function drawAlbum(id) {
      var my = ++seq;
      view.innerHTML = "";
      view.appendChild(backBtn("Back", function () { openAlbum = null; drawView(); }));
      var spin = loading("Opening release…");
      view.appendChild(spin);
      M.album(id).then(function (al) {
        if (my !== seq) return;
        spin.remove();
        var head = el("div", "mu-album-head");
        head.appendChild(cover(al.cover, "is-hero"));
        var info = el("div", "mu-album-info");
        info.appendChild(el("span", "label", "Release" + (al.year ? " · " + al.year : "")));
        var h = el("h2", null, al.title);
        info.appendChild(h);
        info.appendChild(el("p", "mu-album-by", al.artist + " · " + al.tracks.length + (al.tracks.length === 1 ? " song" : " songs")));
        if (al.description) info.appendChild(el("p", "mu-album-desc", al.description));
        var lic = el("p", "mu-license");
        lic.appendChild(el("span", "mu-lic-tag", M.licenseLabel(al.license)));
        var src = el("a", null, "View on the Internet Archive");
        src.href = "https://archive.org/details/" + encodeURIComponent(al.id);
        src.target = "_blank";
        src.rel = "noopener noreferrer";
        lic.appendChild(src);
        info.appendChild(lic);
        var acts = el("div", "btn-row");
        var pa = btn("Play", "play", function () { M.playTracks(al.tracks, 0); }, "btn-cta");
        pa.disabled = !al.tracks.length;
        acts.appendChild(pa);
        var sh = btn("Shuffle", "shuffle", function () {
          var t = al.tracks.slice().sort(function () { return Math.random() - 0.5; });
          M.playTracks(t, 0);
        });
        sh.disabled = al.tracks.length < 2;
        acts.appendChild(sh);
        acts.appendChild(btn("Add to queue", "queue", function () { M.enqueue(al.tracks); UI.toast("Added " + al.tracks.length + " songs to the queue"); }));
        acts.appendChild(btn("Save to playlist", "list", function () { pickPlaylist(al.tracks); }));
        info.appendChild(acts);
        head.appendChild(info);
        view.appendChild(head);
        if (!al.tracks.length) {
          view.appendChild(empty("No playable songs", "This release doesn't have MP3 files the player can stream."));
          return;
        }
        view.appendChild(trackList(al.tracks, { inAlbum: true }));
      }).catch(function (err) {
        if (my !== seq) return;
        spin.remove();
        view.appendChild(empty("Couldn't open that release", err.message));
      });
    }

    function drawLiked() {
      view.innerHTML = "";
      var list = M.likes();
      var head = el("div", "mu-sechead");
      head.appendChild(el("h2", null, "Liked songs"));
      head.appendChild(el("span", "dim", list.length + (list.length === 1 ? " song" : " songs")));
      if (list.length) {
        head.appendChild(el("span", "fill"));
        head.appendChild(btn("Play", "play", function () { M.playTracks(M.likes(), 0); }, "btn-cta"));
        head.appendChild(btn("Shuffle", "shuffle", function () {
          M.playTracks(M.likes().sort(function () { return Math.random() - 0.5; }), 0);
        }));
      }
      view.appendChild(head);
      if (!list.length) {
        view.appendChild(empty("No liked songs yet", "Tap the heart on any song and it lands here, on this device."));
        return;
      }
      view.appendChild(trackList(list, { covers: true, onUnlike: function () { window.setTimeout(drawLiked, 250); } }));
    }

    function drawRecent() {
      view.innerHTML = "";
      var list = M.recent();
      var head = el("div", "mu-sechead");
      head.appendChild(el("h2", null, "Recently played"));
      if (list.length) {
        head.appendChild(el("span", "fill"));
        head.appendChild(btn("Clear", "trash", function () { M.clearRecent(); drawRecent(); }, "btn-flat"));
      }
      view.appendChild(head);
      if (!list.length) {
        view.appendChild(empty("Nothing played yet", "Songs you play show up here."));
        return;
      }
      view.appendChild(trackList(list, { covers: true }));
    }

    function drawQueue() {
      view.innerHTML = "";
      var s = M.state();
      var head = el("div", "mu-sechead");
      head.appendChild(el("h2", null, "Queue"));
      head.appendChild(el("span", "dim", s.queue.length + (s.queue.length === 1 ? " song" : " songs")));
      if (s.queue.length > 1) {
        head.appendChild(el("span", "fill"));
        head.appendChild(btn("Save as playlist", "list", function () {
          newPlaylist().then(function (p) {
            if (!p) return;
            M.addToPlaylist(p.id, M.state().queue);
            UI.toast("Saved the queue to " + p.name);
          });
        }));
        head.appendChild(btn("Clear up next", "trash", function () { M.clearQueue(); drawQueue(); }, "btn-flat"));
      }
      view.appendChild(head);
      if (!s.queue.length) {
        view.appendChild(empty("The queue is empty", "Play a release or a station and its songs line up here.",
          btn("Play Top picks", "play", function () { playStation("top"); }, "btn-cta")));
        return;
      }
      view.appendChild(trackList(s.queue, {
        covers: true,
        onPlay: function (i) { M.jump(i); },
        removeLabel: "Remove from queue",
        onRemove: function (t, i) { M.removeAt(i); drawQueue(); }
      }));
    }

    function drawPlaylists() {
      view.innerHTML = "";
      var lists = M.playlists();
      var head = el("div", "mu-sechead");
      head.appendChild(el("h2", null, "Your playlists"));
      head.appendChild(el("span", "fill"));
      head.appendChild(btn("New playlist", "plus", function () { newPlaylist(); }, "btn-cta"));
      view.appendChild(head);
      if (!lists.length) {
        view.appendChild(empty("No playlists yet", "Make one, then add songs from any release with the + button."));
        return;
      }
      var grid = el("div", "mu-grid");
      lists.forEach(function (p) {
        var art = el("span", "mu-cover is-card is-mosaic");
        var covers = [];
        p.tracks.forEach(function (t) { if (t.cover && covers.indexOf(t.cover) === -1) covers.push(t.cover); });
        if (!covers.length) { art.classList.add("is-blank"); art.appendChild(UI.icon("music")); }
        covers.slice(0, 4).forEach(function (src) {
          var img = document.createElement("img");
          img.alt = "";
          img.loading = "lazy";
          img.addEventListener("error", function () { img.style.visibility = "hidden"; });
          img.src = src;
          art.appendChild(img);
        });
        art.dataset.n = String(Math.min(4, covers.length));
        var c = card(art, p.name, p.tracks.length + (p.tracks.length === 1 ? " song" : " songs"),
          function () { openList = p.id; drawView(); },
          p.tracks.length ? function () { M.playTracks(p.tracks, 0); } : null);
        grid.appendChild(c);
      });
      view.appendChild(grid);
    }

    function drawPlaylist(id) {
      view.innerHTML = "";
      var p = M.playlists().filter(function (x) { return x.id === id; })[0];
      view.appendChild(backBtn("All playlists", function () { openList = null; drawView(); }));
      if (!p) { view.appendChild(empty("That playlist is gone", "")); return; }
      var head = el("div", "mu-sechead");
      head.appendChild(el("h2", null, p.name));
      head.appendChild(el("span", "dim", p.tracks.length + (p.tracks.length === 1 ? " song" : " songs")));
      head.appendChild(el("span", "fill"));
      var pa = btn("Play", "play", function () { M.playTracks(p.tracks, 0); }, "btn-cta");
      pa.disabled = !p.tracks.length;
      head.appendChild(pa);
      var sh = btn("Shuffle", "shuffle", function () { M.playTracks(p.tracks.slice().sort(function () { return Math.random() - 0.5; }), 0); });
      sh.disabled = p.tracks.length < 2;
      head.appendChild(sh);
      head.appendChild(btn("Rename", "edit", function () {
        var dlg = D();
        (dlg ? dlg.ask({ title: "Rename playlist", value: p.name, maxLength: 60, confirmLabel: "Rename" }) : Promise.resolve(window.prompt("Rename", p.name)))
          .then(function (name) { if (name && String(name).trim()) { M.renamePlaylist(id, String(name).trim()); drawPlaylist(id); } });
      }, "btn-flat"));
      head.appendChild(btn("Delete", "trash", function () {
        var dlg = D();
        (dlg ? dlg.confirm({ title: "Delete “" + p.name + "”?", body: "The playlist is removed from this device. The songs stay in the library.", confirmLabel: "Delete", danger: true })
          : Promise.resolve(window.confirm("Delete this playlist?")))
          .then(function (yes) { if (yes) { M.deletePlaylist(id); openList = null; drawView(); UI.toast("Playlist deleted"); } });
      }, "btn-flat btn-danger"));
      view.appendChild(head);
      if (!p.tracks.length) {
        view.appendChild(empty("Nothing in here yet", "Open a release in Discover and add songs with the + button.",
          btn("Discover music", "music", function () { setTab("discover"); }, "btn-cta")));
        return;
      }
      view.appendChild(trackList(p.tracks, {
        covers: true,
        removeLabel: "Remove from playlist",
        onRemove: function (t) { M.removeFromPlaylist(id, t.id); drawPlaylist(id); }
      }));
    }

    /* ------------------------------------------------------------- search */

    $("mu-search").addEventListener("submit", function (e) {
      e.preventDefault();
      query = $("mu-q").value.trim();
      tabs.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === "discover" ? "true" : "false"); });
      tab = "discover";
      openAlbum = null;
      openList = null;
      drawDiscover();
    });
    $("mu-q").addEventListener("search", function () {
      if (!$("mu-q").value && query) { query = ""; drawDiscover(); }
    });

    /* Space toggles play/pause when nothing else wants the key. */
    document.addEventListener("keydown", function (e) {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.closest("input, textarea, select, button, [contenteditable]") )) return;
      if (!M.current()) return;
      e.preventDefault();
      M.toggle();
    });

    /* ?q=… searches, ?station=… opens a station, ?album=… opens a release. */
    var params = new URLSearchParams(window.location.search);
    if (params.get("station") && M.stations.some(function (s) { return s.id === params.get("station"); })) station = params.get("station");
    if (params.get("q")) { query = params.get("q").slice(0, 80); $("mu-q").value = query; }
    if (params.get("album")) openAlbum = params.get("album");
    drawView();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
