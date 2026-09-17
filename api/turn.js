/* Vercel serverless function — mint short-lived Cloudflare TURN credentials.
 *
 * Voice/video calls need a TURN relay to connect through mobile data, school
 * and work firewalls, and symmetric NAT (STUN alone fails there). Cloudflare
 * Realtime TURN is free — 1,000 GB of relay per month, no card required.
 *
 * This runs SERVER-SIDE so the Cloudflare API token is never shipped to the
 * browser (the site's repo is public — a token in client JS would let anyone
 * burn the quota). The browser calls GET /api/turn and gets back a ready-to-use
 * iceServers array with fresh, time-limited credentials.
 *
 * Setup (one time, all free):
 *   1. dash.cloudflare.com  ->  Realtime  ->  TURN  ->  Create
 *   2. Copy the "Turn Token ID" and the "API Token".
 *   3. In the Vercel project: Settings -> Environment Variables, add:
 *        CLOUDFLARE_TURN_KEY_ID     = <Turn Token ID>
 *        CLOUDFLARE_TURN_API_TOKEN  = <API Token>   (mark it Secret)
 *   4. Redeploy. Done.
 *
 * Until those are set, this returns STUN only, so the site never breaks — calls
 * just keep working on open networks the way they do today.
 */

const STUN = {
  urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
};

module.exports = async (req, res) => {
  // Never cache: TURN credentials are short-lived and per-request.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  // Reply helper that works on BOTH Vercel (res.status().end) and a plain
  // Node http server (res.statusCode/res.end) — so local tests and prod agree.
  const send = (code, obj) => {
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;

  // Not configured yet — hand back STUN only so calling still works on open
  // networks. `turn:false` tells the client to try its config.js fallback.
  if (!keyId || !token) {
    send(200, { iceServers: [STUN], turn: false, reason: "not_configured" });
    return;
  }

  try {
    const cfRes = await fetch(
      "https://rtc.live.cloudflare.com/v1/turn/keys/" +
        encodeURIComponent(keyId) +
        "/credentials/generate-ice-servers",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        // 24h TTL: comfortably longer than any call, refreshed on each page load.
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    if (!cfRes.ok) {
      const detail = await cfRes.text().catch(() => "");
      send(200, { iceServers: [STUN], turn: false, reason: "cf_" + cfRes.status, detail: detail.slice(0, 200) });
      return;
    }

    // Cloudflare returns { iceServers: [ {urls:[stun...]}, {urls:[turn...], username, credential} ] }.
    const data = await cfRes.json();
    const cfList = (data && Array.isArray(data.iceServers)) ? data.iceServers : [];
    const hasTurn = cfList.some(function (s) {
      const u = Array.isArray(s.urls) ? s.urls.join(",") : String(s.urls || "");
      return /turns?:/.test(u) && s.username && s.credential;
    });

    // Always keep Google STUN in the list as a cheap first path, then append
    // everything Cloudflare handed back (its STUN + the credentialed TURN).
    const list = [STUN].concat(cfList);
    send(200, { iceServers: list, turn: hasTurn });
  } catch (err) {
    // Any failure falls back to STUN — never 500 the call path.
    send(200, { iceServers: [STUN], turn: false, reason: "exception" });
  }
};
