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

    /* Where the games are served from.
       Each catalog entry names its `host`; this maps that to an origin.
       The four repos are separate GitHub Pages sites — enable Pages on each
       (Settings → Pages → Deploy from branch → main → /root) and these URLs
       start working. Swap any of them for Vercel/Netlify/your own host and
       only this table changes. */
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

    /* Fallback for any entry without a `host`, and for legacy catalogs whose
       paths are still root-relative. Empty means "same origin as this site". */
    gameBase: "",

    /* ---------------------------------------------------------------
       Accounts backend. Pick ONE, or neither.

       "supabase" — hosted Postgres + Auth. Talks straight from the
                    browser, so the whole thing runs on Vercel with no
                    second server. Fill in `supabase` below and run
                    supabase/schema.sql once in the SQL editor.

       "node"     — the Express + SQLite server in server/. Needs a host
                    that runs a real process with a persistent disk.
                    Set `apiBase` to its URL (or leave empty when the
                    same server is also serving this site).

       "none"     — no accounts at all. Every account feature hides
                    itself and the arcade works exactly as it does now.

       "auto"     — (default) probe this origin for a node backend. Right
                    for local development; on static hosting it finds
                    nothing and quietly settles on "none".
       --------------------------------------------------------------- */
    backend: "supabase",

    /* Used when backend === "supabase".
       The anon key is MEANT to be public — row-level security is what
       protects the data. NEVER put a `sb_secret_…` / service-role key
       here; it bypasses RLS and would hand every visitor full database
       access. If one has ever been pasted anywhere public, rotate it. */
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

    /* ---------------------------------------------------------------
       TURN relay for voice/video calls.

       Calls now get their TURN relay from the /api/turn serverless
       function (Cloudflare Realtime TURN — free, 1,000 GB/mo, credentials
       minted server-side so no secret ships to the browser). That is the
       primary and recommended path; see api/turn.js.

       This block is only a STATIC FALLBACK used when /api/turn is
       unreachable or not configured. It is disabled by default because
       there is no reliable free no-signup TURN server to hard-code — the
       old public ones (OpenRelay etc.) now reject with allocate errors.
       To use your own relay without the serverless function, set
       enabled:true and fill `servers` with { urls, username, credential }.
       --------------------------------------------------------------- */
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
})();
