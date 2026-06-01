// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, statSync } from "fs";
import { join } from "path";

export const REPORT_PATTERN = /^report-stage\d+-(full|inc)-\d{4}-\d{2}-\d{2}(-from-\d{4}-\d{2}-\d{2})?\.html$/;

export function parseMetaTimestamp(fp: string): string {
  try {
    const content = readFileSync(fp, "utf-8");
    const m = content.match(/<meta name="fs:meta" content="([^"]+)">/);
    if (m) {
      const parts = m[1].split(",");
      return parts[2] || "";
    }
  } catch {}
  return "";
}

export function parseTimestampFromFilename(filename: string): string {
  const m = filename.match(/-(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] + "T00:00:00.000Z" : "";
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  } catch {
    return "";
  }
}

export function formatMtime(fp: string): string {
  try {
    const d = statSync(fp).mtime;
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  } catch {
    return "";
  }
}

export function getReportMeta(fp: string): { runType: string; changeCount: number } {
  let runType = "full", changeCount = 0;
  try {
    const content = readFileSync(fp, "utf-8");
    const m = content.match(/<meta name="fs:meta" content="([^"]+)">/);
    if (m) {
      const parts = m[1].split(",");
      runType = parts[0] === "inc" ? "inc" : "full";
      changeCount = parseInt(parts[1], 10) || 0;
    }
  } catch {}
  return { runType, changeCount };
}

export function getReportStage(filename: string): string {
  return (filename.match(/^report-stage(\d+)/) || [])[1] || "";
}

export function makeRunLabel(runType: string): string {
  return runType === "inc" ? "[Inc]" : "[Full]";
}

export function makeOptionLabel(runType: string, dateStr: string, changeCount: number, stage?: string, currentStage?: string): string {
  const parts: string[] = [];
  if (stage && stage !== currentStage) {
    parts.push("[Stage " + stage + "]");
  }
  parts.push(makeRunLabel(runType));
  parts.push(dateStr);
  if (changeCount > 0) {
    parts.push("\u00b7 " + changeCount + " changes");
  }
  return parts.join(" ");
}

export function findLatestByStage(files: string[], outputDir: string, stage: string): string {
  const defaultName = "report-stage" + stage + ".html";
  let latest = defaultName;
  let latestTs = "";
  for (const r of files) {
    const s = getReportStage(r);
    if (s !== stage) continue;
    const fp = join(outputDir, r);
    const ts = parseMetaTimestamp(fp) || parseTimestampFromFilename(r);
    if (ts && ts > latestTs) {
      latestTs = ts;
      latest = r;
    }
  }
  return latest;
}
