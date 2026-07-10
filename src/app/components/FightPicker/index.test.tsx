import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FightPicker } from "./index";
import { aFight } from "../../../testUtils/factories";

const trash = aFight({
  id: 1,
  name: "Trash",
  encounterID: 0,
  kill: null,
  bossPercentage: null,
  startTime: 0,
  endTime: 5000,
});
const bossKill = aFight({
  id: 2,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: true,
  bossPercentage: null,
  startTime: 0,
  endTime: 90000,
});
const bossWipe = aFight({
  id: 3,
  name: "Coilfang Frenzy",
  encounterID: 500,
  kill: false,
  bossPercentage: 34.2,
  startTime: 0,
  endTime: 60000,
});

describe("FightPicker", () => {
  it("hides trash fights by default", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectFight={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Trash/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toBeInTheDocument();
  });

  it("reveals trash fights when the toggle is checked", async () => {
    const user = userEvent.setup();
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={null}
        onSelectFight={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Show trash fights"));
    expect(screen.getByRole("button", { name: /Trash/ })).toBeInTheDocument();
  });

  it("shows kill and wipe status distinctly, with boss HP% on a wipe", () => {
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectFight={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Pull 1 — Coilfang Frenzy/ }),
    ).toHaveTextContent("Kill");
    expect(
      screen.getByRole("button", { name: /Pull 2 — Coilfang Frenzy/ }),
    ).toHaveTextContent("Wipe (34%)");
  });

  it("calls onSelectFight and highlights the clicked row", async () => {
    const user = userEvent.setup();
    const onSelectFight = vi.fn();
    render(
      <FightPicker
        fights={[bossKill, bossWipe]}
        initialFightId={null}
        onSelectFight={onSelectFight}
      />,
    );
    const wipeRow = screen.getByRole("button", { name: /Wipe/ });
    await user.click(wipeRow);
    expect(onSelectFight).toHaveBeenCalledWith(3);
    expect(wipeRow).toHaveAttribute("aria-current", "true");
  });

  it("pre-selects a boss fight from initialFightId without enabling the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={2}
        onSelectFight={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Coilfang Frenzy/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("pre-selects a trash fight from initialFightId and auto-enables the trash toggle", () => {
    render(
      <FightPicker
        fights={[trash, bossKill]}
        initialFightId={1}
        onSelectFight={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Show trash fights")).toBeChecked();
    expect(screen.getByRole("button", { name: /Trash/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
