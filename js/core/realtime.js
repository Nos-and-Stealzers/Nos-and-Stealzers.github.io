/* Realtime transport — dependency-free Supabase Realtime (Phoenix) client.
 *
 * WHY: calling and messaging were HTTP-polling only (6s to even ring, 1.5s per
 * signalling round-trip, 5s per message refresh). That made call setup slow and
 * often *fail*, because ICE candidates dribbled across at one-per-1.5s. This
 * opens a single websocket to Supabase Realtime and lets features subscribe to
 * broadcast channels for INSTANT pokes. It is purely additive: every feature
 * keeps its polling as a fallback, so if the socket can't connect (blocked
 * network, signed out, older browser) nothing breaks — it just falls back to
 * the old speed.
 *
 * Protocol (verified against qopjzxrjkkljpumyirtb):
 *   join:      {topic, event:"phx_join", payload:{config:{broadcast:{self,ack}}}, ref}
 *   heartbeat: {topic:"phoenix", event:"heartbeat", payload:{}, ref}
 *   broadcast: {topic, event:"broadcast", payload:{type:"broadcast",event,payload}, ref}
 *
 * No supabase-js: the official client is ~120KB from a CDN that the restrictive
 * networks this site targets often block. This is ~200 lines of fetch/WebSocket.
 */
