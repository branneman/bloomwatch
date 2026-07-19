import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrisisCard } from "./index";

describe("CrisisCard", () => {
  it("shows a judgement chip and the resource rows when judged and not responded", () => {
    render(
      <CrisisCard
        target="Offtank"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={false}
        swiftmendReady={true}
        nsReady={false}
        idlePreceding={true}
        judgement="fair"
      />,
    );

    expect(screen.getByText("Offtank")).toBeInTheDocument();
    expect(screen.getByText("Fair")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("On cooldown")).toBeInTheDocument();
  });

  it("shows 'Context only' instead of a judgement chip when not judged", () => {
    render(
      <CrisisCard
        target="Random raider"
        time="2:10"
        hitPointsPct={12}
        maintained={false}
        judged={false}
        responded={false}
        swiftmendReady={true}
        nsReady={true}
        idlePreceding={true}
        judgement={null}
      />,
    );

    expect(screen.getByText("Context only")).toBeInTheDocument();
  });

  it("shows 'Responded' with no resource rows when the druid reacted", () => {
    render(
      <CrisisCard
        target="Offtank"
        time="0:45"
        hitPointsPct={8}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        judgement="good"
      />,
    );

    expect(screen.getByText("Responded")).toBeInTheDocument();
  });
});
