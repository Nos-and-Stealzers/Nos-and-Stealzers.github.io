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
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
            body: JSON.stringify({ ttl: 86400 }),
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
