import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrepHygieneCard } from "./index";
import * as prepHygieneModule from "../../../metrics/prepHygiene";
import {
  ENCHANTABLE_SLOT_INDEXES,
  MAIN_HAND_GEAR_INDEX,
  SUPERIOR_WIZARD_OIL_ENCHANT_ID,
  GLYPH_OF_RENEWAL_ID,
  GREATER_INSCRIPTION_OF_FAITH_ID,
  INSCRIPTION_OF_FAITH_ID,
  ENCHANT_CLOAK_SUBTLETY_ID,
  ENCHANT_CLOAK_GREATER_SHADOW_RESISTANCE_ID,
  CHEST_MAJOR_SPIRIT_ID,
  CHEST_EXCEPTIONAL_STATS_ID,
  ENCHANT_BRACER_SUPERIOR_HEALING_ID,
  ENCHANT_BRACER_HEALING_POWER_ID,
  ENCHANT_GLOVES_MAJOR_HEALING_ID,
  GOLDEN_SPELLTHREAD_ID,
  SILVER_SPELLTHREAD_ID,
  ENCHANT_BOOTS_BOARS_SPEED_ID,
  ENCHANT_WEAPON_MAJOR_HEALING_ID,
  ENCHANT_WEAPON_HEALING_POWER_ID,
  TEARDROP_LIVING_RUBY_ID,
  BRACING_EARTHSTORM_DIAMOND_ID,
  type EnchantableSlot,
} from "../../../metrics/prepHygiene";
import type { WclEvent, WclEventDataType } from "../../../wcl/events";
import type { EventFetcherFight } from "../../../wcl/eventCache";
import { aCombatantInfoEvent, aFight } from "../../../testUtils/factories";

// Test-local id tables, duplicated from src/metrics/prepHygiene.test.ts's
// own BIS_ID_BY_SLOT/ACCEPTABLE_ID_BY_SLOT (real researched constants — see
// docs/specs/602-enchant-gem-check-design.md's "ID compilation" section).
// Head/Hands/Feet have no real acceptable-tier id (see prepHygiene.ts's
// per-slot comments).
const BIS_ID_BY_SLOT: Record<EnchantableSlot, number> = {
  Head: GLYPH_OF_RENEWAL_ID,
  Shoulder: GREATER_INSCRIPTION_OF_FAITH_ID,
  Back: ENCHANT_CLOAK_SUBTLETY_ID,
  Chest: CHEST_MAJOR_SPIRIT_ID,
  Wrist: ENCHANT_BRACER_SUPERIOR_HEALING_ID,
  Hands: ENCHANT_GLOVES_MAJOR_HEALING_ID,
  Legs: GOLDEN_SPELLTHREAD_ID,
  Feet: ENCHANT_BOOTS_BOARS_SPEED_ID,
  MainHand: ENCHANT_WEAPON_MAJOR_HEALING_ID,
};

const ACCEPTABLE_ID_BY_SLOT: Partial<Record<EnchantableSlot, number>> = {
  Shoulder: INSCRIPTION_OF_FAITH_ID,
  Back: ENCHANT_CLOAK_GREATER_SHADOW_RESISTANCE_ID,
  Chest: CHEST_EXCEPTIONAL_STATS_ID,
  Wrist: ENCHANT_BRACER_HEALING_POWER_ID,
  Legs: SILVER_SPELLTHREAD_ID,
  MainHand: ENCHANT_WEAPON_HEALING_POWER_ID,
};

interface TestGearEntry {
  temporaryEnchant?: number;
  permanentEnchant?: number;
  gems?: { id: number }[];
}

// A fully-prepped gear array: every enchantable slot on the given tier
// (falling back to bis where no acceptable id exists), plus the weapon oil
// temporary enchant and a recognized meta + colored gem — the "nothing left
// to flag" case for both new rows.
function fullyPreppedGear(
  idBySlot: Record<EnchantableSlot, number>,
): TestGearEntry[] {
  const gear: TestGearEntry[] = Array.from({ length: 19 }, () => ({}));
  for (const [slot, index] of Object.entries(ENCHANTABLE_SLOT_INDEXES)) {
    gear[index] = { permanentEnchant: idBySlot[slot as EnchantableSlot] };
  }
  gear[MAIN_HAND_GEAR_INDEX] = {
    ...gear[MAIN_HAND_GEAR_INDEX],
    temporaryEnchant: SUPERIOR_WIZARD_OIL_ENCHANT_ID,
  };
  gear[ENCHANTABLE_SLOT_INDEXES.Head] = {
    ...gear[ENCHANTABLE_SLOT_INDEXES.Head],
    gems: [{ id: BRACING_EARTHSTORM_DIAMOND_ID }],
  };
  gear[ENCHANTABLE_SLOT_INDEXES.Chest] = {
    ...gear[ENCHANTABLE_SLOT_INDEXES.Chest],
    gems: [{ id: TEARDROP_LIVING_RUBY_ID }],
  };
  return gear;
}

