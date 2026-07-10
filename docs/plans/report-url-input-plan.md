# Report URL Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backlog story 002 — let the user paste a WCL report URL or bare report code, validate it, and use it to drive the existing connect/report-fetch flow instead of the hardcoded `REPORT_CODE` constant.

**Architecture:** A pure parsing function (`parseReportInput`) handles all URL/code recognition and validation logic, fully covered by Tier 1 unit tests per `docs/testing.md`. A small `ReportInput` form component wraps it for user interaction (Tier 3 component tests). `App.tsx` wires the two together, gated behind the existing WCL auth state, replacing the hardcoded report code with real user input.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library — all already in place in this repo.

## Global Constraints

- Spell/ability IDs are irrelevant to this story — not applicable here.
- No secrets, no backend calls added — this story is pure client-side parsing + existing WCL client wiring (already backend-less).
- Tests are co-located next to the file under test (`*.test.ts` / `*.test.tsx`), per `docs/testing.md`.
- Full-project static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) must stay clean — the pre-commit hook enforces this; don't bypass it.
- Commit messages follow Conventional Commits (`type(scope): summary`), scope `report` fits this epic.

---

### Task 1: `parseReportInput` pure function

**Files:**

- Create: `src/report/parseReportInput.ts`
- Test: `src/report/parseReportInput.test.ts`

**Interfaces:**

