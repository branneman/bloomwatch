# WCL Auth Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove (or disprove) a backend-less way to call WCL API v2 (GraphQL) from a static page, hosted on GitHub Pages, and confirm fresh-realm report codes resolve — per [backlog story 001](../backlog.md#001--wcl-api-access-spike) and the [design spec](../specs/wcl-auth-spike-design.md).

**Architecture:** A single zero-dependency `index.html` at the repo root implements an Authorization Code + PKCE OAuth flow against WCL's v2 auth endpoints (no client secret). If that fails (CORS, or the token endpoint demands a secret), a Client Credentials fallback is added. Whichever flow yields a bearer token is used to call WCL's GraphQL API and render the fight list — and, as a stretch goal, the cast timeline — of a real report (`4GYHZRdtL3bvhpc8`).

**Tech Stack:** Plain HTML/CSS/JS, no framework, no build step, no npm. WCL API v2 (GraphQL over HTTPS). OAuth2 Authorization Code + PKCE, with Client Credentials as a coded fallback. GitHub Pages for hosting.

## Global Constraints

- No backend / no server-side code — every request (OAuth token exchange, GraphQL calls) happens in the browser. (CLAUDE.md principle 2)
- Zero dependencies, zero build step — plain HTML + inline `<script>`. (spec: Hosting & file layout)
- No secrets required at build or deploy time. A pasted Client Secret (Task 4, if needed) is a runtime user input stored in `localStorage`, never a build-time secret. (CLAUDE.md, spec step 2)
- Commit messages follow Conventional Commits: `type(scope): summary`. (CLAUDE.md)
- The report code `4GYHZRdtL3bvhpc8` is intentionally hardcoded — this file is a disposable diagnostic artifact, not the product. (spec: Report data fetch)
- `index.html` stays in the repo permanently after the spike as a reference artifact — never delete it. (spec: Documentation deliverables)
- Error handling is deliberately verbose: dump raw response status/body on any failure. No user-friendly error UX. (spec: Error handling)
- No automated tests. Verification is manual and live against the deployed GitHub Pages URL. (spec: Testing / verification)

---

## Before Task 1: one-time GitHub Pages setup

This isn't a coding task, but later tasks require the page to be live at a stable URL before OAuth testing can work (the redirect URI must exactly match what's registered with WCL).

- [ ] **Step 1: Enable GitHub Pages**

In the `branneman/bloomwatch` repo on GitHub: Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save.

- [ ] **Step 2: Confirm the live URL**

After a minute, visit `https://branneman.github.io/bloomwatch/`. It's fine if this 404s right now (no `index.html` exists yet) — you're confirming Pages is wired up, not that content exists. A GitHub-branded 404 page confirms Pages is live; a "there isn't a GitHub Pages site here" message means Pages isn't enabled yet — go back to Step 1.

---

### Task 1: Register WCL client + scaffold the spike page

**Files:**

- Create: `index.html`

**Interfaces:**

- Produces: `localStorage` keys `wcl_client_id`, `wcl_client_secret`; DOM ids `client-id`, `client-secret`, `save-creds`, `log`; JS function `log(msg)` (appends a line to the `#log` panel and mirrors to `console.log`) — every later task's diagnostics go through this.

- [ ] **Step 1: Register a WCL API v2 client**

