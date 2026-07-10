import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FightPicker } from "./index";
import { aFight } from "../../../testUtils/factories";

const sscZone = { id: 548, name: "Serpentshrine Cavern" };
const tkZone = { id: 550, name: "The Eye" };

const trash = aFight({
  id: 1,
  name: "Trash",
  encounterID: 0,
  kill: null,
  bossPercentage: null,
  startTime: 0,
  endTime: 5000,
  gameZone: sscZone,
});
const bossKill = aFight({
  id: 2,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: true,
  bossPercentage: null,
  startTime: 0,
  endTime: 90000,
  gameZone: sscZone,
});
const bossWipe = aFight({
  id: 3,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: false,
  bossPercentage: 34.2,
  startTime: 0,
  endTime: 60000,
  gameZone: sscZone,
});
const tkBoss = aFight({
  id: 4,
  name: "Al'ar",
  encounterID: 600,
  kill: true,
  bossPercentage: null,
  startTime: 0,
  endTime: 120000,
  gameZone: tkZone,
});

describe("FightPicker", () => {
  it("hides trash fights by default", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Trash/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pull 1 — Coilfang Frenzy/)).toBeInTheDocument();
  });

  it("reveals trash fights when the toggle is checked", async () => {
    const user = userEvent.setup();
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(screen.getByText(/Trash/)).toBeInTheDocument();
  });

  it("shows kill and wipe status distinctly, with boss HP% on a wipe", () => {
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText(/Pull 1 — Coilfang Frenzy/),
    ).toHaveAccessibleName(/Kill/);
    expect(
      screen.getByLabelText(/Pull 2 — Coilfang Frenzy/),
    ).toHaveAccessibleName(/Wipe \(34%\)/);
  });

  it("toggling a fight's checkbox calls onSelectionChange with just that fight", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(screen.getByLabelText(/Wipe/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([3]);
    expect(screen.getByLabelText(/Wipe/)).toBeChecked();

    await user.click(screen.getByLabelText(/Kill/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 3]);
  });

  it("unchecking a fight removes just that fight from the selection", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={2}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(screen.getByLabelText(/Wipe/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 3]);

    await user.click(screen.getByLabelText(/Kill/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([3]);
  });

  it("pre-selects a boss fight from initialFightId without enabling the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={2}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).not.toBeChecked();
    expect(screen.getByLabelText(/Coilfang Frenzy/)).toBeChecked();
  });

  it("pre-selects a trash fight from initialFightId and auto-enables the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={1}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).toBeChecked();
    expect(screen.getByLabelText(/Trash/)).toBeChecked();
  });

  it("renders one button per zone present among boss fights, with boss counts", () => {
    render(
      <FightPicker
        fights={[trash, bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "The Eye (1)" }),
    ).toBeInTheDocument();
  });

  it("clicking a zone button selects exactly that zone's boss fights", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    );
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 3]);
    expect(screen.getByLabelText(/Coilfang Frenzy — Kill/)).toBeChecked();
    expect(screen.getByLabelText(/Wipe/)).toBeChecked();
    expect(screen.getByLabelText(/Al'ar/)).not.toBeChecked();
  });

  it("replaces a prior zone selection when a different zone button is clicked", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    );
    await user.click(screen.getByRole("button", { name: "The Eye (1)" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([4]);
    expect(screen.getByLabelText(/Coilfang Frenzy — Kill/)).not.toBeChecked();
    expect(screen.getByLabelText(/Wipe/)).not.toBeChecked();
    expect(screen.getByLabelText(/Al'ar/)).toBeChecked();
  });

  it("keeps the rest of a zone selection after unchecking one of its fights", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe, tkBoss]}
        initialFightId={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Serpentshrine Cavern (2)" }),
    );
    await user.click(screen.getByLabelText(/Wipe/));
    expect(onSelectionChange).toHaveBeenLastCalledWith([2]);
    expect(screen.getByLabelText(/Coilfang Frenzy — Kill/)).toBeChecked();
  });

  it("never counts trash fights in a zone button, even when shown", async () => {
    const user = userEvent.setup();
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectionChange={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(
      screen.getByRole("button", { name: "Serpentshrine Cavern (1)" }),
    ).toBeInTheDocument();
  });
});
