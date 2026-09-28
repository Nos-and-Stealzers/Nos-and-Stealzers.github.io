/* Vercel serverless function — sign in on one of the hub's domains using
 * the session you already have on another.
 *
 * Every mirror domain has its own browser storage, so a sign-in on one never
 * reached the others. Sharing the same refresh token between them would
 * break: Supabase rotates it on every refresh and treats a reused one as
 * stolen. Instead each domain gets its own session, created here from a
 * one-time login code.
 *
 * Flow (see sso.html):
 *   1. A signed-out domain sends you to /sso.html on a domain where you're
 *      signed in, with ?to=<its origin>&state=<random>.
 *   2. That page POSTs your access token and the target origin here.
 *   3. This checks the token with Supabase, refuses banned accounts and any
 *      target that isn't one of the hub's own domains, and asks Supabase
 *      (with the service key, which never leaves the server) for a one-time
 *      login code for your account.
 *   4. The page sends you back to the target with the code in the URL
 *      fragment; the target trades it for its own session and checks the
 *      state it started with.
 *
 * Setup (one time): in the Vercel project, Settings -> Environment Variables,
 * add SUPABASE_SERVICE_ROLE_KEY (Supabase -> Project Settings -> API ->
 * service_role key; mark it Sensitive), then redeploy. Until then this
 * answers 503 and the site offers the normal sign-in form instead.
 */

const SUPABASE_URL = "https://qopjzxrjkkljpumyirtb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvcGp6eHJqa2tsanB1bXlpcnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE0NzYsImV4cCI6MjA5MTc2NzQ3Nn0.wHLn-q1OpO0HP87yiDGnNmHfnI0J_AUDEXT09HpKUNg"; // public anon key, same as the site ships

/* The hub's own domains. Exact origins only: a login code must never be
   handed to anything else. Keep in step with SITE.domains in js/core/config.js. */
const HUB_ORIGINS = new Set([
  "https://arcadecampushub.online",
  "https://www.arcadecampushub.online",
  "https://arcadecampushub.space",
  "https://www.arcadecampushub.space",
  "https://arcadecampushub.fun",
  "https://www.arcadecampushub.fun",
  "https://poppersarcade.online",
  "https://www.poppersarcade.online",
  "https://geniussis.online",
  "https://www.geniussis.online",
  "https://geniussis.space",
  "https://www.geniussis.space",
  "https://securlyfex.online",
  "https://www.securlyfex.online",
  "https://securlyfex.site",
  "https://www.securlyfex.site",
  "https://securly.site",
  "https://www.securly.site",
  "https://websitegames-topaz.vercel.app"
]);

function readBody(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (req.body && typeof req.body === "object") return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 8192) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only." });

  /* Only the hub's own pages may ask. A browser always sends Origin on a
     cross-site or POST fetch, and a page can't forge it. */
  const origin = String(req.headers.origin || "");
  if (!HUB_ORIGINS.has(origin)) return send(res, 403, { error: "Not allowed from here." });

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return send(res, 503, { error: "Cross-site sign-in isn't set up yet." });

  let input;
  try { input = JSON.parse(await readBody(req)); } catch (e) { input = null; }
  const token = input && typeof input.token === "string" ? input.token : "";
  const target = input && typeof input.target === "string" ? input.target : "";
  if (!token || token.length > 4096) return send(res, 401, { error: "Sign in first." });
  if (!HUB_ORIGINS.has(target)) return send(res, 400, { error: "That isn't one of the hub's sites." });

  try {
    /* Who is this? Supabase checks the token's signature and expiry. */
    const who = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + token }
    });
    if (!who.ok) return send(res, 401, { error: "Your session ended. Sign in again." });
    const user = await who.json();
    if (!user || !user.id || !user.email) return send(res, 401, { error: "Sign in first." });

    /* Banned accounts don't get a way in on another domain. */
    const prof = await fetch(SUPABASE_URL + "/rest/v1/profiles?select=banned&id=eq." + encodeURIComponent(user.id), {
      headers: { apikey: service, Authorization: "Bearer " + service }
    });
    const rows = prof.ok ? await prof.json() : null;
    if (!Array.isArray(rows) || !rows.length) return send(res, 403, { error: "Account not found." });
    if (rows[0].banned) return send(res, 403, { error: "This account is banned." });

    /* A one-time login code for this account. Nothing is emailed; the code
       works once and then it's spent. */
    const link = await fetch(SUPABASE_URL + "/auth/v1/admin/generate_link", {
      method: "POST",
      headers: {
        apikey: service,
        Authorization: "Bearer " + service,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "magiclink", email: user.email })
    });
    const out = link.ok ? await link.json() : null;
    const code = out && (out.hashed_token || (out.properties && out.properties.hashed_token));
    if (!code) return send(res, 502, { error: "Couldn't create a sign-in code. Try again." });

    return send(res, 200, { code: code });
  } catch (e) {
    return send(res, 502, { error: "The account server didn't answer. Try again." });
  }
};