Go to `https://www.warcraftlogs.com/api/clients/` while logged into your WCL account (if that path 404s, look for "API Clients" under your WCL account settings — WCL's UI has moved this before). Click "Create Client". Fill in:

- Application Name: `Bloomwatch (dev)`
- Redirect URL: `https://branneman.github.io/bloomwatch/` — must match exactly, including the trailing slash.

Save, then copy the generated **Client ID**. You'll paste it into the page in Step 3. Leave the Client Secret alone for now — Task 3 will tell you whether you need it.

- [ ] **Step 2: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bloomwatch — WCL Auth Spike</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        font-family: monospace;
        max-width: 800px;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      label {
        display: block;
        margin-top: 1rem;
      }
      input {
        width: 100%;
        padding: 0.4rem;
        box-sizing: border-box;
      }
      button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        margin-right: 0.5rem;
      }
      #log {
        white-space: pre-wrap;
        background: #111;
        color: #0f0;
        padding: 1rem;
        margin-top: 1.5rem;
        min-height: 4rem;
        font-size: 0.85rem;
      }
    </style>
  </head>
  <body>
    <h1>Bloomwatch — WCL Auth Spike</h1>
    <p>
      Diagnostic page for backlog story 001. Not the product — see
      <a href="docs/specs/wcl-auth-spike-design.md">the design spec</a>.
    </p>

    <label
      >WCL Client ID
      <input type="text" id="client-id" />
    </label>
    <label
      >WCL Client Secret (only needed if PKCE fails)
      <input type="text" id="client-secret" />
    </label>
    <button id="save-creds">Save credentials</button>

    <div id="log"></div>

    <script>
      const logEl = document.getElementById("log");
      function log(msg) {
        logEl.textContent += (logEl.textContent ? "\n\n" : "") + msg;
        console.log(msg);
      }

      document.getElementById("client-id").value =
        localStorage.getItem("wcl_client_id") || "";
      document.getElementById("client-secret").value =
        localStorage.getItem("wcl_client_secret") || "";

      document.getElementById("save-creds").addEventListener("click", () => {
        localStorage.setItem(
          "wcl_client_id",
          document.getElementById("client-id").value.trim(),
        );
        localStorage.setItem(
          "wcl_client_secret",
          document.getElementById("client-secret").value.trim(),
        );
        log("Saved credentials to localStorage.");
      });
    </script>
  </body>
</html>
```

- [ ] **Step 3: Commit and push**

```bash
git add index.html
git commit -m "feat(auth): scaffold WCL auth spike page with credential storage"
git push
```

- [ ] **Step 4: Verify live**

Wait ~1 minute for Pages to rebuild, then visit `https://branneman.github.io/bloomwatch/`. Expected:

- The page loads with the two credential inputs and a "Save credentials" button.
- Paste the Client ID from Step 1 into the "WCL Client ID" field, leave the secret blank, click "Save credentials".
- Expected: the log panel shows `Saved credentials to localStorage.`
- Reload the page. Expected: the Client ID field still shows your pasted value (confirms `localStorage` persistence).

---

### Task 2: PKCE authorize redirect

**Files:**

- Modify: `index.html`

**Interfaces:**

- Consumes: `log(msg)`, `localStorage.wcl_client_id` (Task 1).
- Produces: JS functions `base64urlEncode(buffer)`, `generateRandomString(length)`, `generateCodeChallenge(verifier)`, `redirectUri()`; `sessionStorage` keys `pkce_verifier`, `pkce_state`; DOM id `connect-pkce`; constant `AUTHORIZE_URL`.

- [ ] **Step 1: Add the PKCE helpers and the Connect button**

Add a new button in the body, right after the "Save credentials" button:

```html
<button id="save-creds">Save credentials</button>
<button id="connect-pkce">Connect (PKCE)</button>
```

Add the following to the `<script>` block, after the `save-creds` click handler and before the closing `</script>`:

```javascript
// --- PKCE helpers ---
const AUTHORIZE_URL = "https://www.warcraftlogs.com/oauth/authorize";

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateRandomString(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes.buffer).slice(0, length);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(digest);
}

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

// --- PKCE connect ---
document.getElementById("connect-pkce").addEventListener("click", async () => {
  const clientId = localStorage.getItem("wcl_client_id");
  if (!clientId) {
    log("ERROR: save a Client ID first.");
    return;
  }

  const verifier = generateRandomString(64);
  const state = generateRandomString(32);
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  const url = AUTHORIZE_URL + "?" + params.toString();
  log("Redirecting to: " + url);
  window.location.href = url;
});
```

- [ ] **Step 2: Commit and push**

```bash
git add index.html
git commit -m "feat(auth): add PKCE authorize redirect"
git push
```

- [ ] **Step 3: Verify live**

Visit `https://branneman.github.io/bloomwatch/`, confirm your Client ID is still saved (from Task 1), then click "Connect (PKCE)". Expected:

