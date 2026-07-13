import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "/bloomwatch/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Recursive (**/…) so these also exclude nested git worktrees under
    // .claude/worktrees/ — a bare "node_modules/**" only matched the repo
    // root's own node_modules and let vitest crawl into every worktree's
    // vendored package tests and e2e specs when run from the repo root.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/test/e2e/**",
      "**/test/contract/**",
      ".claude/worktrees/**",
    ],
  },
});