function fullyBisGear(): TestGearEntry[] {
  return fullyPreppedGear(BIS_ID_BY_SLOT);
}

// Every slot that has a real acceptable-tier id uses it; slots with none
// (Head, Hands, Feet) fall back to bis — the exact "still reads good, but
// with upgrade room" case story 602's tiered design is built around.
function fullyAcceptableGear(): TestGearEntry[] {
  const idBySlot = {} as Record<EnchantableSlot, number>;
  for (const slot of Object.keys(
    ENCHANTABLE_SLOT_INDEXES,
  ) as EnchantableSlot[]) {
    idBySlot[slot] = ACCEPTABLE_ID_BY_SLOT[slot] ?? BIS_ID_BY_SLOT[slot];
  }
  return fullyPreppedGear(idBySlot);
}

function makeFetchEvents(combatantInfoEvents: WclEvent[]) {
  return (
    _accessToken: string,
    _reportCode: string,
    _fight: EventFetcherFight,
    dataType: WclEventDataType,
  ): Promise<WclEvent[]> => {
    if (dataType === "CombatantInfo") {
      return Promise.resolve(combatantInfoEvents);
    }
    return Promise.resolve([]);
  };
}

describe("PrepHygieneCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a good judgement and both rows present when fully prepped", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    // Extended with fully-bis gear (Task 2) so the enchant/gem coverage
    // rows are also good — otherwise mixedJudgement would fold the
    // factory's default (unenchanted, ungemmed) gear in as bad/fair and
    // this "fully prepped" case would stop being fully prepped.
    const combatant = aCombatantInfoEvent({ gear: fullyBisGear() });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([combatant])}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Pull-time consumables check" }),
    ).toBeInTheDocument();
    // Four "Good" chips render once loaded: the card's own overall
    // judgement (MetricCard's header chip), the flask/elixir row, and the
    // two new enchant/gem coverage rows — all good in this fully-prepped
    // case.
    await waitFor(() => expect(screen.getAllByText("Good")).toHaveLength(4));
    expect(
      screen.getByText("Battle + guardian elixir active"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Present")).toHaveLength(2);
  });

  it("flags missing food and oil as Missing rows and a bad judgement", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const combatant = aCombatantInfoEvent({
      auras: [],
      gear: Array.from({ length: 16 }, () => ({})),
    });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([combatant])}
      />,
    );

    // Three "Bad" chips render here: the card's overall judgement, the
    // flask/elixir row, and the enchant coverage row (all 9 slots
    // unenchanted, over the bad threshold of 4+). The gem coverage row
    // reads "Fair" instead of "Bad" — this gear array has no gems at all,
    // which only counts as one missing item (the unrecognized meta gem),
    // under gem coverage's own bad threshold of 3+.
    await waitFor(() => expect(screen.getAllByText("Bad")).toHaveLength(3));
    expect(screen.getByText("No flask or elixir active")).toBeInTheDocument();
    expect(screen.getAllByText("Missing")).toHaveLength(2);
  });

  it("renders enchant and gem coverage rows for a fully-prepped combatant", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const combatant = aCombatantInfoEvent({ gear: fullyBisGear() });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([combatant])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("All 9 enchantable slots enchanted"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("All gems recognized, meta gem correct"),
    ).toBeInTheDocument();
  });

  it("shows an upgrade note for acceptable-tier gear without affecting the good judgement", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const combatant = aCombatantInfoEvent({ gear: fullyAcceptableGear() });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([combatant])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/upgrade available/)).toBeInTheDocument(),
    );
    // Every slot is covered (bis or acceptable — none missing) and both
    // gems are recognized, so all four chips (overall, flask, enchant,
    // gem) still read good despite the acceptable-tier note.
    expect(screen.getAllByText("Good")).toHaveLength(4);
  });

  it("shows missing-slot detail when enchant coverage is incomplete", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 341000 });
    const gear = fullyBisGear();
    gear[ENCHANTABLE_SLOT_INDEXES.Head] = {}; // drop Head's enchant only
    const combatant = aCombatantInfoEvent({ gear });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={makeFetchEvents([combatant])}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Missing\/unrecognized enchant: Head/),
      ).toBeInTheDocument(),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={() => new Promise<never>(() => {})}
      />,
    );

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
  });

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    let rejectFetch: (err: Error) => void = () => {};
    const fetchEvents = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a local error message when computing the metric throws (isolated from the rest of the scorecard)", async () => {
    vi.spyOn(prepHygieneModule, "computePrepHygiene").mockImplementation(() => {
      throw new Error("boom");
    });
    const fight = aFight({ id: 6, startTime: 0, endTime: 10000 });
    const fetchEvents = () => Promise.resolve([]);

    render(
      <PrepHygieneCard
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fight={fight}
        druidId={2}
        fetchEvents={fetchEvents}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });
});
