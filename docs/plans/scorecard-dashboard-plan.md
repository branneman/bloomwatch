# Story 701 — Dashboard-of-widgets scorecard Implementation Plan

> **For agentic workers:** Per `CLAUDE.md`, execute this plan with **superpowers:subagent-driven-development**, directly on `main` — no `executing-plans` review-checkpoint session, no git worktree isolation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, continuous Scorecard layout with a dashboard of small per-epic widgets (worst-of R/O/G + 1-2 stats), click-to-drill-down into full epic detail, and a way back — per backlog story 701.

**Architecture:** `Scorecard` gains local `activeEpic` state and renders either a responsive grid of 6 `Widget`s (2 real epics + 4 permanently-disabled placeholders for epics not yet built) or one epic's drill-down (a `*Content` wrapper around its existing metric cards, unchanged). Two new thin hooks compute each real epic's worst-of judgement and headline stats by calling the existing pure `compute*` metric functions a second time over already-cached events — no new network calls, no changes to the existing metric cards.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library (co-located tests), CSS Modules using `src/index.css`'s existing design tokens.

## Global Constraints

- Spell/ability **IDs** must never be hardcoded (`CLAUDE.md`) — this does not apply to the decorative icon **image URLs** used here, which are presentational only (same as the existing local `lifebloom.jpg`/`instantcast.jpg` imports).
- Every red/orange/green threshold must trace to a documented rationale — this plan introduces no new thresholds, only aggregates existing ones via `worstJudgement`.
- Static analysis (`npm run typecheck`, `npm run lint`, `npm run format:check`) runs full-project on every commit via the pre-commit hook — never bypass it.
- Tests are co-located next to the file under test (`*.test.ts`/`*.test.tsx`), per `docs/testing.md`.
- Commits follow Conventional Commits (`type(scope): summary`); scope `lifebloom`/`gcd` where confined, otherwise omit.

---

### Task 1: Pure epic-summary helpers

**Files:**

- Create: `src/metrics/epicSummary.ts`
- Test: `src/metrics/epicSummary.test.ts`

**Interfaces:**

- Consumes: `Judgement` (`src/metrics/judgement.ts`), `GcdUtilizationResult` (`src/metrics/gcdUtilization.ts`), `IdleGapsResult` (`src/metrics/idleGaps.ts`), `Lb3UptimeResult`/`Lb3TargetResult` (`src/metrics/lb3Uptime.ts`), `RefreshCadenceResult` (`src/metrics/refreshCadence.ts`), `AccidentalBloomsResult` (`src/metrics/accidentalBlooms.ts`), `RestackTaxResult` (`src/metrics/restackTax.ts`).
- Produces: `EpicSummary` (`{ judgement: Judgement; stats: string[] }`), `worstJudgement(judgements: (Judgement | null)[]): Judgement`, `summarizeGcdEconomy(gcd, idleGaps): EpicSummary`, `summarizeLifebloomDiscipline(lb3, refresh, blooms, restack): EpicSummary` — all consumed by Task 5/6's hooks.

- [ ] **Step 1: Write the failing test**

