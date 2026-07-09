# Build & Test Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Bloomwatch's real project foundation — a Vite + React + TypeScript scaffold, deployed automatically to GitHub Pages, with a full 6-tier test pyramid (static analysis, unit, WCL-client-integration, component, contract, E2E smoke) — replacing the Phase 0 spike (`index.html`).

**Architecture:** `npm create vite@latest` bootstraps the scaffold; the spike's proven PKCE + GraphQL logic is ported into typed modules under `src/wcl/` (`pkce.ts` for pure crypto/URL helpers, `client.ts` for the two HTTP calls — token exchange and the report-fights GraphQL query), wired into a minimal React shell (`useWclAuth` hook + `ConnectPanel` component). Each tier of the test pyramid is stood up alongside the code it first needs, not speculatively ahead of time.

**Tech Stack:** Vite, React, TypeScript, ESLint (`typescript-eslint` + `eslint-plugin-react-hooks`), Prettier, Husky, Vitest, MSW, React Testing Library, Playwright, GitHub Actions.

## Global Constraints

- No backend / no server-side code — every request happens client-side. (CLAUDE.md principle 2)
- No secrets required to build or deploy the product itself. The one CI secret (`WCL_TEST_ACCESS_TOKEN`) is a dedicated test account's bearer token, used only by Tier 4 (contract) and Tier 5 (E2E) — both skip gracefully if it's absent. (spec: Secrets & credentials summary)
- TypeScript throughout; Vite + React, no Astro/Eleventy. (spec: Stack & project structure)
- Tier 1 (unit) and Tier 3 (component) tests are co-located as `*.test.ts`/`*.test.tsx` next to the file under test. Tiers 2, 4, 5 live under `test/integration/`, `test/contract/`, `test/e2e/`. (spec: Stack & project structure)
- Tier 0 (static analysis: `tsc`, ESLint, Prettier) runs full-project — never diff/staged-file-scoped — in both the pre-commit hook and CI. (spec: Pre-commit hook)
- Tier 4 (contract) triggers only via `workflow_dispatch` or locally — never on a schedule/cron. Tier 5 (E2E) triggers automatically after every deploy. (spec: CI/CD pipeline)
- `index.html`'s spike content is retired — replaced by Vite's entry template. Its logic is preserved as ported, tested modules, not as a standalone page. (spec: Stack & project structure)
- Commit messages follow Conventional Commits. (CLAUDE.md)
- Report code `4GYHZRdtL3bvhpc8` and its real captured response shapes (title `"SSC+TK 2026-07-07"`, fight list, Dassz's cast events) are reused from story 001 — see `docs/wcl-auth.md`.

---

### Task 1: Vite + React + TypeScript scaffold

**Files:**

- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `src/main.tsx`, `src/App.tsx`, `public/` (from Vite template)
- Modify: `index.html` (retired — replaced by Vite's template), `.gitignore`

**Interfaces:**

- Produces: `npm run dev`, `npm run build`, `npm run typecheck` scripts; `src/App.tsx` as the app's root component (rewritten by Task 5).

- [ ] **Step 1: Scaffold into a temporary directory**

```bash
npm create vite@latest vite-scaffold-tmp -- --template react-ts
```

- [ ] **Step 2: Move the generated files into the repo root**

```bash
mv vite-scaffold-tmp/package.json ./package.json
mv vite-scaffold-tmp/vite.config.ts ./vite.config.ts
mv vite-scaffold-tmp/tsconfig.json ./tsconfig.json
mv vite-scaffold-tmp/tsconfig.app.json ./tsconfig.app.json
mv vite-scaffold-tmp/tsconfig.node.json ./tsconfig.node.json
mv vite-scaffold-tmp/eslint.config.js ./eslint.config.js
mv vite-scaffold-tmp/src ./src
mv vite-scaffold-tmp/public ./public
mv vite-scaffold-tmp/index.html ./index.html
rm -rf vite-scaffold-tmp
```

This overwrites the repo-root `index.html` (the Phase 0 spike) with Vite's entry template — the spike's job is done and preserved in `docs/wcl-auth.md`.

- [ ] **Step 3: Merge `.gitignore`**

The repo's existing `.gitignore` is empty. Write it with Vite's standard ignores:

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

- [ ] **Step 4: Set the GitHub Pages base path**

Edit `vite.config.ts`. The site is served at `https://branneman.github.io/bloomwatch/` (a subpath, not domain root), so Vite's `base` must match or built asset URLs will 404 on Pages:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/bloomwatch/",
  plugins: [react()],
});
```

- [ ] **Step 5: Replace the default demo content**

Replace `src/App.tsx` with a placeholder (Task 5 builds the real content):

```tsx
function App() {
  return (
    <div>
      <h1>Bloomwatch</h1>
    </div>
  );
}

