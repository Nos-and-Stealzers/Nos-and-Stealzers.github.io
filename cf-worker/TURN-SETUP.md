# Enable cross-network calling (TURN) — 2-minute setup

Voice/video calls already work **on the same network / open Wi-Fi** (STUN handles that).
To make them connect across **mobile data, school/work firewalls and symmetric NAT**,
the site needs a **TURN relay**. There is no reliable *free no-signup* TURN anymore,
so this is the one step that needs a quick dashboard login. Cloudflare's is free
(1,000 GB relay/month, no credit card).

Everything on the site side is already wired — you only need to create the credential
and paste it into `js/core/config.js`.

## Option A — Cloudflare Realtime TURN (recommended, free)

1. Go to **dash.cloudflare.com → Realtime → TURN → Create**.
2. Name it `arcade-hub` and copy the **Turn Token ID** and the **API Token**.
3. Get ready-to-use credentials once with curl (replace the two values):

   ```bash
   curl -s -X POST \
     "https://rtc.live.cloudflare.com/v1/turn/keys/<TURN_TOKEN_ID>/credentials/generate-ice-servers" \
     -H "Authorization: Bearer <API_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"ttl": 86400}'
   ```

   That returns an `iceServers` array with a `turn:` URL, `username`, and `credential`.

   > Note: Cloudflare TURN credentials are **short-lived** (max ~48h). For a
   > permanent site, deploy the included Worker (`cf-worker/turn-worker.js`) which
   > mints fresh credentials on every call. See Option C.

## Option B — Metered.ca free TURN (50 GB/mo, permanent static creds)

1. Sign up free at **metered.ca** → TURN Server → copy your **username + credential**
   and the `turn:` URLs (they don't expire).
2. Paste them into `js/core/config.js` under `turn`:

   ```js
   turn: {
     enabled: true,
     servers: [
       { urls: "turn:global.relay.metered.ca:80",  username: "<user>", credential: "<cred>" },
       { urls: "turn:global.relay.metered.ca:443", username: "<user>", credential: "<cred>" },
       { urls: "turn:global.relay.metered.ca:443?transport=tcp", username: "<user>", credential: "<cred>" }
     ]
   }
   ```
3. Commit + push. Done — calls now connect everywhere.

## Option C — Deploy the Cloudflare TURN Worker (permanent, auto-refreshing)

The repo ships `cf-worker/turn-worker.js`, a Worker that serves `/api/turn` and
mints fresh Cloudflare TURN credentials server-side (the API token never reaches
the browser).

1. `cd cf-worker && npx wrangler@latest login` (opens the dashboard once).
2. `npx wrangler@latest deploy` — note the `*.workers.dev` URL.
3. `npx wrangler@latest secret put CF_TURN_KEY_ID`  (paste the Turn Token ID)
   `npx wrangler@latest secret put CF_TURN_API_TOKEN` (paste the API Token)
4. In `js/core/config.js` set `apiBase` to the Worker's origin (e.g.
   `"https://arcade-turn.<you>.workers.dev"`). The client already calls
   `apiBase + "/api/turn"` and uses whatever relay it returns.

## How to confirm it worked

Open the site on **mobile data** (not Wi-Fi) on one device and Wi-Fi on another,
and start a call. If it connects with video/audio, TURN is working. Before TURN,
that cross-network case shows "can't connect" on the tile — which is now accurate.
