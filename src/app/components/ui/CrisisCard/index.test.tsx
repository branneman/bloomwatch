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
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="fair"
        clearSave={false}
        saveKind={null}
        prepped={false}
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
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement={null}
        clearSave={false}
        saveKind={null}
        prepped={false}
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
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={false}
        saveKind={null}
        prepped={false}
      />,
    );

    expect(screen.getByText("Responded")).toBeInTheDocument();
  });

  it("shows a distinct badge for a clear-save Nature's Swiftness combo", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={true}
        saveKind="natures-swiftness-combo"
        prepped={false}
      />,
    );

    expect(screen.getByText(/Clear save/)).toBeInTheDocument();
    expect(screen.getByText(/Nature's Swiftness/)).toBeInTheDocument();
  });

  it("shows a distinct badge for a clear-save Swiftmend combo", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={true}
        saveKind="swiftmend-hot-consume"
        prepped={false}
      />,
    );

    expect(screen.getByText(/Clear save/)).toBeInTheDocument();
    expect(screen.getByText(/Swiftmend/)).toBeInTheDocument();
  });

  it("shows no clear-save badge for a plain responded crisis", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={false}
        saveKind={null}
        prepped={false}
      />,
    );

    expect(screen.queryByText(/Clear save/)).not.toBeInTheDocument();
  });

  it("shows an anticipated badge when the crisis was prepped", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={false}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={false}
        saveKind={null}
        prepped={true}
      />,
    );

    expect(screen.getByText(/Anticipated/)).toBeInTheDocument();
  });

  it("shows no anticipated badge when the crisis was not prepped", () => {
    render(
      <CrisisCard
        target="Test Target"
        time="1:30"
        hitPointsPct={10}
        maintained={true}
        judged={true}
        responded={true}
        swiftmendReady={false}
        nsReady={false}
        idlePreceding={false}
        hasSwiftmend={true}
        hasNaturesSwiftness={true}
        judgement="good"
        clearSave={false}
        saveKind={null}
        prepped={false}
      />,
    );

    expect(screen.queryByText(/Anticipated/)).not.toBeInTheDocument();
  });
});
