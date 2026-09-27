/* Arcade Hub — ICE / TURN endpoint (Cloudflare Worker).
 *
 * Serves GET /api/turn (and /turn) with a WebRTC iceServers array for the
 * arcade's voice/video calls. Deployed to the site owner's Cloudflare account
 * so it has a permanent URL and does not depend on the old Vercel backend.
 *
 * STUN always works (free, no credentials). If the Worker has TURN credentials
 * in its environment it also returns a relay, which is what makes calls connect
 * across mobile data / school / symmetric-NAT networks:
 *   - CF_TURN_KEY_ID + CF_TURN_API_TOKEN  -> mints short-lived Cloudflare
 *     Realtime TURN credentials server-side (token never ships to the browser).
 *   - or STATIC_TURN_JSON = a JSON array of {urls,username,credential} objects
 *     for any other TURN provider.
 * With neither set it returns STUN only (turn:false) so calls still work on
 * open networks and the client falls back cleanly.
 */

const STUN = {
  urls: [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
    "stun:stun.cloudflare.com:3478",
  ],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SUPABASE_URL = "https://qopjzxrjkkljpumyirtb.supabase.co";
// The project's public anon key (the same one the site ships); not a secret.
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvcGp6eHJqa2tsanB1bXlpcnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE0NzYsImV4cCI6MjA5MTc2NzQ3Nn0.wHLn-q1OpO0HP87yiDGnNmHfnI0J_AUDEXT09HpKUNg";

// Relay credentials cost bandwidth on our account, so they are only minted
// for a signed-in hub user: the site POSTs its Supabase access token and we
// ask Supabase who it belongs to. ALLOWED_ORIGINS (comma separated) can
// additionally pin which sites may ask.
async function signedIn(request, env) {
  if (request.method !== "POST") return false;
  const token = (await request.text()).trim();
  if (!token || token.length > 4096 || token.split(".").length !== 3) return false;
  const url = (env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, "");
  const anon = env.SUPABASE_ANON_KEY || SUPABASE_ANON;
  try {
    const r = await fetch(url + "/auth/v1/user", {
      headers: { apikey: anon, Authorization: "Bearer " + token },
    });
    if (!r.ok) return false;
    const user = await r.json();
    return !!(user && user.id);
  } catch (e) {
    return false;
  }
}

function originAllowed(request, env) {
  if (!env.ALLOWED_ORIGINS) return true;
  const origin = request.headers.get("Origin") || "";
  return env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const json = (code, obj) =>
      new Response(JSON.stringify(obj), {
        status: code,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
      });

    // Anyone else still gets public STUN, which costs nothing.
    if (!originAllowed(request, env) || !(await signedIn(request, env))) {
      return json(200, { iceServers: [STUN], turn: false, reason: "sign_in_required" });
    }

    // 1) Cloudflare Realtime TURN, minted server-side.
    if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) {
      try {
        const r = await fetch(
          "https://rtc.live.cloudflare.com/v1/turn/keys/" +
            encodeURIComponent(env.CF_TURN_KEY_ID) +
            "/credentials/generate-ice-servers",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + env.CF_TURN_API_TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ttl: 14400 }),
          }
        );
        if (r.ok) {
          const data = await r.json();
          const servers = data.iceServers
            ? Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers]
            : [];
          servers.unshift(STUN);
          return json(200, { iceServers: servers, turn: true });
        }
      } catch (e) { /* fall through to STUN */ }
    }

    // 2) Static TURN from any provider.
    if (env.STATIC_TURN_JSON) {
      try {
        const extra = JSON.parse(env.STATIC_TURN_JSON);
        if (Array.isArray(extra) && extra.length) {
          return json(200, { iceServers: [STUN, ...extra], turn: true });
        }
      } catch (e) { /* fall through */ }
    }

    // 3) STUN only.
    return json(200, { iceServers: [STUN], turn: false, reason: "stun_only" });
  },
};
