// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { generateLanding } from "./report.js";
import { dirname } from "path";
const __dirname = dirname(new URL(import.meta.url).pathname);

const REPORT_PATTERN = /^report-stage\d+-(full|inc)-\d{4}-\d{2}-\d{2}(-from-\d{4}-\d{2}-\d{2})?\.html$/;

function parseMetaTagTimestamp(fp: string): string {
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

function parseTimestampFromFilename(filename: string): string {
  const m = filename.match(/-(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] + "T00:00:00.000Z" : "";
}

export function exportGhPages(outputDir: string, ghPagesDir: string, subpath?: string, stripNotes: boolean = true) {
  if (subpath) ghPagesDir = join(ghPagesDir, subpath);
  if (!existsSync(ghPagesDir)) mkdirSync(ghPagesDir, { recursive: true });

  // Build version dropdown options from reports in the output directory
  let optionsHtml = "";
  const allReports: string[] = [];
  try {
    for (const f of readdirSync(outputDir)) {
      if (REPORT_PATTERN.test(f)) allReports.push(f);
    }
  } catch {}
  allReports.sort((a, b) => b.localeCompare(a));

  for (const r of allReports) {
    const fp = join(outputDir, r);
    if (!existsSync(fp)) continue;
    let runLabel = "", changeCount = 0;
    try {
      const content = readFileSync(fp, "utf-8");
      const m = content.match(/<meta name="fs:meta" content="([^"]+)">/);
      if (m) {
        const parts = m[1].split(",");
        runLabel = parts[0] === "inc" ? "[Inc]" : "[Full]";
        changeCount = parseInt(parts[1], 10) || 0;
      }
    } catch {}
    let dateStr = "";
    const ts = parseMetaTagTimestamp(fp);
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        dateStr = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      }
    }
    if (!dateStr) {
      try {
        const st = statSync(fp);
        const d = st.mtime;
        dateStr = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      } catch {}
    }
    const rStage = (r.match(/^report-stage(\d+)/) || [])[1];
    const stageLabel = rStage ? "[Stage " + rStage + "] " : "";
    const label = [stageLabel + runLabel, dateStr, changeCount > 0 ? "\u00b7 " + changeCount + " changes" : ""].filter(Boolean).join(" ");
    optionsHtml += '<option value="' + r + '">' + (label || r.replace(/\.html$/, "").replace("report-", "")) + "</option>";
  }

  const navTmpl = readFileSync(join(__dirname, "..", "templates", "nav.html"), "utf-8");

  // Determine latest file per stage for nav links
  let stage1Latest = "report-stage1.html";
  let stage2Latest = "report-stage2.html";
  const sorted = [...allReports].sort((a, b) => {
    const ta = parseMetaTagTimestamp(join(outputDir, a)) || parseTimestampFromFilename(a);
    const tb = parseMetaTagTimestamp(join(outputDir, b)) || parseTimestampFromFilename(b);
    return tb.localeCompare(ta);
  });
  for (const r of sorted) {
    const stage = (r.match(/^report-stage(\d+)/) || [])[1];
    if (stage === "1" && stage1Latest === "report-stage1.html") stage1Latest = r;
    if (stage === "2" && stage2Latest === "report-stage2.html") stage2Latest = r;
  }

  let navHtml = navTmpl.replace("{{VERSION_OPTIONS}}", optionsHtml);
  navHtml = navHtml.replace("{{STAGE1_LINK}}", stage1Latest);
  navHtml = navHtml.replace("{{STAGE2_LINK}}", stage2Latest);

  // Copy all versioned report files
  for (const file of allReports) {
    const src = join(outputDir, file);
    if (existsSync(src)) {
      let html = readFileSync(src, "utf-8");
      html = html.replace(/fetch\(['"]\/save-note['"][\s\S]*?\)\.catch\(\(\)=>{}\)\);/g, "");
      html = html.replace(/\/save-note/g, "#");
      html = html.replace(/(src|href)="\/(chart\.umd\.min\.js|highlight\.min\.js|marked\.min\.js|github-dark\.min\.css)"/g, '$1="$2"');
      if (stripNotes) {
        html = html.replace(/window\.__DATA__\s*=\s*(\{.*?\});/s, (match: string, dataStr: string) => {
          try {
            const data = JSON.parse(dataStr);
            delete data.notes;
            return "window.__DATA__ = " + JSON.stringify(data) + ";";
          } catch {
            return match;
          }
        });
      }
      html = html.replace("{{NAV_BAR}}", navHtml);
      writeFileSync(join(ghPagesDir, file), html);
    }
  }

  for (const file of ["analysis.json", "forks.json", "prs.json"]) {
    const src = join(outputDir, file);
    if (existsSync(src)) {
      cpSync(src, join(ghPagesDir, file));
    }
  }

  const templatesDir = join(__dirname, "..", "templates");
  for (const f of ["marked.min.js", "highlight.min.js", "github-dark.min.css", "chart.umd.min.js"]) {
    const src = join(templatesDir, f);
    if (existsSync(src)) cpSync(src, join(ghPagesDir, f));
  }

  const reports: any[] = [];
  let forks = 0, interesting = 0;
  try {
    const data = JSON.parse(readFileSync(join(outputDir, "analysis.json"), "utf-8"));
    forks = data.length;
    interesting = data.filter((d: any) => !d.is_bot_only && d.max_ahead > 0).length;
  } catch {}

  for (const r of allReports) {
    const s = r.includes("stage2") ? "Stage 2" : "Stage 1";
    const ts = parseMetaTagTimestamp(join(outputDir, r)) || parseTimestampFromFilename(r) || new Date().toISOString();
    let runType = "full", changeCount = 0;
    try {
      const content = readFileSync(join(outputDir, r), "utf-8");
      const m = content.match(/<meta name="fs:meta" content="([^"]+)">/);
      if (m) {
        const parts = m[1].split(",");
        runType = parts[0] === "inc" ? "inc" : "full";
        changeCount = parseInt(parts[1], 10) || 0;
      }
    } catch {}
    reports.push({ file: r, stage: s, timestamp: ts, runType, changeCount, forks, interesting });
  }

  generateLanding(reports, ghPagesDir);

  writeFileSync(join(ghPagesDir, ".nojekyll"), "");

  console.log("GH Pages export: " + ghPagesDir);
}
