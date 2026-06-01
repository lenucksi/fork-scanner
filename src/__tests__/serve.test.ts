// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { generateNavBar } from "../serve.js";

function tmpDir(): string {
  const d = join("/tmp", "serve-test-" + Math.random().toString(36).slice(2));
  mkdirSync(d, { recursive: true });
  return d;
}

describe("generateNavBar", () => {
  it("returns nav with options for existing reports", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));

    const f1 = "report-stage1-full-2026-06-01.html";
    const f2 = "report-stage2-full-2026-06-01.html";
    const meta = '<html><head><meta name="fs:meta" content="full,0,2026-06-01T12:00:00Z"></head></html>';

    writeFileSync(join(d, f1), meta);
    writeFileSync(join(d, f2), meta);

    const nav = generateNavBar(d);
    expect(nav).toContain("Stage 1");
    expect(nav).toContain("Stage 2");
    expect(nav).toContain("fsVersionSelect");
    expect(nav).toContain("[Stage 1]");
    expect(nav).toContain("[Stage 2]");
  });
});