- Produces: `parseReportInput(input: string): ParseReportInputResult`, where

  ```ts
  export type ParseReportInputResult =
    | { ok: true; reportCode: string; fightId: number | null }
    | { ok: false; reason: "unsupported-realm" | "invalid"; message: string };
  ```

  Later tasks import `parseReportInput` and `ParseReportInputResult` from `../../../report/parseReportInput` (from `src/app/components/ReportInput/index.tsx`) or `./report/parseReportInput` (from `src/App.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/report/parseReportInput.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReportInput } from "./parseReportInput";

const CODE = "4GYHZRdtL3bvhpc8";

describe("parseReportInput", () => {
  it("accepts a bare 16-character report code", () => {
    expect(parseReportInput(CODE)).toEqual({
      ok: true,
      reportCode: CODE,
      fightId: null,
    });
  });

  it("trims whitespace around a bare code", () => {
    expect(parseReportInput(`  ${CODE}  `)).toEqual({
      ok: true,
      reportCode: CODE,
      fightId: null,
    });
  });

  it("accepts a fresh.warcraftlogs.com URL with no fragment", () => {
    expect(
      parseReportInput(`https://fresh.warcraftlogs.com/reports/${CODE}`),
    ).toEqual({ ok: true, reportCode: CODE, fightId: null });
  });

  it("accepts a fresh.warcraftlogs.com URL without a scheme", () => {
    expect(parseReportInput(`fresh.warcraftlogs.com/reports/${CODE}`)).toEqual({
      ok: true,
      reportCode: CODE,
      fightId: null,
    });
  });

  it("extracts the fight id from a #fight=N fragment", () => {
    expect(
      parseReportInput(
        `https://fresh.warcraftlogs.com/reports/${CODE}#fight=5`,
      ),
    ).toEqual({ ok: true, reportCode: CODE, fightId: 5 });
  });

  it("extracts the fight id when the fragment has extra params", () => {
    expect(
      parseReportInput(
        `https://fresh.warcraftlogs.com/reports/${CODE}#fight=12&type=healing`,
      ),
    ).toEqual({ ok: true, reportCode: CODE, fightId: 12 });
  });

  it("rejects a www. URL as an unsupported realm", () => {
    const result = parseReportInput(
      `https://www.warcraftlogs.com/reports/${CODE}`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unsupported-realm");
    expect(result.message).toMatch(/fresh/i);
  });

  it("rejects a classic. URL as an unsupported realm", () => {
    const result = parseReportInput(
      `https://classic.warcraftlogs.com/reports/${CODE}`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unsupported-realm");
  });

  it("rejects empty input as generically invalid", () => {
    const result = parseReportInput("");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects garbage text as generically invalid", () => {
    const result = parseReportInput("not a report link");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects a wrong-length code as generically invalid", () => {
    const result = parseReportInput("abc123");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });

  it("rejects a non-warcraftlogs URL as generically invalid", () => {
    const result = parseReportInput("https://example.com/reports/" + CODE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/report/parseReportInput.test.ts`
Expected: FAIL — `Cannot find module './parseReportInput'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `parseReportInput`**

Create `src/report/parseReportInput.ts`:

```ts
const REPORT_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;
const WCL_HOSTNAME_PATTERN = /^([a-z0-9]+)\.warcraftlogs\.com$/;
const REPORT_PATH_PATTERN = /\/reports\/([A-Za-z0-9]{16})/;

export type ParseReportInputResult =
  | { ok: true; reportCode: string; fightId: number | null }
  | { ok: false; reason: "unsupported-realm" | "invalid"; message: string };

const UNSUPPORTED_REALM_MESSAGE =
  'This tool only supports TBC Anniversary ("fresh") realm reports. Paste a link from fresh.warcraftlogs.com.';
const INVALID_MESSAGE =
  "Couldn't recognize that as a Warcraft Logs report URL or code. Paste a fresh.warcraftlogs.com report link, or just the 16-character report code.";

export function parseReportInput(input: string): ParseReportInputResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  if (REPORT_CODE_PATTERN.test(trimmed)) {
    return { ok: true, reportCode: trimmed, fightId: null };
  }

  const url = parseUrl(trimmed);
  if (!url) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  const hostMatch = url.hostname.match(WCL_HOSTNAME_PATTERN);
  if (!hostMatch) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  if (hostMatch[1] !== "fresh") {
    return {
      ok: false,
      reason: "unsupported-realm",
      message: UNSUPPORTED_REALM_MESSAGE,
    };
  }

  const pathMatch = url.pathname.match(REPORT_PATH_PATTERN);
  if (!pathMatch) {
    return { ok: false, reason: "invalid", message: INVALID_MESSAGE };
  }

  return {
    ok: true,
    reportCode: pathMatch[1],
    fightId: parseFightId(url.hash),
  };
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    try {
      return new URL(`https://${input}`);
    } catch {
      return null;
    }
  }
}

function parseFightId(hash: string): number | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const raw = new URLSearchParams(fragment).get("fight");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/report/parseReportInput.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/report/parseReportInput.ts src/report/parseReportInput.test.ts
git commit -m "feat(report): add report URL/code parser"
```

---

### Task 2: `ReportInput` component

**Files:**

- Create: `src/app/components/ReportInput/index.tsx`
- Test: `src/app/components/ReportInput/index.test.tsx`

**Interfaces:**

- Consumes: `parseReportInput` and `ParseReportInputResult` from `../../../report/parseReportInput` (Task 1).
- Produces:

  ```ts
  export interface ParsedReport {
    reportCode: string;
    fightId: number | null;
  }

  export interface ReportInputProps {
    onSubmit: (report: ParsedReport) => void;
  }

  export function ReportInput(props: ReportInputProps): JSX.Element;
  ```

  Task 3 imports `ReportInput` and the `ParsedReport` type from `./app/components/ReportInput`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/components/ReportInput/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportInput } from "./index";

const CODE = "4GYHZRdtL3bvhpc8";

describe("ReportInput", () => {
  it("calls onSubmit with the parsed report code and null fightId for a bare code", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/report url or code/i), CODE);
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(onSubmit).toHaveBeenCalledWith({ reportCode: CODE, fightId: null });
  });

  it("calls onSubmit with the parsed fight id from a URL fragment", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/report url or code/i),
      `https://fresh.warcraftlogs.com/reports/${CODE}#fight=5`,
    );
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(onSubmit).toHaveBeenCalledWith({ reportCode: CODE, fightId: 5 });
  });

  it("shows the unsupported-realm message and does not submit for a www. URL", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/report url or code/i),
      `https://www.warcraftlogs.com/reports/${CODE}`,
    );
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/fresh/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a generic message and does not submit for garbage input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReportInput onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText(/report url or code/i),
      "not a report link",
    );
    await user.click(screen.getByRole("button", { name: /load report/i }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

Check whether `@testing-library/user-event` is already a dependency before running this step.

Run: `node -e "require.resolve('@testing-library/user-event')"`

If that errors with `MODULE_NOT_FOUND`, install it first: `npm install --save-dev @testing-library/user-event`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/ReportInput/index.test.tsx`
Expected: FAIL — `Failed to resolve import "./index"` (the component doesn't exist yet).

- [ ] **Step 3: Implement `ReportInput`**

Create `src/app/components/ReportInput/index.tsx`:

```tsx
import { useId, useState, type FormEvent } from "react";
import { parseReportInput } from "../../../report/parseReportInput";

export interface ParsedReport {
  reportCode: string;
  fightId: number | null;
}

export interface ReportInputProps {
  onSubmit: (report: ParsedReport) => void;
}

export function ReportInput({ onSubmit }: ReportInputProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseReportInput(value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onSubmit({ reportCode: result.reportCode, fightId: result.fightId });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={inputId}>Report URL or code</label>
      <input
        id={inputId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="https://fresh.warcraftlogs.com/reports/..."
      />
      <button type="submit">Load report</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/ReportInput/index.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ReportInput
git commit -m "feat(report): add ReportInput component"
```

(If `@testing-library/user-event` was installed in Step 1, include the updated `package.json` and `package-lock.json` in this commit.)

---

### Task 3: Wire `ReportInput` into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `ReportInput` and `ParsedReport` from `./app/components/ReportInput` (Task 2).

- [ ] **Step 1: Replace the hardcoded report code with real input**

Edit `src/App.tsx` to match:

```tsx
import { useState } from "react";
import { useWclAuth } from "./wcl/useWclAuth";
import { fetchReportFights } from "./wcl/client";
import { ConnectPanel } from "./app/components/ConnectPanel";
import { ReportInput, type ParsedReport } from "./app/components/ReportInput";

function App() {
  const { clientId, setClientId, connect, accessToken, authError } =
    useWclAuth();
  // fightId is parsed now; story 003 (fight list & selection) will consume it
  // to pre-select the linked fight once that picker exists.
  const [report, setReport] = useState<ParsedReport | null>(null);

  return (
    <div>
      <h1>Bloomwatch</h1>
      <label>
        WCL Client ID
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <button onClick={connect}>Connect</button>
      {authError && <p role="alert">{authError}</p>}
      {accessToken && <ReportInput onSubmit={setReport} />}
      {accessToken && report && (
        <ConnectPanel
          accessToken={accessToken}
          reportCode={report.reportCode}
          fetchReportFights={fetchReportFights}
        />
      )}
    </div>
  );
}

export default App;
```

This removes the `REPORT_CODE` constant entirely and the unconditional `<ConnectPanel>` render — both are replaced by the `accessToken`/`report`-gated version above.

- [ ] **Step 2: Type-check and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0 with no errors (the pre-commit hook runs these full-project, so confirm now rather than at commit time).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests (pkce, ConnectPanel) plus the two new suites from Tasks 1–2 stay green. `ConnectPanel`'s own tests are unaffected since its props contract didn't change.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the printed local URL, and confirm:

- Before clicking Connect, no "Report URL or code" field is visible.
- After a successful Connect (existing OAuth flow), the "Report URL or code" field appears.
- Pasting `https://www.warcraftlogs.com/reports/4GYHZRdtL3bvhpc8` and submitting shows the fresh-realm-only alert, and no report loads.
- Pasting the bare code `4GYHZRdtL3bvhpc8` (or a `fresh.warcraftlogs.com` link to it) and submitting loads the report title and fight count via the existing `ConnectPanel`, same as the old hardcoded flow did.

Stop the dev server once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(report): wire report URL input into App, replacing hardcoded report code"
```

---

## Self-review notes

- **Spec coverage:** bare code ✓ (Task 1 tests), `fresh.` URL + `#fight=N` ✓ (Task 1), `www.`/`classic.` rejection with fresh-only message ✓ (Task 1 + Task 2 UI), generic malformed-input error ✓ (Task 1 + Task 2 UI), full UI wiring replacing `REPORT_CODE` ✓ (Task 3), `fightId` held in state for future story 003 ✓ (Task 3 comment + state).
- **Type consistency:** `ParseReportInputResult` (Task 1) → consumed only inside `ReportInput` (Task 2), which re-shapes the success case into the narrower `ParsedReport` (`{ reportCode, fightId }`) that `App.tsx` (Task 3) and `ConnectPanel` (pre-existing, unchanged) both already expect — no signature drift across tasks.
- **No placeholders:** every step has runnable code and exact commands; no TODOs left.
