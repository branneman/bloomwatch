# WCL Auth Spike — Design

Backlog story: [001 — WCL API access spike](../backlog.md#001--wcl-api-access-spike).

## Goal

Prove (or disprove) a backend-less way to call the WCL API v2 (GraphQL) from a static page, and confirm fresh-realm report codes resolve, before any feature work starts. Exit with either a working pipeline or a written recommendation — per the roadmap's Phase 0 exit criterion.

## Non-goals

- Production auth UX (token refresh, error recovery, styling). This file is a disposable diagnostic artifact, not the app.
- Deciding the eventual build tooling for the real app (tracked separately, e.g. story 801).

## Hosting & file layout

- Single `index.html` at the repo root. Zero dependencies, zero build step — plain HTML + inline `<script>`.
- GitHub Pages: "Deploy from branch: `main` / `(root)`".
- Live URL: `https://branneman.github.io/bloomwatch/` — this is the exact `redirect_uri` registered with the WCL client and sent in the auth request.

## Auth flow

Attempted in order; each step only happens if the previous one fails.

### 1. Authorization Code + PKCE (no client secret) — primary

- One-time "paste your Client ID" input, saved to `localStorage`.
- "Connect to Warcraft Logs" button generates a `code_verifier` (random string) and `code_challenge` (SHA-256, base64url), stashes the verifier in `sessionStorage`, and redirects to WCL's authorize endpoint with `client_id`, `redirect_uri`, `response_type=code`, `code_challenge`, `code_challenge_method=S256`, and a random `state`.
- On return, the page reads `?code=&state=` from the URL, validates `state` against `sessionStorage`, then `fetch()`-POSTs to WCL's token endpoint with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier` — no secret sent.
- Success criterion: an `access_token` comes back from a request made entirely in the browser.

### 2. Client Credentials grant (with a pasted secret) — fallback

- Only built if step 1 fails (CORS error, or a 400 indicating a secret is required).
- Adds a "Client Secret" input (also saved to `localStorage`).
- `fetch()`-POSTs to the token endpoint with `grant_type=client_credentials`, `client_id`, `client_secret`.
- Sufficient for reading public report data (no per-user login needed), matching roadmap candidate #2.

### 3. Manually-obtained bearer token — last resort, documentation only

- Only reached if step 2 also fails (e.g. the token endpoint has no CORS support at all for browser calls).
- Not built as UI in this spike. Documented as a written recommendation: a one-liner (e.g. `curl`) showing how to obtain a token manually and paste it into a token field, matching roadmap candidate #3.

Whichever step succeeds is the one moved forward with. Steps that were tried and failed get a short "tried, didn't work because X" note in the findings doc — this is exactly the trade-off documentation the acceptance criteria calls for.

## Report data fetch

Once a token exists:

- **Query 1 (required by AC):** `reportData.report(code: "4GYHZRdtL3bvhpc8")` for the fight list (id, name, start/end time). This report is a real SSC/TK/Gruul raid (Spinershatter EU, TBC Anniversary) containing the user's resto druid, Dassz.
  - The exact endpoint host/path (`www.warcraftlogs.com/api/v2/client` vs `/user`, depending on which grant type succeeded) and whether `fresh.` report codes resolve against it are confirmed empirically here — this is the fresh-realm host-resolution requirement from the AC.
- **Query 2 (stretch, matches the roadmap's stated exit criterion):** locate Dassz in the report's actors/player details, pick one fight, query cast events for that fight + source, render as a simple timestamp + ability-name list.
- Rendering is bare-bones (a plain list or near-raw JSON dump) — no styling investment, since this file isn't the product.

## Error handling

Deliberately verbose, not user-friendly: any failed `fetch` (token exchange or GraphQL) dumps the raw response status/body onto the page. The audience for errors here is us, debugging the pipeline live.

## Testing / verification

No automated tests. Verification is manual and live: deploy to Pages, click through the real flow in a browser using a freshly-registered WCL client, and confirm the fight list and Dassz's cast timeline render from the real report.

## Documentation deliverables

- Update `docs/roadmap.md`'s "Architecture snapshot" section: replace the "candidate approaches, to be resolved" language with the resolved answer — which auth flow worked, and the confirmed API host for fresh-realm reports.
- Add `docs/wcl-auth.md`: the concrete how-to — client registration steps (with screenshots/steps as needed), the redirect URI, request/response shapes for whichever flow(s) were attempted, and the curl example for the manual-fallback path.
- `index.html` stays in the repo afterward as a working reference artifact, not deleted post-spike.