(function () {
  "use strict";

  var HEARTBEAT_MS = 25000;   // Supabase drops idle sockets after ~60s
  var RECONNECT_MIN = 1000;
  var RECONNECT_MAX = 15000;

  function RT() {
    this.ws = null;
    this.connected = false;
    this.ref = 0;
    this.channels = {};        // topic -> { handlers:{event:[fn]}, joined, joinRef }
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectDelay = RECONNECT_MIN;
    this.pending = [];         // frames queued while the socket is opening
    this.enabled = false;
    this.wantOpen = false;
  }

  RT.prototype._nextRef = function () { return String(++this.ref); };

  RT.prototype.available = function () {
    return !!(window.WebSocket && window.API && window.API.realtime &&
              window.API.realtime.ready && window.API.realtime.ready());
  };

  RT.prototype.connect = function () {
    if (!this.available()) return;
    this.wantOpen = true;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;

    var cfg = window.API.realtime;
    var token = cfg.token ? cfg.token() : cfg.anonKey;
    var url = cfg.url + "?apikey=" + encodeURIComponent(cfg.anonKey) +
              "&vsn=1.0.0";

    var self = this;
    try {
      this.ws = new WebSocket(url);
    } catch (e) { this._scheduleReconnect(); return; }

    this.ws.addEventListener("open", function () {
      self.connected = true;
      self.reconnectDelay = RECONNECT_MIN;
      /* (Re)join every channel a feature asked for — exactly once. Channel
         intent is tracked in self.channels; _joinChannel is a no-op while the
         socket is still opening, so the initial subscribe() does NOT also queue
         a duplicate join frame (which the server answered with phx_close,dead
         channel, and silently-broken instant ring). */
      Object.keys(self.channels).forEach(function (topic) {
        self.channels[topic].joined = false;
        self._joinChannel(topic);
      });
      /* Flush any broadcasts queued while opening. */
      var q = self.pending; self.pending = [];
      q.forEach(function (f) { self._send(f); });
      self._startHeartbeat();
    });

    this.ws.addEventListener("message", function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      self._onFrame(msg);
    });

    this.ws.addEventListener("close", function () {
      self.connected = false;
      self._stopHeartbeat();
      Object.keys(self.channels).forEach(function (t) { self.channels[t].joined = false; });
      if (self.wantOpen) self._scheduleReconnect();
    });

    this.ws.addEventListener("error", function () {
      try { self.ws.close(); } catch (e) {}
    });
  };

  RT.prototype.disconnect = function () {
    this.wantOpen = false;
    this._stopHeartbeat();
    window.clearTimeout(this.reconnectTimer);
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
    this.ws = null;
    this.connected = false;
  };

  RT.prototype._scheduleReconnect = function () {
    var self = this;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(function () {
      self.reconnectDelay = Math.min(self.reconnectDelay * 2, RECONNECT_MAX);
      self.connect();
    }, this.reconnectDelay);
  };

  RT.prototype._send = function (frame) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(frame)); return true; }
      catch (e) { return false; }
    }
    this.pending.push(frame);
    return false;
  };

  RT.prototype._startHeartbeat = function () {
    var self = this;
    this._stopHeartbeat();
    this.heartbeatTimer = window.setInterval(function () {
      self._send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: self._nextRef() });
    }, HEARTBEAT_MS);
  };
  RT.prototype._stopHeartbeat = function () {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  };

  RT.prototype._joinChannel = function (topic) {
    var ch = this.channels[topic];
    if (!ch) return;
    /* Only join over a genuinely OPEN socket. While the socket is still
       CONNECTING, the open handler will join every known channel exactly once —
       queuing a join frame here too produced a second join and a phx_close. */
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;

    var cfg = window.API.realtime;
    var token = (cfg && cfg.token && cfg.token()) || (cfg && cfg.anonKey);
    var ref = this._nextRef();
    ch.joinRef = ref;
    ch.joined = false;
    this._send({
      topic: topic, event: "phx_join",
      /* access_token belongs INSIDE the join payload in the current Supabase
         protocol; sending it as its own "phoenix" frame got "unmatched topic"
         and left the socket anonymous. */
      payload: {
        access_token: token,
        config: { broadcast: { self: false, ack: false }, presence: { key: "" } }
      },
      ref: ref
    });
  };

  RT.prototype._onFrame = function (msg) {
    var ch = this.channels[msg.topic];
    if (msg.event === "phx_reply") {
      if (ch && msg.ref === ch.joinRef) {
        if (msg.payload && msg.payload.status === "ok") ch.joined = true;
        else ch.joined = false;   // join refused; leave it un-joined
      }
      return;
    }
    /* A channel the server closed or errored (token expiry, a duplicate join,
       a transient server drop) must be re-joined, or its instant pokes stop
       arriving for the rest of the session while polling quietly covers it. */
    if ((msg.event === "phx_close" || msg.event === "phx_error") && ch) {
      ch.joined = false;
      var self = this;
      window.setTimeout(function () {
        if (self.channels[msg.topic] && !self.channels[msg.topic].joined) {
          self._joinChannel(msg.topic);
        }
      }, 400);
      return;
    }
    if (msg.event === "broadcast" && ch && msg.payload) {
      var evName = msg.payload.event;
      var data = msg.payload.payload;
      var list = ch.handlers[evName] || [];
      list.forEach(function (fn) { try { fn(data); } catch (e) {} });
      return;
    }
    /* postgres_changes / presence frames could be handled here later. */
  };

  /* --- public API --- */

  /* Subscribe to a broadcast channel. Returns an unsubscribe function.
     `events` is { eventName: handlerFn }. Multiple subscribers on one topic
     share a single channel join. */
  RT.prototype.subscribe = function (topic, events) {
    if (!this.available()) return function () {};
    this.connect();

    var ch = this.channels[topic];
    if (!ch) {
      ch = this.channels[topic] = { handlers: {}, joined: false, joinRef: null };
      this._joinChannel(topic);
    }
    var added = [];
    Object.keys(events || {}).forEach(function (evName) {
      (ch.handlers[evName] = ch.handlers[evName] || []).push(events[evName]);
      added.push([evName, events[evName]]);
    });

    var self = this;
    return function () {
      var c = self.channels[topic];
      if (!c) return;
      added.forEach(function (pair) {
        var arr = c.handlers[pair[0]] || [];
        var i = arr.indexOf(pair[1]);
        if (i >= 0) arr.splice(i, 1);
      });
      /* Leave the channel entirely once nobody listens. */
      var anyLeft = Object.keys(c.handlers).some(function (k) { return c.handlers[k].length; });
      if (!anyLeft) {
        self._send({ topic: topic, event: "phx_leave", payload: {}, ref: self._nextRef() });
        delete self.channels[topic];
      }
    };
  };

  /* Fire a broadcast to everyone else on a channel. Best-effort; a dropped
     socket just means the peer falls back to its poll. */
  RT.prototype.broadcast = function (topic, event, payload) {
    if (!this.available()) return false;
    this.connect();
    if (!this.channels[topic]) {
      this.channels[topic] = { handlers: {}, joined: false, joinRef: null };
      this._joinChannel(topic);
    }
    return this._send({
      topic: topic, event: "broadcast",
      payload: { type: "broadcast", event: event, payload: payload || {} },
      ref: this._nextRef()
    });
  };

  var rt = new RT();

  /* Connect once a signed-in session exists; drop the socket on sign-out.
     Session broadcasts state via DOM CustomEvents, not an on() method. */
  function boot() {
    if (!window.Session) return;
    /* Subscribe to my personal channel app-wide so the notification bell/badges
       update instantly on any page, and expose a helper others can poke. */
    function subscribeSelf(user) {
      if (!user || !rt.available()) return;
      rt.connect();
      rt.subscribe("realtime:user:" + user.id, {
        notify: function () { if (window.Session.refreshBadges) window.Session.refreshBadges(); },
        ring: function () { if (window.Session.refreshBadges) window.Session.refreshBadges(); }
      });
    }
    window.Session.ready.then(function (s) {
      if (s && s.backend && s.user && rt.available()) { rt.connect(); subscribeSelf(s.user); }
    });
    document.addEventListener("session:change", function (e) {
      var d = e && e.detail;
      if (d && d.user) { rt.connect(); subscribeSelf(d.user); }
      else rt.disconnect();
    });
  }

  /* Convenience: poke a user's personal channel to nudge their notification
     badge/feed. Best-effort; the server's own poll is the fallback. */
  function pokeUser(userId, event) {
    if (userId == null) return;
    rt.broadcast("realtime:user:" + userId, event || "notify", {});
  }

  window.Realtime = rt;
  rt.pokeUser = pokeUser;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
