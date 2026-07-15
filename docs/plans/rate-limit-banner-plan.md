# Rate-limit usage banner (story 009) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a quiet, non-blocking banner near the top of the app once the shared default WCL
API client crosses 75% of its hourly request budget, so slowness reads as "busy" rather than
"broken" — before story 008's existing hard-stop 429 fallback ever kicks in.

**Architecture:** `rateLimitData { limitPerHour pointsSpentThisHour }` is added to the four
existing WCL query bodies; the single shared low-level response parser (`postGraphQLOnce` in
`src/wcl/client.ts`) broadcasts it through a tiny new subscribe/publish module whenever present.
`App.tsx` subscribes via a small hook, derives a percentage, and renders a new `RateLimitBanner`
component as app-wide chrome — a sibling to every existing screen block, not nested inside one —
once that percentage is ≥ 75% and the user is still on the shared default Client ID.

**Tech Stack:** React + TypeScript (Vite), Vitest + Testing Library (Tier 1/3), Vitest + MSW
(Tier 2). No new dependencies.

## Global Constraints

- Threshold is 75%, per `docs/backlog.md` story 009's acceptance criteria — every place this
  number appears must cite the same single exported constant, not a repeated magic number.
- No `pointsResetIn` / no countdown UI (out of scope per the design spec).
- No background polling — `usagePct` only updates as a side effect of requests the user's own
  actions already trigger. Do not add an interval/timer anywhere in this plan.
- No manual dismiss/close button on the banner — automatic show/hide only.
- The "Use your own Client ID" action reuses the existing `OwnClientIdField` component and
  `useWclAuth`'s `connect()` function verbatim — do not build a new registration flow.
- Colors: use the tokens that actually exist in `src/index.css` today — `--judgement-orange` and
  `--judgement-orange-bg`. There is no `--judgement-orange-border` token in this codebase (only in
  the `docs/design_v5.html` reference) — use `var(--judgement-orange)` for the border color
  instead, matching how `Alert`'s `.warning` class already does it
  (`src/app/components/ui/Alert/index.module.css`).
- Wiring approach is the pub-sub module (not a callback threaded through every fetch function) —
  see Task 1/3.

---

### Task 1: Rate-limit usage pub-sub module

**Files:**

- Create: `src/wcl/rateLimitUsage.ts`
- Test: `src/wcl/rateLimitUsage.test.ts`
- Modify: `src/testUtils/factories.ts` (add a factory, following this file's existing
  `export function aX(overrides: Partial<X> = {}): X` convention — see e.g. `aReportAbility` around
  line 50)

**Interfaces:**

- Produces: `RateLimitUsage = { limitPerHour: number; pointsSpentThisHour: number }`,
  `subscribeRateLimitUsage(listener: (usage: RateLimitUsage) => void): () => void`,
  `publishRateLimitUsage(usage: RateLimitUsage): void`, `aRateLimitUsage(overrides?)` factory.
  Task 2 (the hook) and Task 3 (client.ts wiring) both depend on these exact names.

- [ ] **Step 1: Write the failing test**

Create `src/wcl/rateLimitUsage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  subscribeRateLimitUsage,
  publishRateLimitUsage,
} from "./rateLimitUsage";

describe("rateLimitUsage", () => {
  it("delivers a published usage to a subscribed listener", () => {
    const listener = vi.fn();
    subscribeRateLimitUsage(listener);

    publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 });

    expect(listener).toHaveBeenCalledWith({
      limitPerHour: 3600,
      pointsSpentThisHour: 2880,
    });
  });

  it("delivers to every subscribed listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeRateLimitUsage(first);
    subscribeRateLimitUsage(second);

    publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 1000 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("stops delivering once the returned unsubscribe function is called", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRateLimitUsage(listener);
    unsubscribe();

    publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 500 });

    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wcl/rateLimitUsage.test.ts`
Expected: FAIL — `Cannot find module './rateLimitUsage'`

- [ ] **Step 3: Write minimal implementation**

Create `src/wcl/rateLimitUsage.ts`:

