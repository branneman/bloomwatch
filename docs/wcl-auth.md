# WCL API Auth — How To

Findings from the Phase 0 spike (backlog story 001, `docs/specs/wcl-auth-spike-design.md`). Reference implementation: `index.html` at the repo root.

## Registering a WCL API v2 client

1. Go to `https://www.warcraftlogs.com/api/clients/` (while logged into WCL).
2. Click "Create Client".
3. Application Name: anything (e.g. `Bloomwatch`).
4. Redirect URL: your GitHub Pages URL, exactly, including the trailing slash (e.g. `https://branneman.github.io/bloomwatch/`).
5. Check "Public Client" — this is what enables the no-secret PKCE flow below.
6. Save. Copy the Client ID.

## Working auth flow

Authorization Code + PKCE succeeded on the first attempt, no client secret required.

Request:
```
POST https://www.warcraftlogs.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&client_id=...&redirect_uri=https://branneman.github.io/bloomwatch/&code=...&code_verifier=...
```

Response:
```json
{"token_type":"Bearer","expires_in":31104000,"access_token":"REDACTED","refresh_token":"REDACTED"}
```

## Flows that were tried and didn't work

None — PKCE succeeded on the first attempt. The Client Credentials fallback (plan Task 4) was never implemented or tested, since it wasn't needed.

## Report API host

Confirmed working endpoint: `https://www.warcraftlogs.com/api/v2/user` (the "user"-scoped GraphQL endpoint, matching a PKCE-issued user token). Fresh-realm report codes (tested with `4GYHZRdtL3bvhpc8`, a Spinershatter EU TBC Anniversary report) resolve against this host with no special handling — the `fresh.warcraftlogs.com` link prefix doesn't change the API host or require any different query shape. The report returned its real title ("SSC+TK 2026-07-07") and 72 fights.

As a stretch check, the report's `masterData.actors` list also resolved correctly and included the target druid (Dassz, actor id 2) by exact name match — confirming actor lookups work the same way. A cast-events query for Dassz against the report's first fight ID returned an empty event list; this is because the naive "pick fights[0]" logic landed on a zero-duration trash/pull segment, not a real boss encounter — not an API or auth problem. The confirmed fight list already distinguishes real encounters from trash/pull markers by duration — e.g. fight id 6, "The Lurker Below", has `startTime` 1879119 and `endTime` 2036920 (a real ~158s encounter), unlike fight id 1 ("Unknown", `startTime` and `endTime` both 760292 — zero duration, not a real fight). A future implementation should pick a fight by duration or by boss-encounter type rather than by list position; this wasn't re-verified with a second `events` query in this spike.

## Manual bearer token (last-resort fallback)

Not needed for this spike — PKCE worked directly from the browser. If a future environment can't complete the PKCE flow, a token can still be obtained manually:

```bash
curl -X POST https://www.warcraftlogs.com/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET
```

Paste the resulting `access_token` into the app's token field (not implemented as UI in this spike — see `docs/specs/wcl-auth-spike-design.md`).