- The log panel briefly shows a line starting `Redirecting to: https://www.warcraftlogs.com/oauth/authorize?client_id=...&redirect_uri=https%3A%2F%2Fbranneman.github.io%2Fbloomwatch%2F&response_type=code&code_challenge=...&code_challenge_method=S256&state=...` before navigation happens.
- The browser navigates to a `warcraftlogs.com` login/consent screen (or straight to consent if already logged in).
- **Do not approve yet** — this task only proves the redirect is well-formed. If the browser lands on a WCL "invalid redirect_uri" or "invalid client" error page instead, stop and recheck the Client ID and the exact registered redirect URL from Task 1.

---

### Task 3: OAuth callback handling and token exchange

**Files:**

- Modify: `index.html`

**Interfaces:**

- Consumes: `log(msg)`, `redirectUri()`, `localStorage.wcl_client_id`, `sessionStorage.pkce_verifier`, `sessionStorage.pkce_state` (Task 2).
- Produces: `sessionStorage` keys `access_token`, `token_source` (`'pkce'`); constant `TOKEN_URL`; function `handleCallback()`, invoked immediately on page load.

- [ ] **Step 1: Add callback handling**

Add to the `<script>` block, after the PKCE connect handler from Task 2:

```javascript
// --- OAuth callback handling ---
const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return;

  const expectedState = sessionStorage.getItem("pkce_state");
  const verifier = sessionStorage.getItem("pkce_verifier");
  history.replaceState({}, "", window.location.pathname);

  if (state !== expectedState) {
    log(
      "ERROR: state mismatch.\nExpected: " + expectedState + "\nGot: " + state,
    );
    return;
  }

  const clientId = localStorage.getItem("wcl_client_id");
  log("Exchanging code for token (PKCE, no secret)...");
  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri(),
        code,
        code_verifier: verifier,
      }),
    });
    const bodyText = await resp.text();
    log("Token endpoint responded " + resp.status + ":\n" + bodyText);
    if (!resp.ok) return;
    const data = JSON.parse(bodyText);
    sessionStorage.setItem("access_token", data.access_token);
    sessionStorage.setItem("token_source", "pkce");
    log("Access token acquired via PKCE.");
  } catch (err) {
    log("FETCH ERROR during token exchange (possibly CORS): " + err.message);
  }
}
handleCallback();
```

- [ ] **Step 2: Commit and push**

```bash
git add index.html
git commit -m "feat(auth): handle PKCE OAuth callback and token exchange"
git push
```

- [ ] **Step 3: Verify live — this determines whether Task 4 is needed**

Visit `https://branneman.github.io/bloomwatch/`, click "Connect (PKCE)", and this time approve the consent screen on warcraftlogs.com. You'll be redirected back to the page with `?code=...&state=...` in the URL. Expected, one of:

- **Success:** the log shows `Token endpoint responded 200:` followed by a JSON body containing `access_token`, then `Access token acquired via PKCE.` The URL bar cleans up back to `https://branneman.github.io/bloomwatch/`. → PKCE works. **Skip Task 4.**
- **CORS failure:** the log shows `FETCH ERROR during token exchange (possibly CORS): ...` (the browser blocked the cross-origin POST). → **Task 4 is required.**
- **400 response requiring a secret:** the log shows `Token endpoint responded 400:` with a body indicating the client isn't a public/PKCE-enabled client. → **Task 4 is required.**

Record which of these three happened — it's the finding for Task 7's documentation.

---

### Task 4: Client Credentials fallback (only if Task 3 failed)

Skip this entire task if Task 3's PKCE flow succeeded.

**Files:**

- Modify: `index.html`

**Interfaces:**

- Consumes: `log(msg)`, `localStorage.wcl_client_id`, `localStorage.wcl_client_secret`, `TOKEN_URL` (Task 3).
- Produces: `sessionStorage.access_token`, `sessionStorage.token_source` (`'client_credentials'`); DOM id `connect-cc`.

- [ ] **Step 1: Add the Client Credentials button and handler**

Add a new button after "Connect (PKCE)":

```html
<button id="connect-pkce">Connect (PKCE)</button>
<button id="connect-cc">Connect (Client Credentials)</button>
```