```ts
export interface RateLimitUsage {
  limitPerHour: number;
  pointsSpentThisHour: number;
}

type Listener = (usage: RateLimitUsage) => void;

const listeners = new Set<Listener>();

export function subscribeRateLimitUsage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishRateLimitUsage(usage: RateLimitUsage): void {
  for (const listener of listeners) listener(usage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wcl/rateLimitUsage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the test factory**

In `src/testUtils/factories.ts`, add (near the other small-object factories, alongside
`aReportAbility`):

```ts
export function aRateLimitUsage(
  overrides: Partial<RateLimitUsage> = {},
): RateLimitUsage {
  return {
    limitPerHour: 3600,
    pointsSpentThisHour: 1000,
    ...overrides,
  };
}
```

Add `RateLimitUsage` to this file's existing import from `../wcl/rateLimitUsage` (create the
import line if none exists yet for that module) — follow the existing pattern other factories in
this file use for importing their corresponding type.

- [ ] **Step 6: Run the whole suite to confirm nothing broke**

Run: `npm test`
Expected: all existing tests still pass, plus the 3 new ones.

- [ ] **Step 7: Commit**

```bash
git add src/wcl/rateLimitUsage.ts src/wcl/rateLimitUsage.test.ts src/testUtils/factories.ts
git commit -m "feat(rate-limit): add subscribe/publish module for shared-client usage %"
```

---

### Task 2: `useRateLimitUsage` hook

**Files:**

- Create: `src/wcl/useRateLimitUsage.ts`
- Test: `src/wcl/useRateLimitUsage.test.ts`

**Interfaces:**

- Consumes: `subscribeRateLimitUsage`, `RateLimitUsage` from Task 1's `./rateLimitUsage`.
- Produces: `useRateLimitUsage(): number | null` — App.tsx (Task 5) calls this directly.

- [ ] **Step 1: Write the failing test**

Create `src/wcl/useRateLimitUsage.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRateLimitUsage } from "./useRateLimitUsage";
import { publishRateLimitUsage } from "./rateLimitUsage";
import { aRateLimitUsage } from "../testUtils/factories";

