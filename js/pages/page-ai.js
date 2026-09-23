/* Campus AI (Beta) — the built-in assistant.
 *
 * HONEST SCOPE: this is a real, working helper, but it is NOT a large language
 * model. It answers from two sources that are actually on the page:
 *   1. the live game catalog (window.GAME_CATALOG / window.Catalog), so game
 *      recommendations are real titles that really exist here, and
 *   2. a built-in guide to the site's own features.
 * Everything runs in the browser; nothing typed here is sent anywhere.
 *
 * FUTURE-PROOFED: if window.SITE.aiEndpoint is ever set to a real completion
 * API, ask() will POST there first and fall back to the local brain on any
 * error. That's the "soon-to-work" hook the rest of the UI is already built
 * around — drop in an endpoint and the same page becomes a full chat.
 */
(function () {
  "use strict";

  var UI, logEl, inputEl, formEl, sendBtn, suggestEl;

  var GREETING =
    "Hi! I'm Campus AI, the arcade's built-in helper — still in beta. " +
    "I can recommend games from our catalog and explain how the site works. " +
    "Try one of the suggestions below, or just ask.";

  var SUGGESTS = [
    "Recommend a game",
    "Best fighting games",
    "Something like Mario",
    "A quick puzzle game",
    "How do calls work?",
    "How do I add a friend?",
    "What is Arcade+?",
    "How many games are there?"
  ];

  function init() {
    UI = window.UI;
    logEl = document.getElementById("ai-log");
    inputEl = document.getElementById("ai-input");
    formEl = document.getElementById("ai-form");
    sendBtn = document.getElementById("ai-send");
    suggestEl = document.getElementById("ai-suggests");
    if (!logEl || !formEl) return;

    /* Campus+ (Arcade+) members only. Wait for the session to resolve, then
       either unlock the assistant or show the members-only gate. */
    if (window.Session && window.Session.ready) {
      window.Session.ready.then(function () {
        if (window.Session.isPlus && window.Session.isPlus()) start();
        else gate();
      });
    } else {
      start();   // no backend at all — let it run rather than dead-end
    }
  }

  function gate() {
    var shell = document.querySelector(".ai-shell");
    var note = document.querySelector(".ai-note");
    if (note) note.hidden = true;
    if (!shell) return;
    shell.innerHTML = "";
    var box = UI.el("div", "ai-gate");
    box.appendChild(UI.icon("block"));
    var signedIn = !!(window.Session && window.Session.user);
    box.appendChild(UI.el("h2", null, "Campus AI is an Arcade+ feature"));
    var p = UI.el("p", null, signedIn
      ? "Campus AI is part of Arcade+. Ask a staff member to enable Arcade+ on your account to unlock it."
      : "Campus AI is part of Arcade+. Sign in, then ask a staff member to enable Arcade+ on your account.");
    box.appendChild(p);
    var row = UI.el("div", "ai-gate-acts");
    var learn = UI.el("a", "btn btn-cta", "About Arcade+");
    learn.href = "campus-plus.html";
    row.appendChild(learn);
    if (!signedIn) {
      var login = UI.el("a", "btn", "Sign in");
      login.href = "login.html?next=ai.html";
      row.appendChild(login);
    }
    box.appendChild(row);
    shell.appendChild(box);
  }

  function start() {
    sendBtn.appendChild(UI.icon("send"));

    bubble("ai", GREETING);
    drawSuggests(SUGGESTS);

    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      submit();
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    inputEl.addEventListener("input", function () {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
    });
  }

  function drawSuggests(items) {
    suggestEl.innerHTML = "";
    items.forEach(function (text) {
      var b = UI.el("button", "ai-chip", text);
      b.type = "button";
      b.addEventListener("click", function () {
        inputEl.value = text;
        submit();
      });
      suggestEl.appendChild(b);
    });
  }

  function submit() {
    var text = inputEl.value.trim();
    if (!text) return;
    bubble("me", text);
    inputEl.value = "";
    inputEl.style.height = "auto";
    sendBtn.disabled = true;

    var typing = thinking();
    ask(text).then(function (reply) {
      typing.remove();
      renderReply(reply);
    }).catch(function () {
      typing.remove();
      bubble("ai", "Something went wrong on my end — try asking a different way.");
    }).then(function () {
      sendBtn.disabled = false;
      inputEl.focus();
    });
  }

  /* Async so a real endpoint can slot in later without touching the UI. */
  function ask(text) {
    var endpoint = (window.SITE || {}).aiEndpoint;
    if (endpoint) {
      return window.fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      }).then(function (r) {
        if (!r.ok) throw new Error("bad");
        return r.json();
      }).then(function (d) {
        return { text: d.reply || d.text || "", games: d.games || [] };
      }).catch(function () {
        return Promise.resolve(brain(text));   // graceful fallback
      });
    }
    /* Local brain — a tiny delay so it reads as a reply, not an instant echo. */
    return new Promise(function (resolve) {
      window.setTimeout(function () { resolve(brain(text)); }, 260);
    });
  }

  /* ---- the local brain: intent matching over the real catalog + guide ---- */

  function catalog() {
    if (window.Catalog && window.Catalog.all && window.Catalog.all.length) return window.Catalog.all;
    return window.GAME_CATALOG || [];
  }

  var GUIDE = [
    { keys: ["call", "voice", "video", "ring", "phone"], reply:
      "To call a friend, open their profile or a conversation and hit the green " +
      "Call or Video button. Calls are peer-to-peer (nothing is recorded), " +
      "friends-only for 1:1, and hold your whole group (up to 25 people). Calling a group rings " +
      "everyone in it. The call panel is a small pill in the corner — tap the " +
      "arrow to expand it for video, camera and screen-share. It even stays " +
      "connected while you move around the site or launch a game." },
    { keys: ["friend", "add someone", "friend code", "requests"], reply:
      "Head to Friends and add someone by @username or by their six-character " +
      "friend code (like ABC-123). Requests go one way until accepted, and you " +
      "can rotate your own code any time so an old one stops working." },
    { keys: ["message", "chat", "dm", "text", "group"], reply:
      "Open Messages, or use the chat dock in the bottom-right on any page — it " +
      "even stays up while a game is running. Groups hold 25 people and are " +
      "friends-only. Messages deliver instantly over a live connection, with " +
      "polling as a backup so nothing is ever lost." },
    { keys: ["save", "progress", "cloud", "sync", "backup"], reply:
      "Your game progress saves automatically. Signed in, it syncs to your " +
      "account and follows you to other devices; signed out it stays in this " +
      "browser. Manage it in Settings → Export/Import." },
    { keys: ["account", "sign up", "signup", "login", "log in", "register"], reply:
      "You never need an account to play. Signing up adds cloud saves, friends " +
      "and messages, and adopts whatever you've already played here. A real " +
      "email is required (for confirmation and password recovery) and is never " +
      "shown to other users." },
    { keys: ["verify", "verification", "confirm email", "code", "email code"], reply:
      "After signing up you'll get a 6-digit code by email. Enter it on the " +
      "Verify Email page (or Settings → Verify email) to unlock chat, friends " +
      "and calls. Playing games needs no verification. Codes expire in 15 " +
      "minutes — hit Resend if yours lapses." },
    { keys: ["password", "forgot", "reset", "locked out", "can't log in"], reply:
      "Forgot your password? Use the \u201cReset it\u201d link on the sign-in page. " +
      "We'll email a recovery link; open it and set a new password. To change a " +
      "known password, go to Settings → Security." },
    { keys: ["block", "history", "hidden", "cloak", "school", "filter", "incognito"], reply:
      "The Hidden-tab launcher opens a game in an about:blank tab to keep it out " +
      "of your history. You can also toggle it in Settings. Flags on each game " +
      "describe how reliably it loads on restricted networks — they're about " +
      "reliability, not permission." },
    { keys: ["pin", "favorite", "favourite", "library", "bookmark"], reply:
      "Press F on a game, or the star on its tile, to pin it. Pinned games live " +
      "on the Pinned page and sync with your account when you're signed in." },
    { keys: ["theme", "skin", "dark", "light", "motion", "settings", "appearance"], reply:
      "Settings lets you change the skin, text size, turn motion on/off, switch " +
      "grid/list view, set a profile picture, and more. Press ? anywhere to " +
      "jump there." },
    { keys: ["profile picture", "avatar", "pfp", "photo", "picture"], reply:
      "Set a profile picture from your own Profile page or Settings → Profile " +
      "picture. Pick any image; it's squared and shown next to your name in " +
      "chat, friends and calls." },
    { keys: ["arcade+", "campus+", "plus", "membership", "premium", "subscribe"], reply:
      "Arcade+ unlocks the video player, custom playlists, and me — Campus AI. " +
      "It's granted by staff; check the Arcade+ page for what's included." },
    { keys: ["report", "block user", "abuse", "harass", "moderator", "mod"], reply:
      "See something wrong? Use Report inside a conversation or on a profile, " +
      "and Block to cut someone off entirely. Reports go straight to the " +
      "moderators. Blocking is mutual and silent." },
    { keys: ["mobile", "phone", "tablet", "ipad", "android", "install", "app", "pwa"], reply:
      "The whole site is mobile-friendly and installable — use your browser's " +
      "\u201cAdd to Home Screen\u201d to run it like an app, offline shell included." },
    { keys: ["controls", "keyboard", "shortcut", "hotkey", "keys"], reply:
      "Handy shortcuts: F pins the focused game, ? opens Settings, and Enter " +
      "sends a chat message (Shift+Enter for a new line). Most games use arrow " +
      "keys or WASD — check the game's own start screen." },
    { keys: ["who are you", "what are you", "what can you do", "help", "commands"], reply:
      "I'm Campus AI (beta) — a built-in helper. I recommend real games from " +
      "our catalog, help you find something by genre or vibe, and explain how " +
      "the arcade works: accounts, friends, chat, calls, saves, Arcade+ and " +
      "more. Ask for a genre, something like a game you like, \u201csurprise " +
      "me\u201d, or how any feature works." }
  ];

  /* Extra small-talk the guide doesn't cover, so the bot feels less robotic. */
  function smallTalk(q) {
    if (/\b(thank|thanks|thx|ty|appreciate)\b/.test(q))
      return "Anytime! Want another recommendation?";
    if (/\b(bye|goodbye|see ya|cya|later)\b/.test(q))
      return "See you — have fun playing!";
    if (/\bhow are you|how's it going|how are ya\b/.test(q))
      return "Running great, thanks! I'm best at finding you a game — what are you in the mood for?";
    if (/\b(joke|funny|make me laugh)\b/.test(q))
      return "Why did the gamer bring a ladder to the arcade? To reach the next level. \uD83C\uDFAE Want a game to actually play?";
    if (/\b(love you|you're cool|you're awesome|good bot|nice)\b/.test(q))
      return "You're alright yourself. Want me to line up something to play?";
    if (/\bare you (a )?(real|human|ai|bot|robot)\b/.test(q) || /\bare you real\b/.test(q))
      return "I'm a built-in helper — not a giant language model, just a fast local brain that knows this arcade's catalog and features inside out.";
    return null;
  }

  function brain(raw) {
    var q = raw.toLowerCase();

    /* 0. Small-talk / social — quick, before anything game-y. */
    var chat = smallTalk(q);
    if (chat) return { text: chat, games: [] };

    /* 2. Catalog facts — "how many games", "what categories". */
    if (/\b(how many|number of|count).*(games?|titles?)\b/.test(q) ||
        /\bhow big.*(catalog|library)\b/.test(q)) {
      var n = catalog().length;
      return { text: "There are " + n.toLocaleString() + " games in the catalog right now — " +
                     "browse them all on the Games page, or tell me a genre and I'll narrow it down.", games: sample(3) };
    }
    if (/\b(categor|genre|types? of game|what kind)\b/.test(q) && /\b(what|which|list|show|have)\b/.test(q)) {
      var defs = (window.SITE && window.SITE.categories) || {};
      var labels = Object.keys(defs).map(function (id) { return defs[id].label || id; });
      if (labels.length) {
        return { text: "Categories here include: " + labels.slice(0, 12).join(", ") +
                       (labels.length > 12 ? ", and more." : ".") +
                       " Ask for any one and I'll pull some up.", games: [] };
      }
    }

    /* 3. Feature/help questions win when they clearly match the guide. */
    for (var i = 0; i < GUIDE.length; i++) {
      if (GUIDE[i].keys.some(function (k) { return q.indexOf(k) !== -1; })) {
        /* But "fighting games" etc. should still recommend — only take the
           guide branch when the question isn't primarily about finding a game. */
        if (!/\b(game|play|recommend|suggest|like|similar|something)\b/.test(q) ||
            /\b(how|what|who|where|why|explain|work)\b/.test(q)) {
          return { text: GUIDE[i].reply, games: [] };
        }
      }
    }

    /* 2. Category / genre match. */
    var cats = categoryHits(q);
    if (cats.length) {
      var picks = pickByCategory(cats, 4);
      if (picks.length) {
        return {
          text: "Here are some " + cats[0].label.toLowerCase() + " games you can play right now:",
          games: picks
        };
      }
    }

    /* 3. "Like X" / "similar to X" — match by title or shared category. */
    var like = q.match(/(?:like|similar to|such as)\s+(.+)/);
    if (like) {
      var seed = findGame(like[1]);
      if (seed) {
        var near = pickByCategory([{ id: seed.category }], 5)
          .filter(function (g) { return g.id !== seed.id; }).slice(0, 4);
        if (near.length) {
          return { text: "If you like " + seed.title + ", try these:", games: near };
        }
      }
    }

    /* 4. Direct title search. */
    var named = searchTitles(q, 4);
    if (named.length && /\b(find|search|play|game|got|have|is there)\b/.test(q)) {
      return { text: "Found these in the catalog:", games: named };
    }

    /* 5. Generic recommend / surprise me. */
    if (/\b(recommend|suggest|surprise|random|bored|anything|something|fun|good game)\b/.test(q)) {
      return { text: "Here's a handful worth a shot:", games: sample(4) };
    }

    /* 6. Greeting. */
    if (/\b(hi|hey|hello|yo|sup|howdy)\b/.test(q)) {
      return { text: "Hey! Want a game recommendation, or help with something on the site?", games: [] };
    }

    /* 7. Fallback: try a loose title search before giving up. */
    var loose = searchTitles(q, 4);
    if (loose.length) {
      return { text: "Not sure exactly, but these might be what you mean:", games: loose };
    }
    return {
      text: "I'm still in beta, so I might not have caught that. I'm best at game " +
            "recommendations (try a genre, or \"something like Tetris\") and " +
            "questions about how the arcade works.",
      games: []
    };
  }

  function categoryHits(q) {
    var defs = (window.SITE && window.SITE.categories) || {};
    var out = [];
    Object.keys(defs).forEach(function (id) {
      var label = (defs[id].label || id).toLowerCase();
      if (q.indexOf(id) !== -1 || q.indexOf(label) !== -1) out.push({ id: id, label: defs[id].label || id });
    });
    /* Common synonyms. */
    var syn = { shooter: ["shoot", "fps", "gun"], racing: ["race", "racing", "car", "drift"],
                puzzle: ["puzzle", "brain"], fighting: ["fight", "fighting", "brawl", "versus"],
                platformer: ["platform", "jump", "mario", "sonic"], sports: ["sport", "ball", "soccer", "football"],
                rpg: ["rpg", "role"], horror: ["horror", "scary"], idle: ["idle", "clicker", "incremental"] };
    Object.keys(syn).forEach(function (id) {
      if (out.some(function (c) { return c.id === id; })) return;
      if (syn[id].some(function (w) { return q.indexOf(w) !== -1; })) {
        var d = defs[id];
        out.push({ id: id, label: (d && d.label) || id });
      }
    });
    return out;
  }

  function pickByCategory(cats, n) {
    var ids = cats.map(function (c) { return c.id; });
    var pool = catalog().filter(function (g) { return ids.indexOf(g.category) !== -1; });
    return shuffle(pool).slice(0, n);
  }

  function findGame(text) {
    text = text.trim().toLowerCase().replace(/[?.!]+$/, "");
    var all = catalog();
    var exact = all.filter(function (g) { return g.title.toLowerCase() === text; })[0];
    if (exact) return exact;
    return all.filter(function (g) { return g.title.toLowerCase().indexOf(text) !== -1; })[0] || null;
  }

  function searchTitles(q, n) {
    var words = q.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2; });
    if (!words.length) return [];
    var scored = catalog().map(function (g) {
      var t = g.title.toLowerCase();
      var score = 0;
      words.forEach(function (w) { if (t.indexOf(w) !== -1) score += 1; });
      return { g: g, score: score };
    }).filter(function (x) { return x.score > 0; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, n).map(function (x) { return x.g; });
  }

  function sample(n) { return shuffle(catalog().slice()).slice(0, n); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---- rendering ---- */

  function renderReply(reply) {
    bubble("ai", reply.text);
    if (reply.games && reply.games.length) {
      var wrap = UI.el("div", "ai-cards");
      reply.games.forEach(function (g) { wrap.appendChild(gameCard(g)); });
      logEl.appendChild(wrap);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function gameCard(g) {
    var a = UI.el("a", "ai-card");
    a.href = "play.html?id=" + encodeURIComponent(g.id);
    var cover = UI.el("span", "ai-card-cover");
    if (window.UI && window.UI.coverInto) {
      try { window.UI.coverInto(cover, g); } catch (e) {}
    } else if (g.gradient) {
      cover.style.background = g.gradient;
    }
    a.appendChild(cover);
    var meta = UI.el("span", "ai-card-meta");
    meta.appendChild(UI.el("strong", null, g.title));
    var cat = (window.SITE && window.SITE.categories && window.SITE.categories[g.category]);
    meta.appendChild(UI.el("span", "ai-card-cat", (cat && cat.label) || g.category || "Game"));
    a.appendChild(meta);
    return a;
  }

  function bubble(who, text) {
    var row = UI.el("div", "ai-row ai-" + who);
    var b = UI.el("div", "ai-bubble");
    b.textContent = text;
    row.appendChild(b);
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
    return row;
  }

  function thinking() {
    var row = UI.el("div", "ai-row ai-ai");
    var b = UI.el("div", "ai-bubble ai-typing");
    b.innerHTML = "<span></span><span></span><span></span>";
    row.appendChild(b);
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
    return row;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