Add to the `<script>` block, after `handleCallback();`:

```javascript
// --- Client Credentials fallback ---
document.getElementById("connect-cc").addEventListener("click", async () => {
  const clientId = localStorage.getItem("wcl_client_id");
  const clientSecret = localStorage.getItem("wcl_client_secret");
  if (!clientId || !clientSecret) {
    log("ERROR: save both Client ID and Client Secret first.");
    return;
  }

  log("Requesting token via client_credentials...");
  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const bodyText = await resp.text();
    log("Token endpoint responded " + resp.status + ":\n" + bodyText);
    if (!resp.ok) return;
    const data = JSON.parse(bodyText);
    sessionStorage.setItem("access_token", data.access_token);
    sessionStorage.setItem("token_source", "client_credentials");
    log("Access token acquired via client_credentials.");
  } catch (err) {
    log(
      "FETCH ERROR during client_credentials request (possibly CORS): " +
        err.message,
    );
  }
});
```

- [ ] **Step 2: Commit and push**

```bash
git add index.html
git commit -m "feat(auth): add client credentials fallback flow"
git push
```

- [ ] **Step 3: Verify live**

On your WCL client settings page, generate/copy a Client Secret and paste it into the page's "WCL Client Secret" field, click "Save credentials". Visit `https://branneman.github.io/bloomwatch/` and click "Connect (Client Credentials)". Expected: log shows `Token endpoint responded 200:` with an `access_token` body, then `Access token acquired via client_credentials.`

If this also fails (CORS or otherwise), note it — per the spec, step 3 (manually-obtained bearer token) becomes a documentation-only recommendation, not further code in this spike.

---

### Task 5: Fetch report fight list (GraphQL Query 1 — required)

**Files:**

- Modify: `index.html`

**Interfaces:**

- Consumes: `log(msg)`, `sessionStorage.access_token`, `sessionStorage.token_source` (Task 3 or 4).
- Produces: async function `graphql(query)` returning parsed JSON or `null`; constants `USER_API_URL`, `CLIENT_API_URL`, `REPORT_CODE`; DOM id `fetch-report`.

- [ ] **Step 1: Add the GraphQL helper and the report query button**

Add a new button after the connect buttons:

```html
<button id="connect-cc">Connect (Client Credentials)</button>
<button id="fetch-report">Fetch report 4GYHZRdtL3bvhpc8</button>
```

Add to the `<script>` block, after the Client Credentials handler (or after `handleCallback();` if Task 4 was skipped):

```javascript
// --- GraphQL helper ---
const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";
const CLIENT_API_URL = "https://www.warcraftlogs.com/api/v2/client";
const REPORT_CODE = "4GYHZRdtL3bvhpc8";

async function graphql(query) {
  const token = sessionStorage.getItem("access_token");
  const source = sessionStorage.getItem("token_source");
  if (!token) {
    log("ERROR: no access token yet. Connect first.");
    return null;
  }

  const endpoint =
    source === "client_credentials" ? CLIENT_API_URL : USER_API_URL;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ query }),
    });
    const bodyText = await resp.text();
    log(endpoint + " responded " + resp.status + ":\n" + bodyText);
    if (!resp.ok) return null;
    return JSON.parse(bodyText);
  } catch (err) {
    log("FETCH ERROR calling " + endpoint + " (possibly CORS): " + err.message);
    return null;
  }
}

// --- Query 1: report fight list ---
document.getElementById("fetch-report").addEventListener("click", () => {
  graphql(`query {
  reportData {
    report(code: "${REPORT_CODE}") {
      title
      fights { id name startTime endTime }
    }
  }
}`);
});
```

- [ ] **Step 2: Commit and push**

```bash
git add index.html
git commit -m "feat(auth): fetch report fight list via GraphQL"
git push
```

- [ ] **Step 3: Verify live**