describe("useRateLimitUsage", () => {
  it("returns null until the first usage is published", () => {
    const { result } = renderHook(() => useRateLimitUsage());
    expect(result.current).toBeNull();
  });

  it("returns the usage percentage after a publish", () => {
    const { result } = renderHook(() => useRateLimitUsage());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(result.current).toBe(80);
  });

  it("updates again on a later publish", () => {
    const { result } = renderHook(() => useRateLimitUsage());

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });
    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 900 }),
      );
    });

    expect(result.current).toBe(25);
  });

  it("stops updating after unmount (no leaked listener)", () => {
    const { result, unmount } = renderHook(() => useRateLimitUsage());
    unmount();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wcl/useRateLimitUsage.test.ts`
Expected: FAIL — `Cannot find module './useRateLimitUsage'`

- [ ] **Step 3: Write minimal implementation**

Create `src/wcl/useRateLimitUsage.ts`:

```ts
import { useEffect, useState } from "react";
import { subscribeRateLimitUsage, type RateLimitUsage } from "./rateLimitUsage";

export function useRateLimitUsage(): number | null {
  const [usage, setUsage] = useState<RateLimitUsage | null>(null);

  useEffect(() => subscribeRateLimitUsage(setUsage), []);

  if (usage === null) return null;
  return (usage.pointsSpentThisHour / usage.limitPerHour) * 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wcl/useRateLimitUsage.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/wcl/useRateLimitUsage.ts src/wcl/useRateLimitUsage.test.ts
git commit -m "feat(rate-limit): add useRateLimitUsage hook deriving usage %"
```

---

### Task 3: Wire `rateLimitData` into the WCL client

**Files:**

- Modify: `src/wcl/client.ts` (the `postGraphQLOnce` function, and the query bodies of
  `fetchReportFights`, `fetchCastsTable`, `fetchMasterDataAbilities`)
- Modify: `src/wcl/events.ts` (the query body of `fetchEventsPage`)
- Modify: `test/integration/client.test.ts`

**Interfaces:**

- Consumes: `publishRateLimitUsage` from Task 1's `./rateLimitUsage`.
- No signature changes to any exported function in `client.ts` or `events.ts` — this task only
  changes query text and adds one internal side effect inside `postGraphQLOnce`.

- [ ] **Step 1: Write the failing test**

In `test/integration/client.test.ts`, add near the top (after the existing fixture imports):

```ts
import { subscribeRateLimitUsage } from "../../src/wcl/rateLimitUsage";
import { aRateLimitUsage } from "../../src/testUtils/factories";
```

Add a new `describe` block at the end of the file (after the existing `withRateLimitDetection`
block):

```ts
describe("rateLimitData propagation", () => {
  it("publishes rateLimitData through subscribeRateLimitUsage when a response includes it", async () => {
    const usage = aRateLimitUsage({
      limitPerHour: 3600,
      pointsSpentThisHour: 2880,
    });
    server.use(
      http.post(USER_API_URL, () =>
        HttpResponse.json({
          ...reportFightsFixture,
          data: {
            ...reportFightsFixture.data,
            rateLimitData: usage,
          },
        }),
      ),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeRateLimitUsage(listener);

    try {
      await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");
      expect(listener).toHaveBeenCalledWith(usage);
    } finally {
      unsubscribe();
    }
  });

  it("requests rateLimitData alongside every existing query", async () => {
    let requestBody: { query: string } | undefined;
    server.use(
      http.post(USER_API_URL, async ({ request }) => {
        requestBody = (await request.json()) as { query: string };
        return HttpResponse.json(reportFightsFixture);
      }),
    );

    await fetchReportFights("test-token", "4GYHZRdtL3bvhpc8");

    expect(requestBody?.query).toContain(
      "rateLimitData { limitPerHour pointsSpentThisHour }",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/client.test.ts -t "rateLimitData propagation"`
Expected: FAIL — the query doesn't contain `rateLimitData` yet, and nothing publishes it.

- [ ] **Step 3: Add `rateLimitData` to each query body**

In `src/wcl/client.ts`, `fetchReportFights` — change the query template from:

```ts
    `query {
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage }
    }
  }
}`,
```

to:

```ts
    `query {
  rateLimitData { limitPerHour pointsSpentThisHour }
  reportData {
    report(code: "${reportCode}") {
      title
      fights { id name startTime endTime encounterID kill bossPercentage }
    }
  }
}`,
```

Apply the same one-line insertion (`  rateLimitData { limitPerHour pointsSpentThisHour }` right
after the opening `query {`) to `fetchCastsTable`'s and `fetchMasterDataAbilities`'s query
templates in the same file, and to `fetchEventsPage`'s query template in `src/wcl/events.ts`. All
four queries keep their existing `reportData { ... }` body unchanged — this is a pure addition of
one sibling root field.

- [ ] **Step 4: Publish rateLimitData from `postGraphQLOnce`**

At the top of `src/wcl/client.ts`, add the import:

```ts
import { publishRateLimitUsage } from "./rateLimitUsage";
```

In `postGraphQLOnce`, change:

```ts
const parsed = JSON.parse(bodyText);
if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
  throw new WclGraphQLError(resp.status, bodyText, parsed.errors);
}
return parsed.data;
```

to:

```ts
const parsed = JSON.parse(bodyText);
if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
  throw new WclGraphQLError(resp.status, bodyText, parsed.errors);
}
if (parsed.data?.rateLimitData) {
  publishRateLimitUsage(parsed.data.rateLimitData);
}
return parsed.data;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/integration/client.test.ts`
Expected: PASS (all tests in this file, including the 2 new ones)

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all tests pass. (The existing `"requests encounterID, kill, and bossPercentage..."`,
`"requests the table query..."`, and `"requests the masterData abilities query..."` tests only use
`toContain`, so the added `rateLimitData` line doesn't break them.)

- [ ] **Step 7: Commit**

```bash
git add src/wcl/client.ts src/wcl/events.ts test/integration/client.test.ts
git commit -m "feat(rate-limit): request rateLimitData on every WCL query and publish it"
```

---

### Task 4: `RateLimitBanner` component

**Files:**

- Create: `src/app/components/ui/RateLimitBanner/index.tsx`
- Create: `src/app/components/ui/RateLimitBanner/index.module.css`
- Test: `src/app/components/ui/RateLimitBanner/index.test.tsx`

**Interfaces:**

- Consumes: `Disclosure` (`../Disclosure`), `OwnClientIdField`
  (`../../OwnClientIdField`).
- Produces: `RateLimitBanner({ usagePct, onConnect }: RateLimitBannerProps)`,
  `RATE_LIMIT_BANNER_THRESHOLD_PCT` (exported constant, value `75`). Task 5 imports both.

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ui/RateLimitBanner/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RateLimitBanner } from "./index";

describe("RateLimitBanner", () => {
  it("shows the rounded usage percentage and the running-low message", () => {
    render(<RateLimitBanner usagePct={82.4} onConnect={vi.fn()} />);

    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(
      screen.getByText(/Shared connection is running low/),
    ).toBeInTheDocument();
  });

  it("reveals OwnClientIdField when the disclosure is opened, and calls onConnect with its value", async () => {
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<RateLimitBanner usagePct={80} onConnect={onConnect} />);

    expect(
      screen.queryByLabelText("WCL API Client ID"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Use your own Client ID/ }),
    );
    await user.type(
      screen.getByLabelText("WCL API Client ID"),
      "my-own-client-id",
    );
    await user.click(
      screen.getByRole("button", { name: "Connect with this Client ID" }),
    );

    expect(onConnect).toHaveBeenCalledWith("my-own-client-id");
  });

  it("has a status role so it's announced non-intrusively", () => {
    render(<RateLimitBanner usagePct={80} onConnect={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/RateLimitBanner/index.test.tsx`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write the component**

Create `src/app/components/ui/RateLimitBanner/index.tsx`:

```tsx
import { Disclosure } from "../Disclosure";
import { OwnClientIdField } from "../../OwnClientIdField";
import styles from "./index.module.css";

// Threshold per docs/backlog.md story 009's acceptance criteria: the banner
// appears once the shared default client crosses 75% of its hourly request
// budget, and disappears again once usage falls back below it.
export const RATE_LIMIT_BANNER_THRESHOLD_PCT = 75;

export interface RateLimitBannerProps {
  usagePct: number;
  onConnect: (clientId: string) => void;
}

export function RateLimitBanner({ usagePct, onConnect }: RateLimitBannerProps) {
  const clamped = Math.max(0, Math.min(100, usagePct));
  const rounded = Math.round(clamped);

  return (
    <div role="status" aria-live="polite" className={styles.banner}>
      <div className={styles.meter}>
        <div className={styles.meterHeader}>
          <span className={styles.pct}>{rounded}%</span>
          <span className={styles.pctLabel}>used this hour</span>
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${clamped}%` }} />
          <div
            className={styles.thresholdTick}
            style={{ left: `${RATE_LIMIT_BANNER_THRESHOLD_PCT}%` }}
          />
        </div>
      </div>
      <div className={styles.message}>
        <p className={styles.headline}>Shared connection is running low</p>
        <p>
          Everyone shares one connection to Warcraft Logs, and it&apos;s nearly
          used up for this hour — you could soon be blocked out. Your own free
          WCL API key is used only by you and never runs into this.
        </p>
        <Disclosure summary="Use your own Client ID">
          <OwnClientIdField onConnect={onConnect} />
        </Disclosure>
      </div>
    </div>
  );
}
```

Create `src/app/components/ui/RateLimitBanner/index.module.css`:

```css
.banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-5);
  background: var(--judgement-orange-bg);
  border: 1px solid var(--judgement-orange);
  border-radius: var(--radius-md);
}

.meter {
  flex: 0 0 148px;
}

.meterHeader {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: 6px;
}

.pct {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: var(--judgement-orange);
}

.pctLabel {
  font-size: 12px;
  color: var(--text);
}

.track {
  position: relative;
  height: 6px;
  background: var(--border);
  border-radius: var(--radius-pill);
}

.fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  background: var(--judgement-orange);
  border-radius: var(--radius-pill);
}

.thresholdTick {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: var(--text-h);
  opacity: 0.45;
}

.message {
  flex: 1;
  min-width: 0;
}

.headline {
  font-weight: 700;
  color: var(--text-h);
  font-size: 15px;
  margin: 0 0 2px;
}

.message p {
  font-size: var(--text-small-size);
  line-height: 1.4;
  color: var(--text);
  margin: 0 0 var(--space-2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/RateLimitBanner/index.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/RateLimitBanner
git commit -m "feat(rate-limit): add RateLimitBanner component"
```

---

### Task 5: Wire the banner into `App.tsx`

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**

- Consumes: `useRateLimitUsage` (Task 2), `RateLimitBanner`, `RATE_LIMIT_BANNER_THRESHOLD_PCT`
  (Task 4), `publishRateLimitUsage` (Task 1, test-only import), `usingDefaultClient` (already
  returned by `useWclAuth`, currently unused by `App.tsx`).

- [ ] **Step 1: Write the failing tests**

In `src/App.test.tsx`, add the import (near the other imports):

```ts
import { publishRateLimitUsage } from "./wcl/rateLimitUsage";
```

Add `aRateLimitUsage` to this file's existing `from "./testUtils/factories"` import (alongside
`aReportFights`, `aFight`, etc.).

Add a new `describe` block at the end of the file:

```ts
describe("App — Rate-limit usage banner", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, "", "#");
    vi.clearAllMocks();
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  });

  it("shows the banner once usage crosses 75% on the shared default client, and hides it again below that", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    expect(
      screen.queryByText(/Shared connection is running low/),
    ).not.toBeInTheDocument();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(
      await screen.findByText(/Shared connection is running low/),
    ).toBeInTheDocument();

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 900 }),
      );
    });

    await waitFor(() =>
      expect(
        screen.queryByText(/Shared connection is running low/),
      ).not.toBeInTheDocument(),
    );
  });

  it("never shows the banner once a custom Client ID has been set, regardless of usage", async () => {
    localStorage.setItem("wcl_client_id", "my-own-client-id");
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    setUpHappyPathMocks();
    const user = userEvent.setup();

    render(<App />);
    await loadReport(user);

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 3500 }),
      );
    });

    expect(
      screen.queryByText(/Shared connection is running low/),
    ).not.toBeInTheDocument();
  });

  it("does not show the banner while the 008 rate-limited fallback is already showing", async () => {
    sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(fetchReportFights).mockResolvedValue(
      aReportFights({ title: REPORT_TITLE, fights: [aFight({ id: 1 })] }),
    );
    vi.mocked(fetchCastsTable).mockRejectedValue(
      new WclApiError(429, "rate limited"),
    );
    vi.mocked(fetchMasterDataAbilities).mockResolvedValue([aReportAbility()]);
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Report URL or code"), REPORT_CODE);
    await user.click(screen.getByRole("button", { name: "Load report" }));
    await screen.findByText(/temporarily over capacity/);

    act(() => {
      publishRateLimitUsage(
        aRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 }),
      );
    });

    expect(
      screen.queryByText(/Shared connection is running low/),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx -t "Rate-limit usage banner"`
Expected: FAIL — the banner never renders yet.

- [ ] **Step 3: Wire it into `App.tsx`**

Add imports (near the other `./app/components/ui/...` imports):

```ts
import {
  RateLimitBanner,
  RATE_LIMIT_BANNER_THRESHOLD_PCT,
} from "./app/components/ui/RateLimitBanner";
import { useRateLimitUsage } from "./wcl/useRateLimitUsage";
```

Change the destructure of `useWclAuth()` from:

```ts
const { connect, accessToken, authError, rateLimited, reportRateLimited } =
  useWclAuth();
```

to:

```ts
const {
  connect,
  accessToken,
  authError,
  rateLimited,
  reportRateLimited,
  usingDefaultClient,
} = useWclAuth();
```

Add, right after that block:

```ts
const usagePct = useRateLimitUsage();
```

In the JSX returned by `App`, insert this block right after the existing
`{onboardingDismissed && accessToken && rateLimited && (...)}` block (i.e. immediately before the
`{onboardingDismissed && accessToken && (<div ...>` block that wraps the main screen content).
Note this is one single `&&`-chained expression (not a separately-computed boolean variable) so
that TypeScript can narrow `usagePct` from `number | null` to `number` at the point it's passed to
`RateLimitBanner` — a boolean extracted into its own variable wouldn't carry that narrowing across
to a different expression:

```tsx
{
  /* Hidden while 008's blocking fallback (rateLimited) is already
          showing — that screen has its own OwnClientIdField and a more
          urgent message, so showing both at once would be redundant. */
}
{
  onboardingDismissed &&
    accessToken &&
    !rateLimited &&
    usingDefaultClient &&
    usagePct !== null &&
    usagePct >= RATE_LIMIT_BANNER_THRESHOLD_PCT && (
      <Shell>
        <RateLimitBanner usagePct={usagePct} onConnect={connect} />
      </Shell>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (every test in this file, including the 3 new ones)

- [ ] **Step 5: Run the whole suite, typecheck, and lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(rate-limit): show usage banner as app-wide chrome at 75%+"
```

---

### Task 6: Manual verification, then retire the story's paperwork

**Files:**

- Modify: `docs/backlog.md` (mark story 009 `✅ Done`)
- Delete: `docs/specs/rate-limit-banner-design.md`
- Delete: `docs/plans/rate-limit-banner-plan.md` (this file)

- [ ] **Step 1: Manually verify in a running dev server**

Temporarily add these two lines at the bottom of `src/main.tsx`:

```ts
import { publishRateLimitUsage } from "./wcl/rateLimitUsage";
Object.assign(window, { publishRateLimitUsage });
```

Run:

```bash
npm run dev
```

Open the printed local URL, connect with a real WCL session (or reuse an existing one), and load a
report. In the browser devtools console, run
`publishRateLimitUsage({ limitPerHour: 3600, pointsSpentThisHour: 2880 })` and confirm the banner
appears above the current screen with "80%"; then run it again with `pointsSpentThisHour: 900` and
confirm the banner disappears. Then remove the two temporary lines from `src/main.tsx` before
committing anything further (`git diff src/main.tsx` should be empty).

- [ ] **Step 2: Mark story 009 done in the backlog**

In `docs/backlog.md`, change the story 009 heading from:

```
### 009 — Rate-limit usage banner 🔲 Todo
```

to:

```
### 009 — Rate-limit usage banner ✅ Done
```

- [ ] **Step 3: Delete this story's spec and plan**

```bash
git rm docs/specs/rate-limit-banner-design.md docs/plans/rate-limit-banner-plan.md
```

Confirm nothing else references either path first:

```bash
grep -rn "rate-limit-banner-design\|rate-limit-banner-plan" --include="*.md" .
```

Expected: no output (besides `docs/backlog.md`'s own text, which doesn't reference the file paths
themselves).

- [ ] **Step 4: Update CLAUDE.md's repo-state paragraph**

In this repo's `CLAUDE.md` (repo root), "Repo state" section, append a sentence noting story 009
is done, in the same style as the existing sentences for 010/011/etc. — mention that the banner is
threshold-gated at 75% via a pub-sub module (`src/wcl/rateLimitUsage.ts`) rather than a threaded
callback, since that's the one architectural choice a future reader might otherwise assume mirrors
008's `withRateLimitDetection` pattern.

- [ ] **Step 5: Final full check and commit**

```bash
npm test && npm run typecheck && npm run lint && npm run format:check
git add docs/backlog.md CLAUDE.md
git commit -m "docs: mark story 009 done and retire its spec/plan"
```
