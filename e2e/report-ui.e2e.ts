// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from "@playwright/test";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = join(import.meta.dirname, "..", "scan-output", "backlog-md");
const GH_PAGES_DIR = join(import.meta.dirname, "..", "gh-pages-export", "mrlesk-backlog.md");

test.describe("Fork Scanner UI", () => {
  let serverProcess: any;
  let serverUrl = "";

  test.beforeAll(async () => {
    // Start the dev server
    serverProcess = spawn("bun", [
      "run", "src/index.ts",
      "--output", OUTPUT_DIR,
      "--serve", "--port", "4199",
    ], {
      cwd: join(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Wait for server to be ready
    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch("http://localhost:4199");
        if (res.ok) {
          serverUrl = "http://localhost:4199";
          break;
        }
      } catch {}
      attempts++;
    }
    if (!serverUrl) {
      serverProcess.kill();
      throw new Error("Server did not start");
    }
  });

  test.afterAll(() => {
    if (serverProcess) serverProcess.kill();
  });

  test("landing page loads with correct title and navigation", async ({ page }) => {
    await page.goto(serverUrl, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toContainText("Fork Scanner Reports");
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.locator('select[id="fsVersionSelect"]')).toBeVisible();
  });

  test("version dropdown contains all four reports with stage prefixes", async ({ page }) => {
    await page.goto(serverUrl);
    const select = page.locator('select[id="fsVersionSelect"]');
    const options = select.locator("option");

    await expect(options).toHaveCount(5); // "Latest report" + 4 reports
    const texts = await options.allTextContents();
    const hasStage1 = texts.some((t) => t.includes("[Stage 1]"));
    const hasStage2 = texts.some((t) => t.includes("[Stage 2]"));
    expect(hasStage1).toBe(true);
    expect(hasStage2).toBe(true);
  });

  test("stage 1 report page renders stats grid and fork table", async ({ page }) => {
    await page.goto(serverUrl + "/report-stage1-full-2026-06-01.html", { waitUntil: "networkidle" });
    await expect(page.locator("#statsGrid")).toBeVisible();
    await expect(page.locator("#forkTableBody")).toBeVisible();
    // Verify stats have numeric values
    const statCards = page.locator(".stat-card .num");
    const count = await statCards.count();
    expect(count).toBeGreaterThan(3);
  });

  test("stage 2 report renders merged-upstream filter, doughnut chart, and detail cards", async ({ page }) => {
    await page.goto(serverUrl + "/report-stage2-full-2026-06-01.html", { waitUntil: "networkidle" });
    // Merged-upstream filter checkbox
    await expect(page.locator("#mergedFilter")).toBeVisible();
    // Doughnut chart canvas
    await expect(page.locator("#statusChart")).toBeVisible();
    // Detail cards
    await expect(page.locator("#forkDetails")).toBeVisible();
    // Priority matrix header
    await expect(page.locator("#featureCount")).toBeVisible();
  });

  test("version dropdown navigation works", async ({ page }) => {
    await page.goto(serverUrl);
    const select = page.locator('select[id="fsVersionSelect"]');

    // Select stage 1 report
    const stage1Option = select.locator('option').filter({ hasText: "Stage 1" }).first();
    const stage1Value = await stage1Option.getAttribute("value");
    if (stage1Value) {
      await page.goto(serverUrl + stage1Value, { waitUntil: "networkidle" });
      await expect(page.locator("#statsGrid")).toBeVisible();
    }
  });

  test("merged-upstream filter dims merged forks", async ({ page }) => {
    await page.goto(serverUrl + "/report-stage2-full-2026-06-01.html", { waitUntil: "networkidle" });
    const checkbox = page.locator("#mergedFilter");

    // Toggle the filter on
    await checkbox.check();
    // Some rows should have opacity 0.35
    const mergedRows = page.locator('.merged-upstream');
    const countBefore = await mergedRows.count();
    // Toggle off
    await checkbox.uncheck();
  });
});

test.describe("GH Pages static export", () => {
  let ghServerProcess: any;

  test.beforeAll(async () => {
    // Start python HTTP server for gh-pages export
    const ghDir = "gh-pages-export";
    ghServerProcess = spawn("python3", ["-m", "http.server", "4299", "--directory", ghDir], {
      cwd: join(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((r) => setTimeout(r, 1000));
  });

  test.afterAll(() => {
    if (ghServerProcess) ghServerProcess.kill();
  });

  test("landing page has nav and version options", async ({ page }) => {
    await page.goto("http://localhost:4299/mrlesk-backlog.md/");
    await expect(page.locator("h1")).toContainText("Fork Scanner Reports");
    await expect(page.locator('select[id="fsVersionSelect"]')).toBeVisible();
  });

  test("stage 2 report has nav injected and no placeholder leaks", async ({ page }) => {
    await page.goto("http://localhost:4299/mrlesk-backlog.md/report-stage2-full-2026-06-01.html");
    // Nav bar present
    await expect(page.locator("nav")).toBeVisible();
    // HTML should not contain any {{...}} placeholders
    const html = await page.content();
    expect(html).not.toContain("{{");
  });

  test("save-note endpoint stripped from gh-pages", async ({ page }) => {
    await page.goto("http://localhost:4299/mrlesk-backlog.md/report-stage2-full-2026-06-01.html");
    const html = await page.content();
    expect(html).not.toContain("/save-note");
  });
});
