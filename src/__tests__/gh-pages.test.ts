// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { exportGhPages } from "../gh-pages.js";

function tmpDir(): string {
  const d = join("/tmp", "ghpages-test-" + Math.random().toString(36).slice(2));
  mkdirSync(d, { recursive: true });
  return d;
}

describe("exportGhPages", () => {
  it("copies report files and injects nav", () => {
    const outDir = tmpDir();
    afterAll(() => rmSync(outDir, { recursive: true }));

    // Create a mock report file
    const reportFile = "report-stage2-full-2026-06-01.html";
    const reportContent = '<html><head><meta name="fs:meta" content="full,0,2026-06-01T12:00:00Z"></head>'
      + '<body>{{NAV_BAR}}<script>fetch("/save-note",{method:"POST"}).catch(()=>{});</script>'
      + '<div id="content"></div></body></html>';
    writeFileSync(join(outDir, reportFile), reportContent);

    const ghDir = tmpDir();
    afterAll(() => rmSync(ghDir, { recursive: true }));

    exportGhPages(outDir, ghDir, "test-subpath", true);

    const exportedDir = join(ghDir, "test-subpath");
    expect(existsSync(join(exportedDir, reportFile))).toBe(true);

    const html = readFileSync(join(exportedDir, reportFile), "utf-8");
    // Nav bar should be injected
    expect(html).toContain("Fork Scanner");
    // save-note should be stripped
    expect(html).not.toContain("/save-note");
    // NAV_BAR placeholder resolved
    expect(html).not.toContain("{{NAV_BAR}}");
  });
});
