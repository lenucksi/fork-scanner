// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "fs";
import { join } from "path";
import { generateLanding } from "./report.js";
import { dirname } from "path";
const __dirname = dirname(new URL(import.meta.url).pathname);

export function exportGhPages(outputDir: string, ghPagesDir: string, subpath?: string, stripNotes: boolean = true) {
  if (subpath) ghPagesDir = join(ghPagesDir, subpath);
  if (!existsSync(ghPagesDir)) mkdirSync(ghPagesDir, { recursive: true });

  // Build version dropdown options from reports in the output directory
  let optionsHtml = "";
  const reportPattern = /^report-stage\d+(-v\d+)?\.html$/;
  const allReports: string[] = [];
  try {
    for (const f of readdirSync(outputDir)) {
      if (reportPattern.test(f)) allReports.push(f);
    }
  } catch {}
  allReports.sort();

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
    const label = [runLabel, changeCount > 0 ? "\u00b7 " + changeCount + " changes" : ""].filter(Boolean).join(" ");
    // For the nav dropdown, use a relative path prefix
    const relativePath = subpath ? join(subpath, r) : r;
    optionsHtml += '<option value="/' + relativePath + '">' + (label || r.replace(/\.html$/, "").replace("report-", "")) + "</option>";
  }

  const navTmpl = readFileSync(join(__dirname, "..", "templates", "nav.html"), "utf-8");
  const navHtml = navTmpl.replace("{{VERSION_OPTIONS}}", optionsHtml);

  for (const file of ["report-stage1.html", "report-stage2.html", "report-stage1-v1.html", "report-stage2-v1.html"]) {
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
  const stage1 = existsSync(join(ghPagesDir, "report-stage1.html"));
  const stage2 = existsSync(join(ghPagesDir, "report-stage2.html"));

  let forks = 0, interesting = 0;
  try {
    const data = JSON.parse(readFileSync(join(outputDir, "analysis.json"), "utf-8"));
    forks = data.length;
    interesting = data.filter((d: any) => !d.is_bot_only && d.max_ahead > 0).length;
  } catch {}

  const now = new Date().toISOString();
  if (stage1) reports.push({ file: "report-stage1.html", stage: "Stage 1", timestamp: now, forks, interesting });
  if (stage2) reports.push({ file: "report-stage2.html", stage: "Stage 2", timestamp: now, forks, interesting });
  for (const vFile of ["report-stage1-v1.html", "report-stage2-v1.html"]) {
    if (existsSync(join(ghPagesDir, vFile))) {
      const s = vFile.includes("stage2") ? "Stage 2" : "Stage 1";
      reports.push({ file: vFile, stage: s, timestamp: now, forks, interesting });
    }
  }

  generateLanding(reports, ghPagesDir);

  writeFileSync(join(ghPagesDir, ".nojekyll"), "");
  console.log("GH Pages export: " + ghPagesDir);
}
