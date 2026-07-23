import { describe, expect, it } from "vitest";
import { resolveFaerieFireAbilityIds } from "./resolveFaerieFireAbilityIds";
import type { ReportAbility } from "../wcl/client";

describe("resolveFaerieFireAbilityIds", () => {
  it("resolves the live-confirmed gameID 26993", () => {
    const abilities: ReportAbility[] = [{ gameID: 26993, name: "Faerie Fire" }];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set([26993]));
  });

  it("never includes Faerie Fire (Feral), even though it's a distinct real ability", () => {
    const abilities: ReportAbility[] = [
      { gameID: 26993, name: "Faerie Fire" },
      { gameID: 27011, name: "Faerie Fire (Feral)" },
    ];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set([26993]));
  });

  it("resolves an unrecognized gameID via exact name match, still excluding the Feral variant", () => {
    const abilities: ReportAbility[] = [
      { gameID: 99999, name: "Faerie Fire" },
      { gameID: 88888, name: "Faerie Fire (Feral)" },
    ];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set([99999]));
  });

  it("ignores unrelated abilities entirely", () => {
    const abilities: ReportAbility[] = [
      { gameID: 33763, name: "Lifebloom" },
      { gameID: 18562, name: "Swiftmend" },
    ];
    expect(resolveFaerieFireAbilityIds(abilities)).toEqual(new Set());
  });
});