export default App;
```

Empty `src/App.css` (remove the counter-demo styles Vite generated) and delete the unused demo assets:

```bash
rm -f src/assets/react.svg public/vite.svg
: > src/App.css
```

- [ ] **Step 6: Add a `typecheck` script**

Edit `package.json`'s `scripts` block — add `typecheck` alongside the generated `dev`/`build`/`lint`/`preview`:

```json
"typecheck": "tsc -b"
```

- [ ] **Step 7: Verify the build**

```bash
npm install
npm run typecheck
npm run build
```

Expected: both succeed; `npm run build` produces a `dist/` directory containing `index.html` and hashed asset files.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js src public index.html .gitignore
git commit -m "feat(scaffold): bootstrap Vite + React + TypeScript project"
```

---

### Task 2: Tier 0 — static analysis (ESLint, Prettier, Husky)

**Files:**

- Modify: `eslint.config.js`, `package.json`
- Create: `.prettierrc.json`, `.prettierignore`, `.husky/pre-commit`

**Interfaces:**

- Consumes: `eslint.config.js` generated by Task 1 (already includes `typescript-eslint` and `eslint-plugin-react-hooks` from the Vite react-ts template).
- Produces: `npm run lint`, `npm run format`, `npm run format:check` scripts; a pre-commit hook that blocks commits on typecheck/lint/format failures.

- [ ] **Step 1: Install Prettier and Husky**

```bash
npm install -D prettier eslint-config-prettier husky
```

- [ ] **Step 2: Add Prettier config**

Create `.prettierrc.json` (Prettier defaults — no project-specific overrides needed):

```json
{}
```

Create `.prettierignore`:

```
dist
coverage
```

- [ ] **Step 3: Wire Prettier into ESLint's flat config**

Open `eslint.config.js` (generated by Task 1). Add an import for `eslint-config-prettier` and append it as the **last** entry in the exported config array, so it overrides any ESLint rule that would conflict with Prettier's formatting:

```js
import prettier from "eslint-config-prettier";
```

Add `prettier` as the final element of the array passed to `tseslint.config(...)` (or whatever the top-level export call is named in the generated file) — after every other config object.

- [ ] **Step 4: Add format scripts**

Edit `package.json`'s `scripts` block:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

