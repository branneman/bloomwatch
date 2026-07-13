import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DruidDetector } from "./index";
import { aCastTableEntry } from "../../../testUtils/factories";

describe("DruidDetector", () => {
  it("fetches casts and reports detected druids once loaded", async () => {
    const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
    const fetchCastsTable = () => Promise.resolve([dassz]);
    const onDruidsDetected = vi.fn();
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={onDruidsDetected}
      />,
    );
    await waitFor(() =>
      expect(onDruidsDetected).toHaveBeenCalledWith([
        { id: 2, name: "Dassz", healingCastCount: 57, isRestoSpec: true },
      ]),
    );
  });

  it("shows a loading message before the fetch resolves", () => {
    const fetchCastsTable = () => new Promise<never>(() => {});
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
      />,
    );
    expect(screen.getByText("Detecting druids…")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    const fetchCastsTable = () =>
      Promise.reject(new Error("WCL API responded 500: server error"));
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "WCL API responded 500: server error",
      ),
    );
  });

  it("calls onEntriesLoaded with the raw cast-table entries once loaded", async () => {
    const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
    const fanah = aCastTableEntry({ id: 42, name: "Fanah", type: "Paladin" });
    const fetchCastsTable = () => Promise.resolve([dassz, fanah]);
    const onEntriesLoaded = vi.fn();
    render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
        onEntriesLoaded={onEntriesLoaded}
      />,
    );
    await waitFor(() =>
      expect(onEntriesLoaded).toHaveBeenCalledWith([dassz, fanah]),
    );
  });

  it("aborts the in-flight fetch when unmounted", () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchCastsTable = (
      _accessToken: string,
      _reportCode: string,
      _fightIds: number[],
      signal?: AbortSignal,
    ) => {
      capturedSignal = signal;
      return new Promise<never>(() => {});
    };
    const { unmount } = render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={vi.fn()}
      />,
    );

    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("shows the loading message again, not stale candidates, once fightIds changes", async () => {
    const dassz = aCastTableEntry({ id: 2, name: "Dassz" });
    const fetchCastsTable = vi
      .fn()
      .mockResolvedValueOnce([dassz])
      .mockReturnValueOnce(new Promise<never>(() => {}));
    const onDruidsDetected = vi.fn();

    const { rerender } = render(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[6]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={onDruidsDetected}
      />,
    );
    await waitFor(() => expect(onDruidsDetected).toHaveBeenCalledTimes(1));

    rerender(
      <DruidDetector
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fightIds={[7]}
        fetchCastsTable={fetchCastsTable}
        onDruidsDetected={onDruidsDetected}
      />,
    );

    expect(screen.getByText("Detecting druids…")).toBeInTheDocument();
  });
});
