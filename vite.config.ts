import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "/bloomwatch/",
  plugins: [react()],
  test: {
    environment: "node",
    exclude: ["node_modules/**", "dist/**", "test/e2e/**"],
  },
});