(`lint` already exists from Task 1's scaffold — confirm it reads `"lint": "eslint ."`.)

- [ ] **Step 5: Verify Tier 0 commands pass on the current tree**

```bash
npm run typecheck
npm run lint
npm run format:check
```

Expected: all three pass (the scaffold from Task 1 is already clean).

- [ ] **Step 6: Install the pre-commit hook**

```bash
npx husky init
```

This creates `.husky/pre-commit` and adds `"prepare": "husky"` to `package.json`. Replace the generated `.husky/pre-commit` content (default is `npm test`) with:

```sh
npm run typecheck
npm run lint
npm run format:check
```

- [ ] **Step 7: Verify the hook blocks a bad commit**

```bash
echo "const x=1" >> src/App.tsx
git add src/App.tsx
git commit -m "test: verify pre-commit hook blocks unformatted code"
```

Expected: FAIL — the commit is rejected because `format:check` finds `src/App.tsx` unformatted.

- [ ] **Step 8: Fix and verify the hook allows a clean commit**

```bash
git checkout -- src/App.tsx
```

- [ ] **Step 9: Commit**

```bash
git add eslint.config.js package.json package-lock.json .prettierrc.json .prettierignore .husky
git commit -m "feat(tooling): add Tier 0 static analysis (ESLint, Prettier, Husky pre-commit)"
```

---

### Task 3: Tier 1 — Vitest setup + ported PKCE helpers

**Files:**

- Modify: `vite.config.ts`
- Create: `src/wcl/pkce.ts`, `src/wcl/pkce.test.ts`

**Interfaces:**

- Produces: `AUTHORIZE_URL` constant; functions `base64urlEncode(buffer: ArrayBuffer): string`, `generateRandomString(length: number): string`, `generateCodeChallenge(verifier: string): Promise<string>`, `buildAuthorizeUrl(params: { clientId: string; redirectUri: string; challenge: string; state: string }): string`; interface `PkceParams { verifier: string; state: string; challenge: string }`; function `createPkceParams(): Promise<PkceParams>`. Consumed by Task 5's `useWclAuth` hook.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add the Vitest config block**

Edit `vite.config.ts` — change the `defineConfig` import source to `'vitest/config'` (which re-exports Vite's `defineConfig` merged with Vitest's `test` types) and add a `test` block:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/bloomwatch/",
  plugins: [react()],
  test: {
    environment: "node",
    exclude: ["node_modules/**", "dist/**", "test/e2e/**"],
  },
});
```

- [ ] **Step 3: Add the `test` script**

Edit `package.json`:

```json
"test": "vitest run --exclude test/contract/**"
```

- [ ] **Step 4: Write the failing tests**

Create `src/wcl/pkce.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  base64urlEncode,
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateRandomString,
} from "./pkce";

describe("base64urlEncode", () => {
  it("encodes bytes as URL-safe base64 with no padding", () => {
    const buffer = new Uint8Array([0xfb, 0xff, 0xbf]).buffer;
    expect(base64urlEncode(buffer)).toBe("--__");
  });
});

describe("generateRandomString", () => {
  it("returns a string of the requested length using only base64url characters", () => {
    const result = generateRandomString(64);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different output on each call", () => {
    const a = generateRandomString(32);
    const b = generateRandomString(32);
    expect(a).not.toBe(b);
  });
});

