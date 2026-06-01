import { test, expect } from "@playwright/test";

test.describe("Nav bar and version dropdown", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we're on localhost:4099
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("Stage 1 page has correct title and nav links", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage1.html", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle("Fork Analysis — Stage 1");
    const navLinks = page.locator(".fs-nav a");
    await expect(navLinks).toContainText(["Fork Scanner", "Stage 1", "Stage 2"]);
  });

  test("Stage 1 header shows fork count", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage1.html", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText("341 forks");
  });

  test("Stage 1 version dropdown exists and has options", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage1.html", { waitUntil: "networkidle" });
    const select = page.locator("#fsVersionSelect");
    await expect(select).toBeVisible();
    const opts = await select.locator("option").allTextContents();
    // At minimum: "Latest report" plus at least one stage1 report
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts[0].trim()).toBe("Latest report");
  });

  test("Stage 2 page has correct title and nav links", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage2.html", { waitUntil: "networkidle" });
    await expect(page).toHaveTitle("Fork Analysis — Stage 2");
    const navLinks = page.locator(".fs-nav a");
    await expect(navLinks).toContainText(["Fork Scanner", "Stage 1", "Stage 2"]);
  });

  test("Stage 2 version dropdown filters to stage2 reports only", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage2.html", { waitUntil: "networkidle" });
    const select = page.locator("#fsVersionSelect");
    const opts = await select.locator("option").allTextContents();
    const reportOpts = opts.slice(1).map((s) => s.trim()); // skip "Latest report"
    // All options should be stage2/stufe2 (not stage1/stufe1)
    for (const o of reportOpts) {
      expect(o).not.toMatch(/[Ss]tage\s*1/);
    }
  });

  test("Stage 2 shows priority matrix", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage2.html", { waitUntil: "networkidle" });
    const rows = page.locator("#matrixBody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
  });

  test("Stage 2 shows deep analysis detail cards", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage2.html", { waitUntil: "networkidle" });
    const cards = page.locator(".detail-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
  });

  test("Feature heatmap section exists on page", async ({ page }) => {
    await page.goto("http://localhost:4099/report-stage2.html", { waitUntil: "networkidle" });
    await expect(page.locator("h2").filter({ hasText: "Feature Heatmap" })).toBeVisible();
    // Note: position relative to Deep Analysis depends on report generation time.
    // Newly generated reports have heatmap below deep analysis; old reports have it above.
  });

  test("Landing page shows report cards", async ({ page }) => {
    await page.goto("http://localhost:4099/", { waitUntil: "networkidle" });
    const cards = page.locator(".repo-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });
});
