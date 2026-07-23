import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportDashboard } from "./index";
import {
  aCastEvent,
  aCombatantInfoEvent,
  aDeathEvent,
  aFight,
  anApplyBuffEvent,
} from "../../../testUtils/factories";
import type { DruidCandidate } from "../../../report/druidDetection";

const druid: DruidCandidate = {
  id: 101,
  name: "Fernwhisper",
  healingCastCount: 214,
  isRestoSpec: true,
};

const baseProps = {
  accessToken: "test-token",
  reportCode: "4GYHZRdtL3bvhpc8",
  host: "fresh" as const,
  reportTitle: "SSC+TK 2026-07-07",
  druidId: 101,
  druid,
  lifebloomAbilityIds: new Set<number>([33763]),
  rejuvenationAbilityIds: new Set<number>([26982]),
  regrowthAbilityIds: new Set<number>([26980]),
  swiftmendAbilityIds: new Set<number>([18562]),
  naturesSwiftnessAbilityIds: new Set<number>([17116]),
  resolvedAbilities: new Map([
    [33763, { kind: "spell" as const, spell: "Lifebloom" as const, rank: 1 }],
  ]),
  targetNames: new Map(),
  actorClasses: new Map(),
  fetchLookbackEvents: () => Promise.resolve([]),
  openFightId: null as number | null,
  onOpenFight: vi.fn(),
  onCloseFight: vi.fn(),
  activeEpicId: null,
  onSelectEpic: vi.fn(),
  onOpenFightEpic: vi.fn(),
  onStartOver: vi.fn(),
};