describe("generateCodeChallenge", () => {
  it("matches the RFC 7636 appendix B example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds the authorize URL with all required PKCE params and no client secret", () => {
    const url = buildAuthorizeUrl({
      clientId: "test-client-id",
      redirectUri: "https://example.com/",
      challenge: "test-challenge",
      state: "test-state",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.warcraftlogs.com/oauth/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://example.com/",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("test-state");
    expect(parsed.searchParams.has("client_secret")).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './pkce'` (the module doesn't exist yet).

- [ ] **Step 6: Implement `src/wcl/pkce.ts`**

Ported from `index.html`'s spike code (see `docs/wcl-auth.md`), with types added:

```ts
export const AUTHORIZE_URL = "https://www.warcraftlogs.com/oauth/authorize";

export function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes.buffer).slice(0, length);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(digest);
}

export interface PkceParams {
  verifier: string;
  state: string;
  challenge: string;
}

export async function createPkceParams(): Promise<PkceParams> {
  const verifier = generateRandomString(64);
  const state = generateRandomString(32);
  const challenge = await generateCodeChallenge(verifier);
  return { verifier, state, challenge };
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts package.json src/wcl/pkce.ts src/wcl/pkce.test.ts
git commit -m "feat(wcl): port PKCE helpers from the spike, add Vitest (Tier 1)"
```

---

### Task 4: Tier 2 — WCL HTTP client + MSW integration tests

**Files:**

- Create: `src/wcl/client.ts`, `test/integration/fixtures/token-response.json`, `test/integration/fixtures/report-fights.json`, `test/integration/client.test.ts`

**Interfaces:**

- Consumes: none from earlier tasks.
- Produces: `TOKEN_URL`, `USER_API_URL` constants; class `WclApiError extends Error` with `status: number`, `body: string`; interface `TokenResult { accessToken: string; expiresIn: number }`; function `exchangeCodeForToken(params: { clientId: string; code: string; verifier: string; redirectUri: string }): Promise<TokenResult>`; interface `Fight { id: number; name: string; startTime: number; endTime: number }`; interface `ReportFights { title: string; fights: Fight[] }`; function `fetchReportFights(accessToken: string, reportCode: string): Promise<ReportFights>`. Consumed by Task 5's `useWclAuth` hook and `ConnectPanel`/`App`.

- [ ] **Step 1: Install MSW**

```bash
npm install -D msw
```

- [ ] **Step 2: Add fixture files**

These are real response bodies captured live during story 001 (see `docs/wcl-auth.md`), not synthetic data.

Create `test/integration/fixtures/token-response.json` (real shape; token values replaced with test placeholders since real tokens are sensitive):

```json
{
  "token_type": "Bearer",
  "expires_in": 31104000,
  "access_token": "test-access-token",
  "refresh_token": "test-refresh-token"
}
```

Create `test/integration/fixtures/report-fights.json` (a real subset of the actual live response for report `4GYHZRdtL3bvhpc8` — includes both a zero-duration trash-pull fight, id 1, and real boss fights with real durations, ids 3 and 6):

```json
{
  "data": {
    "reportData": {
      "report": {
        "title": "SSC+TK 2026-07-07",
        "fights": [
          {
            "id": 1,
            "name": "Unknown",
            "startTime": 760292,
            "endTime": 760292
          },
          {
            "id": 2,
            "name": "Unknown",
            "startTime": 810565,
            "endTime": 810565
          },
          {
            "id": 3,
            "name": "Coilfang Frenzy",
            "startTime": 1477307,
            "endTime": 1505939
          },
          {
            "id": 4,
            "name": "Coilfang Frenzy",
            "startTime": 1754018,
            "endTime": 1763039
          },
          {
            "id": 5,
            "name": "Unknown",
            "startTime": 1816244,
            "endTime": 1818260
          },
          {
            "id": 6,
            "name": "The Lurker Below",
            "startTime": 1879119,
            "endTime": 2036920
          }
        ]
      }
    }
  }
}
```

- [ ] **Step 3: Write the failing tests**

Create `test/integration/client.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  exchangeCodeForToken,
  fetchReportFights,
  WclApiError,
  TOKEN_URL,
  USER_API_URL,
} from "../../src/wcl/client";
import tokenResponseFixture from "./fixtures/token-response.json";
import reportFightsFixture from "./fixtures/report-fights.json";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("exchangeCodeForToken", () => {
  it("parses a successful token response", async () => {
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json(tokenResponseFixture)),
    );
    const result = await exchangeCodeForToken({
      clientId: "test-client-id",
      code: "test-code",
      verifier: "test-verifier",
      redirectUri: "https://example.com/",
    });
    expect(result.accessToken).toBe("test-access-token");
    expect(result.expiresIn).toBe(31104000);
  });

  it("throws WclApiError with the raw response on failure", async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    await expect(
      exchangeCodeForToken({
        clientId: "test-client-id",
        code: "bad-code",
        verifier: "test-verifier",
        redirectUri: "https://example.com/",
      }),
    ).rejects.toThrow(WclApiError);
  });
});

describe("fetchReportFights", () => {
  it("parses the report title and fight list from a real captured response shape", async () => {
    server.use(
      http.post(USER_API_URL, () => HttpResponse.json(reportFightsFixture)),
    );
    const result = await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
    expect(result.title).toBe("SSC+TK 2026-07-07");
    expect(result.fights).toHaveLength(6);
    expect(result.fights[0]).toEqual({
      id: 1,
      name: "Unknown",
      startTime: 760292,
      endTime: 760292,
    });
    expect(result.fights[5]).toEqual({
      id: 6,
      name: "The Lurker Below",
      startTime: 1879119,
      endTime: 2036920,
    });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '../../src/wcl/client'`.

- [ ] **Step 5: Implement `src/wcl/client.ts`**

Ported from `index.html`'s spike code, split from the pure PKCE helpers since these two functions cross the network boundary (Tier 2, not Tier 1):

```ts
export const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
export const USER_API_URL = "https://www.warcraftlogs.com/api/v2/user";

export class WclApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`WCL API responded ${status}: ${body}`);
  }
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number;
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<TokenResult> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.verifier,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const data = JSON.parse(bodyText);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
}

export interface ReportFights {
  title: string;
  fights: Fight[];
}

export async function fetchReportFights(
  accessToken: string,
  reportCode: string,
): Promise<ReportFights> {
  const resp = await fetch(USER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query {
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime }
    }
  }
}`,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) throw new WclApiError(resp.status, bodyText);
  const parsed = JSON.parse(bodyText);
  return parsed.data.reportData.report;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 9 tests total (6 from Task 3 + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/wcl/client.ts test/integration
git commit -m "feat(wcl): port token exchange and report-fights query (Tier 2, MSW)"
```

---

### Task 5: React app shell — connect flow + report display

**Files:**

- Create: `src/wcl/useWclAuth.ts`, `src/app/components/ConnectPanel/index.tsx`, `src/app/components/ConnectPanel/index.test.tsx`, `src/testUtils/factories.ts`, `test/setup.ts`
- Modify: `src/App.tsx`, `vite.config.ts`

**Interfaces:**

- Consumes: `createPkceParams`, `buildAuthorizeUrl` from `src/wcl/pkce.ts` (Task 3); `exchangeCodeForToken`, `fetchReportFights`, `WclApiError`, `Fight`, `ReportFights` from `src/wcl/client.ts` (Task 4).
- Produces: hook `useWclAuth(): { clientId: string; setClientId: (v: string) => void; connect: () => Promise<void>; accessToken: string | null; authError: string | null }`; component `ConnectPanel(props: { accessToken: string | null; reportCode: string; fetchReportFights: (accessToken: string, reportCode: string) => Promise<ReportFights> })`; factories `aFight(overrides?: Partial<Fight>): Fight`, `aReportFights(overrides?: Partial<ReportFights>): ReportFights`.

- [ ] **Step 1: Install React Testing Library and jsdom**

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Switch the Vitest environment to jsdom**

Edit `vite.config.ts`'s `test` block:

```ts
test: {
  environment: 'jsdom',
  setupFiles: ['./test/setup.ts'],
  exclude: ['node_modules/**', 'dist/**', 'test/e2e/**'],
},
```

Create `test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Run the existing tests to confirm nothing broke**

Run: `npm test`
Expected: PASS, still 9 tests (jsdom environment doesn't change Tier 1/2 test outcomes).

- [ ] **Step 4: Write the failing component test**

Create `src/testUtils/factories.ts`:

```ts
import type { Fight, ReportFights } from "../wcl/client";

export function aFight(overrides: Partial<Fight> = {}): Fight {
  return {
    id: 1,
    name: "Coilfang Frenzy",
    startTime: 1477307,
    endTime: 1505939,
    ...overrides,
  };
}

export function aReportFights(
  overrides: Partial<ReportFights> = {},
): ReportFights {
  return {
    title: "SSC+TK 2026-07-07",
    fights: [aFight()],
    ...overrides,
  };
}
```

Create `src/app/components/ConnectPanel/index.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectPanel } from "./index";
import { aReportFights } from "../../../testUtils/factories";

