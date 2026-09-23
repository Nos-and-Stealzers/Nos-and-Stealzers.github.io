/* Voice, video and screen sharing.
 *
 * The audio and video go straight from one browser to the other over WebRTC.
 * The hub's server only carries the setup handshake, and the addresses come
 * from Google's public STUN servers, which are free. Nothing here costs
 * anything to run and nothing here needs an external service.
 *
 * Everyone connects to everyone else — a mesh — so each extra person costs
 * every participant another upload stream. That's fine up to about four, and
 * the server enforces the same ceiling. Past that you need a relay server
 * that forwards video, and that is the part nobody gives away.
 *
 * One honest limitation: a peer connection belongs to the page that opened
 * it, so navigating away ends your call. Playing a game doesn't — the game
 * runs in an iframe inside the same page — which is the case that matters.
 */
(function () {
  "use strict";

  var RING_POLL = 6000;      // watching for incoming calls
  var LIVE_POLL = 1500;      // in a call, exchanging handshake messages
  var el;

  var state = {
    call: null,          // the active call, from the server
    self: 0,             // my user id
    ice: null,           // ICE server list
    local: null,         // my MediaStream
    screen: null,        // display capture, when sharing
    peers: {},           // userId -> { pc, stream, el }
    muted: false,
    camOff: true,
    timer: null,
    ringTimer: null,
    ringing: null,       // an incoming call awaiting an answer
    startedAt: 0
  };

  var root, bar, tiles, statusEl, timerEl, ringEl;
  /* Realtime pokes and the fallback interval can fire together. `take_signals`
     consumes rows, so overlapping calls from one tab used to hammer Postgres
     with concurrent DELETEs and trigger 40P01 deadlocks. Keep exactly one poll
     in flight; remember one follow-up instead of launching another request. */
  var pumpBusy = false;
  var pumpQueued = false;

  function can() {
    return !!(navigator.mediaDevices && window.RTCPeerConnection);
  }

  /* ---------------------------------------------------------------- UI */

  function build() {
    el = window.UI.el;

    root = el("div", "callroot");
    root.hidden = true;

    /* --- incoming call card --- */
    ringEl = el("div", "ring");
    ringEl.hidden = true;
    ringEl.setAttribute("role", "alertdialog");
    ringEl.setAttribute("aria-label", "Incoming call");
    root.appendChild(ringEl);

    /* --- the live call panel ---
       Compact by default: a slim pill showing who/status, mute and end. The
       expand toggle reveals the video tiles and the secondary controls, so a
       plain voice call takes almost no room. */
    bar = el("div", "callbar");
    bar.hidden = true;

    var head = el("div", "callbar-head");
    var textWrap = el("div", "callbar-headtext");
    statusEl = el("span", "callbar-status", "Connecting…");
    textWrap.appendChild(statusEl);
    timerEl = el("span", "callbar-timer", "0:00");
    textWrap.appendChild(timerEl);
    head.appendChild(textWrap);

    var toggle = el("button", "callbar-btn callbar-toggle");
    toggle.type = "button";
    toggle.title = "Expand call";
    toggle.setAttribute("aria-label", "Expand call");
    toggle.appendChild(window.UI.icon("expand", "callbar-toggle-ico"));
    toggle.addEventListener("click", function () {
      var open = bar.classList.toggle("is-expanded");
      toggle.title = open ? "Collapse" : "Expand call";
      toggle.setAttribute("aria-label", toggle.title);
    });
    head.appendChild(toggle);
    bar.appendChild(head);

    tiles = el("div", "calltiles");
    bar.appendChild(tiles);

    /* Two button tiers. Primary (mute, end) always shows — even collapsed.
       Secondary (camera, screen, fullscreen) only appears once expanded. */
    var deck = el("div", "callbar-deck");
    [
      ["mute",   "mic",    "Mute",   toggleMute,   "primary"],
      ["cam",    "camera", "Camera", toggleCam,    "secondary"],
      ["screen", "screen", "Share",  toggleScreen, "secondary"],
      ["full",   "expand", "Full",   function () { root.classList.toggle("is-big"); }, "secondary"]
    ].forEach(function (spec) {
      var b = el("button", "callbtn callbtn-" + spec[4]);
      b.type = "button";
      b.dataset.act = spec[0];
      b.dataset.icon = spec[1];
      b.title = spec[2];
      b.setAttribute("aria-label", spec[2]);
      b.appendChild(window.UI.icon(spec[1], "callbtn-ico"));
      b.appendChild(el("span", "callbtn-lbl", spec[2]));
      b.addEventListener("click", function () { spec[3](); });
      deck.appendChild(b);
    });

    var end = el("button", "callbtn callbtn-primary is-end");
    end.type = "button";
    end.title = "Leave the call";
    end.setAttribute("aria-label", "Leave the call");
    end.appendChild(window.UI.icon("hangup", "callbtn-ico"));
    end.appendChild(el("span", "callbtn-lbl", "End"));
    end.addEventListener("click", function () { hangUp(); });
    deck.appendChild(end);

    bar.appendChild(deck);
    root.appendChild(bar);
    document.body.appendChild(root);
  }

  /* Open the tile view automatically the first time real video shows up, so a
     video call isn't hidden behind the compact pill — but leave a voice call
     collapsed. Only auto-expands once; the user's manual toggle wins after. */
  function autoExpandForVideo() {
    if (!bar || bar._autoExpanded) return;
    bar._autoExpanded = true;
    bar.classList.add("is-expanded");
    var toggle = bar.querySelector(".callbar-toggle");
    if (toggle) { toggle.title = "Collapse"; toggle.setAttribute("aria-label", "Collapse"); }
  }

  function status(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function clock() {
    if (!timerEl || !state.startedAt) return;
    var s = Math.floor((Date.now() - state.startedAt) / 1000);
    timerEl.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* Each participant gets a tile. Audio-only peers still get one so you can
     see who is actually connected — a black rectangle is worse than a name. */
  function tileFor(userId, label) {
    var peer = state.peers[userId];
    if (peer && peer.el && peer.el.isConnected) return peer.el;

    /* Self isn't tracked in state.peers, and a reconnecting peer may have lost
       its entry, so also reuse any tile already in the DOM for this id. Without
       this, toggling camera / screen share (which each call tileFor again) kept
       stamping out a fresh duplicate tile for the same person. */
    var existing = tiles.querySelector('[data-peer="' + String(userId) + '"]');
    if (existing) {
      if (peer) peer.el = existing;
      return existing;
    }

    var tile = el("div", "calltile");
    tile.dataset.peer = String(userId);

    var video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");        // iOS Safari needs the attribute
    video.setAttribute("autoplay", "");
    video.muted = userId === state.self;    // never hear yourself
    tile.appendChild(video);

    /* Dedicated audio sink for REMOTE peers. The video tile is display:none
       whenever there's no live video (every voice call, and video calls with
       the camera off), and browsers won't autoplay a hidden <video> — so the
       audio rode on an element that never started and you heard nothing. A
       separate always-present <audio autoplay> guarantees the voice comes
       through regardless of whether the video tile is shown. */
    if (userId !== state.self) {
      var audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("autoplay", "");
      tile.appendChild(audio);
      tile._audio = audio;
    }

    var face = el("div", "calltile-face");
    face.appendChild(faceAvatar(userId, label));
    tile.appendChild(face);

    var name = el("span", "calltile-name", label || "…");
    tile.appendChild(name);

    tile._video = video;
    tiles.appendChild(tile);
    return tile;
  }

  /* Start playback and swallow the autoplay-policy rejection. Browsers block
     autoplay of media that isn't muted until a user gesture; the Call/Answer
     click IS that gesture, but media often arrives a beat later, so we also
     retry on the next pointer/keydown as a safety net. */
  var _pendingPlays = [];
  function playMedia(elm) {
    if (!elm) return;
    var p = elm.play && elm.play();
    if (p && p.catch) {
      p.catch(function () {
        if (_pendingPlays.indexOf(elm) === -1) _pendingPlays.push(elm);
        armGesturePlay();
      });
    }
  }
  var _gestureArmed = false;
  function armGesturePlay() {
    if (_gestureArmed) return;
    _gestureArmed = true;
    var retry = function () {
      _pendingPlays.splice(0).forEach(function (elm) {
        try { var q = elm.play(); if (q && q.catch) q.catch(function () {}); } catch (e) {}
      });
      _gestureArmed = false;
      document.removeEventListener("pointerdown", retry, true);
      document.removeEventListener("keydown", retry, true);
    };
    document.addEventListener("pointerdown", retry, true);
    document.addEventListener("keydown", retry, true);
  }

  /* A tile shows the video element only when a live video track exists;
     otherwise it falls back to the avatar.

     A remote track arrives `muted` and stays that way until the first frame
     decodes, which is well after the `track` event. Checking once meant every
     remote camera showed an avatar over a perfectly good video element, so
     the track is watched as well as read. */
  function refreshTile(tile, stream) {
    if (!tile) return;
    var tracks = stream ? stream.getVideoTracks() : [];
    var live = tracks.some(function (t) {
      return t.readyState === "live" && !t.muted;
    });
    tile.classList.toggle("has-video", !!live);
    /* Real video is worth showing — pop the tile view open the first time it
       appears on a call that started collapsed (a voice call turning to video,
       or a screen share). */
    if (live && tile.dataset.peer !== String(state.self)) autoExpandForVideo();

    tracks.forEach(function (t) {
      if (t._watched) return;
      t._watched = true;
      ["unmute", "mute", "ended"].forEach(function (name) {
        t.addEventListener(name, function () { refreshTile(tile, stream); });
      });
    });
  }

  /* ------------------------------------------------------------ ringtone */

  /* Synthesised rather than a file: the site ships no audio assets and a
     silent card in the corner is easy to miss, especially mid-game. Two
     short tones, repeating, at a volume that does not make you jump. */
  var ring = { ctx: null, timer: null };

  function startRinging() {
    if (ring.timer) return;

    function blip() {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!ring.ctx) ring.ctx = new Ctx();
        if (ring.ctx.state === "suspended") ring.ctx.resume();

        [0, 0.42].forEach(function (offset) {
          var at = ring.ctx.currentTime + offset;
          var osc = ring.ctx.createOscillator();
          var gain = ring.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(offset ? 660 : 880, at);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.06, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
          osc.connect(gain).connect(ring.ctx.destination);
          osc.start(at);
          osc.stop(at + 0.34);
        });
      } catch (err) { stopRinging(); }
    }

    blip();
    ring.timer = window.setInterval(blip, 2600);
  }

  function stopRinging() {
    window.clearInterval(ring.timer);
    ring.timer = null;
  }

  function nameOf(id) {
    var peers = (state.call && state.call.peers) || [];
    for (var i = 0; i < peers.length; i++) {
      if (peers[i].id === id) return peers[i].displayName || peers[i].username;
    }
    return "Someone";
  }

  /* The roster row for a user id, so tiles and ring cards can show the real
     profile picture (avatarUrl) instead of only an identicon. */
  function peerOf(id) {
    var peers = (state.call && state.call.peers) || [];
    for (var i = 0; i < peers.length; i++) {
      if (peers[i].id === id) return peers[i];
    }
    return null;
  }

  /* Prefer SocialUI.avatar (renders the uploaded picture, falling back to an
     identicon) when we have a roster row; otherwise fall back to a bare
     identicon from whatever label we have. */
  function avatarFor(id, label) {
    var peer = peerOf(id);
    if (peer && window.SocialUI && window.SocialUI.avatar) {
      return window.SocialUI.avatar({
        username: peer.username, avatarUrl: peer.avatarUrl, online: true
      });
    }
    return window.Art.avatar(label || (peer && peer.username) || String(id));
  }

  /* Tile avatar, including "You": self isn't in the call roster, so pull the
     signed-in user's own picture from the session. */
  function faceAvatar(id, label) {
    if (id === state.self) {
      var me = window.Session && window.Session.user;
      if (me && window.SocialUI && window.SocialUI.avatar) {
        return window.SocialUI.avatar({ username: me.username, avatarUrl: me.avatarUrl, online: true });
      }
      return window.Art.avatar((me && me.username) || label || "You");
    }
    return avatarFor(id, label);
  }

  /* --------------------------------------------------------- own media */

  /* Audio first, always. A call that fails because a camera is missing when
     nobody asked for video is a bad trade. */
  function getLocal(wantVideo) {
    if (state.local && (!wantVideo || !state.camOff)) return Promise.resolve(state.local);

    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: wantVideo ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { max: 24 } } : false
    }).then(function (stream) {
      state.local = stream;
      state.camOff = !wantVideo;
      var tile = tileFor(state.self, "You");
      tile._video.srcObject = stream;
      playMedia(tile._video);
      refreshTile(tile, stream);
      return stream;
    }).catch(function (err) {
      /* If video was the problem, fall back to audio rather than failing. */
      if (wantVideo) return getLocal(false);
      throw new Error(err && err.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow it in the address bar, then try again."
        : "No microphone available.");
    });
  }

  function toggleMute() {
    if (!state.local) return;
    state.muted = !state.muted;
    state.local.getAudioTracks().forEach(function (t) { t.enabled = !state.muted; });
    mark("mute", state.muted);
    status(state.muted ? "Muted" : "In a call");
  }

  function toggleCam() {
    if (!state.local) return;
    var tracks = state.local.getVideoTracks();

    if (tracks.length) {
      state.camOff = !state.camOff;
      tracks.forEach(function (t) { t.enabled = !state.camOff; });
      mark("cam", !state.camOff);
      refreshTile(tileFor(state.self, "You"), state.camOff ? null : state.local);
      return;
    }

    /* Started audio-only: acquire a camera now and push it to every peer. */
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } } })
      .then(function (cam) {
        var track = cam.getVideoTracks()[0];
        state.local.addTrack(track);
        state.camOff = false;
        mark("cam", true);
        publishVideo(track);
        var tile = tileFor(state.self, "You");
        tile._video.srcObject = state.local;
        playMedia(tile._video);
        refreshTile(tile, state.local);
      })
      .catch(function () { window.UI.toast("No camera available."); });
  }

  /* Screen sharing swaps the outgoing video track rather than adding a second
     one, so peers don't have to renegotiate to see it. */
  function toggleScreen() {
    if (state.screen) return stopScreen();

    if (!navigator.mediaDevices.getDisplayMedia) {
      window.UI.toast("This browser can't share a screen.");
      return;
    }

    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { max: 15 } }, audio: false })
      .then(function (stream) {
        state.screen = stream;
        var track = stream.getVideoTracks()[0];
        /* The browser's own "Stop sharing" bar bypasses our button. */
        track.addEventListener("ended", stopScreen);
        publishVideo(track);
        mark("screen", true);

        var tile = tileFor(state.self, "You");
        tile._video.srcObject = stream;
        playMedia(tile._video);
        tile.classList.add("has-video", "is-screen");
      })
      .catch(function (err) {
        if (err && err.name === "NotAllowedError") return;   // they cancelled
        window.UI.toast("Screen sharing failed.");
      });
  }

  function stopScreen() {
    if (!state.screen) return;
    state.screen.getTracks().forEach(function (t) { t.stop(); });
    state.screen = null;
    mark("screen", false);

    var cam = state.local ? state.local.getVideoTracks()[0] : null;
    publishVideo(cam || null);

    var tile = tileFor(state.self, "You");
    tile.classList.remove("is-screen");
    tile._video.srcObject = state.local;
    refreshTile(tile, state.camOff ? null : state.local);
  }

  /* Point every peer's video sender at `track`. Passing null blanks it
     without tearing the connection down. */
  function publishVideo(track) {
    Object.keys(state.peers).forEach(function (id) {
      var pc = state.peers[id].pc;
      if (!pc) return;

      /* Find the video sender via TRANSCEIVERS, not by current track. On an
         audio-only call the pre-negotiated video sender has track === null, so
         filtering senders by "s.track.kind === video" found nothing and we fell
         through to addTrack() — which creates a SECOND video m-line and forces a
         renegotiation this simple signaller doesn't do, leaving remote video
         permanently black. Reusing the existing sender is a plain replaceTrack,
         no renegotiation, and the frames flow. */
      var sender = null;
      var chosen = null;
      var txs = pc.getTransceivers ? pc.getTransceivers() : [];
      /* Prefer the video m-line that is already negotiated. An answerer may
         briefly have more than one video transceiver on older cached clients;
         choosing the first one can select a dead currentDirection=null sender. */
      var ordered = txs.slice().sort(function (a, b) {
        return Number(!!b.currentDirection) - Number(!!a.currentDirection);
      });
      for (var i = 0; i < ordered.length; i++) {
        var tx = ordered[i];
        var kind = (tx.sender && tx.sender.track && tx.sender.track.kind) ||
                   (tx.receiver && tx.receiver.track && tx.receiver.track.kind) ||
                   (tx.mid && /video/i.test(String(tx.mid)) ? "video" : "");
        if (kind === "video") { sender = tx.sender; chosen = tx; break; }
      }
      if (!sender) {
        sender = pc.getSenders().filter(function (s) {
          return s.track ? s.track.kind === "video" : false;
        })[0];
      }

      if (sender) {
        sender.replaceTrack(track);
        /* If the original answer was recv-only (normal for an audio-only
           answerer), replacing the track alone cannot send it. Promote that
           negotiated m-line and make one explicit renegotiation offer. */
        if (track && chosen && chosen.currentDirection &&
            chosen.currentDirection.indexOf("send") === -1) {
          try { chosen.direction = "sendrecv"; } catch (e) {}
          offerTo(id);
        }
      } else if (track) {
        pc.addTrack(track, state.local || new window.MediaStream([track]));
        offerTo(id);
      }
    });
  }

  function mark(act, on) {
    var b = bar.querySelector('[data-act="' + act + '"]');
    if (!b) return;
    b.classList.toggle("is-on", !!on);
    /* The mic swaps to a struck-through icon when muted, and the label to
       "Unmute", so the button always says exactly what it will do next. */
    if (act === "mute") {
      var ico = window.UI.icon(on ? "micOff" : "mic", "callbtn-ico");
      var old = b.querySelector(".callbtn-ico");
      if (old) b.replaceChild(ico, old);
      var lbl = b.querySelector(".callbtn-lbl");
      if (lbl) lbl.textContent = on ? "Unmute" : "Mute";
      b.title = on ? "Unmute" : "Mute";
    }
  }

  /* ------------------------------------------------------ peer plumbing */

  function connect(userId) {
    if (state.peers[userId] && state.peers[userId].pc) return state.peers[userId];

    var pc = new window.RTCPeerConnection({ iceServers: state.ice || [] });
    var entry = state.peers[userId] || (state.peers[userId] = {});
    entry.pc = pc;
    entry.el = tileFor(userId, nameOf(userId));
    entry.pending = [];          // candidates that arrived before the answer

    if (state.local) {
      state.local.getTracks().forEach(function (t) { pc.addTrack(t, state.local); });
    }
    if (state.screen) {
      var s = state.screen.getVideoTracks()[0];
      if (s) pc.addTrack(s, state.screen);
    }

    /* Guarantee exactly one bidirectional video channel up front, even on an
       audio-only call. Two payoffs:
        - a camera or screen turned on later is a plain replaceTrack (no
          renegotiation, which this simple signaller doesn't do reliably), and
        - the OTHER side's camera, added the same way, arrives over an
          already-negotiated receive channel — which is why remote video had
          stopped showing up. */
    var hasVideoSender = pc.getSenders().some(function (s2) {
      return s2.track && s2.track.kind === "video";
    });
    /* Only the deterministic OFFERER creates the empty video m-line. If the
       answerer creates one too, Chrome does not pair it with the remote offer:
       it leaves one unnegotiated send transceiver plus a second recv-only one.
       Camera replaceTrack() then targets the dead transceiver and the other
       person sees no video. The answerer receives the offerer's m-line during
       setRemoteDescription and can promote it when their camera starts. */
    if (!hasVideoSender && shouldOffer(userId)) {
      try { pc.addTransceiver("video", { direction: "sendrecv" }); } catch (e) {}
    }

    /* Offers are started deterministically by pump() after both peers are joined.
       Do NOT also offer from `negotiationneeded`: adding the initial tracks and
       video transceiver fires that event during connect(), racing pump's own
       offerTo(). The loser closed the shared peer connection, so the next poll
       created another one and calls looped through offers forever. Camera and
       screen changes use replaceTrack(), so they do not require renegotiation. */

    pc.addEventListener("icecandidate", function (e) {
      if (e.candidate) send(userId, "ice", e.candidate.toJSON());
    });

    pc.addEventListener("track", function (e) {
      /* addTransceiver("video") can fire `track` with an EMPTY `streams` array.
         Reading e.streams[0] unconditionally made `stream.addEventListener`
         throw and stopped signalling on both sides. Build a stream around the
         track when the sender did not associate one. */
      var stream = e.streams && e.streams[0];
      if (!stream) {
        stream = entry.stream || new window.MediaStream();
        if (e.track && stream.getTracks().indexOf(e.track) === -1) stream.addTrack(e.track);
      }
      entry.stream = stream;
      /* Route audio to the dedicated <audio> sink and video to the <video>
         tile. Both get an explicit play() because autoplay of unmuted remote
         media is otherwise blocked — which is what caused black video and
         silent audio even when the connection was fine. */
      entry.el._video.srcObject = stream;
      playMedia(entry.el._video);
      if (entry.el._audio) {
        entry.el._audio.srcObject = stream;
        playMedia(entry.el._audio);
      }
      refreshTile(entry.el, stream);
      /* Tracks can go live after the tile is drawn. */
      stream.addEventListener("addtrack", function () {
        playMedia(entry.el._video);
        if (entry.el._audio) playMedia(entry.el._audio);
        refreshTile(entry.el, stream);
      });
    });

    pc.addEventListener("connectionstatechange", function () {
      entry.el.dataset.state = pc.connectionState;
      if (pc.connectionState === "connected") {
        entry.el.classList.remove("is-failed");
        if (!state.startedAt) {
          state.startedAt = Date.now();
          status("In a call");
        }
      }
      if (pc.connectionState === "failed") {
        /* Usually a network that blocks direct connections. There is no TURN
           relay to fall back to, so say what happened instead of leaving a
           silent dead tile that looks like the other person went quiet. */
        entry.el.classList.add("is-failed");
        status("Couldn't connect to " + nameOf(userId));
        if (!entry.warned) {
          entry.warned = true;
          window.UI.toast("This network is blocking the direct connection to " +
                          nameOf(userId) + ".", 4200);
        }
      }
    });

    return entry;
  }

  /* Both sides would otherwise offer at once and collide. The lower user id
     always offers; the higher always waits. */
  function shouldOffer(otherId) {
    return state.self < otherId;
  }

  function offerTo(userId) {
    var entry = connect(userId);
    return entry.pc.createOffer()
      .then(function (offer) { return entry.pc.setLocalDescription(offer); })
      .then(function () { send(userId, "offer", entry.pc.localDescription.toJSON()); })
      .catch(function () {
        /* A transient createOffer/setLocalDescription failure must not wedge
           this peer forever: pump()'s "already has a pc" guard skips anyone
           with one, so a broken pc left in place here was never retried. */
        if (entry.pc) { try { entry.pc.close(); } catch (err) { /* already closed */ } }
        entry.pc = null;
      });
  }

  function send(to, kind, payload) {
    if (!state.call) return Promise.resolve();
    /* Write the signal FIRST, then poke. The poke tells the recipient to fetch
       immediately; if it fired before the row committed, that early fetch found
       nothing and negotiation stalled until the 1.5s fallback poll. */
    return window.API.sendSignal(state.call.id, to, kind, payload).then(function () {
      pokePeer(to);
    }, function (err) {
      /* Don't silently swallow: a failed offer/answer/ICE write leaves both
         sides stuck on "Connecting…". Surface it once and keep the fallback
         poll going — a transient failure may still recover on the next tick. */
      if (!state._signalWarned && err && (err.status === 401 || err.status === 403 || err.status === 404)) {
        state._signalWarned = true;
        status("Trouble reaching the call server…");
      }
    });
  }

  /* Realtime helpers. Each call has a channel; each user has a personal
     channel for ring notifications. All best-effort — polling is the fallback. */
  function callTopic(id) { return "realtime:call:" + id; }
  function userTopic(id) { return "realtime:user:" + id; }

  function pokePeer(to) {
    if (!window.Realtime || !state.call) return;
    window.Realtime.broadcast(callTopic(state.call.id), "sig", { to: to });
  }

  var callSub = null;
  function subscribeCall(id) {
    if (!window.Realtime || callSub) return;
    callSub = window.Realtime.subscribe(callTopic(id), {
      /* A peer says a signal is waiting for me → pump now, don't wait 1.5s. */
      sig: function (data) {
        if (!data || String(data.to) === String(state.self) || data.to == null) pump();
      }
    });
  }
  function unsubscribeCall() {
    if (callSub) { callSub(); callSub = null; }
  }

  function handle(sig) {
    var entry = connect(sig.from);
    var pc = entry.pc;

    if (sig.kind === "offer") {
      return pc.setRemoteDescription(sig.payload)
        .then(function () { return drainCandidates(entry); })
        .then(function () { return pc.createAnswer(); })
        .then(function (answer) { return pc.setLocalDescription(answer); })
        .then(function () { send(sig.from, "answer", pc.localDescription.toJSON()); })
        .catch(function () {});
    }

    if (sig.kind === "answer") {
      return pc.setRemoteDescription(sig.payload)
        .then(function () { return drainCandidates(entry); })
        .catch(function () {});
    }

    if (sig.kind === "ice") {
      /* Candidates routinely arrive before the description they belong to;
         holding them until then is normal, not an error. */
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        entry.pending.push(sig.payload);
        return Promise.resolve();
      }
      return pc.addIceCandidate(sig.payload).catch(function () {});
    }

    if (sig.kind === "bye") {
      /* A "bye" can mean two very different things:
           - the peer left the call for good, or
           - the peer navigated to another page and is re-establishing.
         We can't tell from the signal alone, so tear the stale pc down WITHOUT
         hanging up. pump()'s roster check is the source of truth: if the peer is
         really gone it flips to "left" and dropPeer() ends the call; if they're
         still "joined" (a rejoin), pump() simply re-offers to their fresh pc. */
      dropPeer(sig.from, true);
    }
    return Promise.resolve();
  }

  function drainCandidates(entry) {
    var queued = entry.pending || [];
    entry.pending = [];
    return Promise.all(queued.map(function (c) {
      return entry.pc.addIceCandidate(c).catch(function () {});
    }));
  }

  function dropPeer(userId, keepAlive) {
    var entry = state.peers[userId];
    if (!entry) return;
    if (entry.pc) entry.pc.close();
    if (entry.el) entry.el.remove();
    delete state.peers[userId];

    /* keepAlive: a "bye" that might be a rejoin (peer navigated). Don't run the
       "everyone left" hangup — pump() re-offers if the peer is still in the
       roster, or ends the call if they've genuinely gone. */
    if (keepAlive) return;

    /* Someone still ringing is not "everyone left" — hanging up on them the
       moment the one person who answered drops would kill a group call that
       the third member is about to join. */
    var stillComing = ((state.call && state.call.peers) || []).some(function (p) {
      return p.id !== state.self && p.state === "invited";
    });
    if (!Object.keys(state.peers).length && !stillComing && state.call) {
      status("Everyone left");
      window.setTimeout(function () { if (state.call) hangUp(); }, 1500);
    }
  }

  /* --------------------------------------------------------------- loop */

  function pump() {
    if (!state.call) return;
    clock();
    if (pumpBusy) {
      pumpQueued = true;
      return;
    }
    pumpBusy = true;

    window.API.pollSignals(state.call.id).then(function (res) {
      if (!state.call) return;

      /* A missing call row means it is gone, not that nothing changed.
         Treating null as "no news" left the loop polling a dead call for as
         long as the tab stayed open. */
      if (!res.call) return teardown("Call ended");
      state.call = res.call;
      if (res.call.state === "ended") return teardown("Call ended");

      /* Still ringing on the other end — say so rather than sitting on
         "Connecting…" for however long they take to pick up. */
      if (res.call.state === "ringing" && !state.startedAt) status("Ringing…");

      /* Anyone joined and not yet connected gets an offer from whichever
         side owns the offer for that pair. */
      res.call.peers.forEach(function (p) {
        if (p.id === state.self || p.state !== "joined") return;
        if (state.peers[p.id] && state.peers[p.id].pc) return;
        if (shouldOffer(p.id)) offerTo(p.id);
        else connect(p.id);        // stand ready to answer
      });

      /* A peer that left while we were connected: tear its tile down even if
         the bye signal never arrived. */
      Object.keys(state.peers).forEach(function (id) {
        var still = res.call.peers.some(function (p) {
          return String(p.id) === String(id) && p.state !== "left";
        });
        if (!still) dropPeer(id);
      });

      return res.signals.reduce(function (chain, sig) {
        return chain.then(function () { return handle(sig); });
      }, Promise.resolve());
    }).catch(function (err) {
      if (err && (err.status === 403 || err.status === 404)) teardown("Call ended");
    }).then(function () {
      pumpBusy = false;
      if (pumpQueued && state.call) {
        pumpQueued = false;
        window.setTimeout(pump, 0);
      } else {
        pumpQueued = false;
      }
    });
  }

  function runLoop() {
    window.clearInterval(state.timer);
    state.timer = window.setInterval(pump, LIVE_POLL);
    pump();
  }

  /* ------------------------------------------------------- start / stop */

  function begin(call, ice, wantVideo) {
    state.call = call;
    state.ice = ice;
    state.startedAt = 0;
    markActiveCall(call.id);   // sticky across in-site navigation
    subscribeCall(call.id);    // instant signalling over realtime

    stopRinging();
    state.ringing = null;
    root.hidden = false;
    bar.hidden = false;
    ringEl.hidden = true;
    status(call && call.state === "ringing" ? "Ringing…" : "Connecting…");

    return getLocal(wantVideo).then(function () {
      /* Only after the media actually arrives — getLocal falls back to audio
         when there is no camera, and marking the button on beforehand claimed
         a camera that isn't running. */
      mark("cam", !state.camOff);
      /* Ring every invited peer instantly over their personal channel, so the
         incoming-call card pops right away instead of on their next 6s poll.
         Also send a "bye" to every ALREADY-JOINED peer: if this begin() is a
         rejoin after navigating, the other side is still holding a peer
         connection to our dead previous page. bye makes them drop it at once so
         their next pump re-offers to our fresh connection — otherwise both
         sides sit on a stale pc and the reconnect stalls at "Connecting…". */
      if (call && call.peers) {
        call.peers.forEach(function (p) {
          if (p.id === state.self) return;
          if (window.Realtime) window.Realtime.broadcast(userTopic(p.id), "ring", { call: call.id });
          if (p.state === "joined") send(p.id, "bye", {});
        });
      }
      runLoop();
    }).catch(function (err) {
      window.UI.toast(err.message || "Could not start the call.");
      hangUp();
    });
  }

  function start(opts) {
    opts = opts || {};
    if (!can()) {
      window.UI.toast("This browser can't make calls.");
      return Promise.reject(new Error("unsupported"));
    }
    if (state.call) {
      window.UI.toast("You're already in a call.");
      return Promise.resolve();
    }
    if (!root) build();

    return window.API.startCall({
      userId: opts.userId, threadId: opts.threadId, kind: opts.kind || "audio"
    }).then(function (res) {
      state.self = whoAmI() || res.call.startedBy;
      return begin(res.call, res.iceServers, opts.kind === "video");
    }).catch(function (err) {
      window.UI.toast(err.message || "Could not start the call.");
      throw err;
    });
  }

  function answer(callId, wantVideo) {
    if (!root) build();
    stopRinging();
    return window.API.joinCall(callId).then(function (res) {
      /* The Node backend hands `self` back; Supabase does not always, and a
         null id would break the "lower id offers" rule for every pair. */
      state.self = res.self || whoAmI() || state.self;
      return begin(res.call, res.iceServers, !!wantVideo);
    }).catch(function (err) {
      window.UI.toast(err.message || "Could not join that call.");
      dismissRing();
    });
  }

  function whoAmI() {
    return (window.Session && window.Session.user && window.Session.user.id) || null;
  }

  function hangUp() {
    var id = state.call && state.call.id;
    clearActiveCall();     // explicit hang-up: don't auto-rejoin after this
    teardown("");
    if (id) window.API.leaveCall(id).catch(function () {});
  }

  function teardown(message) {
    window.clearInterval(state.timer);
    state.timer = null;
    pumpBusy = false;
    pumpQueued = false;
    stopRinging();
    unsubscribeCall();

    Object.keys(state.peers).forEach(function (k) {
      if (state.peers[k].pc) state.peers[k].pc.close();
    });
    state.peers = {};
    if (tiles) tiles.innerHTML = "";

    [state.local, state.screen].forEach(function (s) {
      if (s) s.getTracks().forEach(function (t) { t.stop(); });
    });
    state.local = null;
    state.screen = null;
    state.call = null;
    state.startedAt = 0;
    state.muted = false;
    state.camOff = true;

    if (bar) {
      bar.hidden = true;
      bar.classList.remove("is-min");
      ["mute", "cam", "screen"].forEach(function (a) { mark(a, false); });
    }
    if (root) {
      root.classList.remove("is-big");
      root.hidden = !ringEl || ringEl.hidden;    // keep it up if something's ringing
    }
    if (message) window.UI.toast(message);
  }

  /* ------------------------------------------------------------ ringing */

  function drawRing(call) {
    state.ringing = call;
    ringEl.innerHTML = "";

    var caller = (call.peers || []).filter(function (p) { return p.id === call.startedBy; })[0];
    var label = caller ? (caller.displayName || caller.username) : "Someone";

    var top = el("div", "ring-who");
    top.appendChild(caller && window.SocialUI && window.SocialUI.avatar
      ? window.SocialUI.avatar({ username: caller.username, avatarUrl: caller.avatarUrl, online: true })
      : window.Art.avatar(caller ? caller.username : "?"));
    var text = el("div", "ring-text");
    text.appendChild(el("strong", null, label));
    text.appendChild(el("span", "ring-kind",
      call.kind === "video" ? "Incoming video call" : "Incoming call"));
    top.appendChild(text);
    ringEl.appendChild(top);

    var acts = el("div", "ring-acts");

    var take = el("button", "btn btn-cta btn-sm ring-answer");
    take.type = "button";
    take.appendChild(window.UI.icon(call.kind === "video" ? "video" : "phone"));
    take.appendChild(el("span", null, "Answer"));
    take.addEventListener("click", function () {
      ringEl.hidden = true;
      answer(call.id, call.kind === "video");
    });
    acts.appendChild(take);

    if (call.kind === "video") {
      var audioOnly = el("button", "btn btn-sm");
      audioOnly.type = "button";
      audioOnly.appendChild(window.UI.icon("phone"));
      audioOnly.appendChild(el("span", null, "Audio"));
      audioOnly.addEventListener("click", function () {
        ringEl.hidden = true;
        answer(call.id, false);
      });
      acts.appendChild(audioOnly);
    }

    var no = el("button", "btn btn-sm ring-decline");
    no.type = "button";
    no.appendChild(window.UI.icon("hangup"));
    no.appendChild(el("span", null, "Decline"));
    no.addEventListener("click", function () {
      window.API.leaveCall(call.id).catch(function () {});
      dismissRing();
    });
    acts.appendChild(no);

    ringEl.appendChild(acts);
    ringEl.hidden = false;
    root.hidden = false;
    startRinging();
  }

  function dismissRing() {
    state.ringing = null;
    stopRinging();
    if (ringEl) ringEl.hidden = true;
    if (root && bar && bar.hidden) root.hidden = true;
  }

  /* Watch for calls aimed at me. Cheap enough to run on every page, and it
     has to run everywhere or a call only reaches you on the messages page. */
  function watch() {
    window.API.pendingCalls().then(function (res) {
      var calls = res.calls || [];

      /* Auto-rejoin: if I'm already a *joined* peer in a live call but this
         page isn't in it (because I navigated here and the previous page's
         WebRTC died with it), quietly rejoin so the call survives moving
         around the site instead of ending on every click. */
      if (!state.call) {
        var ongoing = calls.filter(function (c) {
          if (c.state === "ended") return false;
          return (c.peers || []).some(function (p) {
            return p.id === state.self && p.state === "joined";
          });
        })[0];
        if (ongoing && sessionRejoinWanted(ongoing.id)) {
          var wantsVideo = (ongoing.kind === "video");
          answer(ongoing.id, wantsVideo);
          return;
        }
      }

      /* Only a call where *my* row is still "invited" is ringing at me. A
         group call I've already joined comes back here too. */
      var mine = calls.filter(function (c) {
        if (state.call && c.id === state.call.id) return false;
        if (c.state !== "ringing" || c.startedBy === state.self) return false;
        return (c.peers || []).some(function (p) {
          return p.id === state.self && p.state === "invited";
        });
      })[0];

      if (!mine) { if (state.ringing) dismissRing(); return; }
      if (state.call) return;                       // already busy
      if (state.ringing && state.ringing.id === mine.id) {
        /* Keep the card current — the caller may have hung up between polls,
           and the peer list is what tells us who is still there. */
        state.ringing = mine;
        return;
      }
      drawRing(mine);
    }).catch(function () { /* offline; try again next tick */ });
  }

  /* A call is "sticky" across navigation only if the user didn't explicitly
     hang up. We remember the active call id in sessionStorage; leaving via the
     hang-up button clears it, so we don't silently rejoin a call the user
     meant to end. */
  var REJOIN_KEY = "ach:activeCall";
  function markActiveCall(id) {
    try { window.sessionStorage.setItem(REJOIN_KEY, String(id)); } catch (e) {}
  }
  function clearActiveCall() {
    try { window.sessionStorage.removeItem(REJOIN_KEY); } catch (e) {}
  }
  function sessionRejoinWanted(id) {
    try { return window.sessionStorage.getItem(REJOIN_KEY) === String(id); }
    catch (e) { return false; }
  }

  /* ---------------------------------------------------------------- boot */

  var mounted = false;
  function setup(user) {
    if (mounted) { state.self = user.id; return; }
    if (!can()) return;
    mounted = true;
    build();
    state.self = user.id;

    state.ringTimer = window.setInterval(watch, RING_POLL);
    watch();

    /* Instant ring: listen on my personal channel. When someone starts a
       call aimed at me they broadcast here, so watch() runs at once instead
       of up to RING_POLL (6s) later. Polling stays as the fallback. */
    if (window.Realtime) {
      window.Realtime.subscribe(userTopic(state.self), {
        ring: function () { watch(); },
        hangup: function () { watch(); }
      });
    }
    installNavGuards();
  }

  function mount() {
    if (!window.Session || !window.API || !window.UI) return;

    window.Session.ready.then(function (s) {
      if (s && s.backend && s.user) setup(s.user);
    });
    /* If the session arrives AFTER ready resolved (e.g. the user signed in on
       this very page), pick it up so calling works without a reload. Session
       announces changes via a DOM event. */
    document.addEventListener("session:change", function (e) {
      var d = e && e.detail;
      if (d && d.user) setup(d.user);
    });
  }

  function installNavGuards() {
      /* Keeping a call alive across the site.
         A WebRTC connection belongs to the page that opened it, so any real
         navigation ends it and the NEXT page rejoins from sessionStorage. The
         job here is to tell three very different events apart:
           - a same-site link/redirect  → keep the seat, rejoin next page
           - the tab being frozen (bfcache) or just backgrounded → do NOTHING,
             the same page and its live connection are still there
           - a genuine tab/window close or navigation OFF the site → leave, so
             the other person isn't stuck talking to a dead tile.
         The previous version leaked "leave" on tab-switch because it never
         checked event.persisted (a bfcache freeze fires pagehide too). */
      var internalNav = false;
      document.addEventListener("click", function (e) {
        var a = e.target && e.target.closest && e.target.closest("a[href]");
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (/^(#|javascript:)/i.test(href)) return;
        if (a.target && a.target !== "_self") return;   // opens elsewhere
        try {
          var dest = new URL(a.href, location.href);
          if (dest.origin === location.origin) internalNav = true;
        } catch (err) { /* ignore */ }
      }, true);
      /* A form that posts back to this origin (search, login) is also internal. */
      document.addEventListener("submit", function (e) {
        var f = e.target;
        if (!f || !f.action) { internalNav = true; return; }
        try {
          if (new URL(f.action, location.href).origin === location.origin) internalNav = true;
        } catch (err) { internalNav = true; }
      }, true);
      /* history.back()/forward() and location changes we didn't catch as a click. */
      window.addEventListener("beforeunload", function () {
        try {
          if (document.activeElement && document.activeElement.closest &&
              document.activeElement.closest("a[href],button,form")) internalNav = true;
        } catch (e) {}
      });
      window.addEventListener("pageshow", function () { internalNav = false; });

      window.addEventListener("pagehide", function (e) {
        /* bfcache freeze / tab backgrounding: the page (and its live peer
           connection) is being kept, not destroyed. Never leave the call. */
        if (e && e.persisted) return;

        /* Internal navigation: keep our seat; the next page's watch() sees we
           are still a joined peer and rejoins automatically. */
        if (internalNav && state.call) return;

        if (state.ringing) {
          window.API.leaveCall(state.ringing.id).catch(function () {});
        }
        if (!state.call) return;

        clearActiveCall();
        var id = state.call.id;
        var node = (window.API.backend || "node") === "node";
        if (node && navigator.sendBeacon) {
          var url = String(window.SITE.apiBase || "").replace(/\/+$/, "") +
                    "/api/calls/" + id + "/leave";
          navigator.sendBeacon(url, new Blob([], { type: "text/plain" }));
        } else {
          window.API.leaveCall(id).catch(function () {});
        }
        teardown("");
      });
  }

  window.Calls = {
    start: start,
    answer: answer,
    hangUp: hangUp,
    supported: can,
    active: function () { return !!state.call; },
    _debugPeers: function () {
      var out = {};
      Object.keys(state.peers).forEach(function (id) {
        var e = state.peers[id];
        out[id] = {
          conn: e.pc ? e.pc.connectionState : "no-pc",
          ice: e.pc ? e.pc.iceConnectionState : "-",
          audio: e.stream ? e.stream.getAudioTracks().length : 0,
          video: e.stream ? e.stream.getVideoTracks().length : 0
        };
      });
      return out;
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
