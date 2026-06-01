// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, afterAll } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import {
  REPORT_PATTERN,
  parseMetaTimestamp,
  parseTimestampFromFilename,
  formatTimestamp,
  getReportMeta,
  getReportStage,
  makeRunLabel,
  makeOptionLabel,
  findLatestByStage,
} from "../utils/report-ui.js";

function tmpDir(): string {
  const d = join("/tmp", "report-ui-test-" + Math.random().toString(36).slice(2));
  mkdirSync(d, { recursive: true });
  return d;
}

describe("REPORT_PATTERN", () => {
  it("matches versioned filenames", () => {
    expect(REPORT_PATTERN.test("report-stage1-full-2026-06-01.html")).toBe(true);
    expect(REPORT_PATTERN.test("report-stage2-inc-2026-06-01-from-2026-06-01.html")).toBe(true);
  });

  it("rejects non-matching filenames", () => {
    expect(REPORT_PATTERN.test("report-stage1.html")).toBe(false);
    expect(REPORT_PATTERN.test("index.html")).toBe(false);
    expect(REPORT_PATTERN.test("report-stage1-v0.html")).toBe(false);
  });
});

describe("parseMetaTimestamp", () => {
  it("extracts timestamp from meta tag", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));
    const fp = join(d, "test.html");
    writeFileSync(fp, '<html><head><meta name="fs:meta" content="inc,3,2026-06-01T12:00:00Z"></head></html>');
    expect(parseMetaTimestamp(fp)).toBe("2026-06-01T12:00:00Z");
  });

  it("returns empty string when meta tag missing", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));
    const fp = join(d, "test.html");
    writeFileSync(fp, "<html></html>");
    expect(parseMetaTimestamp(fp)).toBe("");
  });

  it("returns empty string for non-existent file", () => {
    expect(parseMetaTimestamp("/nonexistent/file.html")).toBe("");
  });
});

describe("parseTimestampFromFilename", () => {
  it("extracts date from filename", () => {
    expect(parseTimestampFromFilename("report-stage1-full-2026-06-01.html")).toBe("2026-06-01T00:00:00.000Z");
  });

  it("handles incremental filenames with parent ref", () => {
    expect(parseTimestampFromFilename("report-stage2-inc-2026-06-01-from-2026-05-28.html")).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns empty string when no date", () => {
    expect(parseTimestampFromFilename("index.html")).toBe("");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO timestamp to MM-DD HH:MM", () => {
    expect(formatTimestamp("2026-06-01T14:41:00Z")).toBe("06-01 14:41");
  });

  it("returns empty for invalid timestamp", () => {
    expect(formatTimestamp("")).toBe("");
    expect(formatTimestamp("not-a-date")).toBe("");
  });
});

describe("getReportMeta", () => {
  it("parses inc run type and change count", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));
    const fp = join(d, "test.html");
    writeFileSync(fp, '<html><head><meta name="fs:meta" content="inc,3,2026-06-01T12:00:00Z"></head></html>');
    const meta = getReportMeta(fp);
    expect(meta.runType).toBe("inc");
    expect(meta.changeCount).toBe(3);
  });

  it("defaults to full when no meta tag", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));
    const fp = join(d, "test.html");
    writeFileSync(fp, "<html></html>");
    const meta = getReportMeta(fp);
    expect(meta.runType).toBe("full");
    expect(meta.changeCount).toBe(0);
  });
});

describe("getReportStage", () => {
  it("extracts stage 1", () => {
    expect(getReportStage("report-stage1-full-2026-06-01.html")).toBe("1");
  });

  it("extracts stage 2 from inc filename", () => {
    expect(getReportStage("report-stage2-inc-2026-06-01-from-2026-05-28.html")).toBe("2");
  });

  it("returns empty for non-matching", () => {
    expect(getReportStage("index.html")).toBe("");
  });
});

describe("makeRunLabel", () => {
  it("returns [Inc] for inc", () => {
    expect(makeRunLabel("inc")).toBe("[Inc]");
  });

  it("returns [Full] for full", () => {
    expect(makeRunLabel("full")).toBe("[Full]");
  });
});

describe("makeOptionLabel", () => {
  it("builds label with stage prefix", () => {
    const label = makeOptionLabel("inc", "06-01 14:41", 0, "2");
    expect(label).toContain("[Stage 2]");
    expect(label).toContain("[Inc]");
    expect(label).toContain("06-01 14:41");
  });

  it("omits stage prefix when matching currentStage", () => {
    const label = makeOptionLabel("full", "06-01 15:17", 5, "1", "1");
    expect(label).not.toContain("[Stage 1]");
    expect(label).toContain("[Full]");
    expect(label).toContain("5 changes");
  });

  it("omits change count when zero", () => {
    const label = makeOptionLabel("full", "06-01 04:44", 0, "1");
    expect(label).not.toContain("changes");
  });
});

describe("findLatestByStage", () => {
  it("finds the latest report by timestamp meta tag", () => {
    const d = tmpDir();
    afterAll(() => rmSync(d, { recursive: true }));
    const fp1 = join(d, "report-stage1-full-2026-06-01.html");
    const fp2 = join(d, "report-stage1-inc-2026-06-02-from-2026-06-01.html");
    writeFileSync(fp1, '<html><head><meta name="fs:meta" content="full,0,2026-06-01T12:00:00Z"></head></html>');
    writeFileSync(fp2, '<html><head><meta name="fs:meta" content="inc,1,2026-06-02T12:00:00Z"></head></html>');

    const files = ["report-stage1-full-2026-06-01.html", "report-stage1-inc-2026-06-02-from-2026-06-01.html", "report-stage2-full-2026-06-01.html"];
    const latest = findLatestByStage(files, d, "1");
    expect(latest).toBe("report-stage1-inc-2026-06-02-from-2026-06-01.html");
  });

  it("returns default when no files match stage", () => {
    const files: string[] = [];
    expect(findLatestByStage(files, "/tmp", "1")).toBe("report-stage1.html");
  });
});
