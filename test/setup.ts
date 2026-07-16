import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't implement window.scrollTo (real browser API, no-op here) —
// without a stub it logs "Not implemented" noise on every route change.
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
});
