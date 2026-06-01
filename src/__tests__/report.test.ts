// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { generateLanding } from "../report.js";

function tmpDir(): string {
  const d = join("/tmp", "report-test-" + Math.random().toString(36).slice(2));
  mkdirSync(d, { recursive: true });
  return d;
}

describe("generateLanding", () => {
  it("generates index.html with version options", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));

    // Write a nav template so generateLanding can load it
    const templatesDir = join(import.meta.dirname, "..", "..", "templates");
    const reports = [
      {
        file: "report-stage2-full-2026-06-01.html",
        stage: "Stage 2",
        timestamp: "2026-06-01T15:17:00Z",
        runType: "full",
        changeCount: 0,
        forks: 341,
        interesting: 124,
      },
      {
        file: "report-stage1-full-2026-06-01.html",
        stage: "Stage 1",
        timestamp: "2026-06-01T04:44:00Z",
        runType: "full",
        changeCount: 0,
        forks: 341,
        interesting: 124,
      },
    ];

    generateLanding(reports, d);

    const indexPath = join(d, "index.html");
    expect(existsSync(indexPath)).toBe(true);

    const html = readFileSync(indexPath, "utf-8");
    expect(html).toContain("Fork Scanner");
    expect(html).toContain("report-stage2-full-2026-06-01.html");
    expect(html).toContain("report-stage1-full-2026-06-01.html");
    expect(html).toContain("Stage 2");
    expect(html).toContain("Stage 1");
  });
});
