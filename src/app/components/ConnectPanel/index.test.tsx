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
        onStartOver={vi.fn()}
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
        onStartOver={vi.fn()}
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
        onStartOver={vi.fn()}
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
        onStartOver={vi.fn()}
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
        onStartOver={vi.fn()}
      />,
    );

    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("shows a rejection message and does not call onReportLoaded for a non-TBC report", async () => {
    const fetchReportFights = () =>
      Promise.resolve(aReportFights({ expansionId: 1000 }));
    const onReportLoaded = vi.fn();
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={onReportLoaded}
        onStartOver={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "isn't Burning Crusade content",
      ),
    );
    expect(onReportLoaded).not.toHaveBeenCalled();
  });

  it("shows a subscription-required message and does not call onReportLoaded when archiveStatus.isAccessible is false", async () => {
    const fetchReportFights = () =>
      Promise.resolve(
        aReportFights({
          archiveStatus: { isArchived: true, isAccessible: false },
        }),
      );
    const onReportLoaded = vi.fn();
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={onReportLoaded}
        onStartOver={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "requires an active Warcraft Logs subscription",
      ),
    );
    expect(onReportLoaded).not.toHaveBeenCalled();
  });

  it("shows the subscription-required message when the fetch throws an error mentioning a subscription", async () => {
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
        onStartOver={vi.fn()}
      />,
    );

    await act(async () => {
      rejectFetch(new Error("This report has been archived."));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "requires an active Warcraft Logs subscription",
    );
  });

  it("calls onStartOver when the back-link is clicked after a rejection", async () => {
    const onStartOver = vi.fn();
    const fetchReportFights = () =>
      Promise.resolve(aReportFights({ expansionId: 1002 }));
    render(
      <ConnectPanel
        accessToken="test-token"
        reportCode="4GYHZRdtL3bvhpc8"
        fetchReportFights={fetchReportFights}
        onReportLoaded={vi.fn()}
        onStartOver={onStartOver}
      />,
    );
    await waitFor(() => screen.getByRole("alert"));
    screen.getByText("Load different WCL report").click();
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
