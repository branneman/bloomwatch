import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectPanel } from "./index";
import { aReportFights } from "../../../testUtils/factories";

describe("ConnectPanel", () => {
  it("shows a not-connected message when there is no access token", () => {
    render(
      <ConnectPanel
        accessToken={null}
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={() => Promise.reject()}
        onReportLoaded={vi.fn()}
      />,
    );
    expect(screen.getByText("Not connected.")).toBeInTheDocument();
  });

  it("fetches and renders the report title once connected", async () => {
    const fetchReportFights = () => Promise.resolve(aReportFights());
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("SSC+TK 2026-07-07")).toBeInTheDocument(),
    );
  });

  it("calls onReportLoaded with the fetched report once loaded", async () => {
    const report = aReportFights();
    const fetchReportFights = () => Promise.resolve(report);
    const onReportLoaded = vi.fn();
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={onReportLoaded}
      />,
    );
    await waitFor(() => expect(onReportLoaded).toHaveBeenCalledWith(report));
  });

  it("does not show a local error message when the fetch fails (escalates to the app-level recovery overlay instead)", async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const fetchReportFights = () =>
      new Promise<never>((_resolve, reject) => {
        rejectFetch = reject;
      });
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("WCL API responded 500: server error"));
      await Promise.resolve();
    });

    expect(screen.getByText("Loading report…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts the in-flight fetch when unmounted", () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchReportFights = (
      _accessToken: string,
      _reportCode: string,
      signal?: AbortSignal,
    ) => {
      capturedSignal = signal;
      return new Promise<never>(() => {});
    };
    const { unmount } = render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
      />,
    );

    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