Visit `https://branneman.github.io/bloomwatch/`, reconnect if `sessionStorage` was cleared (tokens don't survive a closed tab), then click "Fetch report 4GYHZRdtL3bvhpc8". Expected: log shows the endpoint URL, `responded 200:`, and a JSON body with `data.reportData.report.title` and a non-empty `fights` array (SSC/TK/Gruul fights from the real raid). This confirms both the API host/path and that this fresh-realm report code resolves — record the working endpoint (`/api/v2/user` vs `/api/v2/client`) for Task 7.

If the response is `200` with `"report": null`, the report code didn't resolve against this host — note that finding for Task 7 too (it's a real result, not a bug to fix silently).

---

### Task 6: Fetch Dassz's cast events (GraphQL Query 2 — stretch)

**Files:**

- Modify: `index.html`

**Interfaces:**

- Consumes: `graphql(query)`, `log(msg)`, `REPORT_CODE` (Task 5).
- Produces: DOM id `fetch-casts`.

- [ ] **Step 1: Add the cast-events button and handler**

Add a new button after "Fetch report":

```html
<button id="fetch-report">Fetch report 4GYHZRdtL3bvhpc8</button>
<button id="fetch-casts">Fetch Dassz cast events (stretch)</button>
```

Add to the `<script>` block, after the Task 5 `fetch-report` handler:

```javascript
// --- Query 2 (stretch): Dassz cast events ---
document.getElementById("fetch-casts").addEventListener("click", async () => {
  const actorsResult = await graphql(`query {
  reportData {
    report(code: "${REPORT_CODE}") {
      masterData { actors(type: "Player") { id name type subType } }
    }
  }
}`);
  if (!actorsResult) return;

  const actors = actorsResult.data.reportData.report.masterData.actors;
  const dassz = actors.find((a) => a.name === "Dassz");
  if (!dassz) {
    log(
      "ERROR: no actor named Dassz in this report.\nActors: " +
        JSON.stringify(actors),
    );
    return;
  }
  log("Found Dassz: actor id " + dassz.id);

  const fightsResult = await graphql(`query {
  reportData {
    report(code: "${REPORT_CODE}") {
      fights { id name }
    }
  }
}`);
  if (!fightsResult) return;
  const fights = fightsResult.data.reportData.report.fights;
  const firstFight = fights[0];
  log("Using first fight: " + firstFight.name + " (id " + firstFight.id + ")");

  const eventsResult = await graphql(`query {
  reportData {
    report(code: "${REPORT_CODE}") {
      events(fightIDs: [${firstFight.id}], sourceID: ${dassz.id}, dataType: Casts) {
        data
      }
    }
  }
}`);
  if (!eventsResult) return;
  const events = eventsResult.data.reportData.report.events.data;
  log(
    "Cast events for Dassz in " +
      firstFight.name +
      ":\n" +
      JSON.stringify(events, null, 2),
  );
});
```

- [ ] **Step 2: Commit and push**

```bash
git add index.html
git commit -m "feat(auth): fetch Dassz cast events via GraphQL (stretch)"
git push
```

- [ ] **Step 3: Verify live**

Visit `https://branneman.github.io/bloomwatch/`, reconnect if needed, click "Fetch Dassz cast events (stretch)". Expected: log shows three successive GraphQL calls (`actors`, `fights`, `events`), ending with `Found Dassz: actor id ...`, `Using first fight: ... (id ...)`, and a JSON array of cast events (each with at least a `timestamp` and `abilityGameID`).

This is a stretch goal per the spec — if `actors` doesn't contain "Dassz" (e.g. the field is a pet/guardian name, or WCL truncated/renamed it), log the raw actor list and treat this task as informational rather than blocking; note the discrepancy for Task 7.

---

### Task 7: Documentation deliverables

**Files:**

- Modify: `docs/roadmap.md` (Architecture snapshot section)
- Create: `docs/wcl-auth.md`

**Interfaces:**

- Consumes: the live findings recorded during Tasks 3, 4 (if run), and 5 — which auth flow succeeded, which API host resolved the report, whether the stretch goal worked.

- [ ] **Step 1: Update `docs/roadmap.md`'s Architecture snapshot**

Open `docs/roadmap.md` and replace this bullet (currently lines 29-33):

