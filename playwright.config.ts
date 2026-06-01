// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
  testMatch: "*.e2e.ts",
  use: { headless: true },
});
