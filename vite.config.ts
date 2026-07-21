import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";

// Fast-forward-only merging (see CLAUDE.md) keeps main's history linear, so a
// plain commit count from the root doubles as a stable, human-readable build
// number. Falls back to "dev" if there's no git history to read (e.g. a
// tarball checkout with no .git).
function appVersion(): string {
  try {
    const count = execSync("git rev-list --count HEAD").toString().trim();
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    return `${count}-${hash}`;
  } catch {
    return "dev";
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: "/bloomwatch/",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  plugins: [
    // MDX must run before @vitejs/plugin-react's own transform — it
    // compiles .mdx source straight to plain JS (already using the
    // automatic JSX runtime), so plugin-react's .jsx/.tsx handling never
    // needs to touch its output.
    { enforce: "pre", ...mdx() },
    react(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Recursive (**/…) so these also exclude nested git worktrees under
    // .claude/worktrees/ or .worktrees/ (the harness-native and manual-
    // fallback locations, respectively — see docs/testing.md) — a bare
    // "node_modules/**" only matched the repo root's own node_modules and
    // let vitest crawl into every worktree's vendored package tests and
    // e2e specs when run from the repo root.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/test/e2e/**",
      "**/test/contract/**",
      ".claude/worktrees/**",
      ".worktrees/**",
      "**/docs/design_v*/**",
    ],
  },
});