```markdown
- Auth is the key unknown: WCL v2 requires OAuth2. Candidate approaches for a backend-less app, to be resolved in the Phase 0 spike:
  1. User creates their own (free) WCL API client and the app runs an OAuth flow suited to public clients (PKCE), storing the token in `localStorage`.
  2. User pastes client credentials; app performs the token exchange from the browser (viability depends on CORS on the WCL token endpoint).
  3. Fallback: user pastes a bearer token obtained manually (documented one-liner).
```

with the resolved finding — using whichever of these matches what actually happened in Task 3/4 (fill in with your real result, don't guess):

```markdown
- Auth is resolved (Phase 0 spike, see `docs/wcl-auth.md`): [Authorization Code + PKCE from the browser, no client secret | Client Credentials grant with a pasted secret, since PKCE hit CORS/secret-required] against WCL's OAuth endpoints. Token exchange happens entirely client-side via `fetch()`.
```

And replace this bullet (currently line 33):

```markdown
- Anniversary ("fresh") realm reports must be verified against the API host(s) — `fresh.` / `classic.` / `www.` subdomains may or may not share one API endpoint. Part of the spike.
```

with:

```markdown
- Anniversary ("fresh") realm reports resolve against `https://www.warcraftlogs.com/api/v2/[user|client]` (confirmed with report `4GYHZRdtL3bvhpc8`, see `docs/wcl-auth.md`) — a single host regardless of which subdomain the report link uses.
```

- [ ] **Step 2: Create `docs/wcl-auth.md`**

Write the file with this structure, filling in the bracketed parts with what actually happened during Tasks 1-6:

````markdown
# WCL API Auth — How To

Findings from the Phase 0 spike (backlog story 001, `docs/specs/wcl-auth-spike-design.md`). Reference implementation: `index.html` at the repo root.

## Registering a WCL API v2 client

1. Go to `https://www.warcraftlogs.com/api/clients/` (while logged into WCL).
2. Click "Create Client".
3. Application Name: anything (e.g. `Bloomwatch`).
4. Redirect URL: your GitHub Pages URL, exactly, including the trailing slash (e.g. `https://branneman.github.io/bloomwatch/`).
5. Save. Copy the Client ID.

## Working auth flow

[State which flow worked: PKCE, or Client Credentials. Include the exact token endpoint (`https://www.warcraftlogs.com/oauth/token`), the exact request body fields sent, and a redacted example response, e.g.:]

Request:

```
POST https://www.warcraftlogs.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&client_id=...&redirect_uri=...&code=...&code_verifier=...
```

Response:

```json
{ "token_type": "Bearer", "expires_in": ..., "access_token": "REDACTED", "refresh_token": "REDACTED" }
```

## Flows that were tried and didn't work

[If PKCE failed and Client Credentials was used instead, document that here: what error PKCE produced (CORS message or 400 body), so nobody re-attempts it without reason. If PKCE worked outright, write "PKCE succeeded on the first attempt; Client Credentials fallback (Task 4) was not needed."]

## Report API host

Confirmed working endpoint: `https://www.warcraftlogs.com/api/v2/[user|client]` (fill in whichever Task 5 confirmed). Fresh-realm report codes (tested with `4GYHZRdtL3bvhpc8`, a Spinershatter EU TBC Anniversary report) resolve against this host with no special handling — the `fresh.warcraftlogs.com` link prefix doesn't change the API host.

## Manual bearer token (last-resort fallback)

Not needed for this spike — [PKCE | Client Credentials] worked from the browser. If a future environment can't complete either OAuth flow, a token can still be obtained manually:

```bash
curl -X POST https://www.warcraftlogs.com/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET
```

Paste the resulting `access_token` into the app's token field (not implemented as UI in this spike — see `docs/specs/wcl-auth-spike-design.md`).
````

- [ ] **Step 3: Commit and push**

```bash
git add docs/roadmap.md docs/wcl-auth.md
git commit -m "docs: record WCL auth spike findings in roadmap and wcl-auth.md"
git push
```

- [ ] **Step 4: Verify**

Read both files back. Confirm no `[bracketed placeholder]` text remains — every bracket should have been replaced with the real, observed result from Tasks 1-6. This closes out backlog story 001's exit criterion: a hardcoded page on GitHub Pages proving the pipeline, plus the documentation trail the acceptance criteria calls for.