```ts
// src/metrics/epicSummary.test.ts
import { describe, expect, it } from "vitest";
import {
  worstJudgement,
  summarizeGcdEconomy,
  summarizeLifebloomDiscipline,
} from "./epicSummary";
import type { GcdUtilizationResult } from "./gcdUtilization";
import type { IdleGapsResult } from "./idleGaps";
import type { Lb3UptimeResult } from "./lb3Uptime";
import type { RefreshCadenceResult } from "./refreshCadence";
import type { AccidentalBloomsResult } from "./accidentalBlooms";
import type { RestackTaxResult } from "./restackTax";

describe("worstJudgement", () => {
  it("returns the worst of a mix of judgements", () => {
    expect(worstJudgement(["green", "orange"])).toBe("orange");
    expect(worstJudgement(["green", "red", "orange"])).toBe("red");
  });

  it("ignores null entries", () => {
    expect(worstJudgement(["green", null, "orange"])).toBe("orange");
  });

  it("defaults to green when every entry is null", () => {
    expect(worstJudgement([null, null])).toBe("green");
  });
});

describe("summarizeGcdEconomy", () => {
  it("takes the worst-of judgement and formats both stat lines", () => {
    const gcd: GcdUtilizationResult = {
      activeTimeMs: 3000,
      fightDurationMs: 10000,
      utilizationPct: 87,
      judgement: "green",
    };
    const idleGaps: IdleGapsResult = {
      gaps: [],
      longestGaps: [],
      totalDeadTimeMs: 620,
      fightDurationMs: 10000,
      deadTimePct: 6.2,
      judgement: "orange",
    };

    expect(summarizeGcdEconomy(gcd, idleGaps)).toEqual({
      judgement: "orange",
      stats: ["GCD utilization: 87%", "Idle gaps: 6.2% dead time"],
    });
  });
});

describe("summarizeLifebloomDiscipline", () => {
  it("ranges the LB3 uptime stat across multiple targets and formats the median", () => {
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 95,
          lb3UptimeMs: 9100,
          windowMs: 10000,
          lb3UptimePct: 91,
          judgement: "green",
        },
        {
          targetId: 2,
          lbUptimePct: 82,
          lb3UptimeMs: 7900,
          windowMs: 10000,
          lb3UptimePct: 79,
          judgement: "orange",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 5,
      medianMs: 6400,
      judgement: "green",
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [{ timestampMs: 173000, targetId: 2 }],
      count: 1,
      judgement: "orange",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 3,
      estimatedMana: 2400,
      judgement: "orange",
    };

    expect(summarizeLifebloomDiscipline(lb3, refresh, blooms, restack)).toEqual(
      {
        judgement: "orange",
        stats: ["LB3 uptime: 79–91%", "Refresh cadence: 6.4s median"],
      },
    );
  });

  it("formats a single maintained target without a range", () => {
    const lb3: Lb3UptimeResult = {
      targets: [
        {
          targetId: 1,
          lbUptimePct: 95,
          lb3UptimeMs: 9100,
          windowMs: 10000,
          lb3UptimePct: 91,
          judgement: "green",
        },
      ],
    };
    const refresh: RefreshCadenceResult = {
      intervalCount: 0,
      medianMs: null,
      judgement: null,
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "green",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "green",
    };

    expect(summarizeLifebloomDiscipline(lb3, refresh, blooms, restack)).toEqual(
      {
        judgement: "green",
        stats: ["LB3 uptime: 91%", "Refresh cadence: no refreshes"],
      },
    );
  });

  it("reports no maintained targets when there are none", () => {
    const lb3: Lb3UptimeResult = { targets: [] };
    const refresh: RefreshCadenceResult = {
      intervalCount: 0,
      medianMs: null,
      judgement: null,
      buckets: [],
    };
    const blooms: AccidentalBloomsResult = {
      accidentalBlooms: [],
      count: 0,
      judgement: "green",
    };
    const restack: RestackTaxResult = {
      casts: [],
      castCount: 0,
      estimatedMana: 0,
      judgement: "green",
    };

    expect(
      summarizeLifebloomDiscipline(lb3, refresh, blooms, restack).stats[0],
    ).toBe("LB3 uptime: no maintained targets");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: FAIL — `src/metrics/epicSummary.ts` does not exist / has no exports.

- [ ] **Step 3: Write the implementation**

```ts
// src/metrics/epicSummary.ts
import type { Judgement } from "./judgement";
import type { GcdUtilizationResult } from "./gcdUtilization";
import type { IdleGapsResult } from "./idleGaps";
import type { Lb3TargetResult, Lb3UptimeResult } from "./lb3Uptime";
import type { RefreshCadenceResult } from "./refreshCadence";
import type { AccidentalBloomsResult } from "./accidentalBlooms";
import type { RestackTaxResult } from "./restackTax";

export interface EpicSummary {
  judgement: Judgement;
  stats: string[];
}

const JUDGEMENT_RANK: Record<Judgement, number> = {
  red: 2,
  orange: 1,
  green: 0,
};

export function worstJudgement(judgements: (Judgement | null)[]): Judgement {
  const present = judgements.filter((j): j is Judgement => j !== null);
  return present.reduce(
    (worst, current) =>
      JUDGEMENT_RANK[current] > JUDGEMENT_RANK[worst] ? current : worst,
    "green" as Judgement,
  );
}

export function summarizeGcdEconomy(
  gcd: GcdUtilizationResult,
  idleGaps: IdleGapsResult,
): EpicSummary {
  return {
    judgement: worstJudgement([gcd.judgement, idleGaps.judgement]),
    stats: [
      `GCD utilization: ${Math.round(gcd.utilizationPct)}%`,
      `Idle gaps: ${idleGaps.deadTimePct.toFixed(1)}% dead time`,
    ],
  };
}

function formatLb3UptimeStat(targets: Lb3TargetResult[]): string {
  if (targets.length === 0) return "LB3 uptime: no maintained targets";
  const pcts = targets.map((target) => Math.round(target.lb3UptimePct));
  if (pcts.length === 1) return `LB3 uptime: ${pcts[0]}%`;
  return `LB3 uptime: ${Math.min(...pcts)}–${Math.max(...pcts)}%`;
}