describe("ReportDashboard", () => {
  it("renders every non-trash fight immediately and lets you click in before any judgement resolves", () => {
    const fights = [
      aFight({ id: 1, name: "Lady Vashj", kill: true }),
      aFight({ id: 2, name: "Trash pack", encounterID: 0 }),
    ];
    const fetchEvents = () => new Promise<never>(() => {}); // never resolves

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    const row = screen.getByRole("button", { name: /Pull 1 · Lady Vashj/ });
    expect(row).toBeInTheDocument();
    expect(screen.queryByText(/Trash pack/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Calculating…").length).toBeGreaterThan(0);
  });

  it("calls onOpenFight on row click; rendering the fight's scorecard once openFightId is set is the parent's job", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const onOpenFight = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        onOpenFight={onOpenFight}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Pull 1 · Lady Vashj/ }),
    );
    expect(onOpenFight).toHaveBeenCalledWith(1);

    rerender(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        onOpenFight={onOpenFight}
        openFightId={1}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pull 1 · Lady Vashj/ }),
    ).not.toBeInTheDocument();
  });

  it("calls onCloseFight when ← All fights is clicked from an open fight", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = () => Promise.resolve([]);
    const onCloseFight = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={1}
        onCloseFight={onCloseFight}
      />,
    );

    await user.click(screen.getByRole("button", { name: "← All fights" }));
    expect(onCloseFight).toHaveBeenCalledOnce();
  });

  it("shows each fight's own worst-of judgement once its six epics resolve", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Casts"
          ? [
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 1000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 2000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 3000,
              }),
            ]
          : [],
      );

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Pull 1 · Lady Vashj/ }),
      ).toHaveTextContent(/Good|Fair|Bad/),
    );
  });

  it("opens directly on the fight named by openFightId", async () => {
    const fights = [
      aFight({ id: 1, name: "Lady Vashj", kill: true }),
      aFight({ id: 2, name: "Leotheras the Blind", kill: true }),
    ];
    const fetchEvents = () => Promise.resolve([]);

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={2}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /GCD economy/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Leotheras the Blind/)).toBeInTheDocument();
  });

  it("passes activeEpicId/onSelectEpic through to the open fight's Scorecard", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const events: never[] = [];
    const fetchEvents = () => Promise.resolve(events);
    const onSelectEpic = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
        openFightId={1}
        onSelectEpic={onSelectEpic}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /GCD economy/ }),
    );
    expect(onSelectEpic).toHaveBeenCalledWith("gcd");
  });

  it("shows six aggregated epic chips that resolve once every fight's data is in", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Casts"
          ? [
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 1000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 2000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 3000,
              }),
            ]
          : [],
      );

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    for (const label of [
      "GCD economy",
      "Lifebloom discipline",
      "Spell discipline",
      "Mana economy",
      "Death forensics",
      "Prep hygiene",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );
  });

  it("excludes an off-role fight's judgements from the aggregate strip and labels its row", async () => {
    const onRoleFight = aFight({ id: 1, name: "Lady Vashj", kill: true });
    const offRoleFight = aFight({
      id: 2,
      name: "Hydross the Unstable",
      kill: true,
    });
    // The off-role fight (id 2) gets its own maintained-Lifebloom death with
    // both cooldowns unspent, which computeDeathForensics (src/metrics/
    // deathForensics.ts) resolves to a "bad" Death forensics judgement. The
    // on-role fight (id 1) has zero death events, which resolves to "good"
    // (worstJudgement of an empty array). This divergence is what lets the
    // assertion below actually detect leakage: if the off-role fight's
    // summary were wrongly pooled into the aggregate, "Death forensics"
    // would flip from good to bad once it's added.
    const fetchEvents = (
      _token: string,
      _report: string,
      fight: { id: number },
      dataType: string,
    ) => {
      if (dataType === "Casts") {
        if (fight.id !== 1) return Promise.resolve([]);
        return Promise.resolve([
          aCastEvent({
            sourceID: 101,
            abilityGameID: 33763,
            timestamp: 1000,
          }),
          aCastEvent({
            sourceID: 101,
            abilityGameID: 33763,
            timestamp: 2000,
          }),
          aCastEvent({
            sourceID: 101,
            abilityGameID: 33763,
            timestamp: 3000,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "Buffs") {
        // Lifebloom applied at fight start and never removed -> 100% uptime
        // on target 55, comfortably over the 30% "maintained" threshold.
        return Promise.resolve([
          anApplyBuffEvent({
            sourceID: 101,
            targetID: 55,
            abilityGameID: 33763,
            timestamp: offRoleFight.startTime,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "Deaths") {
        // No prior druid casts at all (Casts returns [] for fight 2), so
        // both Swiftmend and Nature's Swiftness read as "ready" (unspent) —
        // 2 unspent resources on a maintained target is a "bad" death.
        return Promise.resolve([
          aDeathEvent({
            targetID: 55,
            timestamp: offRoleFight.startTime + 10000,
          }),
        ]);
      }
      return Promise.resolve([]);
    };

    const EPIC_LABELS = [
      "GCD economy",
      "Lifebloom discipline",
      "Spell discipline",
      "Mana economy",
      "Death forensics",
      "Prep hygiene",
    ];

    // Render the on-role fight alone first, and capture what the aggregate
    // strip settles on. This is the baseline the combined render (below)
    // must match exactly — if the off-role fight's judgements leaked into
    // the pool, at least one chip would read differently once it's added,
    // since the two fights' underlying event data differs (3 Lifebloom
    // casts vs. none at all).
    const solo = render(
      <ReportDashboard
        {...baseProps}
        fights={[onRoleFight]}
        fetchEvents={fetchEvents}
      />,
    );
    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );
    const soloChipText = EPIC_LABELS.map(
      (label) =>
        screen.getByText(label).parentElement?.parentElement?.textContent,
    );
    solo.unmount();

    render(
      <ReportDashboard
        {...baseProps}
        fights={[onRoleFight, offRoleFight]}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Hydross the Unstable/ }),
      ).toHaveTextContent("Not healing this fight"),
    );
    expect(
      screen.queryByRole("button", {
        name: /Hydross the Unstable/,
      }),
    ).not.toHaveTextContent(/Good|Fair|Bad/);

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );
    const comboChipText = EPIC_LABELS.map(
      (label) =>
        screen.getByText(label).parentElement?.parentElement?.textContent,
    );

    // The aggregate strip must be byte-for-byte identical whether or not
    // the off-role fight is present — proving its judgements were excluded
    // from the pool, not merely that its own row shows a different label.
    expect(comboChipText).toEqual(soloChipText);
  });

  it("shows a fight-count breakdown next to each aggregate chip once every fight resolves", async () => {
    const cleanFight = aFight({ id: 1, name: "Lady Vashj", kill: true });
    const deadlyFight = aFight({
      id: 2,
      name: "Leotheras the Blind",
      kill: true,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      fight: { id: number },
      dataType: string,
    ) => {
      // Both fights need >= MIN_HEALING_CASTS_FOR_DETECTION (3) healing
      // casts here so neither is excluded as off-role from the aggregate
      // rollup (src/report/druidDetection.ts) — an empty Casts response
      // for every fight would leave onRoleEntries empty and the chip
      // strip stuck on "Calculating…" forever.
      if (dataType === "Casts") {
        return Promise.resolve([
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
        ]);
      }
      if (fight.id === 2 && dataType === "Buffs") {
        return Promise.resolve([
          anApplyBuffEvent({
            sourceID: 101,
            targetID: 55,
            abilityGameID: 33763,
            timestamp: deadlyFight.startTime,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "Deaths") {
        return Promise.resolve([
          aDeathEvent({
            targetID: 55,
            timestamp: deadlyFight.startTime + 10000,
          }),
        ]);
      }
      // Restoration 45 clears both Swiftmend's (30) and Nature's
      // Swiftness's (20) minimums (src/report/archetypeDetection.ts), so
      // both read as unspent cooldowns on the maintained-target death
      // above -> deadlyFight's death judges "bad" (>= 2 unspent), matching
      // this test's assertion below.
      if (fight.id === 2 && dataType === "CombatantInfo") {
        return Promise.resolve([
          aCombatantInfoEvent({
            sourceID: 101,
            talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
          }),
        ]);
      }
      return Promise.resolve([]);
    };

    render(
      <ReportDashboard
        {...baseProps}
        fights={[cleanFight, deadlyFight]}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );

    const deathChipText =
      screen.getByText("Death forensics").parentElement?.parentElement
        ?.textContent;
    expect(deathChipText).toContain("1 good");
    expect(deathChipText).toContain("1 bad");
  });

  it("keeps a single-bucket breakdown as plain text, not an interactive control", async () => {
    const fights = [aFight({ id: 1, name: "Lady Vashj", kill: true })];
    const fetchEvents = (
      _token: string,
      _report: string,
      _fight: unknown,
      dataType: string,
    ) =>
      Promise.resolve(
        dataType === "Casts"
          ? [
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 1000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 2000,
              }),
              aCastEvent({
                sourceID: 101,
                abilityGameID: 33763,
                timestamp: 3000,
              }),
            ]
          : [],
      );

    render(
      <ReportDashboard
        {...baseProps}
        fights={fights}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );

    // A single fight means every chip's breakdown is single-bucket ("1
    // good"/"1 fair"/"1 bad") — none should render as an interactive
    // control, per the "only 2+ buckets are interactive" rule.
    expect(
      screen.queryAllByRole("button", { name: /^\d+ (good|fair|bad)$/ }),
    ).toHaveLength(0);
  });

  it("lists the bosses behind each judgement bucket in a popover, and clicking one navigates to that fight's scorecard with the right epic", async () => {
    const cleanFight = aFight({ id: 1, name: "Lady Vashj", kill: true });
    const deadlyFight = aFight({
      id: 2,
      name: "Leotheras the Blind",
      kill: true,
    });
    const fetchEvents = (
      _token: string,
      _report: string,
      fight: { id: number },
      dataType: string,
    ) => {
      if (dataType === "Casts") {
        return Promise.resolve([
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 1000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 2000 }),
          aCastEvent({ sourceID: 101, abilityGameID: 33763, timestamp: 3000 }),
        ]);
      }
      if (fight.id === 2 && dataType === "Buffs") {
        return Promise.resolve([
          anApplyBuffEvent({
            sourceID: 101,
            targetID: 55,
            abilityGameID: 33763,
            timestamp: deadlyFight.startTime,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "Deaths") {
        return Promise.resolve([
          aDeathEvent({
            targetID: 55,
            timestamp: deadlyFight.startTime + 10000,
          }),
        ]);
      }
      if (fight.id === 2 && dataType === "CombatantInfo") {
        return Promise.resolve([
          aCombatantInfoEvent({
            sourceID: 101,
            talents: [{ id: 0 }, { id: 0 }, { id: 45 }],
          }),
        ]);
      }
      return Promise.resolve([]);
    };
    const onOpenFightEpic = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportDashboard
        {...baseProps}
        fights={[cleanFight, deadlyFight]}
        fetchEvents={fetchEvents}
        onOpenFightEpic={onOpenFightEpic}
      />,
    );

    await waitFor(() =>
      expect(screen.queryAllByText("Calculating…")).toHaveLength(0),
    );

    const deathChip =
      screen.getByText("Death forensics").parentElement!.parentElement!;

    await user.click(within(deathChip).getByRole("button", { name: "1 bad" }));
    const link = within(deathChip).getByRole("button", {
      name: /Leotheras the Blind/,
    });
    expect(link).toBeInTheDocument();

    await user.click(link);
    expect(onOpenFightEpic).toHaveBeenCalledWith(2, "death");
  });
});
