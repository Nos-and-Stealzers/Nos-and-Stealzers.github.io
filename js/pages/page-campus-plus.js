/* Campus+: paste a YouTube link and it plays inline; save videos into playlists (private or shared), queue a… */
(function () {
  "use strict";

  var HISTORY_KEY = "ach:cp-history";
  var TITLES_KEY = "ach:cp-titles";
  var YT_ORIGINS = ["https://www.youtube-nocookie.com", "https://www.youtube.com"];

  /* Three sources share one player. A saved item's id says which:
       "dQw4w9WgXcQ"           YouTube (its fixed 11-character id)
       "tt:7234567890123456789" TikTok (the numeric video id)
       "ig:Cx1AbCdEfGh"         Instagram post or reel (its shortcode) */
  var TT_ORIGINS = ["https://www.tiktok.com"];

  function sourceOf(key) {
    key = String(key || "");
    if (key.indexOf("tt:") === 0) return "tiktok";
    if (key.indexOf("ig:") === 0) return "instagram";
    return "youtube";
  }
  function bareId(key) { return String(key || "").replace(/^(tt|ig):/, ""); }
  var SOURCE_LABEL = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

  /* Every shape a link comes in: YouTube watch?v=, youtu.be/, embed/,
     shorts/, live/, music., m. (with timestamps or list= riding along);
     TikTok /@user/video/<id>, /embed/v2/<id>, /player/v1/<id>, m.tiktok.com/v/<id>;
     Instagram /p/, /reel/, /reels/, /tv/. Returns the item key, or null. */
  function extractVideoId(input) {
    var s = String(input || "").trim();
    if (!s) return null;
    var tt = s.match(/tiktok\.com\/(?:@[\w.\-]+\/(?:video|photo)\/|embed\/(?:v2\/)?|player\/v1\/|v\/|share\/video\/)(\d{8,25})/);
    if (tt) return "tt:" + tt[1];
    var ig = s.match(/instagram\.com\/(?:[\w.\-]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,40})/);
    if (ig) return "ig:" + ig[1];
    var patterns = [
      /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/v\/([A-Za-z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = s.match(patterns[i]);
      if (m) return m[1];
    }
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    if (/^(tt:\d{8,25}|ig:[A-Za-z0-9_-]{5,40})$/.test(s)) return s;
    return null;
  }

  /* TikTok's share links (vm.tiktok.com/…, tiktok.com/t/…) hide the id behind
     a redirect. TikTok's oEmbed (CORS-enabled, no key) follows it for us. */
  function isTikTokShort(input) {
    return /(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|tiktok\.com\/t\/[A-Za-z0-9]+/.test(String(input || ""));
  }
  function resolveMedia(input) {
    var key = extractVideoId(input);
    if (key) return Promise.resolve(key);
    if (!isTikTokShort(input)) return Promise.resolve(null);
    var raw = String(input).trim();
    if (!/^https?:\/\//.test(raw)) raw = "https://" + raw;
    return fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(raw))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var id = d && (d.embed_product_id || "");
        if (!/^\d{8,25}$/.test(String(id))) {
          var m = d && String(d.html || "").match(/data-video-id="(\d{8,25})"/);
          id = m ? m[1] : "";
        }
        if (!id) return null;
        var key2 = "tt:" + id;
        cacheInfo(key2, {
          title: String(d.title || "").slice(0, 200), author: String(d.author_name || "").slice(0, 100),
          thumb: String(d.thumbnail_url || ""), authorUrl: String(d.author_url || ""), at: Date.now()
        });
        return key2;
      })
      .catch(function () { return null; });
  }

  /* ?t=90 / ?t=1m30s / &start=90 — honoured when a timestamped link is pasted. */
  function extractStart(input) {
    var m = String(input || "").match(/[?&#](?:t|start)=(\d+h)?(\d+m)?(\d+)s?\b/);
    if (!m) return 0;
    return (parseInt(m[1] || "0", 10) * 3600) + (parseInt(m[2] || "0", 10) * 60) + parseInt(m[3] || "0", 10);
  }

  function embedUrl(key, start) {
    var src = sourceOf(key), id = encodeURIComponent(bareId(key));
    if (src === "tiktok") {
      return "https://www.tiktok.com/player/v1/" + id +
        "?autoplay=1&loop=0&music_info=1&description=1&rel=0&native_context_menu=1&closed_caption=1";
    }
    if (src === "instagram") return "https://www.instagram.com/p/" + id + "/embed/captioned/";
    return "https://www.youtube-nocookie.com/embed/" + id +
      "?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1" +
      "&origin=" + encodeURIComponent(window.location.origin) +
      (start ? "&start=" + start : "");
  }
  function linkFor(key) {
    var src = sourceOf(key), id = bareId(key);
    if (src === "tiktok") {
      /* oEmbed tells us the creator's handle; use it so the link is the
         canonical one, falling back to TikTok's handle-less form. */
      var c = titleCache[key];
      var handle = c && /^https:\/\/www\.tiktok\.com\/@[\w.\-]+$/.test(c.authorUrl || "") ? c.authorUrl : "https://www.tiktok.com/@";
      return handle + "/video/" + id;
    }
    if (src === "instagram") return "https://www.instagram.com/p/" + id + "/";
    return "https://youtu.be/" + id;
  }
  function thumbUrl(key) {
    if (sourceOf(key) === "youtube") return "https://i.ytimg.com/vi/" + encodeURIComponent(key) + "/mqdefault.jpg";
    var c = titleCache[key];
    return (c && c.thumb) || "";
  }

  /* A thumbnail that hides itself if the image host is blocked, so the
     placeholder behind it shows instead of a broken-image icon. TikTok
     thumbnails come from oEmbed, so they may arrive a moment later.
     Instagram has no keyless thumbnails: it gets a branded plate. */
  function thumb(key) {
    var src = sourceOf(key);
    var img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "cp-thumb is-" + src;
    img.addEventListener("error", function () { img.style.visibility = "hidden"; });
    if (src === "instagram") {
      img.src = "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#feda75"/><stop offset=".35" stop-color="#fa7e1e"/><stop offset=".6" stop-color="#d62976"/>' +
        '<stop offset=".8" stop-color="#962fbf"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs>' +
        '<rect width="320" height="180" fill="url(#g)"/><rect x="132" y="62" width="56" height="56" rx="16" fill="none" stroke="#fff" stroke-width="7"/>' +
        '<circle cx="160" cy="90" r="13" fill="none" stroke="#fff" stroke-width="7"/><circle cx="176" cy="74" r="4" fill="#fff"/></svg>');
      return img;
    }
    var url = stale(key) ? "" : thumbUrl(key);
    if (url) {
      img.src = url;
      /* An expired TikTok link: drop the cached copy and fetch a fresh one, once. */
      if (src === "tiktok") img.addEventListener("error", function retry() {
        img.removeEventListener("error", retry);
        if (titleCache[key]) titleCache[key].at = 0;
        videoInfo(key).then(function (info) { if (info.thumb && info.thumb !== url) { img.style.visibility = ""; img.src = info.thumb; } });
      });
    } else {
      img.style.visibility = "hidden";
      videoInfo(key).then(function (info) {
        if (info.thumb) { img.style.visibility = ""; img.src = info.thumb; }
      });
    }
    return img;
  }

  function sourceBadge(key) {
    var src = sourceOf(key);
    var b = document.createElement("span");
    b.className = "cp-src cp-src-" + src;
    b.textContent = SOURCE_LABEL[src];
    return b;
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null") || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  /* Titles come from oEmbed (YouTube and TikTok are both CORS-enabled, no
     key). Cached so a playlist doesn't refetch every title on every visit.
     Instagram's oEmbed needs an app token, so its posts keep a plain label. */
  var titleCache = readJSON(TITLES_KEY, {});
  var titleWaits = {};
  function cacheInfo(key, info) {
    titleCache[key] = info;
    var keys = Object.keys(titleCache);
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(function (k) { delete titleCache[k]; });
    writeJSON(TITLES_KEY, titleCache);
  }
  /* TikTok thumbnails are signed links that expire within a day or so;
     a cached entry older than that is refetched for a fresh one. */
  var TT_FRESH = 6 * 3600 * 1000;
  function stale(key) {
    var c = titleCache[key];
    return !!c && sourceOf(key) === "tiktok" && !(c.at && Date.now() - c.at < TT_FRESH);
  }
  function videoInfo(key) {
    if (titleCache[key] && !stale(key)) return Promise.resolve(titleCache[key]);
    if (titleWaits[key]) return titleWaits[key];
    var src = sourceOf(key);
    if (src === "instagram") return Promise.resolve({ title: "Instagram post", author: "" });
    var url = src === "tiktok"
      ? "https://www.tiktok.com/oembed?url=" + encodeURIComponent("https://www.tiktok.com/@/video/" + bareId(key))
      : "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + key);
    titleWaits[key] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error("oembed " + r.status);
      return r.json();
    }).then(function (d) {
      var info = { title: String(d.title || "").slice(0, 200), author: String(d.author_name || "").slice(0, 100) };
      if (src === "tiktok") {
        info.thumb = String(d.thumbnail_url || "");
        info.authorUrl = String(d.author_url || "");
        info.at = Date.now();
        if (!info.title) info.title = info.author ? "TikTok by @" + info.author : "TikTok video";
      }
      cacheInfo(key, info);
      return info;
    }).catch(function () {
      /* Offline or refused: an old cached title still beats nothing. */
      return titleCache[key] || { title: "", author: "" };
    }).then(function (info) { delete titleWaits[key]; return info; });
    return titleWaits[key];
  }

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function init() {
    var UI = window.UI;
    var API = window.API;
    var Session = window.Session;
    var el = UI.el;
    function dialogs() { return window.Dialogs; }

    var form = document.getElementById("cp-form");
    var urlInput = document.getElementById("cp-url");
    var urlNote = document.getElementById("cp-url-note");
    var stage = document.getElementById("cp-player-block");
    var player = document.getElementById("cp-player");
    var frameBox = player.parentNode;
    var nowTitle = document.getElementById("cp-now-title");
    var nowSub = document.getElementById("cp-now-sub");
    var nowActs = document.getElementById("cp-now-acts");
    var queueHost = document.getElementById("cp-queue");
    var library = document.getElementById("cp-library");
    var publicSearch = document.getElementById("cp-public-search");
    var publicQ = document.getElementById("cp-public-q");
    var detail = document.getElementById("cp-detail-block");
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".cp-tab"));

    var tab = "mine";
    /* What's playing: a queue of { videoId, title }, and where in it we are.
       A single pasted link is a queue of one. */
    var queue = [];
    var qIndex = -1;
    var queueName = "";
    var loop = false;

    /* ------------------------------------------------------------ player */

    function playAt(i, start) {
      if (i < 0 || i >= queue.length) return;
      qIndex = i;
      var item = queue[i];
      var src = sourceOf(item.videoId);
      delete player.dataset.ended;
      /* A video and a song at once is noise: pause the music player. */
      if (window.Music && window.Music.state().playing) window.Music.pause();
      player.src = embedUrl(item.videoId, start || 0);
      frameBox.classList.toggle("is-vertical", src !== "youtube");
      frameBox.dataset.source = src;
      stage.hidden = false;
      nowTitle.textContent = item.title || "Loading title…";
      nowSub.textContent = SOURCE_LABEL[src];
      videoInfo(item.videoId).then(function (info) {
        if (queue[qIndex] !== item) return;
        if (!item.title && info.title) item.title = info.title;
        nowTitle.textContent = item.title || info.title || SOURCE_LABEL[src] + " video";
        nowSub.textContent = SOURCE_LABEL[src] + (info.author ? " · " + info.author : "");
        drawQueue();
      });
      remember(item);
      drawNowActs();
      drawQueue();
    }

    function playSingle(videoId, start) {
      queue = [{ videoId: videoId, title: "" }];
      queueName = "";
      playAt(0, start);
      stage.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function playList(items, name, startIndex, shuffle) {
      if (!items.length) { UI.toast("This playlist is empty"); return; }
      queue = (shuffle ? shuffled(items) : items.slice()).map(function (it) {
        return { videoId: it.videoId, title: it.title || "" };
      });
      queueName = name || "";
      playAt(shuffle ? 0 : (startIndex || 0));
      stage.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function next() {
      if (qIndex + 1 < queue.length) playAt(qIndex + 1);
      else if (loop && queue.length) playAt(0);
    }
    function prev() { if (qIndex > 0) playAt(qIndex - 1); }

    /* The embed reports state over postMessage once we say we're listening. */
    player.addEventListener("load", function () {
      try {
        player.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
      } catch (e) { /* cross-origin frame gone */ }
    });
    window.addEventListener("message", function (e) {
      if (e.source !== player.contentWindow) return;
      var yt = YT_ORIGINS.indexOf(e.origin) !== -1;
      var tt = TT_ORIGINS.indexOf(e.origin) !== -1;
      if (!yt && !tt) return;
      var d;
      try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (err) { return; }
      if (!d) return;
      /* TikTok's player/v1 posts {type:"onStateChange", value:0} when a video ends. */
      var ended = yt
        ? ((d.event === "onStateChange" && d.info === 0) ||
           (d.event === "infoDelivery" && d.info && d.info.playerState === 0))
        : (d["x-tiktok-player"] && d.type === "onStateChange" && d.value === 0);
      if (ended && !player.dataset.ended) {
        player.dataset.ended = "1";
        window.setTimeout(function () { delete player.dataset.ended; next(); }, 600);
      }
    });

    function smallBtn(label, iconName, onClick, cls) {
      var b = el("button", "btn btn-sm" + (cls ? " " + cls : ""));
      b.type = "button";
      if (iconName) b.appendChild(UI.icon(iconName));
      b.appendChild(el("span", null, label));
      b.addEventListener("click", onClick);
      return b;
    }

    function drawNowActs() {
      nowActs.innerHTML = "";
      var item = queue[qIndex];
      if (!item) return;
      nowActs.appendChild(smallBtn("Save", "plus", function () { saveToPlaylist(item); }, "btn-cta"));
      var share = smallBtn("Copy link", "copy", function () {
        var link = linkFor(item.videoId);
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
          .then(function () { UI.toast("Link copied"); })
          .catch(function () { window.prompt("Copy this link:", link); });
      });
      nowActs.appendChild(share);
      var open = el("a", "btn btn-sm btn-flat");
      open.href = linkFor(item.videoId);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.appendChild(UI.icon("popout"));
      open.appendChild(el("span", null, "Open on " + SOURCE_LABEL[sourceOf(item.videoId)]));
      nowActs.appendChild(open);
      if (window.ChatCore && Session.user) {
        nowActs.appendChild(smallBtn("Send to a friend", "send", function () { sendToFriend(item); }));
      }
    }

    function drawQueue() {
      queueHost.innerHTML = "";
      queueHost.hidden = queue.length < 2;
      stage.classList.toggle("has-queue", queue.length > 1);
      if (queue.length < 2) return;

      var head = el("div", "cp-queue-head");
      var t = el("div", "cp-queue-title");
      t.appendChild(el("strong", null, queueName || "Up next"));
      t.appendChild(el("span", "dim", (qIndex + 1) + " / " + queue.length));
      head.appendChild(t);
      var ctl = el("div", "cp-queue-ctl");
      var pb = smallIcon("back", "Previous", prev);
      pb.disabled = qIndex <= 0;
      var nb = smallIcon("arrowDown", "Next", next);
      nb.classList.add("is-next");
      nb.disabled = qIndex >= queue.length - 1 && !loop;
      var lb = smallIcon("retry", loop ? "Repeat is on" : "Repeat is off", function () {
        loop = !loop;
        drawQueue();
      });
      lb.setAttribute("aria-pressed", loop ? "true" : "false");
      ctl.appendChild(pb);
      ctl.appendChild(nb);
      ctl.appendChild(lb);
      head.appendChild(ctl);
      queueHost.appendChild(head);

      var list = el("ol", "cp-queue-list");
      queue.forEach(function (item, i) {
        var li = el("li");
        var b = el("button", "cp-qitem" + (i === qIndex ? " is-now" : ""));
        b.type = "button";
        if (i === qIndex) b.setAttribute("aria-current", "true");
        var img = thumb(item.videoId);
        var art = el("span", "cp-qitem-art");
        art.appendChild(img);
        art.appendChild(sourceBadge(item.videoId));
        b.appendChild(art);
        var name = el("span", "cp-qitem-title", item.title || "…");
        if (!item.title) {
          videoInfo(item.videoId).then(function (info) {
            if (info.title) { item.title = info.title; name.textContent = info.title; }
            else name.textContent = SOURCE_LABEL[sourceOf(item.videoId)] + " video";
          });
        }
        b.appendChild(name);
        b.addEventListener("click", function () { playAt(i); });
        li.appendChild(b);
        list.appendChild(li);
      });
      queueHost.appendChild(list);
      var now = list.querySelector(".is-now");
      if (now && now.scrollIntoView) now.scrollIntoView({ block: "nearest" });
    }

    function smallIcon(name, label, fn) {
      var b = el("button", "chat-icon-btn");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.appendChild(UI.icon(name));
      b.addEventListener("click", fn);
      return b;
    }

    /* ------------------------------------------------------- paste bar */

    var SUPPORTED_HINT = "Paste a YouTube, TikTok or Instagram link.";
    function checkUrl() {
      var raw = urlInput.value.trim();
      var id = extractVideoId(raw);
      var maybe = !id && isTikTokShort(raw);
      var bad = !!(raw && !id && !maybe);
      urlNote.textContent = bad ? "That doesn't look like a YouTube, TikTok or Instagram link yet." :
        maybe ? "TikTok share link — press Play to open it." : "";
      urlNote.classList.toggle("is-bad", bad);
      return id;
    }
    function playFromInput() {
      var raw = urlInput.value;
      if (!raw.trim()) { UI.toast(SUPPORTED_HINT); urlInput.focus(); return; }
      if (isTikTokShort(raw) && !extractVideoId(raw)) urlNote.textContent = "Opening TikTok link…";
      resolveMedia(raw).then(function (key) {
        if (!key) {
          urlNote.textContent = isTikTokShort(raw)
            ? "Couldn't open that TikTok share link. Open it, then copy the full link from the address bar."
            : "That doesn't look like a YouTube, TikTok or Instagram link yet.";
          urlNote.classList.add("is-bad");
          return;
        }
        urlNote.textContent = "";
        urlNote.classList.remove("is-bad");
        playSingle(key, sourceOf(key) === "youtube" ? extractStart(raw) : 0);
        urlInput.select();
      });
    }
    urlInput.addEventListener("input", checkUrl);
    /* Pasting a link plays it straight away — the whole point of the page. */
    urlInput.addEventListener("paste", function () {
      window.setTimeout(function () {
        var raw = urlInput.value.trim();
        checkUrl();
        if (extractVideoId(raw) || isTikTokShort(raw)) playFromInput();
      }, 0);
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      playFromInput();
    });

    /* ------------------------------------------------------- history */

    function remember(item) {
      var list = readJSON(HISTORY_KEY, []).filter(function (h) { return h.videoId !== item.videoId; });
      list.unshift({ videoId: item.videoId, title: item.title || "", at: Date.now() });
      writeJSON(HISTORY_KEY, list.slice(0, 40));
      if (tab === "history") drawLibrary();
    }

    /* ---------------------------------------------------- saving */

    function saveToPlaylist(item) {
      if (!Session.user) { UI.toast("Sign in to save playlists"); return; }
      var D = dialogs();
      API.myPlaylists().then(function (lists) {
        var s = D.sheet("Save to playlist");
        var box = el("div", "cp-save-list");
        function add(list) {
          s.close();
          videoInfo(item.videoId).then(function (info) {
            return API.addPlaylistItem(list.id, item.videoId, item.title || info.title || "");
          }).then(function () {
            UI.toast("Saved to " + list.title);
            if (tab === "mine") drawLibrary();
          }).catch(function (err) {
            var msg = (err && err.message) || "Couldn't save that";
            /* A database that predates TikTok/Instagram support still only
               takes YouTube ids; say what's going on instead of "invalid link". */
            if (sourceOf(item.videoId) !== "youtube" && /youtube/i.test(msg)) {
              msg = "Saving " + SOURCE_LABEL[sourceOf(item.videoId)] + " videos needs a quick database update. Ask staff to run supabase/2026-10-16-campus-plus-sources.sql.";
            }
            UI.toast(msg, 5000);
          });
        }
        (lists || []).forEach(function (list) {
          var b = el("button", "cp-save-row");
          b.type = "button";
          var art = el("span", "cp-save-art");
          art.appendChild(UI.icon("image"));
          b.appendChild(art);
          var t = el("span", "cp-save-names");
          t.appendChild(el("strong", null, list.title));
          t.appendChild(el("span", "dim", (list.itemCount || 0) + " videos · " + (list.isPublic ? "Shared" : "Private")));
          b.appendChild(t);
          b.addEventListener("click", function () { add(list); });
          box.appendChild(b);
        });
        if (!lists || !lists.length) box.appendChild(el("p", "dim", "You don't have any playlists yet."));
        s.body.appendChild(box);
        var mk = el("button", "btn btn-cta cp-save-new");
        mk.type = "button";
        mk.appendChild(UI.icon("plus"));
        mk.appendChild(el("span", null, "New playlist"));
        mk.addEventListener("click", function () {
          s.close();
          newPlaylist().then(function (created) { if (created) add(created); });
        });
        s.body.appendChild(mk);
      }).catch(function (err) { UI.toast(err.message); });
    }

    function sendToFriend(item) {
      if (!window.ChatCore) return;
      window.ChatCore.pickFriends({ title: "Send to a friend", single: true }).then(function (pick) {
        if (!pick) return;
        var name = pick.usernames[0];
        return API.openThread(name).then(function (res) {
          var text = (item.title ? item.title + " — " : "") + linkFor(item.videoId);
          return API.send(res.threadId, text, null).then(function () {
            if (window.Realtime && window.Realtime.broadcast) {
              window.Realtime.broadcast("realtime:thread:" + res.threadId, "msg", {});
            }
            UI.toast("Sent to @" + name);
          });
        });
      }).catch(function (err) { UI.toast(err.message || "Couldn't send that"); });
    }

    /* Resolves the created playlist ({id,title,...}) or null. */
    function newPlaylist() {
      if (!Session.user) { UI.toast("Sign in to make a playlist"); return Promise.resolve(null); }
      var D = dialogs();
      return D.ask({ title: "New playlist", placeholder: "Playlist name", maxLength: 80, confirmLabel: "Create" })
        .then(function (title) {
          if (!title) return null;
          return D.confirm({
            title: "Share “" + title + "”?",
            body: "Shared playlists show up for everyone on Campus+. You can change this any time.",
            confirmLabel: "Share it"
          }).then(function (share) {
            return API.createPlaylist(title, "", share);
          }).then(function (row) {
            UI.toast("Playlist created");
            if (tab === "mine") drawLibrary();
            return row && row.id ? row : null;
          });
        }).catch(function (err) { UI.toast(err.message); return null; });
    }
    document.getElementById("cp-new").addEventListener("click", function () { newPlaylist(); });

    /* ---------------------------------------------------- library */

    tabs.forEach(function (b) {
      b.addEventListener("click", function () {
        tab = b.dataset.tab;
        tabs.forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
        detail.hidden = true;
        library.hidden = false;
        drawLibrary();
      });
    });

    function card(opts) {
      var c = el("button", "cp-card");
      c.type = "button";
      var art = el("span", "cp-card-art");
      if (opts.videoId) {
        var img = thumb(opts.videoId);
        art.appendChild(img);
      } else {
        art.classList.add("is-empty");
        art.appendChild(UI.icon("video"));
      }
      if (opts.badge) art.appendChild(el("span", "cp-card-badge", opts.badge));
      if (opts.videoId && opts.source) art.appendChild(sourceBadge(opts.videoId));
      c.appendChild(art);
      var t = el("span", "cp-card-title", opts.title || "…");
      c.appendChild(t);
      if (opts.sub) c.appendChild(el("span", "cp-card-sub", opts.sub));
      c.addEventListener("click", opts.onClick);
      return { el: c, title: t };
    }

    function empty(title, body, action) {
      var box = el("div", "cp-empty");
      box.appendChild(el("strong", null, title));
      box.appendChild(el("p", null, body));
      if (action) box.appendChild(action);
      return box;
    }

    var drawSeq = 0;
    function drawLibrary() {
      var my = ++drawSeq;
      publicSearch.hidden = tab !== "shared";
      library.innerHTML = "";
      library.setAttribute("aria-busy", "true");

      if (tab === "history") {
        library.removeAttribute("aria-busy");
        var hist = readJSON(HISTORY_KEY, []);
        if (!hist.length) {
          library.appendChild(empty("Nothing watched yet", "Videos you play show up here, on this device."));
          return;
        }
        hist.forEach(function (h, i) {
          var cd = card({
            videoId: h.videoId, title: h.title || "…", source: true,
            sub: UI.formatWhen(h.at),
            onClick: function () { playList(hist, "Recently watched", i); }
          });
          if (!h.title) videoInfo(h.videoId).then(function (info) { cd.title.textContent = info.title || SOURCE_LABEL[sourceOf(h.videoId)] + " video"; });
          library.appendChild(cd.el);
        });
        var clear = el("button", "btn btn-sm btn-flat cp-clear", "Clear history");
        clear.type = "button";
        clear.addEventListener("click", function () { writeJSON(HISTORY_KEY, []); drawLibrary(); });
        library.appendChild(clear);
        return;
      }

      var load = tab === "mine" ? API.myPlaylists() : API.publicPlaylists(publicQ.value.trim());
      load.then(function (lists) {
        if (my !== drawSeq) return;
        library.removeAttribute("aria-busy");
        lists = lists || [];
        if (!lists.length) {
          if (tab === "mine") {
            var mk = el("button", "btn btn-cta", "Make your first playlist");
            mk.type = "button";
            mk.addEventListener("click", function () { newPlaylist(); });
            library.appendChild(empty("No playlists yet", "Play something, hit Save, and it lands in a playlist.", mk));
          } else {
            library.appendChild(empty(publicQ.value.trim() ? "No matches" : "Nothing shared yet",
              publicQ.value.trim() ? "Try another search." : "Share one of yours and it shows up here for everyone."));
          }
          return;
        }
        lists.forEach(function (p) {
          var cd = card({
            videoId: p.cover || "",
            title: p.title,
            sub: (p.itemCount || 0) + (p.itemCount === 1 ? " video" : " videos") +
                 (tab === "mine" ? " · " + (p.isPublic ? "Shared" : "Private") : " · @" + p.ownerUsername),
            badge: p.itemCount ? String(p.itemCount) : "",
            onClick: function () { openDetail(p.id); }
          });
          library.appendChild(cd.el);
          /* Cover art: the playlist's first video. */
          if (p.itemCount && p.cover === undefined) {
            API.playlistDetail(p.id).then(function (d) {
              var first = d && d.items && d.items[0];
              if (!first) return;
              var art = cd.el.querySelector(".cp-card-art");
              art.classList.remove("is-empty");
              var old = art.querySelector(".svg-ico");
              if (old) old.remove();
              var img = thumb(first.videoId);
              art.insertBefore(img, art.firstChild);
            }).catch(function () {});
          }
        });
      }).catch(function (err) {
        if (my !== drawSeq) return;
        library.removeAttribute("aria-busy");
        var retry = el("button", "btn btn-sm", "Try again");
        retry.type = "button";
        retry.addEventListener("click", drawLibrary);
        library.appendChild(empty("Couldn't load playlists", (err && err.message) || "Check your connection.", retry));
      });
    }

    publicQ.addEventListener("input", UI.debounce(drawLibrary, 250));

    /* ---------------------------------------------------- playlist view */

    function openDetail(id) {
      API.playlistDetail(id).then(function (p) {
        library.hidden = true;
        publicSearch.hidden = true;
        detail.hidden = false;
        detail.innerHTML = "";
        var D = dialogs();

        var back = el("button", "btn btn-sm btn-flat cp-back");
        back.type = "button";
        back.appendChild(UI.icon("back"));
        back.appendChild(el("span", null, "All playlists"));
        back.addEventListener("click", function () {
          detail.hidden = true;
          library.hidden = false;
          drawLibrary();
        });
        detail.appendChild(back);

        var head = el("div", "cp-detail-head");
        var art = el("span", "cp-detail-art");
        if (p.items[0]) {
          var img = thumb(p.items[0].videoId);
          art.appendChild(img);
        } else {
          art.classList.add("is-empty");
          art.appendChild(UI.icon("video"));
        }
        head.appendChild(art);
        var info = el("div", "cp-detail-info");
        info.appendChild(el("span", "label", p.isPublic ? "Shared playlist" : "Private playlist"));
        var h = el("h2", null, p.title);
        h.id = "detail-h";
        info.appendChild(h);
        info.appendChild(el("p", "dim", (p.mine ? "Yours" : "By @" + p.ownerUsername) + " · " +
          p.items.length + (p.items.length === 1 ? " video" : " videos") +
          (p.description ? " — " + p.description : "")));
        var acts = el("div", "btn-row");
        var playAll = smallBtn("Play all", "video", function () { playList(p.items, p.title, 0); }, "btn-cta");
        playAll.disabled = !p.items.length;
        acts.appendChild(playAll);
        var shuf = smallBtn("Shuffle", "retry", function () { playList(p.items, p.title, 0, true); });
        shuf.disabled = p.items.length < 2;
        acts.appendChild(shuf);
        if (p.mine) {
          acts.appendChild(smallBtn("Rename", "edit", function () {
            D.ask({ title: "Rename playlist", value: p.title, maxLength: 80, confirmLabel: "Rename" }).then(function (t) {
              if (!t) return;
              API.updatePlaylist(id, { title: t }).then(function () { UI.toast("Renamed"); openDetail(id); })
                .catch(function (err) { UI.toast(err.message); });
            });
          }));
          acts.appendChild(smallBtn(p.isPublic ? "Make private" : "Share", p.isPublic ? "block" : "group", function () {
            API.updatePlaylist(id, { isPublic: !p.isPublic }).then(function () {
              UI.toast(p.isPublic ? "Now private" : "Shared with everyone");
              openDetail(id);
            }).catch(function (err) { UI.toast(err.message); });
          }));
          acts.appendChild(smallBtn("Delete", "trash", function () {
            D.confirm({
              title: "Delete “" + p.title + "”?",
              body: "The playlist and its list of videos are removed. This can't be undone.",
              confirmLabel: "Delete", danger: true
            }).then(function (yes) {
              if (!yes) return;
              API.deletePlaylist(id).then(function () {
                UI.toast("Deleted");
                detail.hidden = true;
                library.hidden = false;
                drawLibrary();
              }).catch(function (err) { UI.toast(err.message); });
            });
          }, "btn-danger"));
        }
        info.appendChild(acts);
        head.appendChild(info);
        detail.appendChild(head);

        if (!p.items.length) {
          detail.appendChild(empty("Nothing in here yet",
            p.mine ? "Paste a link above, play it, then hit Save." : "The owner hasn't added anything yet."));
          return;
        }

        var list = el("ol", "cp-items");
        p.items.forEach(function (item, i) {
          var li = el("li", "cp-item");
          li.appendChild(el("span", "cp-item-n", String(i + 1)));
          var main = el("button", "cp-item-main");
          main.type = "button";
          var th = thumb(item.videoId);
          var thBox = el("span", "cp-item-art");
          thBox.appendChild(th);
          thBox.appendChild(sourceBadge(item.videoId));
          main.appendChild(thBox);
          var tt = el("span", "cp-item-title", item.title || "…");
          if (!item.title) {
            videoInfo(item.videoId).then(function (vi) {
              item.title = vi.title;
              tt.textContent = vi.title || SOURCE_LABEL[sourceOf(item.videoId)] + " video";
            });
          }
          main.appendChild(tt);
          main.addEventListener("click", function () { playList(p.items, p.title, i); });
          li.appendChild(main);

          if (p.mine) {
            var tools = el("span", "cp-item-tools");
            var up = smallIcon("back", "Move up", function () { move(item, i - 1); });
            up.classList.add("is-up");
            up.disabled = i === 0;
            var down = smallIcon("back", "Move down", function () { move(item, i + 1); });
            down.classList.add("is-down");
            down.disabled = i === p.items.length - 1;
            var rm = smallIcon("trash", "Remove from playlist", function () {
              API.removePlaylistItem(item.id).then(function () { openDetail(id); })
                .catch(function (err) { UI.toast(err.message); });
            });
            tools.appendChild(up);
            tools.appendChild(down);
            tools.appendChild(rm);
            li.appendChild(tools);
          }
          list.appendChild(li);
        });
        detail.appendChild(list);

        function move(item, to) {
          if (to < 0 || to >= p.items.length) return;
          API.reorderPlaylistItem(item.id, to).then(function () { openDetail(id); })
            .catch(function (err) { UI.toast(err.message); });
        }

        detail.scrollIntoView({ behavior: "smooth", block: "start" });
      }).catch(function (err) { UI.toast(err.message); });
    }

    /* ------------------------------------------------------------- boot */

    /* Members-only, granted per account by staff (staff always have it).
       The database enforces this too; this just explains it. */
    function applyGate(user) {
      var tools = document.getElementById("cp-tools");
      var locked = document.getElementById("cp-locked");
      var lockedMsg = document.getElementById("cp-locked-msg");
      var cta = document.getElementById("cp-locked-cta");
      var isStaff = Session && Session.isStaff && Session.isStaff();
      var member = !!(user && (user.isPlus || isStaff));
      tools.hidden = !member;
      locked.hidden = member;
      if (!member) {
        lockedMsg.textContent = user
          ? "Campus+ lets you watch YouTube, TikTok and Instagram videos and build playlists right here. It's a members feature — ask a staff member to turn it on for your account."
          : "Campus+ lets you watch YouTube, TikTok and Instagram videos and build playlists right here. Sign in first, then ask a staff member to turn it on for your account.";
        cta.hidden = !!user;
      }
      return member;
    }

    function showMembership(user) {
      var m = document.getElementById("cp-membership");
      if (!user || !user.isPlus) { m.hidden = true; return; }
      m.hidden = false;
      m.textContent = "Campus+ member · up to 50 playlists, 500 videos each";
    }

    var booted = false;
    function refresh() {
      var user = Session.user;
      var allowed = applyGate(user);
      showMembership(user);
      if (!allowed) return;
      drawLibrary();
      if (booted) return;
      booted = true;
      /* ?v=<id> or ?url=<link> deep-links straight into playback. */
      var params = UI.params();
      var deep = params.get("v") || params.get("url") || "";
      if (deep) resolveMedia(deep).then(function (v) {
        if (v) playSingle(v, sourceOf(v) === "youtube" ? extractStart(params.get("url") || "") : 0);
      });
      var pl = Number(params.get("playlist"));
      if (pl) openDetail(pl);
    }

    Session.ready.then(refresh);
    document.addEventListener("session:change", refresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