export function summarizeLifebloomDiscipline(
  lb3: Lb3UptimeResult,
  refresh: RefreshCadenceResult,
  blooms: AccidentalBloomsResult,
  restack: RestackTaxResult,
): EpicSummary {
  const judgement = worstJudgement([
    ...lb3.targets.map((target) => target.judgement),
    refresh.judgement,
    blooms.judgement,
    restack.judgement,
  ]);

  const cadenceStat =
    refresh.medianMs === null
      ? "Refresh cadence: no refreshes"
      : `Refresh cadence: ${(refresh.medianMs / 1000).toFixed(1)}s median`;

  return {
    judgement,
    stats: [formatLb3UptimeStat(lb3.targets), cadenceStat],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/epicSummary.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/metrics/epicSummary.ts src/metrics/epicSummary.test.ts
git commit -m "feat(scorecard): add epic-summary judgement/stat aggregation helpers"
```

---

### Task 2: `Widget` presentational component

**Files:**

- Create: `src/app/components/ui/Widget/index.tsx`
- Create: `src/app/components/ui/Widget/index.module.css`
- Test: `src/app/components/ui/Widget/index.test.tsx`

**Interfaces:**

- Consumes: `Judgement` (`src/metrics/judgement.ts`), `SpellIcon` (`src/app/components/ui/SpellIcon`), `JudgementChip` (`src/app/components/ui/JudgementChip`).
- Produces: `Widget({ icon: string; label: string; onOpen?: () => void; judgement?: Judgement; stats?: string[]; note?: string })` — consumed by Task 8's `Scorecard`. `onOpen`'s presence is what makes a widget interactive; its absence renders the disabled/placeholder shell. When `judgement` and `stats` are both present they take priority over `note`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/components/ui/Widget/index.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Widget } from "./index";

describe("Widget", () => {
  it("renders judgement and stats and fires onOpen when clicked", async () => {
    const onOpen = vi.fn();
    render(
      <Widget
        icon="icon.jpg"
        label="GCD economy"
        judgement="orange"
        stats={["GCD utilization: 87%", "Idle gaps: 6.2% dead time"]}
        onOpen={onOpen}
      />,
    );

    const button = screen.getByRole("button", { name: /GCD economy/ });
    expect(button).toHaveTextContent("Orange");
    expect(button).toHaveTextContent("GCD utilization: 87%");
    expect(button).toHaveTextContent("Idle gaps: 6.2% dead time");
    expect(button).toHaveTextContent("View details →");

    const user = userEvent.setup();
    await user.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("falls back to a note instead of a chip, but stays clickable", async () => {
    const onOpen = vi.fn();
    render(
      <Widget
        icon="icon.jpg"
        label="GCD economy"
        note="Calculating…"
        onOpen={onOpen}
      />,
    );

    const button = screen.getByRole("button", { name: /GCD economy/ });
    expect(button).toHaveTextContent("Calculating…");
    expect(screen.queryByText(/^(Green|Orange|Red)$/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders disabled with no button role or click target when onOpen is omitted", () => {
    render(
      <Widget
        icon="icon.jpg"
        label="Spell discipline"
        note="Not yet available"
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Spell discipline")).toBeInTheDocument();
    expect(screen.getByText("Not yet available")).toBeInTheDocument();
    expect(screen.queryByText("View details →")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/ui/Widget/index.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/components/ui/Widget/index.tsx
import type { Judgement } from "../../../../metrics/judgement";
import { SpellIcon } from "../SpellIcon";
import { JudgementChip } from "../JudgementChip";
import styles from "./index.module.css";

export interface WidgetProps {
  icon: string;
  label: string;
  onOpen?: () => void;
  judgement?: Judgement;
  stats?: string[];
  note?: string;
}

export function Widget({
  icon,
  label,
  onOpen,
  judgement,
  stats,
  note,
}: WidgetProps) {
  const hasSummary = judgement !== undefined && stats !== undefined;

  const content = (
    <>
      <div className={styles.header}>
        <SpellIcon src={icon} size={20} />
        <span className={styles.label}>{label}</span>
        {hasSummary && <JudgementChip judgement={judgement} />}
      </div>
      {hasSummary ? (
        <div className={styles.stats}>
          {stats.map((stat) => (
            <span key={stat} className={styles.stat}>
              {stat}
            </span>
          ))}
        </div>
      ) : (
        note && <p className={styles.note}>{note}</p>
      )}
      {onOpen && <span className={styles.viewDetails}>View details →</span>}
    </>
  );

  if (onOpen) {
    return (
      <button type="button" className={styles.widget} onClick={onOpen}>
        {content}
      </button>
    );
  }

  return <div className={`${styles.widget} ${styles.disabled}`}>{content}</div>;
}
```

```css
/* src/app/components/ui/Widget/index.module.css */
.widget {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  background: var(--bg);
  box-sizing: border-box;
  text-align: left;
  font: inherit;
}

button.widget {
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

button.widget:hover {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.disabled {
  opacity: 0.5;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.label {
  flex: 1;
  font-size: var(--text-small-size);
  font-weight: 600;
  color: var(--text-h);
  line-height: 18px;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat {
  font-size: 12px;
  color: var(--text);
}

.note {
  font-size: 12px;
  color: var(--text);
  margin: 0;
}

.viewDetails {
  font-size: 12px;
  color: var(--accent);
  margin-top: auto;
  padding-top: var(--space-2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/ui/Widget/index.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ui/Widget
git commit -m "feat(scorecard): add Widget presentational component"
```

---

### Task 3: `GcdEconomyContent`

**Files:**

- Create: `src/app/components/GcdEconomyContent/index.tsx`
- Create: `src/app/components/GcdEconomyContent/index.module.css`
- Test: `src/app/components/GcdEconomyContent/index.test.tsx`

**Interfaces:**

- Consumes: `GCDUtilizationCard`, `IdleGapsCard` (both unchanged, existing components), `Fight` (`src/wcl/client.ts`), `WclEvent`/`WclEventDataType` (`src/wcl/events.ts`), `EventFetcherFight` (`src/wcl/eventCache.ts`).
- Produces: `GcdEconomyContent({ accessToken, reportCode, fight, druidId, fetchEvents })` — consumed by Task 8's `Scorecard`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/components/GcdEconomyContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GcdEconomyContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("GcdEconomyContent", () => {
  it("renders the GCD utilization and idle gaps cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <GcdEconomyContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/GcdEconomyContent/index.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/components/GcdEconomyContent/index.tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { GCDUtilizationCard } from "../GCDUtilizationCard";
import { IdleGapsCard } from "../IdleGapsCard";
import styles from "./index.module.css";

export interface GcdEconomyContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

export function GcdEconomyContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  fetchEvents,
}: GcdEconomyContentProps) {
  return (
    <div className={styles.group}>
      <GCDUtilizationCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
      <IdleGapsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

```css
/* src/app/components/GcdEconomyContent/index.module.css */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/GcdEconomyContent/index.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/GcdEconomyContent
git commit -m "refactor(gcd): extract GcdEconomyContent from Scorecard"
```

---

### Task 4: `LifebloomDisciplineContent`

**Files:**

- Create: `src/app/components/LifebloomDisciplineContent/index.tsx`
- Create: `src/app/components/LifebloomDisciplineContent/index.module.css`
- Test: `src/app/components/LifebloomDisciplineContent/index.test.tsx`

**Interfaces:**

- Consumes: `LB3UptimeCard`, `RefreshCadenceCard`, `AccidentalBloomsCard`, `RestackTaxCard`, `ConcurrentTargetsCard` (all unchanged, existing components).
- Produces: `LifebloomDisciplineContent({ accessToken, reportCode, fight, druidId, lifebloomAbilityIds, targetNames, fetchEvents })` — consumed by Task 8's `Scorecard`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/components/LifebloomDisciplineContent/index.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LifebloomDisciplineContent } from "./index";
import { aFight } from "../../../testUtils/factories";

describe("LifebloomDisciplineContent", () => {
  it("renders all five Lifebloom-discipline cards", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <LifebloomDisciplineContent
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
      />,
    );

    for (const title of [
      "LB3 uptime per target",
      "Refresh cadence",
      "Accidental blooms",
      "Re-stack tax",
      "Concurrent LB3 targets",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/LifebloomDisciplineContent/index.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/components/LifebloomDisciplineContent/index.tsx
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { LB3UptimeCard } from "../LB3UptimeCard";
import { RefreshCadenceCard } from "../RefreshCadenceCard";
import { AccidentalBloomsCard } from "../AccidentalBloomsCard";
import { RestackTaxCard } from "../RestackTaxCard";
import { ConcurrentTargetsCard } from "../ConcurrentTargetsCard";
import styles from "./index.module.css";

export interface LifebloomDisciplineContentProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
}

export function LifebloomDisciplineContent({
  accessToken,
  reportCode,
  fight,
  druidId,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
}: LifebloomDisciplineContentProps) {
  return (
    <div className={styles.group}>
      <LB3UptimeCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <RefreshCadenceCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        fetchEvents={fetchEvents}
      />
      <AccidentalBloomsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <RestackTaxCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        targetNames={targetNames}
        fetchEvents={fetchEvents}
      />
      <ConcurrentTargetsCard
        accessToken={accessToken}
        reportCode={reportCode}
        fight={fight}
        druidId={druidId}
        lifebloomAbilityIds={lifebloomAbilityIds}
        fetchEvents={fetchEvents}
      />
    </div>
  );
}
```

```css
/* src/app/components/LifebloomDisciplineContent/index.module.css */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/LifebloomDisciplineContent/index.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LifebloomDisciplineContent
git commit -m "refactor(lifebloom): extract LifebloomDisciplineContent from Scorecard"
```

---

### Task 5: `useGcdEconomySummary` hook

**Files:**

- Create: `src/app/components/Scorecard/epicSummaryStatus.ts`
- Create: `src/app/components/Scorecard/useGcdEconomySummary.ts`
- Test: `src/app/components/Scorecard/useGcdEconomySummary.test.ts`

**Interfaces:**

- Consumes: `computeGcdUtilization` (`src/metrics/gcdUtilization.ts`), `computeIdleGaps` (`src/metrics/idleGaps.ts`), `summarizeGcdEconomy` (Task 1), `Fight`/`EventFetcherFight`/`WclEvent`/`WclEventDataType` (as in existing cards).
- Produces: `EpicSummaryStatus` (`{ status: "loading" } | { status: "error"; error: string } | { status: "ready"; judgement: Judgement; stats: string[] }`), `useGcdEconomySummary(accessToken, reportCode, fight, druidId, fetchEvents): EpicSummaryStatus` — both consumed by Task 6 (the type) and Task 8's `Scorecard` (the hook).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/components/Scorecard/useGcdEconomySummary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { aCastEvent, aFight } from "../../../testUtils/factories";

describe("useGcdEconomySummary", () => {
  it("starts loading, then reports the worst-of judgement and stat lines", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 2, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 2, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    const { result } = renderHook(() =>
      useGcdEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      status: "ready",
      judgement: "red",
      stats: ["GCD utilization: 30%", expect.stringContaining("Idle gaps:")],
    });
  });

  it("reports an error status when the fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useGcdEconomySummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useGcdEconomySummary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/components/Scorecard/epicSummaryStatus.ts
import type { Judgement } from "../../../metrics/judgement";

export type EpicSummaryStatus =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; judgement: Judgement; stats: string[] };
```

```ts
// src/app/components/Scorecard/useGcdEconomySummary.ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeGcdUtilization } from "../../../metrics/gcdUtilization";
import { computeIdleGaps } from "../../../metrics/idleGaps";
import { summarizeGcdEconomy } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useGcdEconomySummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    fetchEvents(
      accessToken,
      reportCode,
      { id: fight.id, startTime: fight.startTime, endTime: fight.endTime },
      "Casts",
    )
      .then((events) => {
        const gcd = computeGcdUtilization(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        const idleGaps = computeIdleGaps(
          events,
          druidId,
          fight.startTime,
          fight.endTime,
        );
        setState({
          accessToken,
          summary: { status: "ready", ...summarizeGcdEconomy(gcd, idleGaps) },
        });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to summarize GCD economy.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useGcdEconomySummary.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/epicSummaryStatus.ts src/app/components/Scorecard/useGcdEconomySummary.ts src/app/components/Scorecard/useGcdEconomySummary.test.ts
git commit -m "feat(gcd): add useGcdEconomySummary hook for the dashboard widget"
```

---

### Task 6: `useLifebloomDisciplineSummary` hook

**Files:**

- Create: `src/app/components/Scorecard/useLifebloomDisciplineSummary.ts`
- Test: `src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`

**Interfaces:**

- Consumes: `computeLb3Uptime` (`src/metrics/lb3Uptime.ts`), `computeRefreshCadence` (`src/metrics/refreshCadence.ts`), `computeAccidentalBlooms` (`src/metrics/accidentalBlooms.ts`), `computeRestackTax` (`src/metrics/restackTax.ts`), `summarizeLifebloomDiscipline` (Task 1), `EpicSummaryStatus` (Task 5).
- Produces: `useLifebloomDisciplineSummary(accessToken, reportCode, fight, druidId, lifebloomAbilityIds, fetchEvents): EpicSummaryStatus` — consumed by Task 8's `Scorecard`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import {
  anApplyBuffEvent,
  anApplyBuffStackEvent,
  aFight,
} from "../../../testUtils/factories";

describe("useLifebloomDisciplineSummary", () => {
  it("starts loading, then reports the worst-of judgement and stat lines", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const buffEvents = [
      anApplyBuffEvent({ timestamp: 0, sourceID: 2, targetID: 42 }),
      anApplyBuffStackEvent({
        timestamp: 100,
        sourceID: 2,
        targetID: 42,
        stack: 2,
      }),
      anApplyBuffStackEvent({
        timestamp: 200,
        sourceID: 2,
        targetID: 42,
        stack: 3,
      }),
    ];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) => Promise.resolve(dataType === "Buffs" ? buffEvents : []);

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
      ),
    );

    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status).toBe("ready");
  });

  it("reports an error status when a fetch rejects", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));

    const { result } = renderHook(() =>
      useLifebloomDisciplineSummary(
        "test-token",
        "4GYHZRdtL3bvhpc8",
        fight,
        2,
        new Set([33763]),
        fetchEvents,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toEqual({
      status: "error",
      error: "WCL API responded 500: server error",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/components/Scorecard/useLifebloomDisciplineSummary.ts
import { useEffect, useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { computeLb3Uptime } from "../../../metrics/lb3Uptime";
import { computeRefreshCadence } from "../../../metrics/refreshCadence";
import { computeAccidentalBlooms } from "../../../metrics/accidentalBlooms";
import { computeRestackTax } from "../../../metrics/restackTax";
import { summarizeLifebloomDiscipline } from "../../../metrics/epicSummary";
import type { EpicSummaryStatus } from "./epicSummaryStatus";

type TaggedState = { accessToken: string; summary: EpicSummaryStatus };

export function useLifebloomDisciplineSummary(
  accessToken: string,
  reportCode: string,
  fight: Fight,
  druidId: number,
  lifebloomAbilityIds: Set<number>,
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>,
): EpicSummaryStatus {
  const [state, setState] = useState<TaggedState | null>(null);

  useEffect(() => {
    const fightArg = {
      id: fight.id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };
    Promise.all([
      fetchEvents(accessToken, reportCode, fightArg, "Buffs"),
      fetchEvents(accessToken, reportCode, fightArg, "Casts"),
      fetchEvents(accessToken, reportCode, fightArg, "Healing"),
    ])
      .then(([buffEvents, castEvents, healEvents]) => {
        const lb3 = computeLb3Uptime(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
          fight.startTime,
          fight.endTime,
        );
        const refresh = computeRefreshCadence(
          buffEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const blooms = computeAccidentalBlooms(
          buffEvents,
          healEvents,
          druidId,
          lifebloomAbilityIds,
        );
        const restack = computeRestackTax(
          buffEvents,
          castEvents,
          druidId,
          lifebloomAbilityIds,
          fight.endTime - fight.startTime,
        );
        setState({
          accessToken,
          summary: {
            status: "ready",
            ...summarizeLifebloomDiscipline(lb3, refresh, blooms, restack),
          },
        });
      })
      .catch((err: unknown) =>
        setState({
          accessToken,
          summary: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Failed to summarize Lifebloom discipline.",
          },
        }),
      );
  }, [
    accessToken,
    reportCode,
    fight.id,
    fight.startTime,
    fight.endTime,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  ]);

  if (state === null || state.accessToken !== accessToken) {
    return { status: "loading" };
  }
  return state.summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard/useLifebloomDisciplineSummary.ts src/app/components/Scorecard/useLifebloomDisciplineSummary.test.ts
git commit -m "feat(lifebloom): add useLifebloomDisciplineSummary hook for the dashboard widget"
```

---

### Task 7: Real icons for GCD-economy cards

**Files:**

- Modify: `src/app/components/GCDUtilizationCard/index.tsx`
- Modify: `src/app/components/IdleGapsCard/index.tsx`
- Delete: `src/assets/spell-icons/instantcast.jpg`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing new — purely swaps the `icon` value both cards already pass to `MetricCard`. No prop/type changes, so no consumer is affected.

- [ ] **Step 1: Update `GCDUtilizationCard`**

In `src/app/components/GCDUtilizationCard/index.tsx`, replace:

```ts
import instantcastIcon from "../../../assets/spell-icons/instantcast.jpg";
```

with:

```ts
const gcdUtilizationIcon =
  "https://wow.zamimg.com/images/wow/icons/large/ability_rogue_sprint.jpg";
```

Then replace all three `icon={instantcastIcon}` occurrences in that file with `icon={gcdUtilizationIcon}`.

- [ ] **Step 2: Update `IdleGapsCard`**

In `src/app/components/IdleGapsCard/index.tsx`, replace:

```ts
import instantcastIcon from "../../../assets/spell-icons/instantcast.jpg";
```

with:

```ts
const idleGapsIcon =
  "https://wow.zamimg.com/images/wow/icons/large/spell_nature_timestop.jpg";
```

Then replace all three `icon={instantcastIcon}` occurrences in that file with `icon={idleGapsIcon}`.

- [ ] **Step 3: Delete the now-unused local asset**

```bash
git rm src/assets/spell-icons/instantcast.jpg
```

- [ ] **Step 4: Run the existing tests to confirm nothing broke**

Run: `npx vitest run src/app/components/GCDUtilizationCard/index.test.tsx src/app/components/IdleGapsCard/index.test.tsx`
Expected: PASS — neither test asserts on `icon` src, only on headings/text/judgement, so both pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/GCDUtilizationCard/index.tsx src/app/components/IdleGapsCard/index.tsx
git commit -m "feat(gcd): use real hotlinked icons for GCD utilization and idle gaps"
```

---

### Task 8: Rewrite `Scorecard` as the dashboard

**Files:**

- Modify: `src/app/components/Scorecard/index.tsx`
- Modify: `src/app/components/Scorecard/index.module.css`
- Modify: `src/app/components/Scorecard/index.test.tsx`

**Interfaces:**

- Consumes: `GcdEconomyContent` (Task 3), `LifebloomDisciplineContent` (Task 4), `useGcdEconomySummary` (Task 5), `useLifebloomDisciplineSummary` (Task 6), `Widget` (Task 2), `JudgementChip`/`SpellIcon`/`Alert`/`Button` (existing `ui` components).
- Produces: `Scorecard` keeps its existing exported `ScorecardProps` shape unchanged (`App.tsx` needs no changes).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/components/Scorecard/index.test.tsx`:

```tsx
// src/app/components/Scorecard/index.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Scorecard } from "./index";
import { aCastEvent, aFight } from "../../../testUtils/factories";
import type { DruidCandidate } from "../../../report/druidDetection";

const druid: DruidCandidate = {
  id: 101,
  name: "Fernwhisper",
  healingCastCount: 214,
  isRestoSpec: true,
};

describe("Scorecard", () => {
  it("renders the fight header, all 6 epic widgets, and the footer", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 341000,
    });
    const onStartOver = vi.fn();
    const fetchEvents = () => Promise.resolve([]);

    render(
      <Scorecard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={101}
        druid={druid}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        onStartOver={onStartOver}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Lady Vashj \(Kill, 5:41\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fernwhisper — Restoration")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
    for (const label of [
      "Spell discipline",
      "Mana economy",
      "Death forensics",
      "Prep hygiene",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Not yet available")).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /Spell discipline/ }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /can't judge target selection/,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("drills into GCD economy detail and back to the overview", async () => {
    const fight = aFight({
      id: 6,
      name: "Lady Vashj",
      kill: true,
      startTime: 0,
      endTime: 10000,
    });
    const events = [
      aCastEvent({ timestamp: 1000, sourceID: 101, abilityGameID: 33763 }),
      aCastEvent({ timestamp: 3000, sourceID: 101, abilityGameID: 33763 }),
    ];
    const fetchEvents = () => Promise.resolve(events);

    render(
      <Scorecard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={101}
        druid={druid}
        lifebloomAbilityIds={new Set([33763])}
        targetNames={new Map()}
        fetchEvents={fetchEvents}
        onStartOver={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /GCD economy/ }),
      ).toHaveTextContent("Red"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /GCD economy/ }));

    expect(
      screen.getByRole("heading", { name: "GCD utilization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Idle gaps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "← All epics" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Lifebloom discipline/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← All epics" }));
    expect(
      screen.getByRole("button", { name: /Lifebloom discipline/ }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: FAIL — current `Scorecard` renders headings, not widget buttons.

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `src/app/components/Scorecard/index.tsx`:

```tsx
// src/app/components/Scorecard/index.tsx
import { useState } from "react";
import type { Fight } from "../../../wcl/client";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import type { DruidCandidate } from "../../../report/druidDetection";
import { formatDuration } from "../../../report/fightRows";
import { buildFightTimeUrl } from "../../../report/wclLinks";
import { GcdEconomyContent } from "../GcdEconomyContent";
import { LifebloomDisciplineContent } from "../LifebloomDisciplineContent";
import { useGcdEconomySummary } from "./useGcdEconomySummary";
import { useLifebloomDisciplineSummary } from "./useLifebloomDisciplineSummary";
import { Widget } from "../ui/Widget";
import { JudgementChip } from "../ui/JudgementChip";
import { SpellIcon } from "../ui/SpellIcon";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import lifebloomIcon from "../../../assets/spell-icons/lifebloom.jpg";
import styles from "./index.module.css";

export interface ScorecardProps {
  accessToken: string;
  reportCode: string;
  fight: Fight;
  druidId: number;
  druid: DruidCandidate;
  lifebloomAbilityIds: Set<number>;
  targetNames: Map<number, string>;
  fetchEvents: (
    accessToken: string,
    reportCode: string,
    fight: EventFetcherFight,
    dataType: WclEventDataType,
  ) => Promise<WclEvent[]>;
  onStartOver: () => void;
}

type EpicId = "gcd" | "lifebloom" | "spell" | "mana" | "death" | "prep";

const GCD_ECONOMY_ICON =
  "https://wow.zamimg.com/images/wow/icons/large/ability_druid_forceofnature.jpg";

const DISABLED_EPICS: { id: EpicId; label: string; icon: string }[] = [
  {
    id: "spell",
    label: "Spell discipline",
    icon: "https://wow.zamimg.com/images/wow/icons/large/spell_nature_ravenform.jpg",
  },
  {
    id: "mana",
    label: "Mana economy",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_potion_137.jpg",
  },
  {
    id: "death",
    label: "Death forensics",
    icon: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg",
  },
  {
    id: "prep",
    label: "Prep hygiene",
    icon: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_02.jpg",
  },
];

export function Scorecard({
  accessToken,
  reportCode,
  fight,
  druidId,
  druid,
  lifebloomAbilityIds,
  targetNames,
  fetchEvents,
  onStartOver,
}: ScorecardProps) {
  const [activeEpic, setActiveEpic] = useState<EpicId | null>(null);

  const gcdSummary = useGcdEconomySummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    fetchEvents,
  );
  const lifebloomSummary = useLifebloomDisciplineSummary(
    accessToken,
    reportCode,
    fight,
    druidId,
    lifebloomAbilityIds,
    fetchEvents,
  );

  const outcome =
    fight.kill === true
      ? "Kill"
      : fight.kill === false
        ? `Wipe (${Math.round(fight.bossPercentage ?? 0)}%)`
        : "Trash";
  const duration = formatDuration(fight.endTime - fight.startTime);
  const druidLabel = druid.isRestoSpec
    ? `${druid.name} — Restoration`
    : druid.name;

  return (
    <div>
      <h2 className={styles.fightHeading}>
        {fight.name} ({outcome}, {duration})
      </h2>
      <p className={styles.druidLine}>{druidLabel}</p>
      <p className={styles.reportLine}>
        Report <code>{reportCode}</code>{" "}
        <a
          href={buildFightTimeUrl(
            reportCode,
            fight.id,
            0,
            fight.endTime - fight.startTime,
          )}
          target="_blank"
          rel="noreferrer"
        >
          View on Warcraft Logs →
        </a>
      </p>

      {activeEpic === null && (
        <div className={styles.grid}>
          <Widget
            icon={GCD_ECONOMY_ICON}
            label="GCD economy"
            onOpen={() => setActiveEpic("gcd")}
            judgement={
              gcdSummary.status === "ready" ? gcdSummary.judgement : undefined
            }
            stats={gcdSummary.status === "ready" ? gcdSummary.stats : undefined}
            note={
              gcdSummary.status === "loading"
                ? "Calculating…"
                : gcdSummary.status === "error"
                  ? gcdSummary.error
                  : undefined
            }
          />
          <Widget
            icon={lifebloomIcon}
            label="Lifebloom discipline"
            onOpen={() => setActiveEpic("lifebloom")}
            judgement={
              lifebloomSummary.status === "ready"
                ? lifebloomSummary.judgement
                : undefined
            }
            stats={
              lifebloomSummary.status === "ready"
                ? lifebloomSummary.stats
                : undefined
            }
            note={
              lifebloomSummary.status === "loading"
                ? "Calculating…"
                : lifebloomSummary.status === "error"
                  ? lifebloomSummary.error
                  : undefined
            }
          />
          {DISABLED_EPICS.map((epic) => (
            <Widget
              key={epic.id}
              icon={epic.icon}
              label={epic.label}
              note="Not yet available"
            />
          ))}
        </div>
      )}

      {activeEpic === "gcd" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setActiveEpic(null)}
          >
            ← All epics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={GCD_ECONOMY_ICON} />
            <h2 className={styles.epicTitle}>GCD economy</h2>
            {gcdSummary.status === "ready" && (
              <JudgementChip judgement={gcdSummary.judgement} />
            )}
          </div>
          <GcdEconomyContent
            accessToken={accessToken}
            reportCode={reportCode}
            fight={fight}
            druidId={druidId}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      {activeEpic === "lifebloom" && (
        <div className={styles.detail}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setActiveEpic(null)}
          >
            ← All epics
          </button>
          <div className={styles.epicHeader}>
            <SpellIcon src={lifebloomIcon} />
            <h2 className={styles.epicTitle}>Lifebloom discipline</h2>
            {lifebloomSummary.status === "ready" && (
              <JudgementChip judgement={lifebloomSummary.judgement} />
            )}
          </div>
          <LifebloomDisciplineContent
            accessToken={accessToken}
            reportCode={reportCode}
            fight={fight}
            druidId={druidId}
            lifebloomAbilityIds={lifebloomAbilityIds}
            targetNames={targetNames}
            fetchEvents={fetchEvents}
          />
        </div>
      )}

      <div className={styles.footer}>
        <Alert tone="warning">
          This scorecard can&apos;t judge target selection, assignment
          adherence, or positioning — only your process.
        </Alert>
      </div>
      <div className={styles.startOver}>
        <Button variant="secondary" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    </div>
  );
}
```

Replace the full contents of `src/app/components/Scorecard/index.module.css`:

```css
/* src/app/components/Scorecard/index.module.css */
.fightHeading {
  margin-top: 0;
}
.druidLine {
  color: var(--text);
  margin-bottom: var(--space-1);
}
.reportLine {
  font-size: var(--text-small-size);
  color: var(--text);
  margin-bottom: var(--space-6);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  animation: fadeInUp 0.18s ease-out;
}
.detail {
  margin-bottom: var(--space-6);
  animation: fadeInUp 0.18s ease-out;
}
.backLink {
  display: inline-block;
  background: none;
  border: none;
  padding: 0;
  margin-bottom: var(--space-4);
  color: var(--accent);
  font: inherit;
  font-size: var(--text-small-size);
  cursor: pointer;
}
.epicHeader {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.epicTitle {
  margin: 0;
  flex: 1;
}
.footer {
  margin-top: var(--space-6);
}
.startOver {
  margin-top: var(--space-5);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/components/Scorecard/index.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/Scorecard
git commit -m "feat(scorecard): rework into a dashboard of widgets with drill-down (story 701)"
```

---

### Task 9: Full-suite verification, browser check, and paperwork

**Files:**

- Modify: `CLAUDE.md` (Repo state paragraph)
- Modify: `docs/backlog.md` (mark 701 done)
- Delete: `docs/specs/scorecard-dashboard-design.md`

**Interfaces:** none — this task only verifies and updates docs.

- [ ] **Step 1: Run the full static-analysis + test suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all pass, 0 failures.

No E2E update is needed: `test/e2e/smoke.spec.ts`'s golden path only goes as far as picking a
fight checkbox and never reaches the Scorecard, so it has no selectors affected by this rework
(confirmed by reading the file during planning).

- [ ] **Step 2: Manually verify in the browser**

Run: `npm run dev`, open the app, connect, load report `4GYHZRdtL3bvhpc8`, pick a fight and druid, click "Get scorecard". Confirm: 6 widgets render with no page scroll needed, the two real widgets show a judgement chip and stats once loaded, the 4 placeholder widgets show "Not yet available" and are not clickable, clicking a real widget drills into its detail with a working "← All epics" link back. If the 800px `Shell` width (`src/App.tsx`) looks cramped for the 3-column grid, widen it there — this is the only change App.tsx might need.

- [ ] **Step 3: Mark story 701 done in the backlog**

In `docs/backlog.md`, change:

```
### 701 — Single-fight scorecard
```

to:

```
### 701 — Single-fight scorecard ✅ Done
```

- [ ] **Step 4: Retire the spec and update CLAUDE.md's repo state**

```bash
git rm docs/specs/scorecard-dashboard-design.md
```

In `CLAUDE.md`, change the Repo state paragraph's last sentence from:

```
and story 205 (concurrent LB3 targets) are complete and live. Phase 1 MVP work continues with backlog story 701 (single-fight scorecard) next.
```

to:

```
story 205 (concurrent LB3 targets), and story 701 (single-fight scorecard) are complete and live — Phase 1 MVP is done. Phase 2 work continues with backlog story 008 (default API client fallback) next, then epic D starting with story 301.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/backlog.md
git commit -m "docs: close out story 701 (dashboard-of-widgets scorecard)"
```