describe("ConnectPanel", () => {
  it("shows a not-connected message when there is no access token", () => {
    render(
      <ConnectPanel
        accessToken={null}
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={() => Promise.reject()}
      />,
    );
    expect(screen.getByText("Not connected.")).toBeInTheDocument();
  });

  it("fetches and renders the report title and fight count once connected", async () => {
    const fetchReportFights = () => Promise.resolve(aReportFights());
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("SSC+TK 2026-07-07")).toBeInTheDocument(),
    );
    expect(screen.getByText("1 fights")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fetchReportFights = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './index'` (the component doesn't exist yet).

- [ ] **Step 6: Implement `ConnectPanel`**

Create `src/app/components/ConnectPanel/index.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ReportFights } from "../../../wcl/client";

export interface ConnectPanelProps {
  accessToken: string | null;
  reportCode: string;
  fetchReportFights: (
    accessToken: string,
    reportCode: string,
  ) => Promise<ReportFights>;
}

export function ConnectPanel({
  accessToken,
  reportCode,
  fetchReportFights,
}: ConnectPanelProps) {
  const [report, setReport] = useState<ReportFights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setError(null);
    fetchReportFights(accessToken, reportCode)
      .then(setReport)
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Failed to fetch report.",
        ),
      );
  }, [accessToken, reportCode, fetchReportFights]);

  if (!accessToken) return <p>Not connected.</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading report…</p>;

  return (
    <div>
      <h2>{report.title}</h2>
      <p>{report.fights.length} fights</p>
    </div>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 12 tests total.

- [ ] **Step 8: Implement `useWclAuth`**

Create `src/wcl/useWclAuth.ts`:

```ts
import { useEffect, useState } from "react";
import { buildAuthorizeUrl, createPkceParams } from "./pkce";
import { exchangeCodeForToken, WclApiError } from "./client";

const CLIENT_ID_STORAGE_KEY = "wcl_client_id";
const PKCE_VERIFIER_STORAGE_KEY = "wcl_pkce_verifier";
const PKCE_STATE_STORAGE_KEY = "wcl_pkce_state";
const ACCESS_TOKEN_STORAGE_KEY = "wcl_access_token";

function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

export function useWclAuth() {
  const [clientId, setClientIdState] = useState(
    () => localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? "",
  );
  const [accessToken, setAccessToken] = useState(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY),
  );
  const [authError, setAuthError] = useState<string | null>(null);

  function setClientId(value: string) {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
    setClientIdState(value);
  }

  async function connect() {
    if (!clientId) {
      setAuthError("Save a Client ID first.");
      return;
    }
    const { verifier, state, challenge } = await createPkceParams();
    sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_STORAGE_KEY, state);
    window.location.href = buildAuthorizeUrl({
      clientId,
      redirectUri: redirectUri(),
      challenge,
      state,
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code) return;

    const expectedState = sessionStorage.getItem(PKCE_STATE_STORAGE_KEY);
    const verifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
    window.history.replaceState({}, "", window.location.pathname);

    if (returnedState !== expectedState || !verifier) {
      setAuthError("OAuth state mismatch — please try connecting again.");
      return;
    }

    exchangeCodeForToken({
      clientId,
      code,
      verifier,
      redirectUri: redirectUri(),
    })
      .then((result) => {
        sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, result.accessToken);
        setAccessToken(result.accessToken);
      })
      .catch((err: unknown) => {
        setAuthError(
          err instanceof WclApiError
            ? err.message
            : "Failed to exchange code for token.",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { clientId, setClientId, connect, accessToken, authError };
}
```

- [ ] **Step 9: Wire `App.tsx`**

Replace `src/App.tsx`:

```tsx
import { useWclAuth } from "./wcl/useWclAuth";
import { fetchReportFights } from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";

const REPORT_CODE = "4GYHZRdtL3bvhpc8";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      <ConnectPanel
        accessToken={accessToken}
        reportCode={REPORT_CODE}
        fetchReportFights={fetchReportFights}
      />
    </div>
  );
}

export default App;
```

- [ ] **Step 10: Run the full suite and typecheck**

```bash
npm run typecheck
npm test
```

Expected: both pass, 12 tests.

- [ ] **Step 11: Manually verify the connect flow locally**

```bash
npm run dev
```

Visit the printed local URL, paste your real WCL Client ID (from story 001), click Connect, approve on WCL, confirm you're redirected back and the report title + fight count render.

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx src/wcl/useWclAuth.ts src/app src/testUtils test/setup.ts vite.config.ts package.json package-lock.json
git commit -m "feat(app): wire PKCE connect flow and report display (Tier 3)"
```

---

### Task 6: Tier 4 — contract tests against the real WCL API

Prerequisite (manual, before this task): register a **second, dedicated test WCL account** (not your personal one) and a **separate test-only Public Client ID** at `https://www.warcraftlogs.com/api/clients/` (redirect URL = your Pages URL, "Public Client" checked — same steps as `docs/wcl-auth.md`, just a different account/client than production). Run `npm run dev`, use the app's Connect flow with this test client ID to complete the PKCE login once, and copy the resulting access token. Create a gitignored `.env.local` at the repo root:

```
WCL_TEST_ACCESS_TOKEN=<the token you just obtained>
```

**Files:**

- Create: `test/contract/report.contract.test.ts`

**Interfaces:**

- Consumes: `fetchReportFights` from `src/wcl/client.ts` (Task 4).

- [ ] **Step 1: Install dotenv**

```bash
npm install -D dotenv
```

- [ ] **Step 2: Write the contract test**

Create `test/contract/report.contract.test.ts`:

```ts
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { fetchReportFights } from "../../src/wcl/client";

config({ path: ".env.local" });

const accessToken = process.env.WCL_TEST_ACCESS_TOKEN;

describe.skipIf(!accessToken)("fetchReportFights (real WCL API)", () => {
  it("resolves the real fresh-realm report and returns its title and fight list", async () => {
    const result = await fetchReportFights(
      accessToken as string,
      "4GYHZRdtL3bvhpc8",
    );
    expect(result.title).toBe("SSC+TK 2026-07-07");
    expect(result.fights.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Add the `test:contract` script**

Edit `package.json`:

```json
"test:contract": "vitest run test/contract"
```

- [ ] **Step 4: Run it against the real API**

```bash
npm run test:contract
```

Expected: PASS, 1 test — a real network call to `https://www.warcraftlogs.com/api/v2/user` succeeds and returns the real report.

- [ ] **Step 5: Verify the default `npm test` still skips it**

```bash
npm test
```

Expected: PASS, 12 tests (unchanged from Task 5 — `test/contract/**` is excluded from the default run).

- [ ] **Step 6: Commit**

```bash
git add test/contract package.json package-lock.json
git commit -m "feat(wcl): add contract tests against the real WCL API (Tier 4)"
```

---

### Task 7: Tier 5 — Playwright E2E smoke test

**Files:**

- Create: `playwright.config.ts`, `test/e2e/smoke.spec.ts`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: the deployed (or local dev) app from Task 5; `WCL_TEST_ACCESS_TOKEN` from Task 6's `.env.local`.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Add Playwright's output directories to `.gitignore`**

Append to `.gitignore`:

```

# Playwright
test-results/
playwright-report/
blob-report/
playwright/.cache/
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  testDir: "./test/e2e",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
      },
});
```

- [ ] **Step 4: Write the smoke test**

Create `test/e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const accessToken = process.env.WCL_TEST_ACCESS_TOKEN;

test.skip(!accessToken, "WCL_TEST_ACCESS_TOKEN not set — see docs/testing.md");

test("a pre-authenticated visit renders the real fight list", async ({
  page,
}) => {
  await page.addInitScript((token) => {
    window.sessionStorage.setItem("wcl_access_token", token as string);
  }, accessToken);

  await page.goto("/");

  await expect(page.getByText("SSC+TK 2026-07-07")).toBeVisible();
  await expect(page.getByText(/\d+ fights/)).toBeVisible();
});
```

- [ ] **Step 5: Add the `test:e2e` script**

Edit `package.json`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 6: Run it locally**

```bash
npm run test:e2e
```

Expected: PASS, 1 test. Playwright auto-starts the dev server (per `webServer` config), injects the token, and confirms the real report renders.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts test/e2e .gitignore package.json package-lock.json
git commit -m "feat(app): add Playwright E2E smoke test (Tier 5)"
```

---

### Task 8: CI/CD — GitHub Actions build, deploy, and test pipeline

Prerequisites (manual, before this task):

1. Add `WCL_TEST_ACCESS_TOKEN` as a GitHub Actions repository secret: Settings → Secrets and variables → Actions → New repository secret, using the token obtained in Task 6.
2. Switch GitHub Pages' source: Settings → Pages → Source: **GitHub Actions** (it's currently "Deploy from a branch", set during story 001 — this must change now that Pages serves a _built_ `dist/` folder, not the raw repo root).

**Files:**

- Create: `.github/workflows/ci-deploy.yml`, `.github/workflows/contract.yml`
- Modify: `README.md`

**Interfaces:**

- Consumes: all npm scripts from Tasks 1-7 (`typecheck`, `lint`, `format:check`, `test`, `build`, `test:contract`, `test:e2e`); repository secret `WCL_TEST_ACCESS_TOKEN`.

- [ ] **Step 1: Write the main CI/deploy workflow**

Create `.github/workflows/ci-deploy.yml`:

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build-and-test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    outputs:
      page_url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4

  e2e:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          PLAYWRIGHT_BASE_URL: ${{ needs.deploy.outputs.page_url }}
          WCL_TEST_ACCESS_TOKEN: ${{ secrets.WCL_TEST_ACCESS_TOKEN }}
```

- [ ] **Step 2: Write the manual-trigger contract test workflow**

Create `.github/workflows/contract.yml`:

```yaml
name: Contract tests (real WCL API)

on:
  workflow_dispatch:

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:contract
        env:
          WCL_TEST_ACCESS_TOKEN: ${{ secrets.WCL_TEST_ACCESS_TOKEN }}
```

- [ ] **Step 3: Update `README.md`**

Update the Status section and add a Development section:

````markdown
## Status

Phase 0 complete (see [`docs/wcl-auth.md`](docs/wcl-auth.md)). Phase 1 foundation (story 801) in place — see [`docs/roadmap.md`](docs/roadmap.md) and [`docs/backlog.md`](docs/backlog.md) for what's next.

Live: https://branneman.github.io/bloomwatch/

## Development

```bash
npm install
npm run dev            # local dev server
npm run build           # production build
npm test                 # unit + integration + component tests (Tiers 1-3)
npm run test:contract   # real WCL API, needs WCL_TEST_ACCESS_TOKEN — see docs/testing.md
npm run test:e2e        # Playwright smoke test, needs WCL_TEST_ACCESS_TOKEN — see docs/testing.md
```
````

See [`docs/testing.md`](docs/testing.md) for the full test pyramid.

````

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows README.md
git commit -m "feat(ci): add GitHub Actions build/deploy/test pipeline"
git push
````

- [ ] **Step 5: Verify live**

Watch the Actions tab. Expected: `build-and-test` passes, `deploy` publishes to Pages, `e2e` passes against the live URL. Visit `https://branneman.github.io/bloomwatch/`, confirm the real React app loads (not a 404 or the old spike).

- [ ] **Step 6: Manually trigger the contract workflow**

In the Actions tab, run "Contract tests (real WCL API)" via "Run workflow". Expected: PASS.
