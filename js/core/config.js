/* Site-wide configuration. Edit this file, not the page markup. */
(function () {
  "use strict";

  window.SITE = {
    name: "Arcade Campus Hub",
    short: "Arcade Hub",
    mark: "AC",
    tagline: "An index of playable things",
    description:
      "A local-first browser arcade: compatibility flags, favourites and playtime, all stored on your device.",
    domain: "arcadecampushub.online",
    build: "v2",

    /* Where the games are served from. */
    gameHosts: {
      /* Whichever domain the hub is being served from. Pinning this to the
         main domain broke the mirrors: its X-Frame-Options blocks framing. */
      "self":       /^https?:$/.test(location.protocol) ? location.origin : "https://www.arcadecampushub.online",
      "games-huge": "https://arcadecampushub.github.io/games-huge",
      "flashgames": "https://arcadecampushub.github.io/flashgames",
      "hd_fnaf":    "https://arcadecampushub.github.io/hd_fnaf",
      "eaglercraft": "https://arcadecampushub.github.io/eaglercraft",
      "retrobowl":  "https://arcadecampushub.github.io/RetroBow",
      "waterboy-firegirl": "https://arcadecampushub.github.io/Waterboy-Firegirl",
      "extgames": "https://arcadecampushub.github.io/extgames",
      /* rawcdn caches a branch URL forever; pinned to a commit so updates land. */
      "nebula-cdn": "https://rawcdn.githack.com/Nos-and-Stealzers/NEBULA-CDN/cefd7e6ad702e870086059462da69d8f44c6fbcf/games",
      "polytrack":  "https://arcadecampushub.github.io/polytrack"
    },

    /* Every domain the hub is served on. One account signs in on all of
       them: a signed-out domain can borrow the sign-in from `ssoHub` (see
       sso.html). Keep in step with HUB_ORIGINS in api/sso.js. */
    ssoHub: "https://www.arcadecampushub.online",
    domains: [
      "https://arcadecampushub.online", "https://www.arcadecampushub.online",
      "https://arcadecampushub.space", "https://www.arcadecampushub.space",
      "https://arcadecampushub.fun", "https://www.arcadecampushub.fun",
      "https://poppersarcade.online", "https://www.poppersarcade.online",
      "https://geniussis.online", "https://www.geniussis.online",
      "https://geniussis.space", "https://www.geniussis.space",
      "https://securlyfex.online", "https://www.securlyfex.online",
      "https://securlyfex.site", "https://www.securlyfex.site",
      "https://securly.site", "https://www.securly.site",
      "https://websitegames-topaz.vercel.app"
    ],

    /* Games on arcadecampushub.github.io are also served through
       play.<domain> (a Vercel rewrite). From the main domain that host is
       same-site, so a game's storage counts as first-party and survives
       private windows. Mirrors keep loading github.io directly. */
    gameProxy: {
      enabled: true,
      from: "https://arcadecampushub.github.io",
      /* Each mirror has its own play.<domain> so the game frame stays
         same-site no matter which domain the hub is loaded from. */
      to: "https://play." + (location.hostname || "arcadecampushub.online").replace(/^www\./, ""),
      /* Other game sites the play host also serves, at these paths. */
      extra: {
        "https://rzencoder.github.io/sonic-hedgehog-game": "/sonic-hedgehog-game"
      }
    },

    /* Fallback for any entry without a `host`, and for legacy catalogs whose
       paths are still root-relative. Empty means "same origin as this site". */
    gameBase: "",

    /* --------------------------------------------------------------- Accounts backend. */
    backend: "supabase",

    /* Used when backend === "supabase". */
    supabase: {
      url: "https://qopjzxrjkkljpumyirtb.supabase.co",
      anonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvcGp6eHJqa2tsanB1bXlpcnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE0NzYsImV4cCI6MjA5MTc2NzQ3Nn0." +
        "wHLn-q1OpO0HP87yiDGnNmHfnI0J_AUDEXT09HpKUNg"
    },

    /* Used when backend === "node". Empty means same origin.
       Also doubles as the base for /api/turn (see below) — a deployed
       Cloudflare Worker that mints TURN credentials server-side. */
    apiBase: "https://arcade-turn.stealzers-com.workers.dev",

    /* --------------------------------------------------------------- TURN relay for voice/video calls. */
    turn: {
      enabled: false,
      servers: []
    },

    defaults: {
      skin: "noir",            // see `skins` below
      lite: false,             // drop motion + grid overlay on slow hardware
      motion: true,            // animations; separate from lite mode
      textSize: "normal",      // normal | large | huge
      autoFullscreen: false,
      confirmExternal: true,
      view: "grid",            // grid | list
      sort: "title",           // default ordering in the index
      shortcuts: true,         // single-key shortcuts (/ K R P F)
      dock: true,              // floating chat, bottom right
      autoBackup: true,        // push game progress to the account as you play
      hideUnavailable: false,  // drop unhosted titles from the index entirely
      cloakDisguise: "google", // tab title/favicon used by the hidden-tab launcher
      adminKey: "l"            // Ctrl/Cmd + this opens the console (staff only)
    },

    /* Category presentation: label, glyph, accent used by the index tiles. */
    categories: {
      arcade:     { label: "Arcade",     icon: "◈" },
      action:     { label: "Action",     icon: "✷" },
      fighting:   { label: "Fighting",   icon: "✊" },
      shooter:    { label: "Shooter",    icon: "◘" },
      puzzle:     { label: "Puzzle",     icon: "◱" },
      strategy:   { label: "Strategy",   icon: "⬢" },
      horror:     { label: "Horror",     icon: "☾" },
      platformer: { label: "Platformer", icon: "▟" },
      sports:     { label: "Sports",     icon: "◎" },
      racing:     { label: "Racing",     icon: "➤" },
      adventure:  { label: "Adventure",  icon: "⛰" },
      simulation: { label: "Simulation", icon: "⚙" },
      rpg:        { label: "RPG",        icon: "✦" },
      sandbox:    { label: "Sandbox",    icon: "▦" },
      idle:       { label: "Idle",       icon: "◔" },
      clicker:    { label: "Clicker",    icon: "◉" },
      cards:      { label: "Cards",      icon: "♠" },
      board:      { label: "Board",      icon: "⛃" },
      trivia:     { label: "Trivia",     icon: "?" },
      music:      { label: "Music",      icon: "♪" },
      io:         { label: ".io / Online", icon: "⚇" },
      emulator:   { label: "Emulator",   icon: "▤" },
      tower:      { label: "Tower Defense", icon: "♜" },
      escape:     { label: "Escape",     icon: "⚿" },
      multiplayer:{ label: "Multiplayer",icon: "⚭" },
      retro:      { label: "Retro",      icon: "▤" },
      other:      { label: "Other",      icon: "◇" }
    },

    /* Skin picker. `chips` are the two swatch bands in the settings sheet. */
    skins: [
      { id: "noir",      label: "Noir",      dark: true,  chips: ["#0c0d10", "#ff5c33"] },
      { id: "slate",     label: "Slate",     dark: true,  chips: ["#1a1e24", "#ffa03d"] },
      { id: "blueprint", label: "Blueprint", dark: true,  chips: ["#071021", "#4dd9ff"] },
      { id: "terminal",  label: "Terminal",  dark: true,  chips: ["#060a07", "#38e07b"] },
      { id: "grape",     label: "Grape",     dark: true,  chips: ["#140a1f", "#b06cff"] },
      { id: "ember",     label: "Ember",     dark: true,  chips: ["#160d0a", "#ff8a3d"] },
      { id: "paper",     label: "Paper",     dark: false, chips: ["#f7f5f1", "#d13a12"] },
      { id: "linen",     label: "Linen",     dark: false, chips: ["#f4f6f8", "#0f6fd1"] }
    ],

    /* Old v1 theme ids → v2 skins, so saved settings survive the redesign. */
    skinAliases: {
      light: "paper",
      gray: "slate",
      black: "noir",
      midnight: "blueprint",
      arcade: "terminal"
    }
  };

  /* Switch the proxied hosts over on any of the hub's own domains — every
     mirror has its own play.<domain> (see vercel.json), so this isn't
     limited to the main domain anymore. The original github.io bases stay
     in `direct` so old saves can be found. */
  var px = window.SITE.gameProxy;
  var onHub = window.SITE.domains.some(function (d) {
    try {
      var h = new URL(d).hostname;
      return location.hostname === h || location.hostname.slice(-(h.length + 1)) === "." + h;
    } catch (e) { return false; }
  });
  px.active = !!(px.enabled && onHub);
  px.direct = {};
  if (px.active) {
    var hosts = window.SITE.gameHosts;
    Object.keys(hosts).forEach(function (k) {
      if (hosts[k].indexOf(px.from + "/") !== 0) return;
      px.direct[k] = hosts[k];
      hosts[k] = px.to + hosts[k].slice(px.from.length);
    });
  }
})();
