// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { generateLanding } from "./report.js";
import { dirname } from "path";
import { REPORT_PATTERN, parseMetaTimestamp, parseTimestampFromFilename, formatTimestamp, formatMtime, getReportMeta, makeOptionLabel, getReportStage, findLatestByStage } from "./utils/report-ui.js";

const __dirname = dirname(new URL(import.meta.url).pathname);


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
    const meta = getReportMeta(fp);
    const ts = parseMetaTimestamp(fp);
    const dateStr = ts ? formatTimestamp(ts) : formatMtime(fp);
    const rStage = getReportStage(r);
    const label = makeOptionLabel(meta.runType, dateStr, meta.changeCount, rStage);
    optionsHtml += '<option value="' + r + '">' + (label || r.replace(/\.html$/, "").replace("report-", "")) + "</option>";
  }

  const navTmpl = readFileSync(join(__dirname, "..", "templates", "nav.html"), "utf-8");

  const stage1Latest = findLatestByStage(allReports, outputDir, "1");
  const stage2Latest = findLatestByStage(allReports, outputDir, "2");

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
    const ts = parseMetaTimestamp(join(outputDir, r)) || parseTimestampFromFilename(r) || new Date().toISOString();
    const meta2 = getReportMeta(join(outputDir, r));
    let runType = meta2.runType, changeCount = meta2.changeCount;
    reports.push({ file: r, stage: s, timestamp: ts, runType, changeCount, forks, interesting });
  }

  generateLanding(reports, ghPagesDir);

  writeFileSync(join(ghPagesDir, ".nojekyll"), "");

  console.log("GH Pages export: " + ghPagesDir);
}
